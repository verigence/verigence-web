import type { ReactNode } from 'react';

import type { LeaveRequest } from '../../../services/hr/leave';
import { formatDate, formatDateTime } from '../hrLabels';
import { formatDays, leaveTypeLabels, requestStatusLine, statusLabels, statusTone } from './leaveLogic';

interface Props {
  requests: LeaveRequest[];
  /** True on the employee's own screen ("your Team Lead"), false when HR looks at someone else. */
  own: boolean;
  emptyText: string;
  /** Per-request action buttons, for example Cancel or Reverse. */
  actions?: (request: LeaveRequest) => ReactNode;
}

export function dateRange(request: LeaveRequest): string {
  if (request.fromDate === request.toDate) return formatDate(request.fromDate);
  return `${formatDate(request.fromDate)} to ${formatDate(request.toDate)}`;
}

export default function LeaveRequestList({ requests, own, emptyText, actions }: Props) {
  if (requests.length === 0) return <div className="uc01-admin-state">{emptyText}</div>;
  return (
    <ul className="hr-leave-requests">
      {requests.map((r) => {
        const buttons = actions?.(r);
        return (
          <li key={r.requestId} className="hr-leave-request">
            <div className="hr-leave-request__head">
              <div>
                <strong>{leaveTypeLabels[r.leaveType]}</strong>
                <span>{dateRange(r)}{r.halfDay ? ' (half day)' : ''}</span>
              </div>
              <span className={`uc01-admin-status uc01-admin-status--${statusTone[r.status]}`}>{statusLabels[r.status]}</span>
            </div>
            <p className="hr-leave-request__days">{formatDays(r.days)}</p>
            <p className="hr-leave-request__line">{requestStatusLine(r, own)}</p>
            {r.reason && <p className="hr-leave-request__note"><span>Reason</span> {r.reason}</p>}
            {r.decisionNote && <p className="hr-leave-request__note"><span>Note from approver</span> {r.decisionNote}</p>}
            <small className="hr-leave-request__meta">
              Applied {formatDateTime(r.submittedAt)}
              {r.decidedAt ? ` · Decided ${formatDateTime(r.decidedAt)}` : ''}
            </small>
            {buttons && <div className="hr-leave-request__actions">{buttons}</div>}
          </li>
        );
      })}
    </ul>
  );
}
