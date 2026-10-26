import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import SectionCard from '../../components/SectionCard';
import { getUtilisation, type TaskManagerMode, type UtilisationPerson } from '../../services/audit-core/taskManager';
import { addDays, formatWhen, istToday, minutesText, personName, roleLabel } from './tmFormat';
import '../../styles/task-manager.css';

type Range = 'day' | 'week';

function errorText(cause: unknown): string {
  return cause instanceof Error && cause.message ? cause.message : 'The dashboard could not be loaded.';
}

/** Share of the time the app was open that someone was actually using it. */
export function engagement(active: number, idle: number): number | null {
  const open = active + idle;
  return open ? Math.round((100 * active) / open) : null;
}

function HourStrip({ hours }: { hours: number[] }) {
  return (
    <div className="tm-hours" aria-label="Active minutes per hour">
      {hours.map((m, h) => (
        <span key={h} title={`${String(h).padStart(2, '0')}:00 · ${m} min active`}
          style={{ opacity: m ? 0.25 + Math.min(m, 60) / 80 : 0.08 }} />
      ))}
    </div>
  );
}

function PersonRow({ person, open, onToggle }: { person: UtilisationPerson; open: boolean; onToggle: () => void }) {
  const t = person.totals;
  const share = engagement(t.activeMinutes, t.idleMinutes);
  return (
    <>
      <tr className={open ? 'is-open' : ''}>
        <td>
          <button type="button" className="p2dr-toggle" aria-expanded={open} onClick={onToggle}>{open ? '▾' : '▸'}</button>
          {personName(person.name, person.actorId)}
          <span className="p2w-muted"> · {roleLabel(person.role)}{person.activeInProject ? '' : ' (no longer mapped)'}</span>
        </td>
        <td>{minutesText(t.activeMinutes)}</td>
        <td>{minutesText(t.idleMinutes)}</td>
        <td className={share !== null && share < 50 ? 'tm-warn' : ''}>{share === null ? '—' : `${share}%`}</td>
        <td>{t.journeysStarted}</td>
        <td>{t.filesUploaded}<span className="p2w-muted"> / {t.pagesUploaded} p</span></td>
        <td className={t.failedPages ? 'tm-warn' : ''}>{t.failedPages}</td>
        <td>{t.journeyTasksWorked}</td>
        <td>{t.tasksCompleted}<span className="p2w-muted"> / {t.tasksAssigned}</span></td>
        <td>{t.tasksCompleted ? `${Math.round((100 * t.tasksCompletedOnTime) / t.tasksCompleted)}%` : '—'}</td>
        <td className={t.overdueNow ? 'tm-bad' : ''}>{t.overdueNow}</td>
        <td>{t.reviewsDone}{t.reviewOverdueNow ? <span className="tm-warn"> · {t.reviewOverdueNow} late</span> : null}</td>
        <td><HourStrip hours={t.hourlyActiveMinutes} /></td>
      </tr>
      {open ? (
        <tr className="p2dr-child">
          <td colSpan={13}>
            <table className="p2dr-table tm-days">
              <thead>
                <tr><th>Day</th><th>Active</th><th>Idle</th><th>Background</th><th>First / last activity</th><th>Journeys</th><th>Files</th><th>Journey tasks</th><th>Tasks done</th><th>Reviews</th><th>Hours</th></tr>
              </thead>
              <tbody>
                {person.days.map((d) => (
                  <tr key={d.date}>
                    <td>{d.date}</td>
                    <td>{minutesText(d.activeMinutes)}</td>
                    <td>{minutesText(d.idleMinutes)}</td>
                    <td>{minutesText(d.backgroundMinutes)}</td>
                    <td>{d.firstActiveAtUtc ? `${formatWhen(d.firstActiveAtUtc)} – ${formatWhen(d.lastActiveAtUtc)}` : '—'}</td>
                    <td>{d.journeysStarted}</td>
                    <td>{d.filesUploaded} / {d.pagesUploaded} p</td>
                    <td>{d.journeyTasksWorked}</td>
                    <td>{d.tasksCompleted}{d.sendBacksReceived ? ` · ${d.sendBacksReceived} sent back` : ''}</td>
                    <td>{d.reviewsDone}</td>
                    <td><HourStrip hours={d.hourlyActiveMinutes} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </td>
        </tr>
      ) : null}
    </>
  );
}

/**
 * How much each person of the Project did, by day or by week: output, task
 * work and time on Verigence. Executive and Superadmin only (product owner
 * 2026-10-26); the server enforces it.
 */
export default function UtilisationDashboard({ mode, tenantId, accessToken }: {
  mode: TaskManagerMode; tenantId: string; accessToken?: string;
}) {
  const [range, setRange] = useState<Range>('day');
  const [end, setEnd] = useState(istToday());
  const [role, setRole] = useState('ALL');
  const [open, setOpen] = useState<string>();
  const from = range === 'day' ? end : addDays(end, -6);
  const report = useQuery({
    queryKey: ['tm-utilisation', mode, tenantId, from, end],
    queryFn: () => getUtilisation(mode, tenantId, from, end, accessToken),
    enabled: Boolean(tenantId && accessToken),
    staleTime: 60_000,
  });
  const people = useMemo(
    () => (report.data?.people ?? []).filter((p) => role === 'ALL' || p.role === role),
    [report.data, role],
  );
  const roles = useMemo(() => [...new Set((report.data?.people ?? []).map((p) => p.role).filter(Boolean))] as string[], [report.data]);
  const sum = people.reduce((acc, p) => ({
    active: acc.active + p.totals.activeMinutes, idle: acc.idle + p.totals.idleMinutes,
    files: acc.files + p.totals.filesUploaded, done: acc.done + p.totals.tasksCompleted, overdue: acc.overdue + p.totals.overdueNow,
  }), { active: 0, idle: 0, files: 0, done: 0, overdue: 0 });

  return (
    <div className="tm-utilisation">
      <div className="p2w-listbar">
        <div className="p2w-segment" role="tablist" aria-label="Range">
          {(['day', 'week'] as const).map((r) => (
            <button key={r} type="button" role="tab" aria-selected={range === r} className={range === r ? 'is-active' : ''}
              onClick={() => setRange(r)}>{r === 'day' ? 'Day' : 'Week (7 days)'}</button>
          ))}
        </div>
        <div className="p2w-filters">
          <label>{range === 'day' ? 'Day' : 'Week ending'} <input type="date" value={end} max={istToday()} onChange={(e) => setEnd(e.target.value || istToday())} /></label>
          <label>Role <select value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="ALL">Everyone</option>
            {roles.map((r) => <option key={r} value={r}>{roleLabel(r)}</option>)}
          </select></label>
        </div>
      </div>
      {report.isError ? <div className="p2w-alert p2w-alert--error" role="alert">{errorText(report.error)}</div> : null}
      {report.isLoading ? <div className="p2w-skeleton">Loading…</div> : null}
      {report.data ? (
        <SectionCard>
          <div className="p2w-card__title">
            <h3>{from === end ? end : `${from} to ${end}`}</h3>
            <p className="p2w-muted">
              {people.length} people · {minutesText(sum.active)} active, {minutesText(sum.idle)} idle (
              {engagement(sum.active, sum.idle) ?? '—'}% in use) · {sum.files} files · {sum.done} tasks completed · {sum.overdue} overdue now
            </p>
          </div>
          <div className="p2dr-scroll">
            <table className="p2dr-table tm-util-table">
              <thead>
                <tr>
                  <th>Person</th><th title="App visible and used">Active</th><th title={`Visible, no interaction for ${report.data.idleThresholdMinutes}+ min`}>Idle</th>
                  <th title="Active as a share of the time the app was open">In use</th><th>Journeys</th><th>Files</th><th>Failed pages</th>
                  <th>Journey tasks worked</th><th>Tasks done / given</th><th>On time</th><th>Overdue now</th><th>Reviews</th><th>Active by hour</th>
                </tr>
              </thead>
              <tbody>
                {people.map((p) => (
                  <PersonRow key={p.actorId} person={p} open={open === p.actorId} onToggle={() => setOpen(open === p.actorId ? undefined : p.actorId)} />
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      ) : null}
      {report.data ? <ul className="p2dr-notes">{report.data.notes.map((n) => <li key={n}>{n}</li>)}</ul> : null}
    </div>
  );
}

