import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { raiseCorrection, type CorrectionKind } from '../../../services/hr/attendanceCalendar';
import { hrErrorMessage } from '../../../services/hr/client';
import { useSessionStore } from '../../../store/sessionStore';
import DialogShell from './DialogShell';
import { attendanceKeys } from './attendanceQueries';
import { formatTimeIst, formatWorkDate, hhmmIst } from './attendanceFormat';
import type { CorrectionAsk } from './calendarFormat';

interface Props {
  workDate: string;
  /** The day has a check-in and no check-out: recording the check-out is offered first. */
  missesCheckOut?: boolean;
  /** Today: until the day closes only the times or location can be corrected. */
  isToday?: boolean;
  /** What was recorded on the day, when known (from the calendar or today's card). */
  ask?: CorrectionAsk;
  onClose: () => void;
  onDone: (message: string) => void;
}

type Choice = 'ADJUST' | 'FULL_DAY' | 'HALF_DAY';

const CHOICE_TEXT: Record<Choice, string> = {
  ADJUST: 'Correct check-in / check-out time or location',
  FULL_DAY: 'Count the day as a full day',
  HALF_DAY: 'Count the day as a half day',
};

/** "HH:MM" of an instant in IST, or '' when there is none. */
const hhmm = (iso: string | null | undefined) => (iso ? hhmmIst(new Date(iso)) : '');

/**
 * Ask for a correction; it goes to the Team Lead or Project Manager (a Project Manager or Executive
 * when the person's month has passed an attendance limit). A day with a check-in can have its
 * check-in moved earlier, its check-out moved later or recorded, or a location outside the outlet
 * counted as at the outlet (product owner 2026-11-16). An absent, half or no-check-out day can be
 * asked to count as a full or half day.
 */
export default function CorrectionDialog({ workDate, missesCheckOut = false, isToday = false, ask, onClose, onDone }: Props) {
  const accessToken = useSessionStore((state) => state.accessToken);
  const client = useQueryClient();
  const hasCheckIn = Boolean(ask?.checkInAt) || missesCheckOut;
  const canCountDay = ask?.canCountDay ?? (!isToday && missesCheckOut);
  const choices: Choice[] = [
    ...(hasCheckIn ? (['ADJUST'] as Choice[]) : []),
    ...(canCountDay || !hasCheckIn ? (['FULL_DAY', 'HALF_DAY'] as Choice[]) : []),
  ];
  const [choice, setChoice] = useState<Choice>(choices[0]);
  const [checkInTime, setCheckInTime] = useState('');
  const [checkOutTime, setCheckOutTime] = useState('');
  const [locationIn, setLocationIn] = useState(false);
  const [locationOut, setLocationOut] = useState(false);
  const [reason, setReason] = useState('');
  const recordedIn = hhmm(ask?.checkInAt);
  const recordedOut = hhmm(ask?.checkOutAt);
  const noCheckOut = missesCheckOut || (hasCheckIn && !ask?.checkOutAt);
  const adjusting = choice === 'ADJUST';
  const somethingToFix = Boolean(checkInTime || checkOutTime || locationIn || locationOut);

  const send = useMutation({
    mutationFn: () => raiseCorrection(accessToken!, {
      workDate,
      requested: choice as CorrectionKind,
      reason: reason.trim(),
      ...(adjusting && checkInTime ? { checkInTime } : {}),
      ...(adjusting && checkOutTime ? { checkOutTime } : {}),
      ...(adjusting && locationIn ? { locationCheckIn: true } : {}),
      ...(adjusting && locationOut ? { locationCheckOut: true } : {}),
    }),
    onSuccess: (created) => {
      void client.invalidateQueries({ queryKey: ['hr', 'attendance', 'calendar'] });
      void client.invalidateQueries({ queryKey: attendanceKeys.corrections });
      void client.invalidateQueries({ queryKey: attendanceKeys.today });
      const who = created.approvalNote ? 'your Project Manager or Executive' : 'your Team Lead or Project Manager';
      onDone(
        `Your correction for ${formatWorkDate(workDate)} has gone to ${who}.`
          + (adjusting ? ' The day is updated once it is approved.' : '')
          + (created.approvalNote ? ` ${created.approvalNote}` : ''),
      );
    },
  });
  const busy = send.isPending;
  const ready = Boolean(reason.trim()) && (!adjusting || somethingToFix);

  return (
    <DialogShell title="Request attendance correction" eyebrow={formatWorkDate(workDate)} onClose={onClose} locked={busy}>
      <form
        className="hr-cal-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (ready) send.mutate();
        }}
      >
        {ask?.checkInAt && (
          <p className="hr-att-hint">
            Recorded: check-in {formatTimeIst(ask.checkInAt)}
            {noCheckOut ? ', no check-out' : `, check-out ${formatTimeIst(ask?.checkOutAt)}`}.
          </p>
        )}
        {choices.length > 1 && (
          <fieldset className="hr-cal-form__choice">
            <legend>Ask for</legend>
            {choices.map((value) => (
              <label key={value} className={`hr-cal-radio${choice === value ? ' is-checked' : ''}`}>
                <input type="radio" name="requested" value={value} checked={choice === value} onChange={() => setChoice(value)} disabled={busy} />
                <span>{CHOICE_TEXT[value]}</span>
              </label>
            ))}
          </fieldset>
        )}
        {adjusting && (
          <>
            {ask?.checkInAt ? (
              <label className="hr-cal-form__field">
                <span>Actual check-in time (IST){recordedIn ? `, earlier than ${recordedIn}` : ''}</span>
                <input
                  type="time"
                  value={checkInTime}
                  max={recordedIn || undefined}
                  onChange={(e) => setCheckInTime(e.target.value)}
                  disabled={busy}
                />
              </label>
            ) : null}
            <label className="hr-cal-form__field">
              <span>{noCheckOut ? 'Time you left (IST)' : `Actual check-out time (IST), later than ${recordedOut}`}</span>
              <input
                type="time"
                value={checkOutTime}
                min={(noCheckOut ? recordedIn : recordedOut) || undefined}
                onChange={(e) => setCheckOutTime(e.target.value)}
                disabled={busy}
              />
            </label>
            {(ask?.outOfFenceIn || ask?.outOfFenceOut) && (
              <fieldset className="hr-cal-form__choice">
                <legend>Location: I was at my outlet</legend>
                {ask?.outOfFenceIn && (
                  <label className={`hr-cal-radio${locationIn ? ' is-checked' : ''}`}>
                    <input type="checkbox" checked={locationIn} onChange={(e) => setLocationIn(e.target.checked)} disabled={busy} />
                    <span>At check-in</span>
                  </label>
                )}
                {ask?.outOfFenceOut && (
                  <label className={`hr-cal-radio${locationOut ? ' is-checked' : ''}`}>
                    <input type="checkbox" checked={locationOut} onChange={(e) => setLocationOut(e.target.checked)} disabled={busy} />
                    <span>At check-out</span>
                  </label>
                )}
              </fieldset>
            )}
            <p className="hr-att-hint">Fill in only what needs correcting. The recorded times and photos are kept with the request.</p>
          </>
        )}
        <label className="hr-cal-form__field">
          <span>Reason</span>
          <textarea
            value={reason}
            maxLength={500}
            rows={3}
            required
            placeholder={adjusting ? 'For example: the app would not open at the outlet, GPS showed the wrong place' : 'For example: forgot to check in, the app did not open'}
            onChange={(e) => setReason(e.target.value)}
            disabled={busy}
          />
        </label>
        {send.isError && <div className="uc01-admin-message uc01-admin-message--error" role="alert">{hrErrorMessage(send.error)}</div>}
        <div className="uc01-admin-dialog-actions">
          <button type="button" className="uc01-admin-button" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="uc01-admin-button uc01-admin-button--primary" disabled={busy || !ready}>
            {busy ? 'Sending…' : 'Send for approval'}
          </button>
        </div>
      </form>
    </DialogShell>
  );
}
