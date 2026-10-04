import type { LeaveRequest } from '../../../services/hr/leave';
import LeaveDialog from './LeaveDialog';
import { dateRange } from './LeaveRequestList';
import { dayCount, formatDays, leaveTypeLabels } from './leaveLogic';

interface Props {
  request: LeaveRequest;
  employeeName: string;
  busy: boolean;
  error: string;
  onConfirm: () => void;
  onClose: () => void;
}

/**
 * HR takes back an approved leave. The HR service takes no reason for a reversal (it records who did
 * it and when in its own history), so none is asked for here.
 */
export default function ReverseLeaveDialog({ request, employeeName, busy, error, onConfirm, onClose }: Props) {
  const paid = request.leaveType !== 'UNPAID';
  return (
    <LeaveDialog title="Reverse this approved leave?" titleId="leave-reverse-title" eyebrow="Leave overview" busy={busy} onClose={onClose}>
      <p>
        {employeeName}: {leaveTypeLabels[request.leaveType]}, {dateRange(request)} ({formatDays(request.days)}).{' '}
        {paid
          ? `${dayCount(request.days)} ${request.days === 1 ? 'day goes' : 'days go'} back to their balance and the request is marked Cancelled.`
          : 'The request is marked Cancelled.'}{' '}
        This cannot be undone; the person would have to apply again.
      </p>
      {error && <div className="uc01-admin-message uc01-admin-message--error" role="alert">{error}</div>}
      <div className="uc01-admin-dialog__actions">
        <button type="button" className="uc01-admin-button" disabled={busy} onClick={onClose}>Keep leave</button>
        <button type="button" className="uc01-admin-button uc01-admin-button--danger-primary" disabled={busy} onClick={onConfirm}>
          {busy ? 'Reversing…' : 'Reverse leave'}
        </button>
      </div>
    </LeaveDialog>
  );
}
