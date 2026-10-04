import type { AttendanceDay, AttendanceEvent, AttendanceException, AttendanceSide } from '../../../services/hr/attendance';
import PhotoThumb from './PhotoThumb';
import {
  exceptionLabel,
  exceptionStatusLabels,
  exceptionStatusTone,
  flagLabel,
  formatDistance,
  formatTimeIst,
  formatWorkDate,
  statusLabels,
  statusTone,
} from './attendanceFormat';

export function StatusChip({ status }: { status: AttendanceDay['status'] }) {
  const tone = statusTone[status];
  return (
    <span className={`uc01-admin-status${tone ? ` uc01-admin-status--${tone}` : ''}`}>{statusLabels[status]}</span>
  );
}

interface SideProps {
  label: string;
  event: AttendanceEvent;
  side: AttendanceSide | null;
  attendanceId: string;
  caption: string;
  autoLoadPhoto: boolean;
}

export function SideBlock({ label, event, side, attendanceId, caption, autoLoadPhoto }: SideProps) {
  const distance = side ? formatDistance(side.distanceM) : null;
  return (
    <div className="hr-att-side">
      <span className="hr-att-side__label">{label}</span>
      {!side ? (
        <span className="hr-att-side__none">Not recorded</span>
      ) : (
        <>
          <div className="hr-att-side__main">
            <strong className="hr-att-side__time">{formatTimeIst(side.at)}</strong>
            <PhotoThumb
              attendanceId={attendanceId}
              event={event}
              hasPhoto={side.hasPhoto}
              autoLoad={autoLoadPhoto}
              caption={caption}
            />
          </div>
          {(side.outletName || distance) && (
            <span className="hr-att-side__meta">
              {[side.outletName, distance ? `${distance} away` : null].filter(Boolean).join(' · ')}
            </span>
          )}
          {side.address && <span className="hr-att-side__address">{side.address}</span>}
          {side.flags.length > 0 && (
            <span className="hr-flags">
              {side.flags.map((flag) => <span key={flag} className="hr-flag">{flagLabel(flag)}</span>)}
            </span>
          )}
        </>
      )}
    </div>
  );
}

export function ExceptionList({
  exceptions,
  viewer,
  caption,
}: {
  exceptions: AttendanceException[];
  viewer: 'self' | 'other';
  caption: string;
}) {
  if (exceptions.length === 0) return null;
  return (
    <ul className="hr-att-exceptions" aria-label={`Approvals for ${caption}`}>
      {exceptions.map((exception) => (
        <li key={exception.exceptionId}>
          <div className="hr-att-exceptions__row">
            <span>{exceptionLabel(exception.kind)}</span>
            <span className={`uc01-admin-status uc01-admin-status--${exceptionStatusTone[exception.status]}`}>
              {exceptionStatusLabels[exception.status]}
            </span>
          </div>
          {exception.reason && <small>{viewer === 'self' ? 'Your reason' : 'Reason given'}: {exception.reason}</small>}
          {exception.decisionNote && <small>Decision note: {exception.decisionNote}</small>}
        </li>
      ))}
    </ul>
  );
}

interface Props {
  days: AttendanceDay[];
  /** 'self' words the reason line as the person's own. */
  viewer: 'self' | 'other';
  monthLabel: string;
}

/** A month of attendance days, newest first, as cards that read well at phone width. */
export default function DayList({ days, viewer, monthLabel }: Props) {
  if (days.length === 0) {
    return <div className="uc01-admin-state">No attendance recorded for {monthLabel}.</div>;
  }
  return (
    <ul className="hr-att-days">
      {days.map((day) => {
        const caption = formatWorkDate(day.workDate);
        return (
          <li key={day.attendanceId} className="hr-att-day">
            <div className="hr-att-day__head">
              <strong>{caption}</strong>
              <StatusChip status={day.status} />
            </div>
            <div className="hr-att-day__sides">
              <SideBlock label="Check-in" event="CHECK_IN" side={day.checkIn} attendanceId={day.attendanceId} caption={caption} autoLoadPhoto={false} />
              <SideBlock label="Check-out" event="CHECK_OUT" side={day.checkOut} attendanceId={day.attendanceId} caption={caption} autoLoadPhoto={false} />
            </div>
            <ExceptionList exceptions={day.exceptions} viewer={viewer} caption={caption} />
          </li>
        );
      })}
    </ul>
  );
}
