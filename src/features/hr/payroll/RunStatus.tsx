import type { PayrollRun, RunStatus } from '../../../services/hr/payroll';
import { formatDate, formatDateTime } from '../hrLabels';

export const RUN_STATUS: Record<RunStatus, { label: string; tone: string }> = {
  DRAFT: { label: 'Draft', tone: 'draft' },
  SUBMITTED: { label: 'Waiting for approval', tone: 'pending' },
  APPROVED: { label: 'Approved', tone: 'approved' },
  PAID: { label: 'Paid', tone: 'paid' },
  CANCELLED: { label: 'Cancelled', tone: 'rejected' },
};

export function RunStatusPill({ status }: { status: RunStatus }) {
  const s = RUN_STATUS[status];
  return <span className={`hr-pay-pill hr-pay-pill--${s.tone}`}>{s.label}</span>;
}

const STEPS: Array<{ key: Exclude<RunStatus, 'CANCELLED'>; label: string }> = [
  { key: 'DRAFT', label: 'Draft' },
  { key: 'SUBMITTED', label: 'Submitted' },
  { key: 'APPROVED', label: 'Approved' },
  { key: 'PAID', label: 'Paid' },
];

function stepDate(run: PayrollRun, key: string): string | null {
  if (key === 'DRAFT') return run.createdAt ? formatDateTime(run.createdAt) : null;
  if (key === 'SUBMITTED') return run.submittedAt ? formatDateTime(run.submittedAt) : null;
  if (key === 'APPROVED') return run.approvedAt ? formatDateTime(run.approvedAt) : null;
  if (key === 'PAID') return run.paymentDate ? `Paid on ${formatDate(run.paymentDate)}` : null;
  return null;
}

/** DRAFT, SUBMITTED, APPROVED, PAID. A cancelled run is not on this path and says so instead. */
export function RunStepper({ run }: { run: PayrollRun }) {
  if (run.status === 'CANCELLED') {
    return <div className="uc01-admin-message uc01-admin-message--error" role="status">This run was cancelled. Start a new run for the month if it is still needed.</div>;
  }
  const current = STEPS.findIndex((s) => s.key === run.status);
  return (
    <ol className="hr-pay-stepper" aria-label="Where this run stands">
      {STEPS.map((step, index) => {
        const state = index < current ? 'done' : index === current ? 'current' : 'todo';
        const when = state === 'todo' ? null : stepDate(run, step.key);
        return (
          <li key={step.key} className={`hr-pay-step hr-pay-step--${state}`} aria-current={state === 'current' ? 'step' : undefined}>
            <span className="hr-pay-step__mark" aria-hidden="true">{state === 'done' ? '✓' : index + 1}</span>
            <span className="hr-pay-step__text">
              <strong>{step.label}</strong>
              {when && <small>{when}</small>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
