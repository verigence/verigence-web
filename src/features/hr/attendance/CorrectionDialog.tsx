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
  onClose: () => void;
  onDone: (message: string) => void;
}

/** Ask for one day to count as a full day or a half day. It goes to the Team Lead or Project Manager. */
export default function CorrectionDialog({ workDate, onClose, onDone }: Props) {
  const accessToken = useSessionStore((state) => state.accessToken);
  const client = useQueryClient();
  const [requested, setRequested] = useState<CorrectionKind>('FULL_DAY');
  const [reason, setReason] = useState('');
  const send = useMutation({
    mutationFn: () => raiseCorrection(accessToken!, { workDate, requested, reason: reason.trim() }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['hr', 'attendance', 'calendar'] });
      void client.invalidateQueries({ queryKey: attendanceKeys.corrections });
      onDone(`Your correction for ${formatWorkDate(workDate)} has gone to your Team Lead or Project Manager.`);
    },
  });
  const busy = send.isPending;

  return (
    <DialogShell title="Request attendance correction" eyebrow={formatWorkDate(workDate)} onClose={onClose} locked={busy}>
      <form
        className="hr-cal-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (reason.trim()) send.mutate();
        }}
      >
        <fieldset className="hr-cal-form__choice">
          <legend>Count this day as</legend>
          {(['FULL_DAY', 'HALF_DAY'] as const).map((value) => (
            <label key={value} className={`hr-cal-radio${requested === value ? ' is-checked' : ''}`}>
              <input type="radio" name="requested" value={value} checked={requested === value} onChange={() => setRequested(value)} disabled={busy} />
              <span>{value === 'FULL_DAY' ? 'Full day' : 'Half day'}</span>
            </label>
          ))}
        </fieldset>
        <label className="hr-cal-form__field">
          <span>Reason</span>
          <textarea
            value={reason}
            maxLength={500}
            rows={3}
            required
            placeholder="For example: forgot to check out, the app did not open"
            onChange={(e) => setReason(e.target.value)}
            disabled={busy}
          />
        </label>
        {send.isError && <div className="uc01-admin-message uc01-admin-message--error" role="alert">{hrErrorMessage(send.error)}</div>}
        <div className="uc01-admin-dialog-actions">
          <button type="button" className="uc01-admin-button" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="uc01-admin-button uc01-admin-button--primary" disabled={busy || !reason.trim()}>
            {busy ? 'Sending…' : 'Send for approval'}
          </button>
        </div>
      </form>
    </DialogShell>
  );
}
