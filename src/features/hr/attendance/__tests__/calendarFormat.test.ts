import { describe, expect, it } from 'vitest';

import type { CalendarDay } from '../../../../services/hr/attendanceCalendar';
import {
  canRequestCorrection,
  dayLabel,
  formatHoursShort,
  formatMinutes,
  mondayOf,
  sharedText,
  shiftDays,
} from '../calendarFormat';

const day = (over: Partial<CalendarDay>): CalendarDay => ({
  date: '2026-10-07',
  status: 'ABSENT',
  label: '',
  dayKind: 'WORKING',
  holiday: null,
  checkInAt: null,
  checkOutAt: null,
  minutes: 0,
  runningMinutes: null,
  leave: null,
  correction: null,
  exceptions: [],
  markedBySystem: true,
  ...over,
});

describe('hours', () => {
  it('formats minutes as hours and minutes', () => {
    expect(formatMinutes(510)).toBe('8 h 30 m');
    expect(formatMinutes(480)).toBe('8 h');
    expect(formatMinutes(45)).toBe('45 m');
    expect(formatMinutes(0)).toBe('0 h');
    expect(formatHoursShort(510)).toBe('8:30');
    expect(formatHoursShort(0)).toBe('');
  });
});

describe('weeks', () => {
  it('finds the Monday and moves by days', () => {
    expect(mondayOf('2026-10-07')).toBe('2026-10-05');
    expect(mondayOf('2026-10-05')).toBe('2026-10-05');
    expect(mondayOf('2026-10-11')).toBe('2026-10-05');
    expect(shiftDays('2026-10-05', -7)).toBe('2026-09-28');
  });
});

describe('day words', () => {
  it('says when the system marked the day absent', () => {
    expect(dayLabel(day({}))).toBe('Absent (marked by system)');
    expect(dayLabel(day({ status: 'LEAVE_APPLIED', markedBySystem: false }))).toBe('Leave applied (not approved)');
    expect(dayLabel(day({ status: 'OFF_DAY', holiday: 'Diwali', markedBySystem: false }))).toBe('Diwali');
  });

  it('names the other projects of a shared employee', () => {
    expect(sharedText([{ projectCode: 'P2', projectName: 'Project Two' }])).toBe('Also on Project Two');
  });
});

describe('corrections', () => {
  it('offers a correction only for a past working day that does not count in full', () => {
    expect(canRequestCorrection(day({}), '2026-10-09', false)).toBe(true);
    expect(canRequestCorrection(day({ status: 'PRESENT' }), '2026-10-09', false)).toBe(false);
    expect(canRequestCorrection(day({ dayKind: 'SUNDAY', status: 'OFF_DAY' }), '2026-10-09', false)).toBe(false);
    expect(canRequestCorrection(day({ date: '2026-10-09' }), '2026-10-09', false)).toBe(false);
    expect(canRequestCorrection(day({ date: '2026-10-09' }), '2026-10-09', true)).toBe(true);
    expect(
      canRequestCorrection(day({ correction: { correctionId: 'c', requested: 'FULL_DAY', reason: 'x', status: 'PENDING' } }), '2026-10-09', false),
    ).toBe(false);
  });
});
