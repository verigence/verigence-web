import type { LeaveRequest } from '../../../services/hr/leave';
import LeaveDialog from './LeaveDialog';
import { dateRange } from './LeaveRequestList';
import { formatDays, leaveTypeLabels } from './leaveLogic';

interface Props {
  request: LeaveRequest;
  busy: boolean;
  error: string;
  onConfirm: () => void;
  onClose: () => void;
}

/** The employee withdraws a request that is still pending. */
export default function CancelLeaveDialog({ request, busy, error, onConfirm, onClose }: Props) {
  return (
    <LeaveDialog title="Cancel this leave request?" titleId="leave-cancel-title" eyebrow="My leave" busy={busy} onClose={onClose}>
      <p>
        {leaveTypeLabels[request.leaveType]}, {dateRange(request)} ({formatDays(request.days)}). It has not been approved yet, so nothing
        is taken from your balance.
      </p>
      {error && <div className="uc01-admin-message uc01-admin-message--error" role="alert">{error}</div>}
      <div className="uc01-admin-dialog__actions">
        <button type="button" className="uc01-admin-button" disabled={busy} onClick={onClose}>Keep request</button>
        <button type="button" className="uc01-admin-button uc01-admin-button--danger-primary" disabled={busy} onClick={onConfirm}>
          {busy ? 'Cancelling…' : 'Cancel request'}
        </button>
      </div>
    </LeaveDialog>
  );
}
