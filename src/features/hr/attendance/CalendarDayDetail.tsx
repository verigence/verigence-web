import type { CalendarDay } from '../../../services/hr/attendanceCalendar';
import { exceptionLabel, exceptionStatusLabels, formatTimeIst, formatWorkDate } from './attendanceFormat';
import { absentAfterFor, calendarTag, correctionKindLabels, dayLabel, formatMinutes, halfDayHolidayText } from './calendarFormat';

interface Props {
  day: CalendarDay;
  absentAfter: string;
  /** Shown only on the employee's own calendar, for a day they may ask to correct. */
  onRequestCorrection?: () => void;
}

/** One day of the calendar in full: times, hours, leave, what waits for approval. */
export default function CalendarDayDetail({ day, absentAfter, onRequestCorrection }: Props) {
  const words = dayLabel(day);
  return (
    <div className="hr-cal-detail" aria-live="polite">
      <div className="hr-cal-detail__head">
        <strong>{formatWorkDate(day.date)}</strong>
        {words && <span className={`hr-tag hr-tag--${calendarTag[day.status]}`}>{words}</span>}
      </div>
      <dl className="hr-cal-detail__facts">
        <div><dt>Check-in</dt><dd>{day.checkInAt ? formatTimeIst(day.checkInAt) : '—'}</dd></div>
        <div><dt>Check-out</dt><dd>{day.checkOutAt ? formatTimeIst(day.checkOutAt) : '—'}</dd></div>
        <div>
          <dt>Hours</dt>
          <dd>
            {day.minutes ? formatMinutes(day.minutes) : day.runningMinutes ? `${formatMinutes(day.runningMinutes)} so far` : '—'}
          </dd>
        </div>
      </dl>
      {day.workingSunday && <p className="hr-cal-detail__note">Working Sunday: {day.workingSunday.name}. A normal working day.</p>}
      {day.halfDayHoliday && <p className="hr-cal-detail__note">{halfDayHolidayText(day.halfDayHoliday)}.</p>}
      {day.markedBySystem && (
        <p className="hr-cal-detail__note">No check-in by {absentAfterFor(day, absentAfter)}, so the system marked this day absent.</p>
      )}
      {day.leave && (
        <p className="hr-cal-detail__note">
          {day.leave.halfDay ? 'Half-day leave' : 'Leave'}{' '}
          {day.leave.status === 'APPROVED' ? 'approved.' : 'applied, not yet approved by your Team Lead or Project Manager. Until it is approved the day counts as absent.'}
        </p>
      )}
      {day.exceptions.length > 0 && (
        <ul className="hr-cal-detail__list">
          {day.exceptions.map((e, i) => (
            <li key={`${e.kind}-${i}`}>{exceptionLabel(e.kind)}: {exceptionStatusLabels[e.status] ?? e.status}</li>
          ))}
        </ul>
      )}
      {day.correction && (
        <p className="hr-cal-detail__note">
          Correction to a {correctionKindLabels[day.correction.requested].toLowerCase()}:{' '}
          {day.correction.status === 'APPROVED' ? 'approved' : 'waiting for a decision'}. Reason: {day.correction.reason}
        </p>
      )}
      {onRequestCorrection && (
        <button type="button" className="uc01-admin-button uc01-admin-button--primary" onClick={onRequestCorrection}>
          Request attendance correction
        </button>
      )}
    </div>
  );
}
