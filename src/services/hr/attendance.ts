import { hrRawRequest, hrRequest } from './client';

/** Permission key (hrmgmt/permissions.py) that opens every employee's attendance. */
export const ATTENDANCE_PERMISSION = {
  readAll: 'hr.attendance.read_all',
} as const;

/** Error `code` values the attendance endpoints answer with (hrmgmt/api/attendance.py). */
export const ATTENDANCE_ERROR = {
  notWorkingDay: 'ATTENDANCE_NOT_A_WORKING_DAY',
  /** Past 17:00 with no check-in: the system has marked the day absent. */
  dayClosed: 'ATTENDANCE_DAY_CLOSED',
  alreadyCheckedIn: 'ATTENDANCE_ALREADY_CHECKED_IN',
  notCheckedIn: 'ATTENDANCE_NOT_CHECKED_IN',
  alreadyCheckedOut: 'ATTENDANCE_ALREADY_CHECKED_OUT',
  locationInvalid: 'ATTENDANCE_LOCATION_INVALID',
  locationTooInaccurate: 'ATTENDANCE_LOCATION_TOO_INACCURATE',
  locationTooOld: 'ATTENDANCE_LOCATION_TOO_OLD',
  photoNotAccepted: 'ATTENDANCE_PHOTO_NOT_ACCEPTED',
  reasonRequired: 'ATTENDANCE_REASON_REQUIRED',
  tokenInvalid: 'ATTENDANCE_TOKEN_INVALID',
  dependencyUnavailable: 'HR_DEPENDENCY_UNAVAILABLE',
} as const;

export type AttendanceEvent = 'CHECK_IN' | 'CHECK_OUT';
export type AttendanceDayStatus = 'ABSENT' | 'PENDING_APPROVAL' | 'EXCEPTION_REJECTED' | 'CHECKED_IN' | 'COMPLETE';
type AttendanceDayKind = 'WORKING' | 'SUNDAY' | 'HOLIDAY';
export type ExceptionKind = 'OUT_OF_FENCE' | 'NO_OUTLET_LOCATION' | 'LATE_CHECK_IN' | 'EARLY_CHECK_OUT' | 'OFF_DAY_WORK' | 'SHORT_DAY';
export type ExceptionStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface CaptureToken {
  token: string;
  ttlSeconds: number;
  expiresAt: string;
}

export interface AttendanceSide {
  at: string;
  distanceM: number | null;
  outletName: string | null;
  address: string | null;
  /** LATE, EARLY, OUT_OF_FENCE, NO_OUTLET_LOCATION, PHOTO_TIME_MISMATCH, NO_ADDRESS. */
  flags: string[];
  hasPhoto: boolean;
}

export interface AttendanceException {
  exceptionId: string;
  event: AttendanceEvent;
  kind: ExceptionKind;
  reason: string | null;
  status: ExceptionStatus;
  decisionNote: string | null;
  decidedAt: string | null;
}

export interface AttendanceDay {
  attendanceId: string;
  workDate: string;
  status: AttendanceDayStatus;
  geofenced: boolean;
  checkIn: AttendanceSide | null;
  checkOut: AttendanceSide | null;
  exceptions: AttendanceException[];
}

export interface AttendanceToday {
  workDate: string;
  serverTime: string;
  dayKind: AttendanceDayKind;
  holidayName: string | null;
  /**
   * A half-day holiday that applies to this person today (dayKind stays WORKING). Absent from
   * services before 7 Nov 2026.
   */
  halfDayHoliday?: HalfDayHoliday | null;
  /** This Sunday is a working day for this person (dayKind is WORKING). Absent from older services. */
  workingSunday?: { name: string } | null;
  tentativeHoliday: string | null;
  tentativeHolidayDayPart?: 'FULL_DAY' | 'MORNING' | 'AFTERNOON' | null;
  day: AttendanceDay | null;
  roles: string[];
  geofenced: boolean;
  geofenceRadiusM: number;
  outlets: { outletName: string | null; projectName: string | null; hasLocation: boolean }[];
  workContextAgeHours: number | null;
  standardTimes: {
    /** "HH:MM" strings, IST. */
    checkIn: string;
    lateAfter: string;
    checkOutEarliest: string;
    checkOut: string;
    /** No check-in by this time and the day is marked absent (the split when the afternoon is off). */
    absentAfter?: string;
    /** Minimum hours today (halved on a half-day holiday). */
    minimumHours?: number;
  };
}

/** Which half of a working day is a holiday, and from when (HH:MM, IST). */
export interface HalfDayHoliday {
  name: string;
  dayPart: 'MORNING' | 'AFTERNOON';
  splitAt: string;
}

export interface AttendanceMonth {
  /** "YYYY-MM" */
  month: string;
  days: AttendanceDay[];
}

export interface TeamAttendanceEmployee {
  employeeId: string;
  employeeCode: string;
  fullName: string;
  daysCheckedIn: number;
  daysCheckedOut: number;
  pendingExceptions: number;
  /** This person's own working days in the month (their holidays; a half-day holiday is 0.5). */
  workingDays?: number;
  /** Working days they checked in (a half-day holiday counts 0.5). */
  daysPresent: number;
  /** Check-ins on a Sunday or a declared holiday. */
  offDayWorked: number;
  /** Approved leave days up to today (a half day is 0.5). */
  daysOnLeave: number;
  /** Working days before today with no check-in and no leave. */
  daysAbsent: number;
}

interface TeamAttendanceSummary {
  workingDays: number;
  workingDaysSoFar: number;
  sundays: number;
  /** Company-wide holidays. dayPart is absent from services before 7 Nov 2026. */
  holidays: Array<{ date: string; name: string; dayPart?: 'FULL_DAY' | 'MORNING' | 'AFTERNOON' }>;
  /** Declared holidays for some projects or outlets only, with whom they are for. */
  /** Sundays of the month made working days, with whom for. */
  workingSundays?: Array<{ date: string; name: string; appliesTo: string[] }>;
  otherHolidays?: Array<{ date: string; name: string; dayPart: 'FULL_DAY' | 'MORNING' | 'AFTERNOON'; appliesTo: string[] }>;
}

export interface TeamAttendance {
  month: string;
  summary: TeamAttendanceSummary;
  employees: TeamAttendanceEmployee[];
}

export interface AttendanceResult {
  attendanceId: string;
  workDate: string;
  event: AttendanceEvent;
  at: string;
  distanceM: number | null;
  outletName: string | null;
  address: string | null;
  flags: string[];
  /** Exception kinds this event created for approval. */
  needsApproval: ExceptionKind[];
}

export interface AttendanceSubmission {
  photo: Blob;
  token: string;
  latitude: number;
  longitude: number;
  accuracyM: number;
  positionAgeS: number;
  /** Sent only when given. Required by the server when the person is outside the outlet area. */
  reason?: string;
}

const base = '/hr/v1';

const monthQuery = (month?: string) => (month ? `?month=${encodeURIComponent(month)}` : '');

export const getAttendanceToday = (token: string) =>
  hrRequest<AttendanceToday>(`${base}/attendance/today`, { accessToken: token });

export const getMyAttendance = (token: string, month?: string) =>
  hrRequest<AttendanceMonth>(`${base}/attendance/me${monthQuery(month)}`, { accessToken: token });

/** Needs hr.attendance.read_all. */
export const getTeamAttendance = (token: string, month?: string) =>
  hrRequest<TeamAttendance>(`${base}/attendance/team${monthQuery(month)}`, { accessToken: token });

/** Needs hr.attendance.read_all. */
export const getEmployeeAttendance = (token: string, employeeId: string, month?: string) =>
  hrRequest<AttendanceMonth>(
    `${base}/attendance/employee/${encodeURIComponent(employeeId)}${monthQuery(month)}`,
    { accessToken: token },
  );

/** One-time permission to take one photo for this event. */
export const requestCaptureToken = (token: string, purpose: AttendanceEvent) =>
  hrRequest<CaptureToken>(`${base}/attendance/capture-token`, {
    accessToken: token,
    method: 'POST',
    body: { purpose },
  });

/** One attempt. The caller decides whether the person may try again. */
export function submitAttendanceEvent(token: string, event: AttendanceEvent, input: AttendanceSubmission) {
  const form = new FormData();
  form.append('photo', input.photo, 'attendance.jpg');
  form.append('token', input.token);
  form.append('latitude', String(input.latitude));
  form.append('longitude', String(input.longitude));
  form.append('accuracy_m', String(input.accuracyM));
  form.append('position_age_s', String(input.positionAgeS));
  if (input.reason?.trim()) form.append('reason', input.reason.trim());
  return hrRequest<AttendanceResult>(
    `${base}/attendance/${event === 'CHECK_IN' ? 'check-in' : 'check-out'}`,
    { accessToken: token, method: 'POST', body: form },
  );
}

/** The stamped photo. Anyone but the employee viewing it is written to the history by the server. */
export async function fetchAttendancePhoto(
  token: string,
  attendanceId: string,
  event: AttendanceEvent,
): Promise<Blob> {
  const side = event === 'CHECK_IN' ? 'in' : 'out';
  const response = await hrRawRequest(
    `${base}/attendance/${encodeURIComponent(attendanceId)}/photo/${side}`,
    { accessToken: token },
  );
  return response.blob();
}
