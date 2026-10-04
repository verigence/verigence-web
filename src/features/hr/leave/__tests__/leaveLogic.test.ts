import { describe, expect, it } from 'vitest';

import {
  addDays,
  daysBetween,
  formatDays,
  isSunday,
  istToday,
  parseAdjustDays,
  validateAdjust,
  validateApply,
  waitingFor,
  type ApplyForm,
} from '../leaveLogic';

const today = '2026-10-04';
const base: ApplyForm = { leaveType: 'SICK', fromDate: '2026-10-12', toDate: '2026-10-13', halfDay: false, reason: '' };

describe('dates', () => {
  it('uses the India calendar date', () => {
    expect(istToday(new Date('2026-10-04T20:00:00Z'))).toBe('2026-10-05');
    expect(istToday(new Date('2026-10-04T10:00:00Z'))).toBe('2026-10-04');
  });
  it('counts and adds calendar days', () => {
    expect(daysBetween('2026-10-04', '2026-10-12')).toBe(8);
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(isSunday('2026-10-04')).toBe(true);
    expect(isSunday('2026-10-05')).toBe(false);
  });
});

describe('validateApply', () => {
  it('accepts a normal request', () => {
    expect(validateApply(base, today)).toEqual({});
  });
  it('needs a type and dates', () => {
    const e = validateApply({ ...base, leaveType: '', fromDate: '', toDate: '' }, today);
    expect(Object.keys(e).sort()).toEqual(['fromDate', 'leaveType', 'toDate']);
  });
  it('rejects an end before the start, a second year, long ranges and far dates', () => {
    expect(validateApply({ ...base, toDate: '2026-10-11' }, today).toDate).toMatch(/before/);
    expect(validateApply({ ...base, fromDate: '2026-12-30', toDate: '2027-01-02' }, today).toDate).toMatch(/one calendar year/);
    expect(validateApply({ ...base, fromDate: '2026-10-05', toDate: '2026-12-31' }, today).toDate).toMatch(/at most 60/);
    expect(validateApply({ ...base, fromDate: '2026-08-01', toDate: '2026-08-01' }, today).fromDate).toMatch(/30 days/);
    expect(validateApply({ ...base, fromDate: '2027-10-06', toDate: '2027-10-06' }, today).toDate).toMatch(/too far/);
  });
  it('allows exactly 30 days back and 60 days of range', () => {
    expect(validateApply({ ...base, fromDate: '2026-09-04', toDate: '2026-09-04' }, today)).toEqual({});
    expect(validateApply({ ...base, fromDate: '2026-10-05', toDate: '2026-12-04' }, today)).toEqual({});
  });
  it('allows a half day only on a single date', () => {
    expect(validateApply({ ...base, halfDay: true }, today).halfDay).toMatch(/single date/);
    expect(validateApply({ ...base, toDate: base.fromDate, halfDay: true }, today)).toEqual({});
  });
});

describe('adjustments', () => {
  it('parses signed days with one decimal', () => {
    expect(parseAdjustDays('2')).toBe(2);
    expect(parseAdjustDays('-1.5')).toBe(-1.5);
    expect(parseAdjustDays('+0.5')).toBe(0.5);
    expect(parseAdjustDays('0')).toBeNull();
    expect(parseAdjustDays('1.25')).toBeNull();
    expect(parseAdjustDays('1000')).toBeNull();
    expect(parseAdjustDays('abc')).toBeNull();
  });
  it('requires days and a reason of at least 3 characters', () => {
    const ok = { leaveType: 'SICK' as const, year: '2026', days: '1', note: 'Carry over' };
    expect(validateAdjust(ok)).toEqual({});
    expect(validateAdjust({ ...ok, note: ' ab ' }).note).toBeTruthy();
    expect(validateAdjust({ ...ok, days: '' }).days).toBeTruthy();
    expect(validateAdjust({ ...ok, year: '1999' }).year).toBeTruthy();
  });
});

describe('words', () => {
  it('writes days and who is deciding', () => {
    expect(formatDays(0.5)).toBe('Half day');
    expect(formatDays(1)).toBe('1 day');
    expect(formatDays(2.5)).toBe('2.5 days');
    expect(waitingFor('TL_PM', true)).toBe('Waiting for your Team Lead or Project Manager');
    expect(waitingFor('HR', false)).toBe('Waiting for HR');
  });
});
