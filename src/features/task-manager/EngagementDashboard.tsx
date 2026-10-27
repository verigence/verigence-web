import { Fragment, useMemo, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';

import SectionCard from '../../components/SectionCard';
import {
  getEngagement, type EngagementCell, type EngagementPeriod, type EngagementPerson, type TaskManagerMode,
} from '../../services/audit-core/taskManager';
import type { LoginPerson } from '../../services/security/loginActivity';
import { addDays, istToday, minutesText, personName, roleLabel } from './tmFormat';
import '../../styles/task-manager.css';

/*
 * Employee engagement of one Project, by day, week or month (product owner
 * 2026-10-27): time on Verigence, sessions (count, shortest, average,
 * longest), output (files, pages, bad scans), work (journey tasks, Task
 * Manager tasks, reviews) and plain efficacy ratios, with a period-by-period
 * view so a person can be compared week to week and month to month.
 * Executive and Superadmin only; the server enforces it.
 */

const MAX_DAYS = 93;

export function mondayOf(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  const weekday = (d.getUTCDay() + 6) % 7; // Monday = 0
  return addDays(day, -weekday);
}

export function firstOfMonth(day: string, monthsBack = 0): string {
  const d = new Date(`${day.slice(0, 7)}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - monthsBack);
  return d.toISOString().slice(0, 10);
}

/** The default range for a period: 7 days, 8 weeks or 3 months ending today. */
export function defaultRange(period: EngagementPeriod, today = istToday()): { from: string; to: string } {
  if (period === 'week') return { from: addDays(mondayOf(today), -49), to: today };
  if (period === 'month') return { from: firstOfMonth(today, 2), to: today };
  return { from: addDays(today, -6), to: today };
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
}

type MetricKey =
  | 'activeMinutes' | 'inUsePct' | 'daysActive' | 'avgActivePerDay' | 'sessions' | 'sessionAvg'
  | 'filesUploaded' | 'pagesUploaded' | 'filesPerActiveHour' | 'tasksPerActiveHour' | 'journeyTasksWorked'
  | 'tasksCompleted' | 'onTimePct' | 'badScanPct' | 'reviewsDone';

type Metric = { key: MetricKey; label: string; higherIsBetter: boolean; value: (c: EngagementCell) => number | null; text: (n: number) => string };

const pct = (n: number) => `${n}%`;
const num = (n: number) => String(n);

export const METRICS: Metric[] = [
  { key: 'activeMinutes', label: 'Active time', higherIsBetter: true, value: (c) => c.activeMinutes, text: minutesText },
  { key: 'inUsePct', label: 'In use (active ÷ open)', higherIsBetter: true, value: (c) => c.efficacy.inUsePct, text: pct },
  { key: 'daysActive', label: 'Days active', higherIsBetter: true, value: (c) => c.daysActive, text: num },
  { key: 'avgActivePerDay', label: 'Active time per day worked', higherIsBetter: true, value: (c) => c.efficacy.avgActiveMinutesPerDayActive, text: minutesText },
  { key: 'sessions', label: 'Sessions', higherIsBetter: true, value: (c) => c.sessions, text: num },
  { key: 'sessionAvg', label: 'Average session', higherIsBetter: true, value: (c) => c.sessionMinutes.avg, text: minutesText },
  { key: 'filesUploaded', label: 'Files uploaded', higherIsBetter: true, value: (c) => c.filesUploaded, text: num },
  { key: 'pagesUploaded', label: 'Pages uploaded', higherIsBetter: true, value: (c) => c.pagesUploaded, text: num },
  { key: 'filesPerActiveHour', label: 'Files per active hour', higherIsBetter: true, value: (c) => c.efficacy.filesPerActiveHour, text: num },
  { key: 'tasksPerActiveHour', label: 'Tasks per active hour', higherIsBetter: true, value: (c) => c.efficacy.tasksPerActiveHour, text: num },
  { key: 'journeyTasksWorked', label: 'Journey tasks worked', higherIsBetter: true, value: (c) => c.journeyTasksWorked, text: num },
  { key: 'tasksCompleted', label: 'Task Manager tasks done', higherIsBetter: true, value: (c) => c.tasksCompleted, text: num },
  { key: 'onTimePct', label: 'Tasks done on time', higherIsBetter: true, value: (c) => c.efficacy.onTimePct, text: pct },
  { key: 'badScanPct', label: 'Bad scans (% of pages)', higherIsBetter: false, value: (c) => c.efficacy.badScanPct, text: pct },
  { key: 'reviewsDone', label: 'Reviews done', higherIsBetter: true, value: (c) => c.reviewsDone, text: num },
];

function errorText(cause: unknown): string {
  return cause instanceof Error && cause.message ? cause.message : 'The report could not be loaded.';
}

function sessionText(c: EngagementCell): string {
  if (!c.sessions) return '—';
  const s = c.sessionMinutes;
  return `${c.sessions} · ${minutesText(s.min ?? 0)} / ${minutesText(s.avg ?? 0)} / ${minutesText(s.max ?? 0)}`;
}

function show(value: number | null | undefined, text: (n: number) => string = num): string {
  return value === null || value === undefined ? '—' : text(value);
}

/** Change from the previous period, as an arrow and a short figure; colour says better or worse. */
function Trend({ now, before, metric }: { now: number | null; before: number | null; metric: Metric }) {
  if (now === null || before === null || now === before) return null;
  const up = now > before;
  const good = up === metric.higherIsBetter;
  const diff = Math.abs(now - before);
  const figure = metric.key === 'activeMinutes' || metric.key === 'avgActivePerDay' || metric.key === 'sessionAvg'
    ? minutesText(Math.round(diff))
    : metric.text(Math.round(diff * 10) / 10);
  return <span className={good ? 'tm-trend tm-trend--good' : 'tm-trend tm-trend--bad'} title="Change from the previous period">{up ? '▲' : '▼'} {figure}</span>;
}

function CellRow({ label, cell, signIns }: { label: ReactNode; cell: EngagementCell; signIns?: ReactNode }) {
  const e = cell.efficacy;
  return (
    <>
      <td>{label}</td>
      <td>{minutesText(cell.activeMinutes)}</td>
      <td className={e.inUsePct !== null && e.inUsePct < 50 ? 'tm-warn' : ''}>{show(e.inUsePct, pct)}</td>
      <td>{cell.daysActive}<span className="p2w-muted"> / {cell.workingDays}</span></td>
      <td>{show(e.avgActiveMinutesPerDayActive, minutesText)}</td>
      <td>{sessionText(cell)}</td>
      <td>{cell.usualStart ? `${cell.usualStart} – ${cell.usualEnd ?? '—'}` : '—'}</td>
      {signIns !== undefined ? <td>{signIns}</td> : null}
      <td>{cell.filesUploaded}<span className="p2w-muted"> / {cell.pagesUploaded} p</span></td>
      <td className={e.badScanPct !== null && e.badScanPct >= 10 ? 'tm-warn' : ''}>{cell.badScans}{e.badScanPct !== null ? <span className="p2w-muted"> · {e.badScanPct}%</span> : null}</td>
      <td>{show(e.filesPerActiveHour)}</td>
      <td>{cell.journeyTasksWorked}</td>
      <td>{cell.tasksCompleted}<span className="p2w-muted"> / {cell.tasksAssigned}</span>{cell.sendBacksReceived ? <span className="tm-warn"> · {cell.sendBacksReceived} back</span> : null}</td>
      <td>{show(e.onTimePct, pct)}</td>
      <td>{show(e.tasksPerActiveHour)}</td>
      <td>{cell.reviewsDone}</td>
    </>
  );
}

function signInText(login?: LoginPerson): ReactNode {
  if (!login) return '—';
  return <span title={`Last sign-in ${login.lastLoginAt ? new Date(login.lastLoginAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : '—'}`}>
    {login.loginsOk}<span className="p2w-muted"> ({login.webLogins} web · {login.appLogins} app)</span>
  </span>;
}

export default function EngagementDashboard({ mode, tenantId, accessToken, logins }: {
  mode: TaskManagerMode; tenantId: string; accessToken?: string;
  /** Superadmin only: all-time sign-in counts from Security, by user id. */
  logins?: Map<string, LoginPerson>;
}) {
  const [period, setPeriod] = useState<EngagementPeriod>('week');
  const [range, setRange] = useState(() => defaultRange('week'));
  const [role, setRole] = useState('ALL');
  const [search, setSearch] = useState('');
  const [metricKey, setMetricKey] = useState<MetricKey>('activeMinutes');
  const [open, setOpen] = useState<string>();
  const span = daysBetween(range.from, range.to);
  const rangeOk = span >= 1 && span <= MAX_DAYS;
  const report = useQuery({
    queryKey: ['tm-engagement', mode, tenantId, range.from, range.to, period],
    queryFn: () => getEngagement(mode, tenantId, range.from, range.to, period, accessToken),
    enabled: Boolean(tenantId && accessToken && rangeOk),
    staleTime: 60_000,
  });
  const roles = useMemo(() => [...new Set((report.data?.people ?? []).map((p) => p.role).filter(Boolean))] as string[], [report.data]);
  const people = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (report.data?.people ?? []).filter((p) => (role === 'ALL' || p.role === role)
      && (!q || personName(p.name, p.actorId).toLowerCase().includes(q)));
  }, [report.data, role, search]);
  const metric = METRICS.find((m) => m.key === metricKey) ?? METRICS[0];
  const team = useMemo(() => summarise(people), [people]);
  const showSignIns = Boolean(logins);

  const choosePeriod = (next: EngagementPeriod) => {
    setPeriod(next);
    setRange(defaultRange(next));
  };

  return (
    <div className="tm-utilisation">
      <div className="p2w-listbar">
        <div className="p2w-segment" role="tablist" aria-label="Group by">
          {(['day', 'week', 'month'] as const).map((p) => (
            <button key={p} type="button" role="tab" aria-selected={period === p} className={period === p ? 'is-active' : ''}
              onClick={() => choosePeriod(p)}>{p === 'day' ? 'Daily' : p === 'week' ? 'Weekly' : 'Monthly'}</button>
          ))}
        </div>
        <div className="p2w-filters">
          <label>From <input type="date" value={range.from} max={range.to} onChange={(e) => e.target.value && setRange({ ...range, from: e.target.value })} /></label>
          <label>To <input type="date" value={range.to} min={range.from} max={istToday()} onChange={(e) => e.target.value && setRange({ ...range, to: e.target.value })} /></label>
          <label>Role <select value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="ALL">Everyone</option>
            {roles.map((r) => <option key={r} value={r}>{roleLabel(r)}</option>)}
          </select></label>
          <label>Person <input type="search" value={search} placeholder="Name" onChange={(e) => setSearch(e.target.value)} /></label>
        </div>
      </div>
      {!rangeOk ? <div className="p2w-alert p2w-alert--error" role="alert">Choose a range of 1 to {MAX_DAYS} days.</div> : null}
      {report.isError ? <div className="p2w-alert p2w-alert--error" role="alert">{errorText(report.error)}</div> : null}
      {report.isLoading ? <div className="p2w-skeleton">Loading…</div> : null}
      {report.data ? (
        <>
          <dl className="tm-tiles">
            <div><dt>People active</dt><dd>{team.activePeople}<span> of {people.length}</span></dd></div>
            <div><dt>Active time</dt><dd>{minutesText(team.active)}</dd><span>{team.activeDays ? `${minutesText(Math.round(team.active / team.activeDays))} per person-day` : ''}</span></div>
            <div><dt>In use</dt><dd>{team.inUse === null ? '—' : `${team.inUse}%`}</dd><span>of the time Verigence was open</span></div>
            <div><dt>Sessions</dt><dd>{team.sessions}</dd><span>{team.sessions ? `average ${minutesText(team.avgSession)}` : 'counted from 27 Oct'}</span></div>
            <div><dt>Files uploaded</dt><dd>{team.files}</dd><span>{team.pages} pages · {team.badScanPct === null ? '—' : `${team.badScanPct}%`} bad scans</span></div>
            <div><dt>Journey tasks worked</dt><dd>{team.journeyTasks}</dd></div>
            <div><dt>Task Manager tasks</dt><dd>{team.done}<span> of {team.given}</span></dd><span>{team.onTime === null ? '' : `${team.onTime}% on time`}</span></div>
          </dl>

          <SectionCard>
            <div className="p2w-card__title">
              <h3>{period === 'day' ? 'Day by day' : period === 'week' ? 'Week by week' : 'Month by month'}</h3>
              <p className="p2w-muted">One figure per person per {period}. The arrow is the change from the {period} before; green is better, red is worse.</p>
            </div>
            <div className="p2w-filters">
              <label>Show <select value={metricKey} onChange={(e) => setMetricKey(e.target.value as MetricKey)}>
                {METRICS.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
              </select></label>
            </div>
            <TrendMatrix people={people} periods={report.data.periods} metric={metric} />
          </SectionCard>

          <SectionCard>
            <div className="p2w-card__title">
              <h3>{range.from === range.to ? range.to : `${range.from} to ${range.to}`} · {report.data.workingDays} working days</h3>
              <p className="p2w-muted">Open a person to see each {period}. Sessions: count · shortest / average / longest.</p>
            </div>
            <div className="p2dr-scroll">
              <table className="p2dr-table tm-util-table">
                <thead>
                  <tr>
                    <th>Person</th>
                    <th title="App visible and used">Active</th>
                    <th title="Active as a share of the time the app was open">In use</th>
                    <th title="Days with any activity, of working days (Mon–Sat)">Days active</th>
                    <th>Active per day worked</th>
                    <th title={`A new session starts after a break of ${report.data.sessionGapMinutes} minutes or more`}>Sessions · min / avg / max</th>
                    <th title="Median first and last activity of the day (IST)">Usual hours</th>
                    {showSignIns ? <th title="All-time successful sign-ins, from Security">Sign-ins (all time)</th> : null}
                    <th>Files / pages</th>
                    <th title="Pages refused by the scan-quality check">Bad scans</th>
                    <th>Files per active hour</th>
                    <th>Journey tasks worked</th>
                    <th>Tasks done / given</th>
                    <th>On time</th>
                    <th title="Journey tasks worked plus Task Manager tasks done, per active hour">Tasks per active hour</th>
                    <th>Reviews</th>
                  </tr>
                </thead>
                <tbody>
                  {people.map((p) => {
                    const isOpen = open === p.actorId;
                    return (
                      <Fragment key={p.actorId}>
                        <tr className={isOpen ? 'is-open' : ''}>
                          <CellRow
                            cell={p.totals}
                            signIns={showSignIns ? signInText(logins?.get(p.actorId)) : undefined}
                            label={(
                              <>
                                <button type="button" className="p2dr-toggle" aria-expanded={isOpen}
                                  onClick={() => setOpen(isOpen ? undefined : p.actorId)}>{isOpen ? '▾' : '▸'}</button>
                                {personName(p.name, p.actorId)}
                                <span className="p2w-muted"> · {roleLabel(p.role)}{p.activeInProject ? '' : ' (no longer mapped)'}</span>
                              </>
                            )}
                          />
                        </tr>
                        {isOpen ? [...p.periods].reverse().map((cell) => (
                          <tr key={cell.periodStart} className="tm-subrow">
                            <CellRow cell={cell} signIns={showSignIns ? '' : undefined}
                              label={<span className="tm-subrow__label">{cell.label}<span className="p2w-muted"> · {cell.from === cell.to ? cell.from : `${cell.from} to ${cell.to}`}</span></span>} />
                          </tr>
                        )) : null}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </SectionCard>
          <ul className="p2dr-notes">
            {report.data.notes.map((n) => <li key={n}>{n}</li>)}
            {showSignIns ? <li>Sign-ins come from Security and are all-time totals; Security does not keep them per day.</li> : null}
          </ul>
        </>
      ) : null}
    </div>
  );
}

function TrendMatrix({ people, periods, metric }: {
  people: EngagementPerson[]; periods: Array<{ periodStart: string; label: string }>; metric: Metric;
}) {
  const values = people.flatMap((p) => p.periods.map((c) => metric.value(c) ?? 0));
  const top = Math.max(1, ...values);
  return (
    <div className="p2dr-scroll">
      <table className="p2dr-table tm-matrix">
        <thead>
          <tr><th>Person</th>{periods.map((p) => <th key={p.periodStart}>{p.label}</th>)}</tr>
        </thead>
        <tbody>
          {people.map((person) => (
            <tr key={person.actorId}>
              <td>{personName(person.name, person.actorId)}<span className="p2w-muted"> · {roleLabel(person.role)}</span></td>
              {person.periods.map((cell, i) => {
                const value = metric.value(cell);
                const before = i > 0 ? metric.value(person.periods[i - 1]) : null;
                const shade = value ? 0.08 + 0.5 * Math.min(1, value / top) : 0;
                return (
                  <td key={cell.periodStart} className="tm-matrix__cell"
                    style={{ backgroundColor: `color-mix(in srgb, var(--p2w-action, #2f5bd3) ${Math.round(shade * 100)}%, transparent)` }}>
                    {value === null ? '—' : metric.text(value)}
                    <Trend now={value} before={before} metric={metric} />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function summarise(people: EngagementPerson[]) {
  let active = 0; let idle = 0; let sessions = 0; let sessionMinutes = 0; let files = 0; let pages = 0;
  let badScans = 0; let journeyTasks = 0; let done = 0; let given = 0; let onTime = 0; let activeDays = 0; let activePeople = 0;
  for (const p of people) {
    const t = p.totals;
    active += t.activeMinutes; idle += t.idleMinutes; sessions += t.sessions;
    sessionMinutes += (t.sessionMinutes.avg ?? 0) * t.sessions;
    files += t.filesUploaded; pages += t.pagesUploaded; badScans += t.badScans; journeyTasks += t.journeyTasksWorked;
    done += t.tasksCompleted; given += t.tasksAssigned; onTime += t.tasksCompletedOnTime; activeDays += t.daysActive;
    if (t.daysActive) activePeople += 1;
  }
  return {
    active, sessions, files, pages, journeyTasks, done, given, activeDays, activePeople,
    inUse: active + idle ? Math.round((100 * active) / (active + idle)) : null,
    avgSession: sessions ? Math.round(sessionMinutes / sessions) : 0,
    badScanPct: pages ? Math.round((1000 * badScans) / pages) / 10 : null,
    onTime: done ? Math.round((100 * onTime) / done) : null,
  };
}
