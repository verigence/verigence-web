import SectionCard from '../../../components/SectionCard';
import type { ClaimDetail } from '../../../services/hr/claims';
import { formatDate, formatDateTime } from '../hrLabels';
import ClaimStatusChip from './ClaimStatusChip';
import ReceiptViewer from './ReceiptViewer';
import { eventLabel, formatKm, formatMonth, formatRupees, progressText, stageLabel } from './claimFormat';

type StepState = 'done' | 'current' | 'next' | 'stopped';

/** The approval route with where the claim is on it. */
export function routeSteps(claim: Pick<ClaimDetail, 'status' | 'stagePlan' | 'stage' | 'stale'>) {
  const plan = claim.stagePlan;
  const exception = claim.stale && plan.includes('HR') && plan.includes('FINANCE');
  const finished = ['APPROVED', 'HANDED_TO_PAYROLL', 'PAID'].includes(claim.status);
  const current = claim.status === 'SUBMITTED' && claim.stage ? plan.indexOf(claim.stage) : -1;
  return plan.map((stage, index) => {
    let state: StepState = 'next';
    if (finished || (current >= 0 && index < current)) state = 'done';
    else if (index === current) state = 'current';
    else if (claim.status === 'REJECTED' || claim.status === 'CANCELLED' || claim.status === 'CORRECTION_REQUESTED') state = 'stopped';
    const label = stage === 'FINANCE' && exception && index === plan.length - 1 ? 'Finance (exception for an older claim)' : stageLabel(stage);
    return { stage, label, state };
  });
}

const stepMark: Record<StepState, string> = { done: 'Done', current: 'Now', next: 'Next', stopped: '' };

interface Props {
  claim: ClaimDetail;
  /** Show whose claim it is. The service sends the name for the owner too. */
  showPerson?: boolean;
  /** Receipts load straight away for the owner; for HR and Finance each view is logged, so it waits for a tap. */
  eagerReceipts?: boolean;
}

/**
 * Everything about one claim: amount, status, who has to act, receipts and the history.
 * Read-only; the owner's Cancel and Edit buttons live on the page that shows it.
 */
export default function ClaimDetailView({ claim, showPerson = false, eagerReceipts = false }: Props) {
  const steps = routeSteps(claim);
  const sentBack = claim.status === 'CORRECTION_REQUESTED'
    ? [...claim.history].reverse().find((entry) => entry.event === 'CORRECTION_REQUESTED')
    : undefined;
  const rejected = claim.status === 'REJECTED'
    ? [...claim.history].reverse().find((entry) => entry.event === 'REJECTED')
    : undefined;
  const reason = sentBack ?? rejected;

  return (
    <div className="hrc-detail">
      <section className="hrc-hero" aria-label="Claim summary">
        <div className="hrc-hero__top">
          <div>
            <span className="hrc-hero__label">{claim.categoryLabel}</span>
            <strong className="hrc-hero__amount">{formatRupees(claim.amount)}</strong>
          </div>
          <ClaimStatusChip status={claim.status} />
        </div>
        <p className="hrc-hero__progress">{progressText(claim)}</p>
        {showPerson && claim.employeeName && (
          <p className="hrc-hero__person">{claim.employeeName}{claim.employeeCode ? ` · ${claim.employeeCode}` : ''}</p>
        )}
      </section>

      {reason && (
        <div className={`hrc-callout ${sentBack ? 'hrc-callout--action' : 'hrc-callout--bad'}`} role="note">
          <strong>{sentBack ? `Sent back by ${stageLabel(reason.stage) || 'the reviewer'}` : `Rejected by ${stageLabel(reason.stage) || 'the reviewer'}`}</strong>
          <span>{reason.note || 'No reason was written.'}</span>
        </div>
      )}

      <SectionCard title="Claim">
        <dl className="definition-list hrc-definitions">
          <div><dt>Expense date</dt><dd>{formatDate(claim.expenseDate)}</dd></div>
          <div><dt>Category</dt><dd>{claim.categoryLabel}</dd></div>
          {claim.distanceKm !== null && <div><dt>Distance</dt><dd>{formatKm(claim.distanceKm)}</dd></div>}
          <div><dt>Amount</dt><dd>{formatRupees(claim.amount)}</dd></div>
          <div><dt>Payroll month</dt><dd>{formatMonth(claim.payrollMonth)}</dd></div>
          <div><dt>Sent</dt><dd>{formatDateTime(claim.submittedAt)}</dd></div>
          <div className="hrc-definitions__wide"><dt>Description</dt><dd>{claim.description || 'No description'}</dd></div>
        </dl>
      </SectionCard>

      <SectionCard title="Who approves" description={claim.stale ? 'This is an older claim, so Finance also approves it as an exception.' : undefined}>
        <ol className="hrc-route">
          {steps.map((step) => (
            <li key={step.stage + step.label} className={`hrc-route__step hrc-route__step--${step.state}`}>
              <span>{step.label}</span>
              {stepMark[step.state] && <small>{stepMark[step.state]}</small>}
            </li>
          ))}
        </ol>
      </SectionCard>

      <SectionCard title={`Receipts (${claim.receipts.length})`}>
        <ReceiptViewer claimId={claim.claimId} receipts={claim.receipts} eager={eagerReceipts} />
      </SectionCard>

      <SectionCard title="History">
        {claim.history.length === 0 ? (
          <p className="hrc-empty-line">Nothing has happened to this claim yet.</p>
        ) : (
          <ol className="hr-history hrc-history">
            {claim.history.map((entry, index) => (
              <li key={`${entry.at}-${index}`}>
                <strong>{eventLabel(entry.event, entry.stage)}</strong>
                <small>{formatDateTime(entry.at)}</small>
                {entry.note && <span>{entry.note}</span>}
              </li>
            ))}
          </ol>
        )}
      </SectionCard>
    </div>
  );
}
