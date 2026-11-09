import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';

import PageHeader from '../../components/PageHeader';
import SectionCard from '../../components/SectionCard';
import { ATTENDANCE_PERMISSION } from '../../services/hr/attendance';
import { getEmployeeCalendar, getTeamDaily, getTeamWeekly } from '../../services/hr/attendanceCalendar';
import { hrErrorMessage } from '../../services/hr/client';
import { useSessionStore } from '../../store/sessionStore';
import CalendarSection from '../../features/hr/attendance/CalendarSection';
import MonthSwitcher from '../../features/hr/attendance/MonthSwitcher';
import { attendanceKeys } from '../../features/hr/attendance/attendanceQueries';
import { formatTimeIst, formatWorkDate, todayIst } from '../../features/hr/attendance/attendanceFormat';
import {
  calendarShort,
  calendarTag,
  dayHolidaysText,
  formatHoursShort,
  formatMinutes,
  mondayOf,
  shiftDays,
  weekdayHeader,
} from '../../features/hr/attendance/calendarFormat';
import { useHrAccess, useLeadsAProject } from '../../features/hr/hrQueries';
import { TODAY_REFRESH_MS } from '../../features/hr/attendance/teamArrival';
import TeamDayView, { SharedTag } from '../../features/hr/attendance/TeamDayView';
import '../../styles/hr-attendance.css';
import '../../styles/hr-calendar.css';
import '../../styles/hr-team-day.css';

type View = 'daily' | 'weekly';

interface Person { employeeId: string; employeeName: string; employeeCode: string }

/**
 * Team Lead, Project Manager and Executive: the attendance of everyone on the projects they lead,
 * project by project, as a day or a week, with hours per day and the week's total. HR and the CEO
 * see every project. People who work on more than one project are tagged Shared under each one.
 * Tap a person for their month calendar.
 */
export default function HrTeamOverviewPage() {
  const accessToken = useSessionStore((state) => state.accessToken);
  const access = useHrAccess();
  const leads = useLeadsAProject();
  const allowed = leads || access.can(ATTENDANCE_PERMISSION.readAll);
  const [view, setView] = useState<View>('daily');
  const [date, setDate] = useState(todayIst);
  // The DealGuard dashboard's "Team today" card opens this page on its Project (?project=CODE).
  const [searchParams] = useSearchParams();
  const [project, setProject] = useState(() => searchParams.get('project')?.trim() ?? '');
  const [search, setSearch] = useState('');
  const [person, setPerson] = useState<Person | null>(null);
  const [month, setMonth] = useState(() => todayIst().slice(0, 7));
  const today = todayIst();

  const daily = useQuery({
    queryKey: attendanceKeys.teamDaily(date, project),
    queryFn: () => getTeamDaily(accessToken!, date, project || undefined),
    enabled: Boolean(accessToken) && allowed && view === 'daily',
    retry: false,
    refetchOnWindowFocus: false,
    // Today keeps itself current while the page is open (and the tab is in front); past days do not change.
    refetchInterval: date === today ? TODAY_REFRESH_MS : false,
  });
  const weekly = useQuery({
    queryKey: attendanceKeys.teamWeekly(mondayOf(date), project),
    queryFn: () => getTeamWeekly(accessToken!, date, project || undefined),
    enabled: Boolean(accessToken) && allowed && view === 'weekly',
    retry: false,
    refetchOnWindowFocus: false,
  });
  const calendar = useQuery({
    queryKey: attendanceKeys.employeeCalendar(person?.employeeId ?? '', month),
    queryFn: () => getEmployeeCalendar(accessToken!, person!.employeeId, month),
    enabled: Boolean(accessToken) && Boolean(person),
    retry: false,
    refetchOnWindowFocus: false,
  });

  const needle = search.trim().toLowerCase();
  const matches = (p: { employeeName: string; employeeCode: string }) =>
    !needle || p.employeeName.toLowerCase().includes(needle) || p.employeeCode.toLowerCase().includes(needle);

  const projectChoices = useMemo(() => {
    const source = view === 'daily' ? daily.data?.projects : weekly.data?.projects;
    return (source ?? []).filter((p) => p.projectCode).map((p) => ({ code: p.projectCode as string, name: p.projectName || p.projectCode }));
  }, [view, daily.data, weekly.data]);

  if (access.loading) return <div className="uc01-admin-state">Loading…</div>;
  if (!allowed) {
    return (
      <section className="uc01-admin-page" aria-label="Team attendance overview">
        <PageHeader eyebrow="HR" title="Team attendance overview" />
        <div className="uc01-admin-state uc01-admin-state--error">
          <strong>This view is for Team Leads, Project Managers, Executives and HR.</strong>
        </div>
      </section>
    );
  }

  if (person) {
    return (
      <section className="uc01-admin-page hr-page hr-att-page" aria-label={`Calendar of ${person.employeeName}`}>
        <PageHeader
          eyebrow="Team attendance"
          title={person.employeeName}
          description={`${person.employeeCode} · each day's status and hours, and the total for every week. Times in IST.`}
          actions={<button type="button" className="uc01-admin-button" onClick={() => setPerson(null)}>Back to the team</button>}
        />
        <SectionCard title="Calendar" action={<MonthSwitcher month={month} onChange={setMonth} />}>
          <CalendarSection query={calendar} />
        </SectionCard>
      </section>
    );
  }

  const step = view === 'daily' ? 1 : 7;
  const active = view === 'daily' ? daily : weekly;
  const open = (p: Person) => { setMonth(date.slice(0, 7)); setPerson(p); };

  return (
    <section className="uc01-admin-page hr-page hr-att-page" aria-label="Team attendance overview">
      <PageHeader
        eyebrow="HR"
        title="Team attendance overview"
        description="Everyone on your projects, project by project: the day or the week, hours per day and the week's total. Shared employees work on more than one project."
      />

      <div className="hr-ov-toolbar">
        <div className="hr-switcher" role="tablist" aria-label="View">
          {(['daily', 'weekly'] as const).map((v) => (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={view === v}
              className={`hr-switcher__item${view === v ? ' is-active' : ''}`}
              onClick={() => setView(v)}
            >
              {v === 'daily' ? 'Daily' : 'Weekly'}
            </button>
          ))}
        </div>
        <div className="hr-ov-date">
          <button type="button" className="uc01-admin-button" aria-label={view === 'daily' ? 'Previous day' : 'Previous week'} onClick={() => setDate(shiftDays(date, -step))}>‹</button>
          <label>
            <span className="hr-visually-hidden">Date</span>
            <input type="date" value={date} max={today} onChange={(e) => e.target.value && setDate(e.target.value)} />
          </label>
          <button
            type="button"
            className="uc01-admin-button"
            aria-label={view === 'daily' ? 'Next day' : 'Next week'}
            disabled={shiftDays(date, step) > today && (view === 'daily' || mondayOf(shiftDays(date, step)) > today)}
            onClick={() => setDate(shiftDays(date, step) > today ? today : shiftDays(date, step))}
          >›</button>
        </div>
        <label className="hr-ov-field">
          <span>Project</span>
          <select value={project} onChange={(e) => setProject(e.target.value)}>
            <option value="">All my projects</option>
            {projectChoices.map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}
          </select>
        </label>
        <label className="hr-ov-field hr-ov-field--grow">
          <span>Search</span>
          <input type="search" value={search} placeholder="Name or code" onChange={(e) => setSearch(e.target.value)} />
        </label>
        <button type="button" className="uc01-admin-button" onClick={() => active.refetch()} disabled={active.isFetching}>
          {active.isFetching ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {active.isLoading && <div className="uc01-admin-state">Loading attendance…</div>}
      {active.isError && (
        <div className="uc01-admin-state uc01-admin-state--error" role="alert">
          <strong>Attendance could not be loaded.</strong>
          <span>{hrErrorMessage(active.error)}</span>
          <button type="button" className="uc01-admin-button" onClick={() => active.refetch()}>Try again</button>
        </div>
      )}

      {view === 'daily' && daily.data && (
        <>
          <p className="hr-count">
            {formatWorkDate(daily.data.date)}
            {daily.data.dayKind !== 'WORKING' ? ` · ${daily.data.holiday ?? 'Sunday'} (day off)` : ''}
            {dayHolidaysText(daily.data.holidays, daily.data.dayKind) ? ` · Holidays: ${dayHolidaysText(daily.data.holidays, daily.data.dayKind)}` : ''}
          </p>
          <TeamDayView data={daily.data} today={today} updatedAt={daily.dataUpdatedAt} needle={needle} onOpen={open} />
        </>
      )}

      {view === 'weekly' && weekly.data && (
        <>
          <p className="hr-count">
            Week of {formatWorkDate(weekly.data.weekStart)} to {formatWorkDate(weekly.data.weekEnd)}
          </p>
          <div className="hr-cal-tiles">
            <div><span>People</span><strong>{weekly.data.summary.employees}</strong><small>{weekly.data.summary.shared} shared</small></div>
            <div><span>Hours clocked</span><strong>{formatMinutes(weekly.data.summary.minutes)}</strong></div>
            <div className={weekly.data.summary.absentDays ? 'is-attention' : undefined}><span>Absent days</span><strong>{weekly.data.summary.absentDays}</strong></div>
            <div><span>Leave approved</span><strong>{weekly.data.summary.leaveApprovedDays}</strong><small>days</small></div>
            <div><span>Leave applied</span><strong>{weekly.data.summary.leaveAppliedDays}</strong><small>days, not approved</small></div>
            <div><span>Waiting</span><strong>{weekly.data.summary.pendingDays}</strong><small>days</small></div>
          </div>
          {weekly.data.projects.length === 0 && <div className="uc01-admin-state">No one on your projects this week.</div>}
          {weekly.data.projects.map((group) => {
            const people = group.people.filter(matches);
            if (!people.length) return null;
            return (
              <SectionCard
                key={group.projectCode ?? 'none'}
                title={group.projectName || group.projectCode || 'No project'}
                description={`${people.length} ${people.length === 1 ? 'person' : 'people'} · ${formatMinutes(group.summary.minutes)} clocked`}
              >
                <div className="uc01-admin-table-wrap">
                  <table className="uc01-admin-table hr-table hr-ov-week">
                    <thead>
                      <tr>
                        <th>Employee</th>
                        {weekly.data.days.map((d) => {
                          const h = weekdayHeader(d);
                          return <th key={d} className={d === today ? 'is-today' : undefined}><span>{h.weekday}</span><small>{h.day}</small></th>;
                        })}
                        <th>Week total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {people.map((p) => (
                        <tr key={`${p.employeeId}-${p.projectCode}`} className={p.shared ? 'hr-ov-row--shared' : undefined}>
                          <td data-label="Employee">
                            <button type="button" className="hr-daily-open" onClick={() => open(p)} aria-label={`Open the calendar of ${p.employeeName}`}>
                              <span className="hr-daily-cell"><strong>{p.employeeName}</strong><small>{p.employeeCode}{p.roles.length ? ` · ${p.roles.join(', ')}` : ''}</small></span>
                            </button>
                            <SharedTag others={p.otherProjects} />
                          </td>
                          {p.days.map((c) => (
                            <td key={c.date} data-label={weekdayHeader(c.date).weekday} className={`hr-ov-cell hr-ov-cell--${calendarTag[c.status]}`} title={c.label || undefined}>
                              {calendarShort[c.status] && <span className={`hr-tag hr-tag--${calendarTag[c.status]}`}>{calendarShort[c.status]}</span>}
                              {(c.minutes > 0 || c.runningMinutes) && (
                                <small>{c.minutes ? formatHoursShort(c.minutes) : `${formatHoursShort(c.runningMinutes ?? 0)}…`}</small>
                              )}
                            </td>
                          ))}
                          <td data-label="Week total"><strong>{formatMinutes(p.weekMinutes)}</strong><small>{p.daysWorked} days</small></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </SectionCard>
            );
          })}
        </>
      )}
    </section>
  );
}
