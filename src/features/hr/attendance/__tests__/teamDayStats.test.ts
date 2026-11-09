import { describe, expect, it } from 'vitest';

import type { StandardTimes, TeamDailyRow } from '../../../../services/hr/attendanceCalendar';
import { buildTeamDay, dayClock, formatHhmm, noCheckIn, punchStats, uniquePeople } from '../teamDayStats';

const times: StandardTimes = {
  checkIn: '10:30', lateAfter: '11:15', checkOutEarliest: '17:00', checkOut: '18:30', absentAfter: '17:00', minimumHours: 5,
};

let n = 0;
const row = (over: Partial<TeamDailyRow>): TeamDailyRow => {
  n += 1;
  return {
    workDate: '2026-11-09', employeeId: `e${n}`, employeeCode: `JBR${n}`, employeeName: `Person ${n}`,
    projectCode: 'MAH', projectName: 'Mahindra', roles: ['PC'], outlets: ['Cuttack'], status: 'NOT_CHECKED_IN',
    checkInAt: null, checkOutAt: null, checkInOutlet: null, checkInDistanceM: null, checkInOutOfFence: null,
    delinquencies: [], workedMinutes: 0, runningMinutes: null, weekMinutes: 0, leave: null, shared: false, otherProjects: [],
    ...over,
  };
};

/** An ISO instant for an India time on 9 Nov 2026. */
const ist = (hhmm: string, day = '2026-11-09') => new Date(`${day}T${hhmm}:00+05:30`).toISOString();
const late = { code: 'LATE_CHECK_IN', label: 'Late check-in', side: 'CHECK_IN' as const, decision: 'PENDING' };
const early = { code: 'EARLY_CHECK_OUT', label: 'Early check-out', side: 'CHECK_OUT' as const, decision: 'APPROVED' };

describe('punchStats', () => {
  const today = '2026-11-09';
  const rows = [
    row({ employeeName: 'Bina', checkInAt: ist('10:05'), checkOutAt: ist('18:40'), status: 'COMPLETE', standardTimes: times }),
    row({ employeeName: 'Asha', checkInAt: ist('09:50'), checkOutAt: ist('16:30'), status: 'COMPLETE', delinquencies: [early], standardTimes: times }),
    row({ employeeName: 'Ravi', checkInAt: ist('11:40'), status: 'CHECKED_IN', delinquencies: [late], standardTimes: times, checkInOutOfFence: true, checkInDistanceM: 2400, checkInOutlet: 'Cuttack' }),
    row({ employeeName: 'Dev', status: 'NOT_CHECKED_IN' }),
  ];

  it('finds the first and last check-in and check-out with who made them', () => {
    const s = punchStats(rows, { date: today, today, now: new Date(ist('19:00')), standardTimes: times });
    expect(s.firstIn?.employeeName).toBe('Asha');
    expect(s.lastIn?.employeeName).toBe('Ravi');
    expect(s.firstOut?.employeeName).toBe('Asha');
    expect(s.lastOut?.employeeName).toBe('Bina');
  });

  it("lists late check-ins and early check-outs from myHR's flags, with how late or early by the standard times", () => {
    const s = punchStats(rows, { date: today, today, now: new Date(ist('19:00')), standardTimes: times });
    expect(s.late.map((p) => [p.employeeName, p.minutes, p.reference])).toEqual([['Ravi', 70, '10:30']]);
    expect(s.early.map((p) => [p.employeeName, p.minutes, p.reference])).toEqual([['Asha', 120, '18:30']]);
    expect(s.away.map((p) => [p.employeeName, p.label])).toEqual([['Ravi', 'Away 2.4 km']]);
  });

  it('says just "late" when myHR sends no times, and never flags anyone itself', () => {
    const old = rows.map((r) => ({ ...r, standardTimes: undefined }));
    const s = punchStats(old, { date: today, today, now: new Date(ist('19:00')) });
    expect(s.late.map((p) => [p.employeeName, p.minutes, p.reference])).toEqual([['Ravi', null, null]]);
    // Bina came at 10:05, before 10:30, and Asha left at 16:30; only the flags count.
    expect(s.early.map((p) => p.employeeName)).toEqual(['Asha']);
  });

  it('counts "not checked out" today only after the standard check-out time; on a past day, everyone left in', () => {
    expect(punchStats(rows, { date: today, today, now: new Date(ist('15:00')), standardTimes: times }).notCheckedOut).toBeNull();
    expect(punchStats(rows, { date: today, today, now: new Date(ist('18:45')), standardTimes: times }).notCheckedOut?.map((p) => p.employeeName)).toEqual(['Ravi']);
    expect(punchStats(rows.map((r) => ({ ...r, standardTimes: undefined })), { date: today, today, now: new Date(ist('20:00')) }).notCheckedOut).toBeNull();
    expect(punchStats(rows, { date: '2026-11-08', today, now: new Date(ist('10:00')) }).notCheckedOut?.map((p) => p.employeeName)).toEqual(['Ravi']);
    // After the end with everyone out: an empty list, not "unknown".
    const out = rows.filter((r) => r.checkOutAt);
    expect(punchStats(out, { date: today, today, now: new Date(ist('19:00')), standardTimes: times }).notCheckedOut).toEqual([]);
  });

  it('measures from the half-day time the row carries', () => {
    const morningOff = { ...times, checkIn: '14:00', lateAfter: '14:45' };
    const s = punchStats([row({ checkInAt: ist('14:50'), delinquencies: [late], standardTimes: morningOff })], { date: today, today, now: new Date(ist('15:00')), standardTimes: times });
    expect(s.late[0].minutes).toBe(50);
    expect(s.late[0].reference).toBe('14:00');
  });
});

describe('noCheckIn', () => {
  it('keeps absent, not yet, on leave and morning off apart', () => {
    const g = noCheckIn([
      row({ employeeName: 'Zed', status: 'ABSENT' }),
      row({ employeeName: 'Yan', status: 'NOT_CHECKED_IN' }),
      row({ employeeName: 'Xia', status: 'ON_LEAVE' }),
      row({ employeeName: 'Wen', status: 'LEAVE_APPLIED' }),
      row({ employeeName: 'Vik', status: 'NOT_CHECKED_IN', halfDayHoliday: { name: 'Eve', dayPart: 'MORNING', splitAt: '14:00' } }),
      row({ employeeName: 'Uma', status: 'COMPLETE', checkInAt: ist('10:00') }),
    ], new Date(ist('11:00')));
    expect(g.absent.map((p) => p.employeeName)).toEqual(['Zed']);
    expect(g.notYet.map((p) => p.employeeName)).toEqual(['Yan']);
    expect(g.onLeave.map((p) => [p.employeeName, p.leaveApplied])).toEqual([['Wen', true], ['Xia', false]]);
    expect(g.morningOff.map((p) => [p.employeeName, p.until])).toEqual([['Vik', '14:00']]);
  });

  it('judges a past day at its end, so a morning off never hides an absence', () => {
    const past = row({ status: 'ABSENT', halfDayHoliday: { name: 'Eve', dayPart: 'MORNING', splitAt: '14:00' } });
    const g = noCheckIn([past], dayClock('2026-11-08', '2026-11-09', new Date(ist('09:00'))));
    expect(g.absent).toHaveLength(1);
    expect(g.morningOff).toHaveLength(0);
  });
});

describe('buildTeamDay', () => {
  const shared = { employeeId: 'shared', employeeName: 'Meera', employeeCode: 'JBR900', checkInAt: ist('11:30'), status: 'CHECKED_IN', delinquencies: [late], standardTimes: times };
  const rows = [
    row({ ...shared, projectCode: 'MAH', projectName: 'Mahindra', roles: ['PC'], outlets: ['Cuttack'], shared: true, otherProjects: [{ projectCode: 'TAT', projectName: 'Tata' }] }),
    row({ ...shared, projectCode: 'TAT', projectName: 'Tata', roles: ['TL'], outlets: ['Puri'], shared: true, otherProjects: [{ projectCode: 'MAH', projectName: 'Mahindra' }] }),
    row({ employeeName: 'Asha', projectCode: 'MAH', checkInAt: ist('10:00'), checkInOutOfFence: false, status: 'CHECKED_IN', standardTimes: times }),
    row({ employeeName: 'Ravi', projectCode: 'MAH', status: 'ON_LEAVE' }),
    row({ employeeName: 'Dev', projectCode: 'TAT', projectName: 'Tata', status: 'NOT_CHECKED_IN' }),
    row({ employeeName: 'Nobody', projectCode: null, projectName: null, status: 'NOT_CHECKED_IN' }),
  ];
  const day = buildTeamDay(rows, { date: '2026-11-09', today: '2026-11-09', now: new Date(ist('12:00')), standardTimes: times });

  it('counts someone on two projects once in the overview', () => {
    expect(day.overview.people).toBe(5);
    expect(day.overview.present).toBe(2);
    expect(day.overview.expected).toBe(4);
    expect(day.overview.punches.late.map((p) => p.employeeName)).toEqual(['Meera']);
    expect(day.overview.notYet.map((p) => p.employeeName)).toEqual(['Dev', 'Nobody']);
    expect(day.overview.onLeave.map((p) => p.employeeName)).toEqual(['Ravi']);
    expect(day.overview.reached).toBe(1);
    expect(day.overview.punches.firstIn?.employeeName).toBe('Asha');
    expect(day.overview.punches.notCheckedOut).toBeNull();
  });

  it('lists them under each of their projects, in name order with no project last', () => {
    expect(day.projects.map((p) => p.name)).toEqual(['Mahindra', 'Tata', 'No project']);
    const [mah, tata] = day.projects;
    expect(mah.rows.map((r) => r.employeeName)).toContain('Meera');
    expect(tata.rows.map((r) => r.employeeName)).toContain('Meera');
    expect([mah.present, mah.expected, mah.people]).toEqual([2, 2, 3]);
    expect([tata.present, tata.expected]).toEqual([1, 2]);
    expect(tata.punches.late[0].minutes).toBe(60);
    expect(tata.notYet.map((p) => p.employeeName)).toEqual(['Dev']);
    expect(mah.notYet).toEqual([]);
  });

  it('merges the roles and outlets of a shared person', () => {
    const [meera] = uniquePeople(rows.slice(0, 2));
    expect(meera.roles).toEqual(['PC', 'TL']);
    expect(meera.outlets).toEqual(['Cuttack', 'Puri']);
  });

  it('expects nobody from a project whose people are all on leave', () => {
    const all = buildTeamDay([row({ status: 'ON_LEAVE', projectCode: 'X', projectName: 'X' })], { date: '2026-11-09', today: '2026-11-09' });
    expect(all.projects[0].expected).toBe(0);
  });
});

describe('formatHhmm', () => {
  it('reads like the check-in times', () => {
    expect(formatHhmm('10:30')).toBe('10:30 am');
    expect(formatHhmm('14:00')).toBe('2:00 pm');
    expect(formatHhmm('00:05')).toBe('12:05 am');
    expect(formatHhmm('12:00')).toBe('12:00 pm');
  });
});
