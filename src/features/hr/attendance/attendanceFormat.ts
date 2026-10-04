import { ATTENDANCE_ERROR } from '../../../services/hr/attendance';
import type {
  AttendanceDayStatus,
  AttendanceEvent,
  AttendanceToday,
  ExceptionKind,
  ExceptionStatus,
} from '../../../services/hr/attendance';
import { HrHttpError, HrNetworkError } from '../../../services/hr/client';

const IST = 'Asia/Kolkata';

export const statusLabels: Record<AttendanceDayStatus, string> = {
  ABSENT: 'Not checked in',
  PENDING_APPROVAL: 'Awaiting approval',
  EXCEPTION_REJECTED: 'Exception rejected',
  CHECKED_IN: 'Checked in',
  COMPLETE: 'Complete',
};

/** Which uc01-admin-status modifier a day status uses. Empty means the neutral chip. */
export const statusTone: Record<AttendanceDayStatus, string> = {
  ABSENT: 'rejected',
  PENDING_APPROVAL: 'pending',
  EXCEPTION_REJECTED: 'suspended',
  CHECKED_IN: '',
  COMPLETE: 'active',
};

export const flagLabels: Record<string, string> = {
  LATE: 'Late check-in',
  EARLY: 'Early check-out',
  OUT_OF_FENCE: 'Outside outlet area',
  NO_OUTLET_LOCATION: 'No outlet location on file',
  PHOTO_TIME_MISMATCH: 'Photo time did not match',
  NO_ADDRESS: 'Address not found',
};

export const exceptionLabels: Record<ExceptionKind, string> = {
  LATE_CHECK_IN: 'Late check-in',
  EARLY_CHECK_OUT: 'Early check-out',
  OUT_OF_FENCE: 'Outside outlet area',
  NO_OUTLET_LOCATION: 'No outlet location on file',
};

export const exceptionStatusLabels: Record<ExceptionStatus, string> = {
  PENDING: 'Waiting for a decision',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
};

export const exceptionStatusTone: Record<ExceptionStatus, string> = {
  PENDING: 'pending',
  APPROVED: 'active',
  REJECTED: 'suspended',
};

export function flagLabel(flag: string): string {
  return flagLabels[flag] ?? flag.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
}

export function exceptionLabel(kind: string): string {
  return exceptionLabels[kind as ExceptionKind] ?? flagLabel(kind);
}

// ---- dates and times (always IST, 12-hour like the rest of the HR screens) -----------------------

/** "9:05 am" in IST from an ISO instant. */
export function formatTimeIst(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: IST });
}

/** "11:15" (a configured wall-clock time) as "11:15 am". */
export function formatClock(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return hhmm;
  const suffix = h >= 12 ? 'pm' : 'am';
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, '0')} ${suffix}`;
}

function parseWorkDate(workDate: string): Date | null {
  const parts = workDate.slice(0, 10).split('-').map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return null;
  return new Date(parts[0], parts[1] - 1, parts[2]);
}

/** "Fri, 02 Oct 2026" for a YYYY-MM-DD work date. */
export function formatWorkDate(workDate: string): string {
  const date = parseWorkDate(workDate);
  if (!date) return workDate;
  return date.toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
}

/** "Oct 2026" for a YYYY-MM month. */
export function formatMonth(month: string): string {
  const [y, m] = month.split('-').map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m)) return month;
  return new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
}

/** Today's date in IST as YYYY-MM-DD. */
export function todayIst(now: Date = new Date()): string {
  return now.toLocaleDateString('en-CA', { timeZone: IST });
}

export function currentMonthIst(now: Date = new Date()): string {
  return todayIst(now).slice(0, 7);
}

export function isValidMonth(value: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const index = y * 12 + (m - 1) + delta;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;
}

/** The HH:MM an instant has in IST. */
export function hhmmIst(date: Date): string {
  return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: IST });
}

export function formatDistance(metres: number | null | undefined): string | null {
  if (metres === null || metres === undefined) return null;
  return metres >= 1000 ? `${(metres / 1000).toFixed(1)} km` : `${Math.round(metres)} m`;
}

// ---- what the server is likely to ask for --------------------------------------------------------

/**
 * Late check-in / early check-out are only warnings: the server records them for approval and does
 * not need a reason. This tells the screen when to offer the optional note. The server decides.
 */
export function expectedException(
  event: AttendanceEvent,
  nowHhmm: string,
  standard: AttendanceToday['standardTimes'],
): 'LATE' | 'EARLY' | null {
  if (event === 'CHECK_IN' && nowHhmm > standard.lateAfter) return 'LATE';
  if (event === 'CHECK_OUT' && nowHhmm < standard.checkOutEarliest) return 'EARLY';
  return null;
}

export type NextStep = 'reason' | 'retake' | 'close' | 'again';

export interface AttendanceProblem {
  message: string;
  /** reason: ask for a reason and send the same photo again. retake: a new photo is needed. again: the same button may be pressed again. close: nothing to retry. */
  next: NextStep;
  /** The server's view of today changed (already checked in/out...). */
  stale: boolean;
}

/** Plain words and the next step for a failed check-in or check-out. */
export function describeAttendanceError(error: unknown): AttendanceProblem {
  if (error instanceof HrHttpError) {
    switch (error.code) {
      case ATTENDANCE_ERROR.reasonRequired:
        return { message: error.message, next: 'reason', stale: false };
      case ATTENDANCE_ERROR.alreadyCheckedIn:
      case ATTENDANCE_ERROR.notCheckedIn:
      case ATTENDANCE_ERROR.alreadyCheckedOut:
      case ATTENDANCE_ERROR.notWorkingDay:
        return { message: error.message, next: 'close', stale: true };
      case ATTENDANCE_ERROR.tokenInvalid:
        return { message: 'This photo session has expired. Take the photo again.', next: 'retake', stale: false };
      case ATTENDANCE_ERROR.locationTooInaccurate:
      case ATTENDANCE_ERROR.locationTooOld:
      case ATTENDANCE_ERROR.locationInvalid:
      case ATTENDANCE_ERROR.photoNotAccepted:
        return { message: error.message, next: 'retake', stale: false };
      default:
        if (error.status === 401) {
          return { message: 'Your session has ended. Please sign in again.', next: 'close', stale: false };
        }
        if (error.status === 403) {
          return { message: 'You do not have access to this.', next: 'close', stale: false };
        }
        if (error.status === 404) {
          return { message: error.message, next: 'close', stale: false };
        }
        return {
          message: error.correlationId ? `${error.message} Reference: ${error.correlationId}.` : error.message,
          next: 'retake',
          stale: true,
        };
    }
  }
  if (error instanceof HrNetworkError) {
    return {
      message:
        'We could not confirm that your attendance was saved. Close this window and check your status before you try again.',
      next: 'close',
      stale: true,
    };
  }
  return { message: 'Something went wrong. Please try again.', next: 'retake', stale: true };
}

export type LocationProblem = 'UNSUPPORTED' | 'DENIED' | 'UNAVAILABLE' | 'TIMEOUT';

export function locationMessage(problem: LocationProblem): string {
  switch (problem) {
    case 'UNSUPPORTED':
      return 'This device cannot share its location with the browser, so you cannot check in here.';
    case 'DENIED':
      return 'Location access is blocked. Allow location for Verigence in your browser or phone settings, then try again. You cannot check in without your location.';
    case 'TIMEOUT':
      return 'Your location took too long to arrive. Move to an open area, switch on GPS and try again.';
    default:
      return 'Your location could not be found. Switch on GPS or location services and try again.';
  }
}

export const CAMERA_UNAVAILABLE_MESSAGE =
  'The camera is not available here. Attendance needs a live photo, so open Verigence in a current browser over a secure connection (https) or in the mobile app.';

export function cameraMessage(error: unknown): string {
  const name = error instanceof DOMException ? error.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return 'Camera access is blocked. Allow the camera for Verigence in your browser or phone settings, then try again. If you cannot, ask HR to record your attendance.';
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') {
    return 'No camera was found on this device. Attendance needs a live photo; ask HR to record your attendance.';
  }
  if (name === 'NotReadableError' || name === 'AbortError') {
    return 'The camera is being used by another app. Close it and try again.';
  }
  return 'The camera could not be started. Try again.';
}
