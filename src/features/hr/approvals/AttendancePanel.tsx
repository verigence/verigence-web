import { useQuery } from '@tanstack/react-query';

import { decideAttendance, listAttendanceApprovals, type AttendanceApproval } from '../../../services/hr/approvals';
import { useSessionStore } from '../../../store/sessionStore';
import ApprovalListFrame from './ApprovalListFrame';
import ApprovalPerson from './ApprovalPerson';
import AttendancePhoto from './AttendancePhoto';
import {
  attendanceEventLabels,
  attendanceKindLabels,
  dateAgeLabel,
  daysSinceDate,
  formatDate,
  formatDistanceM,
  formatTimeIst,
  isOldDays,
  label,
} from './approvalFormat';
import { approvalKeys } from './approvalKeys';
import DecisionButtons from './DecisionButtons';
import { useDecisionFlow } from './useDecisionFlow';

export function useAttendanceApprovals() {
  const accessToken = useSessionStore((state) => state.accessToken);
  return useQuery({
    queryKey: approvalKeys.attendance,
    queryFn: () => listAttendanceApprovals(accessToken!),
    enabled: Boolean(accessToken),
    retry: false,
    refetchOnWindowFocus: false,
  });
}

const subjectOf = (x: AttendanceApproval) => `${x.employeeName}, ${label(attendanceKindLabels, x.kind).toLowerCase()} on ${formatDate(x.workDate)}`;

export default function AttendancePanel({ query }: { query: ReturnType<typeof useAttendanceApprovals> }) {
  const accessToken = useSessionStore((state) => state.accessToken);
  const now = new Date();
  const flow = useDecisionFlow<AttendanceApproval>({
    listKey: approvalKeys.attendance,
    send: (item, decision, note) =>
      decideAttendance(accessToken!, item.exceptionId, { decision: decision === 'APPROVE' ? 'APPROVE' : 'REJECT', ...(note ? { note } : {}) }),
    describe: (x) => `${x.employeeName}’s ${label(attendanceKindLabels, x.kind).toLowerCase()}`,
  });

  return (
    <ApprovalListFrame
      noun="attendance exceptions"
      query={query}
      flow={flow}
      emptyText="Late, early and location exceptions from your team will appear here."
      summaryOf={(x) => `${label(attendanceKindLabels, x.kind)} on ${formatDate(x.workDate)}, for ${x.employeeName}.`}
    >
      {(items) => (
        <div className="uc01-admin-table-wrap">
          <table className="uc01-admin-table hr-table hr-appr-table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Exception</th>
                <th>Reason given</th>
                <th>Photo</th>
                <th><span className="hr-visually-hidden">Decision</span></th>
              </tr>
            </thead>
            <tbody>
              {items.map((x) => {
                const distance = formatDistanceM(x.distanceM);
                return (
                  <tr key={x.exceptionId}>
                    <td data-label="Employee"><ApprovalPerson name={x.employeeName} code={x.employeeCode} waiting={{ text: dateAgeLabel(x.workDate, now), old: isOldDays(daysSinceDate(x.workDate, now)) }} /></td>
                    <td data-label="Exception">
                      <strong>{label(attendanceKindLabels, x.kind)}</strong>
                      <small>{label(attendanceEventLabels, x.event)} on {formatDate(x.workDate)}{x.at ? `, ${formatTimeIst(x.at)}` : ''}</small>
                      {(x.outletName || distance) && (
                        <small>{[x.outletName, distance ? `${distance} from outlet` : null].filter(Boolean).join(', ')}</small>
                      )}
                    </td>
                    <td data-label="Reason given">
                      {x.reason ? <span className="hr-appr-text">{x.reason}</span> : <span className="hr-muted">No reason given</span>}
                    </td>
                    <td data-label="Photo"><AttendancePhoto attendanceId={x.attendanceId} event={x.event} name={x.employeeName} /></td>
                    <td data-label="Decision">
                      <DecisionButtons subject={subjectOf(x)} disabled={flow.busy} onDecide={(d) => flow.open(x, d)} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </ApprovalListFrame>
  );
}
