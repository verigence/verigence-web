import type { HalfDayHoliday } from '../../../services/hr/attendance';
import type { DayHolidayInfo } from '../../../services/hr/attendanceReports';
import type { CalendarDay, CalendarStatus, CorrectionStatus } from '../../../services/hr/attendanceCalendar';

/**
 * Words and Carbon tag colours for the attendance calendar and the team views.
 * Carbon tag types: green (done), red (absent), purple (leave applied), teal (leave approved),
 * magenta (half day), blue (in progress), warm-gray (waiting), cool-gray (off), outline (nothing yet).
 */
export const calendarLabels: Record<CalendarStatus, string> = {
  PRESENT: 'Present',
  CHECKED_IN: 'Checked in',
  MISSING_CHECK_OUT: 'No check-out',
  PENDING_APPROVAL: 'Waiting for approval',
  HALF_DAY: 'Half day (rejected)',
  CORRECTED: 'Corrected',
  ABSENT: 'Absent',
  LEAVE_APPROVED: 'Leave approved',
  LEAVE_APPLIED: 'Leave applied (not approved)',
  NOT_CHECKED_IN: 'Not checked in yet',
  OFF_DAY: 'Day off',
  OFF_DAY_WORKED: 'Worked on a day off',
  UPCOMING: '',
  NOT_JOINED: 'Before joining',
};

/** Short form for a calendar cell or a weekly grid cell. */
export const calendarShort: Record<CalendarStatus, string> = {
  PRESENT: 'Present',
  CHECKED_IN: 'In',
  MISSING_CHECK_OUT: 'No out',
  PENDING_APPROVAL: 'Pending',
  HALF_DAY: 'Half day',
  CORRECTED: 'Corrected',
  ABSENT: 'Absent',
  LEAVE_APPROVED: 'Leave',
  LEAVE_APPLIED: 'Leave applied',
  NOT_CHECKED_IN: 'Not in yet',
  OFF_DAY: 'Off',
  OFF_DAY_WORKED: 'Off, worked',
  UPCOMING: '',
  NOT_JOINED: '—',
};

export type TagType = 'green' | 'red' | 'purple' | 'teal' | 'magenta' | 'blue' | 'warm-gray' | 'cool-gray' | 'outline';

export const calendarTag: Record<CalendarStatus, TagType> = {
  PRESENT: 'green',
  CHECKED_IN: 'blue',
  MISSING_CHECK_OUT: 'magenta',
  PENDING_APPROVAL: 'warm-gray',
  HALF_DAY: 'magenta',
  CORRECTED: 'green',
  ABSENT: 'red',
  LEAVE_APPROVED: 'teal',
  LEAVE_APPLIED: 'purple',
  NOT_CHECKED_IN: 'outline',
  OFF_DAY: 'cool-gray',
  OFF_DAY_WORKED: 'blue',
  UPCOMING: 'outline',
  NOT_JOINED: 'outline',
};

export const correctionLabels: Record<CorrectionStatus, string> = {
  PENDING: 'Waiting for a decision',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  CANCELLED: 'Withdrawn',
};

export const correctionKindLabels = { FULL_DAY: 'Full day', HALF_DAY: 'Half day' } as const;

/** 510 -> "8 h 30 m"; 0 -> "0 h". */
export function formatMinutes(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined || !Number.isFinite(minutes) || minutes <= 0) return '0 h';
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m} m`;
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, '0')} m`;
}

/** 510 -> "8:30", for dense grids. */
export function formatHoursShort(minutes: number): string {
  if (!minutes || minutes <= 0) return '';
  return `${Math.floor(minutes / 60)}:${String(Math.round(minutes % 60)).padStart(2, '0')}`;
}

/** "Half-day holiday (afternoon off from 14:00): Diwali eve" (product owner, 7 Nov 2026). */
export function halfDayHolidayText(h: HalfDayHoliday): string {
  const part = h.dayPart === 'MORNING' ? `morning off until ${h.splitAt}` : `afternoon off from ${h.splitAt}`;
  return `Half-day holiday (${part}): ${h.name}`;
}

/** The time after which a missing check-in is an absence on this day: the split when the afternoon is off. */
export function absentAfterFor(day: Pick<CalendarDay, 'halfDayHoliday'>, absentAfter: string): string {
  return day.halfDayHoliday?.dayPart === 'AFTERNOON' ? day.halfDayHoliday.splitAt : absentAfter;
}

/** What a day says in words, including leave and the system's 17:00 mark. */
export function dayLabel(day: CalendarDay): string {
  if (day.status === 'ABSENT' && day.markedBySystem) {
    return day.leave?.halfDay && day.leave.status === 'APPROVED' ? 'Absent (half-day leave approved)' : 'Absent (marked by system)';
  }
  if (day.status === 'OFF_DAY' && day.holiday) return day.holiday;
  return calendarLabels[day.status] || '';
}

/** Whether the employee may ask for this day to be corrected (the server has the final say). */
export function canRequestCorrection(day: CalendarDay, today: string, absentAfterPassed: boolean): boolean {
  if (day.dayKind !== 'WORKING' || day.correction) return false;
  if (day.date > today) return false;
  if (day.date === today && !(absentAfterPassed && day.status === 'ABSENT')) return false;
  return ['ABSENT', 'MISSING_CHECK_OUT', 'HALF_DAY'].includes(day.status);
}

/** "Mon 05" for a YYYY-MM-DD in a weekly grid header. */
export function weekdayHeader(date: string): { weekday: string; day: string } {
  const [y, m, d] = date.split('-').map(Number);
  const value = new Date(y, m - 1, d);
  return {
    weekday: value.toLocaleDateString('en-IN', { weekday: 'short' }),
    day: value.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
  };
}

/** The Monday of the week holding a YYYY-MM-DD, as YYYY-MM-DD. */
export function mondayOf(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const value = new Date(Date.UTC(y, m - 1, d));
  const shift = (value.getUTCDay() + 6) % 7;
  value.setUTCDate(value.getUTCDate() - shift);
  return value.toISOString().slice(0, 10);
}

export function shiftDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const value = new Date(Date.UTC(y, m - 1, d));
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

/** Who else a shared employee works for: "also on Project Two, Project Three". */
export function sharedText(others: Array<{ projectCode: string; projectName: string | null }>): string {
  return `Also on ${others.map((o) => o.projectName || o.projectCode).join(', ')}`;
}

const PART_WORDS: Record<DayHolidayInfo['dayPart'], string> = {
  FULL_DAY: 'full day',
  MORNING: 'morning off',
  AFTERNOON: 'afternoon off',
};

/**
 * The declared holidays of a day for the HR and lead day views, with whom each is for:
 * "Diwali eve (afternoon off, whole company) · Alpha day (full day, Cuttack Motors)". Empty when the
 * day has none, or only the company-wide full day the page already names.
 */
export function dayHolidaysText(holidays: DayHolidayInfo[] | undefined, dayKind: string): string {
  const shown = (holidays ?? []).filter((h) => !(dayKind === 'HOLIDAY' && h.appliesTo === 'ALL' && h.dayPart === 'FULL_DAY'));
  return shown
    .map((h) => `${h.name} (${PART_WORDS[h.dayPart]}, ${h.appliesTo === 'ALL' ? 'whole company' : h.scope.join(', ') || 'selected projects'})`)
    .join(' · ');
}
