import { useQuery } from '@tanstack/react-query';

import { decideCorrection, listCorrectionApprovals, type CorrectionApproval } from '../../../services/hr/attendanceCalendar';
import { useSessionStore } from '../../../store/sessionStore';
import { recentLeaveText, weeklyHoursText } from '../leave/leaveLogic';
import { correctionAskedText } from '../attendance/requestFormat';
import MonthStatsLine from './MonthStatsLine';
import ApprovalListFrame from './ApprovalListFrame';
import ApprovalPerson from './ApprovalPerson';
import { attendanceKindLabels, dateAgeLabel, daysSinceDate, formatDate, formatTimeIst, isOldDays, label } from './approvalFormat';
import { approvalKeys } from './approvalKeys';
import DecisionButtons from './DecisionButtons';
import { useDecisionFlow } from './useDecisionFlow';

/** "Full day", "Check-out at 6:40 pm", or the times and locations of a time correction (2026-11-16). */
const askedFor = (x: CorrectionApproval) => correctionAskedText(x);

export function useCorrectionApprovals() {
  const accessToken = useSessionStore((state) => state.accessToken);
  return useQuery({
    queryKey: approvalKeys.corrections,
    queryFn: () => listCorrectionApprovals(accessToken!),
    enabled: Boolean(accessToken),
    retry: false,
    refetchOnWindowFocus: false,
  });
}

const subjectOf = (x: CorrectionApproval) => x.requested === 'FULL_DAY' || x.requested === 'HALF_DAY'
  ? `${x.employeeName}, correction to a ${askedFor(x).toLowerCase()} on ${formatDate(x.workDate)}`
  : `${x.employeeName}, ${askedFor(x).toLowerCase()} on ${formatDate(x.workDate)}`;

/** Attendance correction requests from the team: what was asked, why, and what was recorded that day. */
export default function CorrectionsPanel({ query }: { query: ReturnType<typeof useCorrectionApprovals> }) {
  const accessToken = useSessionStore((state) => state.accessToken);
  const now = new Date();
  const flow = useDecisionFlow<CorrectionApproval>({
    listKey: approvalKeys.corrections,
    send: (item, decision, note) =>
      decideCorrection(accessToken!, item.correctionId, { decision: decision === 'APPROVE' ? 'APPROVE' : 'REJECT', ...(note ? { note } : {}) }),
    describe: (x) => `${x.employeeName}’s correction`,
  });

  return (
    <ApprovalListFrame
      noun="correction requests"
      query={query}
      flow={flow}
      emptyText="Requests from your team to count a day as a full or half day, or to correct a check-in, check-out or location, will appear here."
      summaryOf={(x) => `${askedFor(x)} on ${formatDate(x.workDate)}, for ${x.employeeName}.`}
    >
      {(items) => (
        <div className="uc01-admin-table-wrap">
          <table className="uc01-admin-table hr-table hr-appr-table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Asked for</th>
                <th>Recorded that day</th>
                <th>Reason given</th>
                <th><span className="hr-visually-hidden">Decision</span></th>
              </tr>
            </thead>
            <tbody>
              {items.map((x) => (
                <tr key={x.correctionId}>
                  <td data-label="Employee">
                    <ApprovalPerson name={x.employeeName} code={x.employeeCode} waiting={{ text: dateAgeLabel(x.workDate, now), old: isOldDays(daysSinceDate(x.workDate, now)) }} />
                  </td>
                  <td data-label="Asked for">
                    <strong>{askedFor(x)}</strong>
                    <small>{formatDate(x.workDate)}</small>
                    {x.recentLeave && <small className="hr-appr-recent">{recentLeaveText(x.recentLeave)}</small>}
                    {x.weeklyHours && <small className="hr-appr-recent">{weeklyHoursText(x.weeklyHours)}</small>}
                    {x.monthStats && <MonthStatsLine stats={x.monthStats} />}
                  </td>
                  <td data-label="Recorded that day">
                    <small>
                      {x.day.checkInAt ? `In ${formatTimeIst(x.day.checkInAt)}` : 'No check-in'}
                      {x.day.checkInAt ? (x.day.checkOutAt ? `, out ${formatTimeIst(x.day.checkOutAt)}` : ', no check-out') : ''}
                    </small>
                    {x.day.checkInDistanceM != null && x.day.checkInDistanceM > 0 && (
                      <small>Check-in {Math.round(x.day.checkInDistanceM)} m from {x.day.checkInOutletName ?? 'the outlet'}</small>
                    )}
                    {x.day.checkOutDistanceM != null && x.day.checkOutDistanceM > 0 && (
                      <small>Check-out {Math.round(x.day.checkOutDistanceM)} m from {x.day.checkOutOutletName ?? 'the outlet'}</small>
                    )}
                    {x.day.exceptions.map((e, i) => (
                      <small key={`${e.kind}-${i}`}>{label(attendanceKindLabels, e.kind)}: {e.status.toLowerCase()}</small>
                    ))}
                  </td>
                  <td data-label="Reason given"><span className="hr-appr-text">{x.reason}</span></td>
                  <td data-label="Decision">
                    <DecisionButtons subject={subjectOf(x)} disabled={flow.busy} onDecide={(d) => flow.open(x, d)} />
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
