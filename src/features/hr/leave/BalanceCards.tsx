import type { LeaveBalanceType } from '../../../services/hr/leave';
import { dayCount, paidTypeLabels } from './leaveLogic';

interface Props {
  types: LeaveBalanceType[];
  year: number;
}

/** Sick and Earned, as the server counts them: available is the balance less requests still pending. */
export default function BalanceCards({ types, year }: Props) {
  if (types.length === 0) {
    return <div className="uc01-admin-state">No leave balance is set up for {year}.</div>;
  }
  return (
    <div className="hr-leave-balances">
      {types.map((t) => (
        <article key={t.leaveType} className="hr-leave-balance" aria-label={`${paidTypeLabels[t.leaveType]} leave ${year}`}>
          <header>
            <span>{paidTypeLabels[t.leaveType]} leave</span>
            <small>{year}</small>
          </header>
          <p className="hr-leave-balance__available">
            <strong>{dayCount(t.available)}</strong>
            <span>{t.available === 1 ? 'day available' : 'days available'}</span>
          </p>
          <dl className="hr-leave-balance__facts">
            <div><dt>Granted</dt><dd>{dayCount(t.granted)}</dd></div>
            <div><dt>Used</dt><dd>{dayCount(t.used)}</dd></div>
            <div><dt>Pending</dt><dd>{dayCount(t.pending)}</dd></div>
          </dl>
        </article>
      ))}
    </div>
  );
}
