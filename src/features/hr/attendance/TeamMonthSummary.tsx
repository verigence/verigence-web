import type { AttendanceSummaryRow, TeamSummary } from '../../../services/hr/attendanceCalendar';
import { formatMinutes } from './calendarFormat';

/** A row as the table shows it: the page names the projects (only it may show project names). */
export interface SummaryRowView extends AttendanceSummaryRow {
  projectsText: string;
}

interface Props {
  data: TeamSummary;
  rows: SummaryRowView[];
  onOpen: (row: AttendanceSummaryRow) => void;
}

const days = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

/**
 * The month in numbers for everyone the viewer can see (21 Nov 2026): one row per person with the
 * working days so far, present, absent, leave applied (not approved), leave taken (paid / unpaid),
 * caution days and hours. Every number is a count of the person's calendar days; tap a name for
 * the calendar behind it. Carbon data table with tiles for the totals.
 */
export default function TeamMonthSummary({ data, rows, onOpen }: Props) {
  const total = (key: keyof AttendanceSummaryRow) => rows.reduce((sum, r) => sum + (Number(r[key]) || 0), 0);
  const cautionSeen = rows.some((r) => r.cautionDaysOff || r.cautionDaysWorked || r.sundaysOffInLieu);
  return (
    <>
      <div className="hr-cal-tiles">
        <div><span>People</span><strong>{rows.length}</strong></div>
        <div><span>Hours clocked</span><strong>{formatMinutes(total('minutes'))}</strong></div>
        <div className={total('absentDays') ? 'is-attention' : undefined}><span>Absent days</span><strong>{days(total('absentDays'))}</strong></div>
        <div><span>Leave applied</span><strong>{days(total('leaveAppliedDays'))}</strong><small>days, not approved</small></div>
        <div>
          <span>Leave taken</span>
          <strong>{days(total('leaveTakenDays'))}</strong>
          <small>{days(total('paidLeaveDays'))} paid · {days(total('unpaidLeaveDays'))} unpaid</small>
        </div>
        {cautionSeen && (
          <div>
            <span>Caution days</span>
            <strong>{total('cautionDaysWorked')}</strong>
            <small>worked · {total('cautionDaysOff')} taken off · {total('sundaysOffInLieu')} Sundays off in lieu</small>
          </div>
        )}
      </div>
      {rows.length === 0 && <div className="uc01-admin-state">No one on your projects this month.</div>}
      {rows.length > 0 && (
        <div className="uc01-admin-table-wrap">
          <table className="uc01-admin-table hr-table hr-ov-month">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Working days</th>
                <th>Present</th>
                <th>Absent</th>
                <th>Leave applied</th>
                <th>Leave taken</th>
                {cautionSeen && <th>Caution day</th>}
                <th>Hours</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.employeeId}>
                  <td data-label="Employee">
                    <button type="button" className="hr-daily-open" onClick={() => onOpen(r)} aria-label={`Open the calendar of ${r.employeeName}`}>
                      <span className="hr-daily-cell">
                        <strong>{r.employeeName}</strong>
                        <small>{r.employeeCode}{r.projectsText ? ` · ${r.projectsText}` : ''}</small>
                      </span>
                    </button>
                  </td>
                  <td data-label="Working days">
                    <strong>{days(r.workingDaysSoFar)}</strong>
                    <small> of {days(r.workingDays)}</small>
                  </td>
                  <td data-label="Present">{days(r.presentDays)}</td>
                  <td data-label="Absent">
                    {r.absentDays ? <span className="hr-tag hr-tag--red">{days(r.absentDays)}</span> : '0'}
                  </td>
                  <td data-label="Leave applied">
                    {r.leaveAppliedDays ? <span className="hr-tag hr-tag--purple">{days(r.leaveAppliedDays)}</span> : '0'}
                  </td>
                  <td data-label="Leave taken">
                    <strong>{days(r.leaveTakenDays)}</strong>
                    {r.leaveTakenDays > 0 && <small> ({days(r.paidLeaveDays)} paid, {days(r.unpaidLeaveDays)} unpaid)</small>}
                  </td>
                  {cautionSeen && (
                    <td data-label="Caution day">
                      {r.cautionDaysWorked > 0 && <span className="hr-tag hr-tag--magenta">Worked {r.cautionDaysWorked}</span>}
                      {r.sundaysOffInLieu > 0 && <span className="hr-tag hr-tag--teal">{r.sundaysOffInLieu} Sunday off in lieu</span>}
                      {r.cautionDaysOff > 0 && <span className="hr-tag hr-tag--cool-gray">Off {r.cautionDaysOff}</span>}
                      {!r.cautionDaysWorked && !r.sundaysOffInLieu && !r.cautionDaysOff && '—'}
                    </td>
                  )}
                  <td data-label="Hours">
                    <strong>{formatMinutes(r.minutes)}</strong>
                    {r.averageMinutesPerDayPresent > 0 && <small> · {formatMinutes(r.averageMinutesPerDayPresent)} a day</small>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="hr-count">
        {data.month}: working days so far of the month. Leave applied is waiting for approval and is not yet counted as leave.
      </p>
    </>
  );
}
