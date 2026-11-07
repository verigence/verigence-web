import type { AttendanceCalendar as CalendarData, CalendarDay } from '../../../services/hr/attendanceCalendar';
import { formatTimeIst } from './attendanceFormat';
import { calendarShort, calendarTag, dayLabel, formatHoursShort, formatMinutes, halfDayHolidayText } from './calendarFormat';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

interface Props {
  data: CalendarData;
  today: string;
  selected: string | null;
  onSelect: (day: CalendarDay) => void;
}

/**
 * A month as whole weeks, Monday to Sunday, with each week's hours at the end of its row
 * (Carbon data-table grid with tags). Each day shows its status and the hours clocked.
 */
export default function AttendanceCalendar({ data, today, selected, onSelect }: Props) {
  return (
    <div className="hr-cal" role="grid" aria-label={`Attendance calendar, ${data.month}`}>
      <div className="hr-cal__row hr-cal__row--head" role="row">
        {WEEKDAYS.map((d) => (
          <div key={d} role="columnheader" className="hr-cal__head">{d}</div>
        ))}
        <div role="columnheader" className="hr-cal__head hr-cal__head--week">Week</div>
      </div>
      {data.weeks.map((week) => (
        <div key={week.weekStart} className="hr-cal__row" role="row">
          {week.days.map((day) => {
            const hours = day.minutes ? formatHoursShort(day.minutes) : day.runningMinutes ? `${formatHoursShort(day.runningMinutes)}…` : '';
            const classes = [
              'hr-cal__day',
              `hr-cal__day--${calendarTag[day.status]}`,
              day.inMonth === false ? 'is-outside' : '',
              day.date === today ? 'is-today' : '',
              day.date === selected ? 'is-selected' : '',
              day.dayKind !== 'WORKING' ? 'is-off' : '',
            ].filter(Boolean).join(' ');
            const words = dayLabel(day);
            return (
              <button
                key={day.date}
                type="button"
                role="gridcell"
                className={classes}
                aria-selected={day.date === selected}
                aria-label={`${day.date}${words ? `, ${words}` : ''}${day.halfDayHoliday ? `, ${halfDayHolidayText(day.halfDayHoliday)}` : ''}${day.workingSunday ? `, working Sunday: ${day.workingSunday.name}` : ''}${day.minutes ? `, ${formatMinutes(day.minutes)}` : ''}`}
                onClick={() => onSelect(day)}
              >
                <span className="hr-cal__date">{Number(day.date.slice(8, 10))}</span>
                {calendarShort[day.status] && day.inMonth !== false && (
                  <span className={`hr-tag hr-tag--${calendarTag[day.status]} hr-cal__tag`}>{calendarShort[day.status]}</span>
                )}
                {hours && <span className="hr-cal__hours">{hours}</span>}
                {day.checkInAt && day.inMonth !== false && (
                  <span className="hr-cal__times">
                    {formatTimeIst(day.checkInAt)}{day.checkOutAt ? ` – ${formatTimeIst(day.checkOutAt)}` : ''}
                  </span>
                )}
                {day.workingSunday && day.inMonth !== false && (
                  <span className="hr-tag hr-tag--outline hr-cal__tag" title={day.workingSunday.name}>Working Sunday</span>
                )}
                {day.halfDayHoliday && day.inMonth !== false && (
                  <span className="hr-tag hr-tag--cool-gray hr-cal__tag" title={`${day.halfDayHoliday.name}`}>
                    {day.halfDayHoliday.dayPart === 'MORNING' ? 'AM off' : 'PM off'}
                  </span>
                )}
                {day.correction && <span className="hr-cal__mark" title="Correction asked">C</span>}
              </button>
            );
          })}
          <div className="hr-cal__week" role="gridcell" aria-label={`Week of ${week.weekStart}: ${formatMinutes(week.minutes)}`}>
            <strong>{formatMinutes(week.minutes)}</strong>
            <small>{week.daysWorked === 1 ? '1 day' : `${week.daysWorked} days`}</small>
          </div>
        </div>
      ))}
    </div>
  );
}
