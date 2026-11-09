import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';

import { TeamTodayView, attendanceOverviewLink, teamTodayProblem } from '../TeamTodayCard';
import type { TeamDaily, TeamDailyRow } from '../../../../services/hr/attendanceCalendar';
import { HrHttpError, HrNetworkError } from '../../../../services/hr/client';

const row = (over: Partial<TeamDailyRow>): TeamDailyRow => ({
  workDate: '2026-11-09', employeeId: 'e1', employeeCode: 'JBR001', employeeName: 'Asha Rao', projectCode: 'MAHOD', projectName: 'Mahindra',
  roles: ['PC'], outlets: [], status: 'NOT_CHECKED_IN', checkInAt: null, checkOutAt: null,
  checkInOutlet: null, checkInDistanceM: null, checkInOutOfFence: null,
  delinquencies: [], workedMinutes: 0, runningMinutes: null, weekMinutes: 0, leave: null, shared: false, otherProjects: [],
  ...over,
});

const summary = {
  employees: 0, checkedIn: 0, completed: 0, stillIn: 0, notCheckedIn: 0, absent: 0, onLeave: 0, leaveApplied: 0,
  missingCheckOut: 0, pendingApproval: 0, rejected: 0, corrected: 0, late: 0, shortDay: 0,
};

const day = (rows: TeamDailyRow[], dayKind: TeamDaily['dayKind'] = 'WORKING'): TeamDaily => ({
  date: '2026-11-09', dayKind, holiday: null, summary, projects: [], rows,
});

function render(props: Partial<Parameters<typeof TeamTodayView>[0]>) {
  return renderToString(
    <MemoryRouter>
      <TeamTodayView data={undefined} error={null} loading={false} projectCode="MAHOD" {...props} />
    </MemoryRouter>,
  ).replace(/<!-- -->/g, '');
}

const team = [
  row({ employeeId: 'a', employeeName: 'Asha', status: 'CHECKED_IN', checkInAt: '2026-11-09T03:42:00Z', checkInOutOfFence: false }),
  row({ employeeId: 'b', employeeName: 'Bikash', status: 'CHECKED_IN', checkInAt: '2026-11-09T04:35:00Z', checkInOutOfFence: false }),
  row({ employeeId: 'c', employeeName: 'Chitra', status: 'CHECKED_IN', checkInAt: '2026-11-09T03:30:00Z', checkInOutOfFence: true, checkInDistanceM: 4000 }),
  row({ employeeId: 'd', employeeName: 'Deepak', roles: ['TL'], status: 'CHECKED_IN', checkInAt: '2026-11-09T03:00:00Z' }),
  ...['Eshan', 'Farah', 'Gopal', 'Hema', 'Indu', 'Jai'].map((name, i) => row({ employeeId: `n${i}`, employeeName: name })),
  row({ employeeId: 'l', employeeName: 'Lata', status: 'ON_LEAVE' }),
  // Another Project of the same lead: not counted on this Project's dashboard.
  row({ employeeId: 'z', employeeName: 'Zoya', projectCode: 'TATA' }),
];

describe('Team today card', () => {
  it('shows n of m reached the outlet, first and latest arrival, and who has not checked in', () => {
    const html = render({ data: day(team) });
    // PCs at work: Asha, Bikash, Chitra and six not in yet = 9; Deepak (TL) and Lata (leave) are not counted.
    expect(html).toContain('2<span> of 9</span>');
    expect(html).toContain('reached the outlet');
    expect(html).toContain('9:12 am');
    expect(html).toContain('10:05 am');
    expect(html).toContain('Not checked in yet (6):');
    expect(html).toContain('Eshan, Farah, Gopal, Hema, Indu +1');
    expect(html).not.toContain('Zoya');
    expect(html).toContain('href="/hr/attendance/overview?project=MAHOD"');
  });

  it('says so when everyone has checked in', () => {
    const html = render({ data: day(team.slice(0, 4)) });
    expect(html).toContain('Everyone expected today has checked in.');
  });

  it('is quiet when the Project has no one in myHR, or it is a day off', () => {
    expect(render({ data: day([row({ projectCode: 'TATA' })]) })).toContain('No one on this Project’s team in myHR today.');
    expect(render({ data: day([], 'SUNDAY') })).toContain('A day off');
    // No rows for this Project: the link opens all the lead's projects.
    expect(render({ data: day([]) })).toContain('href="/hr/attendance/overview"');
  });

  it('says myHR is unavailable in one line instead of failing', () => {
    const html = render({ error: new HrNetworkError('down') });
    expect(html).toContain('could not be loaded from myHR');
    expect(html).toContain('Team today');
    expect(render({ loading: true })).toContain('Loading today’s attendance');
  });

  it('never shows a face-match score', () => {
    const html = render({ data: day(team) });
    expect(html.toLowerCase()).not.toContain('face');
  });
});

describe('teamTodayProblem', () => {
  it('words each failure for a lead', () => {
    expect(teamTodayProblem(new HrHttpError(403, { code: 'FORBIDDEN' }))).toContain('do not lead a team');
    expect(teamTodayProblem(new HrHttpError(403, { code: 'NIGHT_MODE' }))).toBe('Night Mode On');
    expect(teamTodayProblem(new HrHttpError(401))).toContain('Sign in again');
    expect(teamTodayProblem(new HrHttpError(503))).toContain('could not be loaded');
  });
});

describe('attendanceOverviewLink', () => {
  it('opens the overview on the Project, or on all projects', () => {
    expect(attendanceOverviewLink('MAH OD')).toBe('/hr/attendance/overview?project=MAH%20OD');
    expect(attendanceOverviewLink(undefined)).toBe('/hr/attendance/overview');
  });
});
