import type { MonthStats } from '../../../services/hr/attendanceCalendar';
import { formatMinutes } from '../attendance/calendarFormat';

/**
 * The person's month so far, in one or two lines for an approval: late and early with hours, and
 * the average a day against the hours expected (2026-11-16). When the month has passed a limit the
 * note says only a Project Manager or Executive can approve it.
 */
export default function MonthStatsLine({ stats }: { stats: MonthStats }) {
  const average = stats.averageMinutes === null ? 'no full day yet' : `${formatMinutes(stats.averageMinutes)} a day on average`;
  return (
    <>
      <small className="hr-appr-recent">
        This month: {stats.lateCheckIns} late ({formatMinutes(stats.lateMinutes)}), {stats.earlyCheckOuts} early (
        {formatMinutes(stats.earlyMinutes)}); {average} ({stats.expectedHours} h expected).
      </small>
      {stats.note && <small className="hr-appr-recent hr-appr-escalated">{stats.note}</small>}
    </>
  );
}
