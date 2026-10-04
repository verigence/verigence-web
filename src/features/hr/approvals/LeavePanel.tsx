import { useQuery } from '@tanstack/react-query';

import { decideLeave, listLeaveApprovals, type LeaveApproval } from '../../../services/hr/approvals';
import { useSessionStore } from '../../../store/sessionStore';
import ApprovalListFrame from './ApprovalListFrame';
import ApprovalPerson from './ApprovalPerson';
import {
  ageLabel,
  formatDateRange,
  formatDateTimeIst,
  formatDays,
  isOldDays,
  label,
  leaveApproverLabels,
  leaveTypeLabels,
  timestampDays,
} from './approvalFormat';
import { approvalKeys } from './approvalKeys';
import DecisionButtons from './DecisionButtons';
import { useDecisionFlow } from './useDecisionFlow';

export function useLeaveApprovals() {
  const accessToken = useSessionStore((state) => state.accessToken);
  return useQuery({
    queryKey: approvalKeys.leave,
    queryFn: () => listLeaveApprovals(accessToken!),
    enabled: Boolean(accessToken),
    retry: false,
    refetchOnWindowFocus: false,
  });
}

const whatOf = (x: LeaveApproval) => `${label(leaveTypeLabels, x.leaveType)}, ${formatDateRange(x.fromDate, x.toDate)}`;

export default function LeavePanel({ query }: { query: ReturnType<typeof useLeaveApprovals> }) {
  const accessToken = useSessionStore((state) => state.accessToken);
  const now = new Date();
  const flow = useDecisionFlow<LeaveApproval>({
    listKey: approvalKeys.leave,
    send: (item, decision, note) =>
      decideLeave(accessToken!, item.requestId, { decision: decision === 'APPROVE' ? 'APPROVE' : 'REJECT', ...(note ? { note } : {}) }),
    describe: (x) => `${x.employeeName}’s leave`,
  });

  return (
    <ApprovalListFrame
      noun="leave requests"
      query={query}
      flow={flow}
      emptyText="Leave requests that need your decision will appear here."
      summaryOf={(x) => `${whatOf(x)} (${formatDays(x.days, x.halfDay)}), for ${x.employeeName}.`}
    >
      {(items) => (
        <div className="uc01-admin-table-wrap">
          <table className="uc01-admin-table hr-table hr-appr-table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Leave</th>
                <th>Reason</th>
                <th>Decided by</th>
                <th><span className="hr-visually-hidden">Decision</span></th>
              </tr>
            </thead>
            <tbody>
              {items.map((x) => (
                <tr key={x.requestId}>
                  <td data-label="Employee"><ApprovalPerson name={x.employeeName} code={x.employeeCode} waiting={{ text: ageLabel(x.submittedAt, now), old: isOldDays(timestampDays(x.submittedAt, now)), sent: formatDateTimeIst(x.submittedAt) }} /></td>
                  <td data-label="Leave">
                    <strong>{label(leaveTypeLabels, x.leaveType)}</strong>
                    <small>{formatDateRange(x.fromDate, x.toDate)}</small>
                    <small>{formatDays(x.days, x.halfDay)}</small>
                  </td>
                  <td data-label="Reason">
                    {x.reason ? <span className="hr-appr-text">{x.reason}</span> : <span className="hr-muted">No reason given</span>}
                  </td>
                  <td data-label="Decided by"><span>{label(leaveApproverLabels, x.approverRule)}</span></td>
                  <td data-label="Decision">
                    <DecisionButtons subject={`${x.employeeName}, ${whatOf(x)}`} disabled={flow.busy} onDecide={(d) => flow.open(x, d)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </ApprovalListFrame>
  );
}
