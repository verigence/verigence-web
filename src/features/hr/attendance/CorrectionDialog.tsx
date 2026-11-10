import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { raiseCorrection, type CorrectionKind } from '../../../services/hr/attendanceCalendar';
import { hrErrorMessage } from '../../../services/hr/client';
import { useSessionStore } from '../../../store/sessionStore';
import DialogShell from './DialogShell';
import { attendanceKeys } from './attendanceQueries';
import { formatWorkDate } from './attendanceFormat';

interface Props {
  workDate: string;
  /** The day has a check-in and no check-out: recording the check-out is offered first. */
  missesCheckOut?: boolean;
  /** Today: only the check-out can be asked for until the day closes. */
  isToday?: boolean;
  onClose: () => void;
  onDone: (message: string) => void;
}

const KIND_TEXT: Record<CorrectionKind, string> = {
  CHECK_OUT: 'Record my check-out',
  FULL_DAY: 'Full day',
  HALF_DAY: 'Half day',
};

/**
 * Ask for a correction; it goes to the Team Lead or Project Manager. For a day with a check-in and
 * no check-out (product owner 2026-11-10) the check-out itself can be asked for, with the time the
 * person left: once approved it is recorded at that time.
 */
export default function CorrectionDialog({ workDate, missesCheckOut = false, isToday = false, onClose, onDone }: Props) {
  const accessToken = useSessionStore((state) => state.accessToken);
  const client = useQueryClient();
  const kinds: CorrectionKind[] = missesCheckOut ? (isToday ? ['CHECK_OUT'] : ['CHECK_OUT', 'FULL_DAY', 'HALF_DAY']) : ['FULL_DAY', 'HALF_DAY'];
  const [requested, setRequested] = useState<CorrectionKind>(kinds[0]);
  const [leftAt, setLeftAt] = useState('');
  const [reason, setReason] = useState('');
  const needsTime = requested === 'CHECK_OUT';
  const send = useMutation({
    mutationFn: () => raiseCorrection(accessToken!, {
      workDate,
      requested,
      reason: reason.trim(),
      ...(needsTime ? { checkOutTime: leftAt } : {}),
    }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['hr', 'attendance', 'calendar'] });
      void client.invalidateQueries({ queryKey: attendanceKeys.corrections });
      void client.invalidateQueries({ queryKey: attendanceKeys.today });
      onDone(needsTime
        ? `Your check-out at ${leftAt} on ${formatWorkDate(workDate)} has gone to your Team Lead or Project Manager. It is recorded once approved.`
        : `Your correction for ${formatWorkDate(workDate)} has gone to your Team Lead or Project Manager.`);
    },
  });
  const busy = send.isPending;
  const ready = Boolean(reason.trim()) && (!needsTime || Boolean(leftAt));

  return (
    <DialogShell title={missesCheckOut ? 'Ask for your check-out to be recorded' : 'Request attendance correction'} eyebrow={formatWorkDate(workDate)} onClose={onClose} locked={busy}>
      <form
        className="hr-cal-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (ready) send.mutate();
        }}
      >
        {kinds.length > 1 && (
          <fieldset className="hr-cal-form__choice">
            <legend>{missesCheckOut ? 'Ask for' : 'Count this day as'}</legend>
            {kinds.map((value) => (
              <label key={value} className={`hr-cal-radio${requested === value ? ' is-checked' : ''}`}>
                <input type="radio" name="requested" value={value} checked={requested === value} onChange={() => setRequested(value)} disabled={busy} />
                <span>{KIND_TEXT[value]}</span>
              </label>
            ))}
          </fieldset>
        )}
        {needsTime && (
          <label className="hr-cal-form__field">
            <span>Time you left (IST)</span>
            <input type="time" value={leftAt} required onChange={(e) => setLeftAt(e.target.value)} disabled={busy} />
          </label>
        )}
        <label className="hr-cal-form__field">
          <span>Reason</span>
          <textarea
            value={reason}
            maxLength={500}
            rows={3}
            required
            placeholder={needsTime ? 'For example: the app would not open at the outlet, phone battery died' : 'For example: forgot to check out, the app did not open'}
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
