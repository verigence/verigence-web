import { useState } from 'react';
import type { UseQueryResult } from '@tanstack/react-query';

import type { AttendanceCalendar as CalendarData, CalendarDay } from '../../../services/hr/attendanceCalendar';
import { hrErrorMessage } from '../../../services/hr/client';
import AttendanceCalendar from './AttendanceCalendar';
import CalendarDayDetail from './CalendarDayDetail';
import { hhmmIst, todayIst } from './attendanceFormat';
import { calendarTag, canRequestCorrection, formatMinutes, missesCheckOut, type CorrectionAsk } from './calendarFormat';

interface Props {
  query: UseQueryResult<CalendarData>;
  /** Only on the employee's own calendar. */
  onRequestCorrection?: (ask: CorrectionAsk) => void;
}

const LEGEND: Array<[keyof typeof calendarTag, string]> = [
  ['PRESENT', 'Present'],
  ['ABSENT', 'Absent'],
  ['LEAVE_APPROVED', 'Leave approved'],
  ['LEAVE_APPLIED', 'Leave applied'],
  ['PENDING_APPROVAL', 'Waiting'],
  ['HALF_DAY', 'Half day / no check-out'],
  ['OFF_DAY', 'Day off'],
];

/** Month totals, the calendar and the chosen day, with loading and error states. */
export default function CalendarSection({ query, onRequestCorrection }: Props) {
  const [selected, setSelected] = useState<CalendarDay | null>(null);
  if (query.isLoading) return <div className="uc01-admin-state">Loading calendar…</div>;
  if (query.isError || !query.data) {
    return (
      <div className="uc01-admin-state uc01-admin-state--error" role="alert">
        <strong>The calendar could not be loaded.</strong>
        <span>{hrErrorMessage(query.error)}</span>
        <button type="button" className="uc01-admin-button" onClick={() => query.refetch()}>Try again</button>
      </div>
    );
  }
  const data = query.data;
  const today = todayIst();
  const closed = hhmmIst(new Date()) >= data.absentAfter;
  const counts = data.totals.statusCounts;
  const current = selected
    ? data.weeks.flatMap((w) => w.days).find((d) => d.date === selected.date) ?? null
    : null;

  return (
    <div className="hr-cal-section">
      <div className="hr-cal-tiles">
        <div><span>Hours this month</span><strong>{formatMinutes(data.totals.minutes)}</strong><small>{data.totals.daysWorked} days with hours</small></div>
        <div><span>Present</span><strong>{(counts.PRESENT ?? 0) + (counts.CORRECTED ?? 0)}</strong></div>
        <div className={counts.ABSENT ? 'is-attention' : undefined}><span>Absent</span><strong>{counts.ABSENT ?? 0}</strong></div>
        <div><span>Leave approved</span><strong>{counts.LEAVE_APPROVED ?? 0}</strong></div>
        <div><span>Leave applied</span><strong>{counts.LEAVE_APPLIED ?? 0}</strong><small>not yet approved</small></div>
        <div><span>Waiting</span><strong>{counts.PENDING_APPROVAL ?? 0}</strong></div>
      </div>
      <ul className="hr-cal-legend" aria-label="Legend">
        {LEGEND.map(([status, text]) => (
          <li key={status}><span className={`hr-cal-swatch hr-cal-swatch--${calendarTag[status]}`} aria-hidden="true" />{text}</li>
        ))}
      </ul>
      <AttendanceCalendar data={data} today={today} selected={current?.date ?? null} onSelect={setSelected} />
      <p className="hr-att-hint">
        Hours are check-out minus check-in. No check-in by {data.absentAfter} on a working day and the system marks the day absent.
        Less than {data.minimumHours} hours goes to your Team Lead.
      </p>
      {current && (
        <CalendarDayDetail
          day={current}
          absentAfter={data.absentAfter}
          onRequestCorrection={
            onRequestCorrection && canRequestCorrection(current, today, closed)
              ? () => onRequestCorrection({ date: current.date, missesCheckOut: missesCheckOut(current) })
              : undefined
          }
        />
      )}
    </div>
  );
}
