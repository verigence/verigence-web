import type { MissingDetail, SalaryStatus } from '../../services/hr/employees';
import { missingDetailLabels, salaryStatusLabels, salaryStatusTone } from './hrLabels';
import '../../styles/hr-payroll.css';

/** Compact salary status pill. */
export function SalaryStatusBadge({ status }: { status: SalaryStatus }) {
  return <span className={`hr-pay-pill hr-pay-pill--${salaryStatusTone[status]}`}>{salaryStatusLabels[status]}</span>;
}

/** Count of pending details, or nothing when the record is complete. */
export function PendingCountBadge({ missing }: { missing: MissingDetail[] }) {
  if (missing.length === 0) return null;
  return (
    <span className="hr-flag" title={missing.map((m) => missingDetailLabels[m]).join(', ')}>
      {missing.length} pending {missing.length === 1 ? 'detail' : 'details'}
    </span>
  );
}

/** The automatic "Pending details" note. Shown only when something is missing. */
export function PendingDetailsNotice({ missing, title = 'Pending details' }: { missing: MissingDetail[]; title?: string }) {
  if (missing.length === 0) return null;
  return (
    <div className="hr-pending" role="status">
      <strong>{title}</strong>
      <ul>
        {missing.map((m) => <li key={m}>{missingDetailLabels[m]}</li>)}
      </ul>
    </div>
  );
}
