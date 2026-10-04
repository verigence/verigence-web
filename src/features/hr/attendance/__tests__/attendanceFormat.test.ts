import { describe, expect, it } from 'vitest';

import { HrHttpError, HrNetworkError } from '../../../../services/hr/client';
import {
  currentMonthIst,
  describeAttendanceError,
  expectedException,
  formatClock,
  formatDistance,
  formatMonth,
  formatTimeIst,
  hhmmIst,
  shiftMonth,
  todayIst,
} from '../attendanceFormat';
import { fixAgeSeconds } from '../attendanceDevice';

const standard = { checkIn: '10:30', lateAfter: '11:15', checkOutEarliest: '17:00', checkOut: '18:30' };

describe('times in IST', () => {
  it('shows an instant as IST wall-clock time in 12-hour form', () => {
    expect(formatTimeIst('2026-10-02T04:30:00+00:00').toLowerCase()).toBe('10:00 am');
    expect(formatTimeIst('2026-10-02T12:15:00+00:00').toLowerCase()).toBe('5:45 pm');
    expect(formatTimeIst(null)).toBe('—');
    expect(formatTimeIst('nonsense')).toBe('—');
  });

  it('formats configured clock times', () => {
    expect(formatClock('11:15')).toBe('11:15 am');
    expect(formatClock('17:00')).toBe('5:00 pm');
    expect(formatClock('00:05')).toBe('12:05 am');
    expect(formatClock('12:00')).toBe('12:00 pm');
  });

  it('finds the IST date across the UTC midnight', () => {
    expect(todayIst(new Date('2026-10-03T19:00:00Z'))).toBe('2026-10-04');
    expect(currentMonthIst(new Date('2026-09-30T20:00:00Z'))).toBe('2026-10');
    expect(hhmmIst(new Date('2026-10-03T05:45:00Z'))).toBe('11:15');
  });

  it('moves between months', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2026-10', 0)).toBe('2026-10');
    expect(formatMonth('2026-10')).toContain('2026');
  });

  it('formats distances', () => {
    expect(formatDistance(120.4)).toBe('120 m');
    expect(formatDistance(1460)).toBe('1.5 km');
    expect(formatDistance(null)).toBeNull();
  });
});

describe('late and early warnings', () => {
  it('flags a check-in after the late time only', () => {
    expect(expectedException('CHECK_IN', '11:15', standard)).toBeNull();
    expect(expectedException('CHECK_IN', '11:16', standard)).toBe('LATE');
    expect(expectedException('CHECK_IN', '09:00', standard)).toBeNull();
  });

  it('flags a check-out before the earliest time only', () => {
    expect(expectedException('CHECK_OUT', '16:59', standard)).toBe('EARLY');
    expect(expectedException('CHECK_OUT', '17:00', standard)).toBeNull();
    expect(expectedException('CHECK_OUT', '18:45', standard)).toBeNull();
  });
});

describe('server answers in plain words', () => {
  it('asks for a reason when the server says one is required', () => {
    const error = new HrHttpError(422, { code: 'ATTENDANCE_REASON_REQUIRED', detail: 'You are not at an assigned outlet. Say why.' });
    expect(describeAttendanceError(error)).toEqual({ message: 'You are not at an assigned outlet. Say why.', next: 'reason', stale: false });
  });

  it('needs a new photo when the token or location is refused', () => {
    expect(describeAttendanceError(new HrHttpError(409, { code: 'ATTENDANCE_TOKEN_INVALID', detail: 'x' })).next).toBe('retake');
    expect(describeAttendanceError(new HrHttpError(422, { code: 'ATTENDANCE_LOCATION_TOO_OLD', detail: 'Wait for a fresh location.' })).next).toBe('retake');
    expect(describeAttendanceError(new HrHttpError(422, { code: 'ATTENDANCE_PHOTO_NOT_ACCEPTED', detail: 'Use a JPEG.' })).message).toBe('Use a JPEG.');
  });

  it('stops and refreshes when today already moved on', () => {
    const problem = describeAttendanceError(new HrHttpError(409, { code: 'ATTENDANCE_ALREADY_CHECKED_IN', detail: 'You have already checked in today.' }));
    expect(problem).toEqual({ message: 'You have already checked in today.', next: 'close', stale: true });
  });

  it('never invites a blind retry after a lost connection', () => {
    const problem = describeAttendanceError(new HrNetworkError('HR could not be reached.'));
    expect(problem.next).toBe('close');
    expect(problem.stale).toBe(true);
  });
});

describe('location age', () => {
  it('is never negative and counts seconds', () => {
    const fix = { latitude: 1, longitude: 2, accuracyM: 5, measuredAt: 1_000_000 };
    expect(fixAgeSeconds(fix, 1_012_300)).toBe(12.3);
    expect(fixAgeSeconds(fix, 900_000)).toBe(0);
  });
});
