import { describe, expect, it } from 'vitest';

import type { SettingItem } from '../../../../services/hr/hrSettings';
import {
  collectChanges,
  describeBounds,
  formatHolidayDate,
  groupSettings,
  parseSetting,
  placeServerProblem,
  sortHolidays,
  validateHoliday,
} from '../settingsForm';

const item = (over: Partial<SettingItem>): SettingItem => ({
  key: 'attendance.geofence_radius_m',
  group: 'Attendance',
  label: 'Geofence radius for PCs (metres)',
  kind: 'int',
  value: 500,
  default: 500,
  ...over,
});

describe('groupSettings', () => {
  it('keeps known groups in order and puts company details last', () => {
    const groups = groupSettings([
      item({ key: 'company.name', group: 'Company', kind: 'text' }),
      item({ key: 'claims.x', group: 'Reimbursement' }),
      item({ key: 'leave.x', group: 'Leave' }),
      item({ key: 'attendance.x' }),
      item({ key: 'attendance.y' }),
    ]);
    expect(groups.map((g) => g.name)).toEqual(['Attendance', 'Leave', 'Reimbursement', 'Company']);
    expect(groups[0].items).toHaveLength(2);
  });
});

describe('parseSetting', () => {
  it('accepts times as HH:MM only', () => {
    const t = item({ kind: 'time', value: '10:30' });
    expect(parseSetting(t, '09:05')).toEqual({ ok: true, value: '09:05' });
    expect(parseSetting(t, '9:05').ok).toBe(false);
    expect(parseSetting(t, '24:00').ok).toBe(false);
  });
  it('requires whole numbers for int', () => {
    expect(parseSetting(item({}), ' 600 ')).toEqual({ ok: true, value: 600 });
    expect(parseSetting(item({}), '12.5')).toEqual({ ok: false, message: 'Use a whole number.' });
    expect(parseSetting(item({}), 'abc').ok).toBe(false);
    expect(parseSetting(item({}), '').ok).toBe(false);
  });
  it('rounds money to two places and lets money_or_null be blank', () => {
    expect(parseSetting(item({ kind: 'money' }), '4.456')).toEqual({ ok: true, value: 4.46 });
    expect(parseSetting(item({ kind: 'money_or_null', value: null }), '')).toEqual({ ok: true, value: null });
    expect(parseSetting(item({ kind: 'money' }), '').ok).toBe(false);
  });
  it('uses bounds only when the service gives them', () => {
    expect(parseSetting(item({}), '5000000').ok).toBe(true);
    const bounded = item({ min: 50, max: 5000 });
    expect(parseSetting(bounded, '10')).toEqual({ ok: false, message: 'Use 50 or more.' });
    expect(parseSetting(bounded, '6000')).toEqual({ ok: false, message: 'Use 5000 or less.' });
    expect(describeBounds(bounded)).toBe('Allowed: 50 to 5000');
    expect(describeBounds(item({}))).toBe('');
  });
  it('tidies text and caps it at 300 characters', () => {
    const t = item({ kind: 'text', value: '' });
    expect(parseSetting(t, '  Verigence   Pvt Ltd ')).toEqual({ ok: true, value: 'Verigence Pvt Ltd' });
    expect(parseSetting(t, 'x'.repeat(301)).ok).toBe(false);
  });
});

describe('collectChanges', () => {
  const items = [
    item({}),
    item({ key: 'claims.meals_monthly_limit', kind: 'money_or_null', value: null, default: null, label: 'Meals' }),
    item({ key: 'attendance.check_in_standard', kind: 'time', value: '10:30', label: 'Standard check-in time' }),
  ];
  it('sends only values that differ from what the service holds', () => {
    const { changes, errors } = collectChanges(items, {
      'attendance.geofence_radius_m': '500',
      'claims.meals_monthly_limit': '',
      'attendance.check_in_standard': '10:45',
    });
    expect(changes).toEqual({ 'attendance.check_in_standard': '10:45' });
    expect(errors).toEqual({});
  });
  it('reports bad values per key and does not include them', () => {
    const { changes, errors } = collectChanges(items, { 'attendance.geofence_radius_m': 'x', 'claims.meals_monthly_limit': '1200' });
    expect(changes).toEqual({ 'claims.meals_monthly_limit': 1200 });
    expect(Object.keys(errors)).toEqual(['attendance.geofence_radius_m']);
  });
  it('ignores untouched fields', () => {
    expect(collectChanges(items, {})).toEqual({ changes: {}, errors: {} });
  });
});

describe('placeServerProblem', () => {
  const items = [item({})];
  it('puts a message that starts with the setting label under that field', () => {
    const r = placeServerProblem(items, 'Geofence radius for PCs (metres): use a value from 50 to 5000.');
    expect(r.fields).toEqual({ 'attendance.geofence_radius_m': 'Use a value from 50 to 5000.' });
    expect(r.general).toBe('');
  });
  it('keeps cross-field messages as general ones', () => {
    const r = placeServerProblem(items, 'The Finance threshold cannot exceed the monthly travel limit.');
    expect(r.fields).toEqual({});
    expect(r.general).toContain('Finance threshold');
  });
});

describe('holidays', () => {
  it('validates date and name like the service does', () => {
    expect(validateHoliday({ date: '2026-10-20', name: 'Vijaya Dasami', status: 'DECLARED' })).toEqual({});
    expect(validateHoliday({ date: '2026-02-30', name: 'A', status: 'TENTATIVE' })).toEqual({
      date: 'Choose a date.',
      name: 'Enter the holiday name (at least 2 characters).',
    });
    expect(validateHoliday({ date: '2019-01-01', name: 'New Year', status: 'TENTATIVE' }).date).toBeDefined();
    expect(validateHoliday({ date: '2026-01-01', name: 'x'.repeat(121), status: 'TENTATIVE' }).name).toBeDefined();
  });
  it('sorts by date and formats without a time-zone shift', () => {
    const sorted = sortHolidays([
      { date: '2026-11-01', name: 'b', status: 'TENTATIVE' },
      { date: '2026-10-20', name: 'a', status: 'DECLARED' },
    ]);
    expect(sorted.map((h) => h.date)).toEqual(['2026-10-20', '2026-11-01']);
    expect(formatHolidayDate('2026-10-20')).toContain('20');
    expect(formatHolidayDate('2026-10-20')).toContain('2026');
  });
});
