import type { AttendanceEvent, AttendanceToday } from '../../../services/hr/attendance';
import { ExceptionList, SideBlock, StatusChip } from './DayList';
import { formatClock, formatWorkDate } from './attendanceFormat';

interface Props {
  today: AttendanceToday;
  onStart: (event: AttendanceEvent) => void;
  /** True while the capture window is open or today is refreshing. */
  disabled?: boolean;
}

/** Today's status, the standard times and the check-in / check-out buttons. */
export default function TodayCard({ today, onStart, disabled = false }: Props) {
  const { day, dayKind, standardTimes: times } = today;
  const working = dayKind === 'WORKING';
  const checkedIn = Boolean(day?.checkIn);
  const checkedOut = Boolean(day?.checkOut);
  const caption = formatWorkDate(today.workDate);
  const pending = day?.exceptions.some((e) => e.status === 'PENDING') ?? false;
  const missingLocation = today.outlets.filter((o) => !o.hasLocation);

  return (
    <div className="hr-att-today">
      <div className="hr-att-today__head">
        <div>
          <strong className="hr-att-today__date">{caption}</strong>
        </div>
        {day ? (
          <StatusChip status={day.status} />
        ) : (
          <span className="uc01-admin-status uc01-admin-status--rejected">
            {working ? 'Not checked in' : dayKind === 'SUNDAY' ? 'Weekly off' : 'Holiday'}
          </span>
        )}
      </div>

      {dayKind === 'SUNDAY' && <div className="uc01-admin-message uc01-admin-message--info">Sunday is the weekly off. There is no check-in today.</div>}
      {dayKind === 'HOLIDAY' && (
        <div className="uc01-admin-message uc01-admin-message--info">Today is a holiday{today.holidayName ? `: ${today.holidayName}` : ''}. There is no check-in today.</div>
      )}
      {today.tentativeHoliday && (
        <div className="uc01-admin-message uc01-admin-message--info">
          Tentative holiday: {today.tentativeHoliday}. Final holidays are declared by HR, so check in as usual until then.
        </div>
      )}

      <div className="hr-att-day__sides">
        <SideBlock label="Check-in" event="CHECK_IN" side={day?.checkIn ?? null} attendanceId={day?.attendanceId ?? ''} caption={caption} autoLoadPhoto />
        <SideBlock label="Check-out" event="CHECK_OUT" side={day?.checkOut ?? null} attendanceId={day?.attendanceId ?? ''} caption={caption} autoLoadPhoto />
      </div>

      {day && <ExceptionList exceptions={day.exceptions} viewer="self" caption={caption} />}
      {pending && (
        <p className="hr-att-hint">Your Team Lead or Project Manager has been asked to approve this. You can still check out.</p>
      )}

      {working && (
        <div className="hr-att-today__actions">
          {!checkedIn && (
            <button type="button" className="uc01-admin-button uc01-admin-button--primary hr-att-big" disabled={disabled} onClick={() => onStart('CHECK_IN')}>
              Check in
            </button>
          )}
          {checkedIn && !checkedOut && (
            <button type="button" className="uc01-admin-button uc01-admin-button--primary hr-att-big" disabled={disabled} onClick={() => onStart('CHECK_OUT')}>
              Check out
            </button>
          )}
          {checkedIn && checkedOut && <p className="hr-att-hint">You have checked in and out today. Nothing more to do.</p>}
        </div>
      )}

      <dl className="hr-att-facts">
        <div>
          <dt>Check-in</dt>
          <dd>Standard {formatClock(times.checkIn)}. After {formatClock(times.lateAfter)} counts as late.</dd>
        </div>
        <div>
          <dt>Check-out</dt>
          <dd>Standard {formatClock(times.checkOut)}. Before {formatClock(times.checkOutEarliest)} counts as early.</dd>
        </div>
        {today.geofenced && (
          <div>
            <dt>Where</dt>
            <dd>
              Within {today.geofenceRadiusM} m of {today.outlets.length > 0
                ? today.outlets.map((o) => o.outletName ?? 'your outlet').join(', ')
                : 'an assigned outlet'}.
            </dd>
          </div>
        )}
      </dl>

      {today.geofenced && today.outlets.length === 0 && (
        <div className="uc01-admin-message uc01-admin-message--info">
          No outlet is assigned to you right now. You can still check in with a reason, and it will go for approval.
        </div>
      )}
      {missingLocation.length > 0 && (
        <div className="uc01-admin-message uc01-admin-message--info">
          No location is on file for {missingLocation.map((o) => o.outletName ?? 'an outlet').join(', ')}. Checking in there needs a
          reason and goes for approval.
        </div>
      )}
      {today.workContextAgeHours !== null && today.workContextAgeHours > 36 && (
        <p className="hr-att-hint">Your project assignments were last refreshed about {Math.round(today.workContextAgeHours)} hours ago.</p>
      )}
    </div>
  );
}
