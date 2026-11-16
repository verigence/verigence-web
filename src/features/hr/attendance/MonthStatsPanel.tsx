import type { MonthStats } from '../../../services/hr/attendanceCalendar';
import { formatMinutes } from './calendarFormat';

interface Props {
  stats: MonthStats;
  /** "your" on the employee's own page, "their" for a lead. */
  own?: boolean;
}

function monthName(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

/**
 * Late check-ins and early check-outs so far this month, with how late or early in hours, and the
 * average hours a day against the 9 expected (product owner, 16 Nov 2026). Past the late/early
 * limit the month's attendance requests go to a Project Manager or Executive, and the note says why.
 */
export default function MonthStatsPanel({ stats, own = true }: Props) {
  const over = stats.lateEarlyMinutes > stats.limits.lateEarlyHours * 60;
  return (
    <div className="hr-month-stats" aria-label={`Late, early and average hours in ${monthName(stats.month)}`}>
      <div className="hr-cal-tiles">
        <div>
          <span>Late check-ins</span>
          <strong>{stats.lateCheckIns}</strong>
          <small>{formatMinutes(stats.lateMinutes)} late in all</small>
        </div>
        <div>
          <span>Early check-outs</span>
          <strong>{stats.earlyCheckOuts}</strong>
          <small>{formatMinutes(stats.earlyMinutes)} early in all</small>
        </div>
        <div className={over ? 'is-attention' : undefined}>
          <span>Late and early together</span>
          <strong>{formatMinutes(stats.lateEarlyMinutes)}</strong>
          <small>limit {stats.limits.lateEarlyHours} h a month</small>
        </div>
        <div>
          <span>Average a day</span>
          <strong>{stats.averageMinutes === null ? '—' : formatMinutes(stats.averageMinutes)}</strong>
          <small>{stats.expectedHours} h expected</small>
        </div>
      </div>
      {stats.note && (
        <div className="uc01-admin-message uc01-admin-message--error" role="status">
          {own
            ? `${stats.note} Your attendance requests for ${monthName(stats.month)} now go to your Project Manager or Executive.`
            : stats.note}
        </div>
      )}
      <p className="hr-att-hint">
        Late is counted from the standard check-in time for check-ins after the late time; early is counted to the standard check-out time
        for check-outs before the earliest time. The average covers full working days with both a check-in and a check-out.
      </p>
    </div>
  );
}
