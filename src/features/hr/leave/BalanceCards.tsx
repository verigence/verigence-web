import type { BirthdayLeaveInfo, LeaveBalanceType } from '../../../services/hr/leave';
import { birthdayLeaveText, dayCount, isYearlyType, PAID_TYPES, paidTypeLabels } from './leaveLogic';

interface Props {
  types: LeaveBalanceType[];
  year: number;
  /** Birthday leave window; absent from older services (the card then shows the year). */
  birthdayLeave?: BirthdayLeaveInfo;
}

/**
 * Paid, Birthday and Comp-off, as the server counts them: available is the balance less requests
 * still pending. Paid leave and comp-off carry over; birthday leave belongs to one birthday, so its
 * card says from when to when it can be taken, or when it opens next.
 */
export default function BalanceCards({ types, year, birthdayLeave }: Props) {
  const shown = PAID_TYPES.map((key) => types.find((t) => t.leaveType === key)).filter((t): t is LeaveBalanceType => Boolean(t));
  if (shown.length === 0) {
    return <div className="uc01-admin-state">No leave balance is set up yet.</div>;
  }
  return (
    <div className="hr-leave-balances">
      {shown.map((t) => {
        const yearly = isYearlyType(t.leaveType);
        const window = yearly ? birthdayLeaveText(birthdayLeave, t.available) : '';
        return (
          <article key={t.leaveType} className="hr-leave-balance" aria-label={`${paidTypeLabels[t.leaveType]} leave${yearly ? (window ? `, ${window}` : ` ${year}`) : ''}`}>
            <header>
              <span>{paidTypeLabels[t.leaveType]} leave</span>
              <small>{yearly ? (birthdayLeave ? 'Birthday' : year) : 'Carries over'}</small>
            </header>
            {window && <p className="hr-leave-balance__window">{window}</p>}
            <p className="hr-leave-balance__available">
              <strong>{dayCount(t.available)}</strong>
              <span>{t.available === 1 ? 'day available' : 'days available'}</span>
            </p>
            <dl className="hr-leave-balance__facts">
              <div><dt>{yearly ? 'Quota' : 'Earned'}</dt><dd>{dayCount(t.granted)}</dd></div>
              <div><dt>Used</dt><dd>{dayCount(t.used)}</dd></div>
              <div><dt>Pending</dt><dd>{dayCount(t.pending)}</dd></div>
            </dl>
          </article>
        );
      })}
    </div>
  );
}
