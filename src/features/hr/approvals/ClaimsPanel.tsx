import { useQuery } from '@tanstack/react-query';

import { decideClaim, listClaimApprovals, type ClaimApproval } from '../../../services/hr/approvals';
import { useSessionStore } from '../../../store/sessionStore';
import ApprovalListFrame from './ApprovalListFrame';
import ApprovalPerson from './ApprovalPerson';
import {
  ageLabel,
  formatDate,
  formatDateTimeIst,
  formatMoney,
  formatMonth,
  isOldDays,
  stageSteps,
  timestampDays,
} from './approvalFormat';
import { approvalKeys } from './approvalKeys';
import ClaimReceipts from './ClaimReceipts';
import DecisionButtons from './DecisionButtons';
import { useDecisionFlow } from './useDecisionFlow';

export function useClaimApprovals() {
  const accessToken = useSessionStore((state) => state.accessToken);
  return useQuery({
    queryKey: approvalKeys.claims,
    queryFn: () => listClaimApprovals(accessToken!),
    enabled: Boolean(accessToken),
    retry: false,
    refetchOnWindowFocus: false,
  });
}

const whatOf = (x: ClaimApproval) => `${x.categoryLabel}, ${formatMoney(x.amount)}`;

export default function ClaimsPanel({ query }: { query: ReturnType<typeof useClaimApprovals> }) {
  const accessToken = useSessionStore((state) => state.accessToken);
  const now = new Date();
  const flow = useDecisionFlow<ClaimApproval>({
    listKey: approvalKeys.claims,
    send: (item, decision, note) => decideClaim(accessToken!, item.claimId, { decision, ...(note ? { note } : {}) }),
    describe: (x) => `${x.employeeName}’s claim`,
  });

  return (
    <ApprovalListFrame
      noun="claims"
      query={query}
      flow={flow}
      emptyText="Reimbursement claims waiting for your review will appear here."
      summaryOf={(x) => `${whatOf(x)} claim for ${formatDate(x.expenseDate)}, from ${x.employeeName}.`}
    >
      {(items) => (
        <div className="uc01-admin-table-wrap">
          <table className="uc01-admin-table hr-table hr-appr-table hr-appr-table--claims">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Claim</th>
                <th>Review stage</th>
                <th>Receipts</th>
                <th><span className="hr-visually-hidden">Decision</span></th>
              </tr>
            </thead>
            <tbody>
              {items.map((x) => (
                <tr key={x.claimId}>
                  <td data-label="Employee"><ApprovalPerson name={x.employeeName} code={x.employeeCode} waiting={{ text: ageLabel(x.submittedAt, now), old: isOldDays(timestampDays(x.submittedAt, now)), sent: formatDateTimeIst(x.submittedAt) }} /></td>
                  <td data-label="Claim">
                    <strong>{x.categoryLabel}: {formatMoney(x.amount)}</strong>
                    <small>Expense date {formatDate(x.expenseDate)}</small>
                    {x.distanceKm !== null && <small>{x.distanceKm} km travelled</small>}
                    {x.description && <span className="hr-appr-text">{x.description}</span>}
                    <small>This month’s travel total: {formatMoney(x.monthTravelTotal)}</small>
                    <small>Goes into payroll: {formatMonth(x.payrollMonth)}</small>
                  </td>
                  <td data-label="Review stage">
                    <ol className="hr-appr-stages" aria-label="Review stages">
                      {stageSteps(x.stagePlan, x.stage).map((step) => (
                        <li key={step.stage} className={`hr-appr-stage is-${step.state}`} aria-current={step.state === 'current' ? 'step' : undefined}>
                          {step.label}
                          {step.state === 'done' && <span className="hr-visually-hidden"> (done)</span>}
                          {step.state === 'current' && <span className="hr-visually-hidden"> (waiting now)</span>}
                        </li>
                      ))}
                    </ol>
                    {x.waitingFor && <small>Waiting for {x.waitingFor}</small>}
                    {x.stale && (
                      <span className="hr-appr-stale">Old claim: also needs a Finance exception approval</span>
                    )}
                  </td>
                  <td data-label="Receipts"><ClaimReceipts claimId={x.claimId} /></td>
                  <td data-label="Decision">
                    <DecisionButtons
                      allowCorrection
                      subject={`${x.employeeName}, ${whatOf(x)}`}
                      disabled={flow.busy}
                      onDecide={(d) => flow.open(x, d)}
                    />
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
