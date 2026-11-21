import type { UseQueryResult } from '@tanstack/react-query';

import type { AttendanceSummaryRow } from '../../../services/hr/attendanceCalendar';
import { formatMinutes } from './calendarFormat';

interface Props {
  query: UseQueryResult<{ month: string; employee: AttendanceSummaryRow }>;
}

const days = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

/**
 * The employee's own month in numbers (21 Nov 2026), the same figures their Team Lead and HR see:
 * working days so far, present, absent, leave applied (not approved), leave taken (paid / unpaid),
 * caution days and hours. Carbon tiles above the calendar; nothing shows while it loads or if it fails
 * (the calendar below carries the same days).
 */
export default function MyMonthSummary({ query }: Props) {
  const r = query.data?.employee;
  if (!r) return null;
  const caution = r.cautionDaysOff || r.cautionDaysWorked || r.sundaysOffInLieu;
  return (
    <div className="hr-cal-tiles" aria-label="My month in numbers">
      <div><span>Working days</span><strong>{days(r.workingDaysSoFar)}</strong><small>so far, of {days(r.workingDays)}</small></div>
      <div><span>Present</span><strong>{days(r.presentDays)}</strong></div>
      <div className={r.absentDays ? 'is-attention' : undefined}><span>Absent</span><strong>{days(r.absentDays)}</strong></div>
      <div><span>Leave applied</span><strong>{days(r.leaveAppliedDays)}</strong><small>not yet approved</small></div>
      <div>
        <span>Leave taken</span>
        <strong>{days(r.leaveTakenDays)}</strong>
        <small>{days(r.paidLeaveDays)} paid · {days(r.unpaidLeaveDays)} unpaid</small>
      </div>
      <div>
        <span>Hours</span>
        <strong>{formatMinutes(r.minutes)}</strong>
        {r.averageMinutesPerDayPresent > 0 && <small>{formatMinutes(r.averageMinutesPerDayPresent)} a day</small>}
      </div>
      {caution > 0 && (
        <div>
          <span>Caution days</span>
          <strong>{r.cautionDaysWorked}</strong>
          <small>worked · {r.cautionDaysOff} off · {r.sundaysOffInLieu} Sunday off in lieu</small>
        </div>
      )}
    </div>
  );
}
