import type { LeaveEarning } from '../../../services/hr/leave';
import { formatDate } from '../hrLabels';
import { dayCount, dayWord, earningProgress } from './leaveLogic';

interface Props {
  earning: LeaveEarning;
  /** True on the employee's own screen ("your"), false when HR looks at someone else. */
  own: boolean;
  /** How many of the latest blocks to list. */
  latest?: number;
}

/**
 * How paid leave is earned from attendance. Every number comes from the server: the settings in
 * force, the days counted so far and the completed blocks. This only writes them as words.
 */
export default function EarningSummary({ earning, own, latest = 6 }: Props) {
  const needed = earning.attendanceDaysNeeded;
  const soFar = earning.attendanceDaysSoFar;
  const blocks = earning.blocks.slice(0, latest);
  const whose = own ? 'your' : 'their';
  const holder = own ? 'You' : 'They';

  return (
    <div className="hr-leave-earning">
      <p className="hr-leave-earning__rule">
        {dayWord(earning.paidDaysEarned)} of paid leave for every {needed} days of attendance. A day with a late, early or
        out-of-location exception that was not approved counts as half. Today, Sundays and holidays are not counted.
      </p>

      <div className="hr-progress" role="status">
        <progress max={100} value={earningProgress(soFar, needed)} aria-label="Attendance towards the next paid leave" />
        <span>
          <strong>{dayCount(soFar)} of {needed} days</strong> of attendance towards {whose} next paid leave.
        </span>
      </div>

      <p className="hr-field__hint">
        {holder} can hold at most {dayCount(earning.balanceCap)} paid {earning.balanceCap === 1 ? 'day' : 'days'}; days earned while at the cap are lost.
      </p>

      {earning.countPausedFrom && (
        <div className="uc01-admin-message uc01-admin-message--info" role="status">
          The count is paused from {formatDate(earning.countPausedFrom)} until {whose} Team Lead decides that day&apos;s attendance.
        </div>
      )}

      {blocks.length > 0 ? (
        <div className="hr-leave-earning__blocks">
          <h3>Latest completed blocks</h3>
          <ul>
            {blocks.map((b) => (
              <li key={b.blockNo}>
                <span>Completed {formatDate(b.completedOn)}</span>
                <span>
                  {b.credited > 0 ? `${dayWord(b.credited)} earned` : 'Nothing earned'}
                  {b.lapsed > 0 ? ` · ${dayWord(b.lapsed)} lost (at the cap)` : ''}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="hr-muted">No block of {needed} days has been completed yet.</p>
      )}
    </div>
  );
}
