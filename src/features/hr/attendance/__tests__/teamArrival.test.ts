import { describe, expect, it } from 'vitest';

import type { TeamDailyRow } from '../../../../services/hr/attendanceCalendar';
import {
  arrivalKind,
  arrivalPlace,
  isOutletStaff,
  namesWithMore,
  nextCheckInSort,
  sortByCheckIn,
  summarizeArrivals,
} from '../teamArrival';

const row = (over: Partial<TeamDailyRow>): TeamDailyRow => ({
  workDate: '2026-11-09', employeeId: 'e1', employeeCode: 'JBR001', employeeName: 'Asha Rao', projectCode: 'MAH', projectName: 'Mahindra',
  roles: ['PC'], outlets: ['Cuttack'], status: 'CHECKED_IN', checkInAt: null, checkOutAt: null,
  checkInOutlet: null, checkInDistanceM: null, checkInOutOfFence: null,
  delinquencies: [], workedMinutes: 0, runningMinutes: null, weekMinutes: 0, leave: null, shared: false, otherProjects: [],
  ...over,
});

// 09:12, 09:40 and 10:05 IST.
const at = { early: '2026-11-09T03:42:00Z', mid: '2026-11-09T04:10:00Z', late: '2026-11-09T04:35:00Z' };

describe('arrivalKind', () => {
  it('reads the geofence decision myHR stored, never the distance alone', () => {
    expect(arrivalKind(row({ checkInAt: at.early, checkInOutOfFence: false, checkInDistanceM: 120 }))).toBe('REACHED');
    expect(arrivalKind(row({ checkInAt: at.early, checkInOutOfFence: true, checkInDistanceM: 2400 }))).toBe('AWAY');
    // A distance with no fence decision (the fence does not apply) says nothing about the outlet.
    expect(arrivalKind(row({ checkInAt: at.early, checkInOutOfFence: null, checkInDistanceM: 40 }))).toBe('CHECKED_IN');
    expect(arrivalKind(row({ checkInAt: at.early, checkInOutOfFence: undefined }))).toBe('CHECKED_IN');
  });

  it('sorts people without a check-in into not yet, on leave and other', () => {
    expect(arrivalKind(row({ status: 'NOT_CHECKED_IN' }))).toBe('NOT_YET');
    expect(arrivalKind(row({ status: 'ABSENT' }))).toBe('NOT_YET');
    expect(arrivalKind(row({ status: 'ON_LEAVE' }))).toBe('ON_LEAVE');
    expect(arrivalKind(row({ status: 'LEAVE_APPLIED' }))).toBe('ON_LEAVE');
    expect(arrivalKind(row({ status: 'CORRECTED' }))).toBe('OTHER');
  });

  it('counts a check-in even on a day of approved leave', () => {
    expect(arrivalKind(row({ status: 'ON_LEAVE', checkInAt: at.early, checkInOutOfFence: false }))).toBe('REACHED');
  });
});

describe('arrivalPlace', () => {
  it('names the outlet and says at outlet or how far away', () => {
    expect(arrivalPlace(row({ checkInAt: at.early, checkInOutlet: 'Cuttack', checkInOutOfFence: false, checkInDistanceM: 80 })))
      .toEqual({ label: 'At outlet', tone: 'green', outlet: 'Cuttack' });
    expect(arrivalPlace(row({ checkInAt: at.early, checkInOutlet: 'Puri', checkInOutOfFence: true, checkInDistanceM: 2430 })))
      .toEqual({ label: 'Away 2.4 km', tone: 'red', outlet: 'Puri' });
    expect(arrivalPlace(row({ checkInAt: at.early, checkInOutlet: 'Puri', checkInOutOfFence: true, checkInDistanceM: 640 })).label).toBe('Away 640 m');
  });

  it('does not invent a distance or a verdict that myHR did not store', () => {
    expect(arrivalPlace(row({ checkInAt: at.early, checkInOutOfFence: true, checkInDistanceM: null })).label).toBe('Away from outlet');
    expect(arrivalPlace(row({ checkInAt: at.early, checkInOutlet: null, checkInOutOfFence: null, checkInDistanceM: 3000 })))
      .toEqual({ label: null, tone: null, outlet: null });
    expect(arrivalPlace(row({ checkInAt: null, checkInOutlet: 'Cuttack', checkInOutOfFence: false }))).toEqual({ label: null, tone: null, outlet: null });
  });
});

describe('isOutletStaff', () => {
  it('follows myHR: a PC who is not also a TL or PM', () => {
    expect(isOutletStaff(['PC'])).toBe(true);
    expect(isOutletStaff(['pc'])).toBe(true);
    expect(isOutletStaff(['PC', 'TL'])).toBe(false);
    expect(isOutletStaff(['PM'])).toBe(false);
    expect(isOutletStaff([])).toBe(false);
  });
});

describe('summarizeArrivals', () => {
  const rows = [
    row({ employeeId: 'a', employeeName: 'Asha', checkInAt: at.mid, checkInOutOfFence: false, checkInOutlet: 'Cuttack' }),
    row({ employeeId: 'b', employeeName: 'Bikash', checkInAt: at.late, checkInOutOfFence: false, checkInOutlet: 'Puri' }),
    row({ employeeId: 'c', employeeName: 'Chitra', checkInAt: at.early, checkInOutOfFence: true, checkInDistanceM: 5200 }),
    row({ employeeId: 'd', employeeName: 'Deepak', roles: ['TL'], checkInAt: at.early }),
    row({ employeeId: 'e', employeeName: 'Eshan', status: 'NOT_CHECKED_IN' }),
    row({ employeeId: 'f', employeeName: 'Bina', status: 'NOT_CHECKED_IN' }),
    row({ employeeId: 'g', employeeName: 'Gita', status: 'ON_LEAVE' }),
    row({ employeeId: 'h', employeeName: 'Hari', status: 'LEAVE_APPLIED' }),
  ];

  it('counts reached, away, checked in without an outlet check, not yet and on leave', () => {
    const s = summarizeArrivals(rows);
    expect(s.people).toBe(8);
    expect(s.reached).toBe(2);
    expect(s.away).toBe(1);
    expect(s.checkedIn).toBe(1);
    expect(s.notYet.map((p) => p.employeeName)).toEqual(['Bina', 'Eshan']);
    expect(s.onLeave).toBe(2);
    expect(s.leaveApplied).toBe(1);
  });

  it('gives n of m over the outlet staff who are not on leave', () => {
    const s = summarizeArrivals(rows);
    // a, b, c, e, f are PCs at work today; d is a TL; g and h are on leave.
    expect(s.outletStaffExpected).toBe(5);
    expect(s.outletStaffReached).toBe(2);
  });

  it('takes the first and latest arrival from the check-ins at the outlet only', () => {
    const s = summarizeArrivals(rows);
    // Chitra (away) and Deepak (TL) checked in earlier, but did not reach an outlet.
    expect(s.firstArrival).toBe(at.mid);
    expect(s.lastArrival).toBe(at.late);
    expect(summarizeArrivals([rows[2], rows[4]]).firstArrival).toBeNull();
  });

  it('counts someone on two projects once and merges their roles', () => {
    const twice = [
      row({ employeeId: 'x', projectCode: 'MAH', roles: ['PC'], status: 'NOT_CHECKED_IN' }),
      row({ employeeId: 'x', projectCode: 'TATA', roles: ['TL'], status: 'NOT_CHECKED_IN' }),
    ];
    const s = summarizeArrivals(twice);
    expect(s.people).toBe(1);
    expect(s.notYet).toHaveLength(1);
    // PC on one project and TL on the other: myHR does not geofence them.
    expect(s.outletStaffExpected).toBe(0);
  });

  it('is all zeros for no rows', () => {
    const s = summarizeArrivals([]);
    expect(s).toMatchObject({ people: 0, reached: 0, away: 0, checkedIn: 0, onLeave: 0, outletStaffExpected: 0, firstArrival: null });
    expect(s.notYet).toEqual([]);
  });
});

describe('namesWithMore', () => {
  const people = ['A', 'B', 'C', 'D', 'E', 'F', 'G'].map((employeeName) => ({ employeeName }));
  it('lists up to five names, then +N', () => {
    expect(namesWithMore(people)).toBe('A, B, C, D, E +2');
    expect(namesWithMore(people.slice(0, 5))).toBe('A, B, C, D, E');
    expect(namesWithMore([])).toBe('');
  });
});

describe('sortByCheckIn', () => {
  const rows = [
    row({ employeeId: '1', checkInAt: at.late }),
    row({ employeeId: '2', checkInAt: null }),
    row({ employeeId: '3', checkInAt: at.early }),
    row({ employeeId: '4', checkInAt: null }),
    row({ employeeId: '5', checkInAt: at.mid }),
  ];
  const ids = (list: TeamDailyRow[]) => list.map((r) => r.employeeId).join('');

  it('sorts earliest or latest first and keeps people without a check-in last', () => {
    expect(ids(sortByCheckIn(rows, 'asc'))).toBe('35124');
    expect(ids(sortByCheckIn(rows, 'desc'))).toBe('15324');
    expect(ids(sortByCheckIn(rows, 'none'))).toBe('12345');
  });

  it('cycles like a Carbon sortable header', () => {
    expect(nextCheckInSort('none')).toBe('asc');
    expect(nextCheckInSort('asc')).toBe('desc');
    expect(nextCheckInSort('desc')).toBe('none');
  });
});

describe('morning off on a half-day holiday', () => {
  const morningOff = { name: 'Post Diwali', dayPart: 'MORNING' as const, splitAt: '14:00' };
  // 9 Nov 2026, 11:00 and 14:30 India time.
  const before = new Date('2026-11-09T05:30:00Z');
  const after = new Date('2026-11-09T09:00:00Z');

  it('is not "not checked in yet" before the afternoon starts', () => {
    const rows = [
      row({ employeeId: 'a', employeeName: 'Asha', roles: ['PC'], status: 'NOT_CHECKED_IN', checkInAt: null, halfDayHoliday: morningOff }),
    ];
    const s = summarizeArrivals(rows, before);
    expect(s.notYet).toHaveLength(0);
    expect(s.morningOff).toBe(1);
    expect(s.morningOffUntil).toBe('14:00');
    expect(s.outletStaffExpected).toBe(0);
  });

  it('is expected again once the afternoon has started', () => {
    const rows = [
      row({ employeeId: 'a', employeeName: 'Asha', roles: ['PC'], status: 'NOT_CHECKED_IN', checkInAt: null, halfDayHoliday: morningOff }),
    ];
    const s = summarizeArrivals(rows, after);
    expect(s.morningOff).toBe(0);
    expect(s.notYet.map((p) => p.employeeName)).toEqual(['Asha']);
    expect(s.outletStaffExpected).toBe(1);
  });

  it('an afternoon-off holiday changes nothing in the morning', () => {
    const rows = [
      row({ employeeId: 'a', employeeName: 'Asha', roles: ['PC'], status: 'NOT_CHECKED_IN', checkInAt: null,
        halfDayHoliday: { name: 'Eve', dayPart: 'AFTERNOON', splitAt: '14:00' } }),
    ];
    expect(summarizeArrivals(rows, before).notYet).toHaveLength(1);
  });
});
