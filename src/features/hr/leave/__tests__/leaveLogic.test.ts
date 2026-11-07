import { describe, expect, it } from 'vitest';

import { HrHttpError } from '../../../../services/hr/client';

import {
  addDays,
  birthdayLeaveText,
  recentLeaveText,
  dayPartWords,
  holidayNoteParts,
  buildApplyPayload,
  dayWord,
  daysBetween,
  earningProgress,
  formatDays,
  isYearlyType,
  isSunday,
  istToday,
  leaveErrorMessage,
  leaveTypeLabels,
  paidTypeLabels,
  parseAdjustDays,
  validateAdjust,
  validateApply,
  waitingFor,
  type ApplyForm,
} from '../leaveLogic';

const today = '2026-10-04';
const base: ApplyForm = { leaveType: 'PAID', fromDate: '2026-10-12', toDate: '2026-10-13', halfDay: false, reason: '' };

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
  it('asks no occasion for birthday leave: the server records "Birthday"', () => {
    expect(validateApply({ ...base, leaveType: 'SPECIAL' }, today)).toEqual({});
  });
  it('does not ask for an occasion on other types', () => {
    for (const leaveType of ['PAID', 'COMP_OFF', 'UNPAID'] as const) {
      expect(validateApply({ ...base, leaveType }, today)).toEqual({});
    }
  });
});

describe('buildApplyPayload', () => {
  it('never sends an occasion, and trims the reason', () => {
    expect(buildApplyPayload({ ...base, leaveType: 'SPECIAL', reason: ' ' })).toEqual({
      leave_type: 'SPECIAL',
      from_date: '2026-10-12',
      to_date: '2026-10-13',
      half_day: false,
    });
    const paid = buildApplyPayload({ ...base, reason: ' Family ' });
    expect(paid).toEqual({ leave_type: 'PAID', from_date: '2026-10-12', to_date: '2026-10-13', half_day: false, reason: 'Family' });
    expect('occasion' in paid).toBe(false);
  });
});

describe('labels', () => {
  it('names the new types and marks the old ones', () => {
    expect(leaveTypeLabels.PAID).toBe('Paid leave');
    expect(leaveTypeLabels.SPECIAL).toBe('Birthday leave (special occasion)');
    expect(leaveTypeLabels.COMP_OFF).toBe('Comp-off');
    expect(leaveTypeLabels.UNPAID).toBe('Unpaid leave');
    expect(leaveTypeLabels.SICK).toBe('Sick leave (old)');
    expect(leaveTypeLabels.EARNED).toBe('Earned leave (old)');
    expect(paidTypeLabels).toEqual({ PAID: 'Paid', SPECIAL: 'Birthday', COMP_OFF: 'Comp-off' });
  });
  it('treats only special occasion leave as yearly', () => {
    expect(isYearlyType('SPECIAL')).toBe(true);
    expect(isYearlyType('PAID')).toBe(false);
    expect(isYearlyType('COMP_OFF')).toBe(false);
  });
  it('explains a missing occasion reported by the server', () => {
    const error = new HrHttpError(400, { code: 'LEAVE_OCCASION_REQUIRED', detail: 'occasion is required' });
    expect(leaveErrorMessage(error)).toBe('Say what the special occasion is.');
  });
});

describe('earning', () => {
  it('works out the progress towards the next paid day', () => {
    expect(earningProgress(11, 22)).toBe(50);
    expect(earningProgress(0, 22)).toBe(0);
    expect(earningProgress(30, 22)).toBe(100);
    expect(earningProgress(5, 0)).toBe(0);
    expect(earningProgress(10.5, 22)).toBe(48);
  });
  it('writes days with a unit', () => {
    expect(dayWord(1)).toBe('1 day');
    expect(dayWord(0.5)).toBe('0.5 days');
    expect(dayWord(3)).toBe('3 days');
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
    const ok = { leaveType: 'PAID' as const, year: '2026', days: '1', note: 'Carry over' };
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

describe('holidays inside the chosen dates (7 Nov 2026)', () => {
  const items = [
    { date: '2026-11-09', name: 'Full', status: 'DECLARED' as const, dayPart: 'FULL_DAY' as const },
    { date: '2026-11-10', name: 'Eve', status: 'DECLARED' as const, dayPart: 'AFTERNOON' as const },
    { date: '2026-11-11', name: 'Puja', status: 'DECLARED' as const, dayPart: 'MORNING' as const },
    { date: '2026-11-11', name: 'Mela', status: 'DECLARED' as const, dayPart: 'AFTERNOON' as const },
    { date: '2026-11-12', name: 'Maybe', status: 'TENTATIVE' as const, dayPart: 'MORNING' as const },
    { date: '2026-11-20', name: 'Later', status: 'DECLARED' as const },
  ];
  it('sorts full, half and tentative; two halves of one date are a full day', () => {
    const parts = holidayNoteParts(items, '2026-11-09', '2026-11-12');
    expect(parts.full.map((h) => h.name)).toEqual(['Full', 'Puja', 'Mela']);
    expect(parts.half.map((h) => h.name)).toEqual(['Eve']);
    expect(parts.tentative.map((h) => h.name)).toEqual(['Maybe']);
    expect(parts.halfDayClash).toBeNull();
  });
  it('flags half-day leave on a half-day holiday', () => {
    expect(holidayNoteParts(items, '2026-11-10', '2026-11-10', true).halfDayClash?.name).toBe('Eve');
    expect(holidayNoteParts(items, '2026-11-13', '2026-11-13', true).halfDayClash).toBeNull();
  });
  it('an older service sends no day part: a full day', () => {
    expect(holidayNoteParts([{ date: '2026-11-20', name: 'Later', status: 'DECLARED' as const }], '2026-11-20', '').full).toHaveLength(1);
    expect(dayPartWords('MORNING')).toBe('morning off');
    expect(dayPartWords(undefined)).toBe('');
  });
});

describe('leave taken in the 6 weeks before a request (7 Nov 2026)', () => {
  it('writes the server numbers as words', () => {
    expect(recentLeaveText({ windowFrom: '2026-09-28', windowTo: '2026-11-08', paidDays: 4.5, unpaidDays: 1 })).toBe(
      'In the 6 weeks before (28 Sept to 8 Nov 2026): 4.5 days paid leave, 1 day unpaid leave.',
    );
    expect(recentLeaveText({ windowFrom: '2026-09-28', windowTo: '2026-11-08', paidDays: 0, unpaidDays: 0 })).toContain('no days paid leave, no days unpaid leave');
  });
});

describe('birthday leave card (7 Nov 2026)', () => {
  const info = { dateOfBirthOnFile: true as const, birthdayYear: 2026, availableFrom: '2026-08-30', availableUntil: '2027-08-29', nextOpensOn: '2027-08-30' };
  it('says from when to when while there is some, and when it opens once used', () => {
    expect(birthdayLeaveText(info, 1)).toBe('Available from 30 Aug 2026 to 29 Aug 2027');
    expect(birthdayLeaveText(info, 0)).toBe('Opens on 30 Aug 2027');
  });
  it('says why there is none, and nothing for an older service', () => {
    expect(birthdayLeaveText({ dateOfBirthOnFile: false, message: 'Your date of birth is not in myHR; ask HR to add it.' }, 0)).toBe(
      'Your date of birth is not in myHR; ask HR to add it.',
    );
    expect(birthdayLeaveText(undefined, 1)).toBe('');
  });
});
