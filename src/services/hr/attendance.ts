import { hrRawRequest, hrRequest } from './client';

/** Permission key (hrmgmt/permissions.py) that opens every employee's attendance. */
export const ATTENDANCE_PERMISSION = {
  readAll: 'hr.attendance.read_all',
} as const;

/** Error `code` values the attendance endpoints answer with (hrmgmt/api/attendance.py). */
export const ATTENDANCE_ERROR = {
  notWorkingDay: 'ATTENDANCE_NOT_A_WORKING_DAY',
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
export type AttendanceDayKind = 'WORKING' | 'SUNDAY' | 'HOLIDAY';
export type ExceptionKind = 'OUT_OF_FENCE' | 'NO_OUTLET_LOCATION' | 'LATE_CHECK_IN' | 'EARLY_CHECK_OUT';
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
  tentativeHoliday: string | null;
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
  };
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
}

export interface TeamAttendance {
  month: string;
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
