import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

import { getPcDay, type PcDayPerson, type PcDayRegister } from '../../../services/audit-core/pcDay';
import { getP2DailyProcessingReport } from '../../../services/audit-core/uc03P2';
import { addDays, minutesText } from '../../task-manager/tmFormat';
import { actionLabel } from '../daily/dailyReportLabels';
import '../../../styles/pc-detail.css';

/**
 * A PC's day, opened from their row in Team and outlets (product owner 2026-11-24: the PCs' day and
 * "Work done and files closed" tabs folded into the Team and outlets view). One day at a time: the
 * Journeys and files, tasks and delivery files closed, daily duties, the gate register owed, what is
 * pending now, the tasks worked (what was done on each) and the delivery files closed, and for an
 * Executive the time on Verigence. The figures are the Tracker's own (Audit Core reports/pc-day and
 * reports/daily-processing?part=work).
 */

const REGISTER: Record<string, { label: string; tone: string }> = {
  MISSED: { label: 'Missed', tone: 'bad' }, NOT_UPLOADED: { label: 'Not uploaded yet', tone: 'warn' },
  COUNTS_PENDING: { label: 'Counts not entered', tone: 'warn' }, ANSWER_PENDING: { label: 'Uploaded, answer pending', tone: 'info' },
  DONE: { label: 'Uploaded', tone: 'ok' },
};
const SOURCES: Record<string, string> = { WEB: 'Computer', MOBILE_WEB: 'Phone browser', ANDROID: 'Android app', IOS: 'iPhone app' };

function clock(at?: string | null): string {
  if (!at) return '—';
  return new Date(at).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false });
}

function dayText(day: string): string {
  return new Date(`${day}T00:00:00+05:30`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });
}

function Stat({ label, value, tone }: { label: string; value: string | number; tone?: 'bad' | 'warn' }) {
  return (
    <div className={`pcx-stat${tone ? ` pcx-stat--${tone}` : ''}`}>
      <span className="pcx-stat__label">{label}</span>
      <span className="pcx-stat__value">{value}</span>
    </div>
  );
}

function Tag({ tone, children }: { tone: string; children: string }) {
  return <span className={`pcx-tag pcx-tag--${tone}`}>{children}</span>;
}

function dutyTag(d: PcDayPerson['duties'][number]) {
  if (d.notDone) return <Tag tone="bad">Missed</Tag>;
  if (d.late) return <Tag tone="info">Done late</Tag>;
  if (d.onTime) return <Tag tone="ok">Done</Tag>;
  return <Tag tone="neutral">Open</Tag>;
}

function registerLine(g: PcDayRegister): string {
  const parts: string[] = [];
  if (g.onRegister != null) parts.push(`${g.onRegister} on the register, ${g.inTool} in the tool`);
  if (g.notIntimated) parts.push(`${g.notIntimated} not intimated`);
  if (g.pendingWithPc) parts.push(`${g.pendingWithPc} with the PC`);
  if (g.uploadedBy && !g.byThisPc) parts.push(`uploaded by ${g.uploadedBy}`);
  if (g.uploadedLate) parts.push('late');
  return parts.join(' · ');
}

export default function PcDetailPanel({ tenantId, accessToken, actorId, name, sub, initialDay, today, onClose }: {
  tenantId: string; accessToken?: string; actorId: string; name: string; sub?: string;
  initialDay: string; today: string; onClose: () => void;
}) {
  const [day, setDay] = useState(initialDay);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  // Both are the whole team's day, kept by Audit Core for two minutes: opening the next PC costs nothing.
  const pcDay = useQuery({
    queryKey: ['pc-day', 'project', tenantId, day],
    queryFn: () => getPcDay('project', tenantId, day, accessToken),
    enabled: Boolean(tenantId && accessToken), staleTime: 120_000,
  });
  const work = useQuery({
    queryKey: ['p2-daily-work', tenantId, day],
    queryFn: () => getP2DailyProcessingReport(tenantId, day, accessToken, 'work'),
    enabled: Boolean(tenantId && accessToken), staleTime: 120_000,
  });
  const p = pcDay.data?.people.find((x) => x.actorId === actorId);
  const worked = work.data?.teamWork?.people.find((x) => x.actorId === actorId);
  const closed = work.data?.deliveryFilesClosed?.byPc.find((x) => x.pcActorId === actorId)?.files ?? [];
  const a = p?.activity;

  return (
    <div className="pcx-overlay" role="presentation" onClick={onClose}>
      <aside className="pcx-panel" role="dialog" aria-modal="true" aria-labelledby="pcx-title" onClick={(e) => e.stopPropagation()}>
        <header className="pcx-head">
          <div className="pcx-head__who">
            <h2 id="pcx-title">{name}</h2>
            {sub ? <p>{sub}</p> : null}
          </div>
          <button type="button" className="pcx-close" aria-label="Close" onClick={onClose}>×</button>
        </header>
        <div className="pcx-day">
          <button type="button" className="pcx-step" aria-label="Previous day" onClick={() => setDay(addDays(day, -1))}>‹</button>
          <input type="date" value={day} max={today} aria-label="Day" onChange={(e) => e.target.value && setDay(e.target.value)} />
          <button type="button" className="pcx-step" aria-label="Next day" disabled={day >= today} onClick={() => setDay(addDays(day, 1))}>›</button>
          <strong>{dayText(day)}</strong>
        </div>

        <div className="pcx-body">
          {pcDay.isLoading ? <p className="pcx-muted">Loading…</p> : null}
          {pcDay.isError ? <p className="pcx-error" role="alert">This day could not be loaded.</p> : null}
          {pcDay.data && !p ? <p className="pcx-muted">This PC is not among the PCs of your outlets.</p> : null}
          {p ? (
            <>
              <section className="pcx-section">
                <h3>Work on the day</h3>
                <div className="pcx-stats">
                  <Stat label="New bookings" value={p.journeys.bookings} />
                  <Stat label="New deliveries" value={p.journeys.deliveries} />
                  <Stat label="Journeys updated" value={p.journeys.updated} />
                  <Stat label="Files" value={p.files.total} />
                  <Stat label="Tasks worked" value={p.tasksWorked} />
                  <Stat label="Tasks closed" value={p.tasksClosed} />
                  <Stat label="Delivery files closed" value={p.deliveryFilesClosed} />
                  <Stat label="Pages rejected" value={p.pagesRejected} tone={p.pagesRejected ? 'warn' : undefined} />
                </div>
                {p.files.total ? (
                  <p className="pcx-note">Files: {p.files.direct} direct · {p.files.bulk} bulk upload · {p.files.drive} Google Drive</p>
                ) : null}
              </section>

              {a ? (
                <section className="pcx-section">
                  <h3>Time on Verigence</h3>
                  <div className="pcx-stats">
                    <Stat label="Active" value={a.activeMinutes ? minutesText(a.activeMinutes) : '—'} />
                    <Stat label="First – last use" value={a.firstActiveAtUtc ? `${clock(a.firstActiveAtUtc)}–${clock(a.lastActiveAtUtc)}` : '—'} />
                    <Stat label="Longest with no output" value={a.longestNoOutputMinutes != null ? minutesText(a.longestNoOutputMinutes) : '—'}
                      tone={(a.longestNoOutputMinutes ?? 0) >= 120 ? 'warn' : undefined} />
                    <Stat label="Active with no output" value={a.activeNoOutputMinutes != null ? minutesText(a.activeNoOutputMinutes) : '—'} />
                  </div>
                  {Object.values(a.bySource).some(Boolean) ? (
                    <p className="pcx-note">
                      {Object.entries(a.bySource).filter(([, m]) => m).map(([s, m]) => `${SOURCES[s] ?? s} ${minutesText(m)}`).join(' · ')}
                      {a.longestNoOutputFrom ? ` · longest with no output ${a.longestNoOutputFrom}–${a.longestNoOutputTo}` : ''}
                    </p>
                  ) : null}
                </section>
              ) : null}

              <section className="pcx-section">
                <h3>Daily duties</h3>
                {p.duties.length ? (
                  <ul className="pcx-list">
                    {p.duties.map((d) => <li key={d.title}><span>{d.title}</span>{dutyTag(d)}</li>)}
                  </ul>
                ) : <p className="pcx-muted">No duty due on the day.</p>}
              </section>

              <section className="pcx-section">
                <h3>Gate register for {dayText(pcDay.data!.registerDate)}</h3>
                {p.gateRegister.length ? (
                  <ul className="pcx-list">
                    {p.gateRegister.map((g) => {
                      const s = REGISTER[g.status] ?? { label: g.status, tone: 'neutral' };
                      const line = registerLine(g);
                      return (
                        <li key={g.outletId}>
                          <span>{g.outletName ?? 'Outlet'}{line ? <small>{line}</small> : null}</span>
                          <Tag tone={s.tone}>{s.label}</Tag>
                        </li>
                      );
                    })}
                  </ul>
                ) : <p className="pcx-muted">No register owed.</p>}
              </section>

              <section className="pcx-section">
                <h3>Pending now</h3>
                <div className="pcx-stats">
                  <Stat label="Deliveries not uploaded" value={p.pending.deliveriesNotUploaded} tone={p.pending.deliveriesNotUploaded ? 'warn' : undefined} />
                  <Stat label="Delivery files not closed" value={p.pending.deliveryFilesOpen} />
                  <Stat label="Open tasks" value={p.pending.tasksOpen} />
                  <Stat label="Overdue tasks" value={p.pending.tasksOverdue} tone={p.pending.tasksOverdue ? 'bad' : undefined} />
                </div>
              </section>
            </>
          ) : null}

          <section className="pcx-section">
            <h3>Tasks worked{worked ? ` (${worked.tasksWorked}, ${worked.tasksClosed} closed)` : ''}</h3>
            {work.isLoading ? <p className="pcx-muted">Loading…</p> : null}
            {work.data && !worked ? <p className="pcx-muted">No task worked on the day.</p> : null}
            {worked ? (
              <table className="pcx-table">
                <thead><tr><th scope="col">Task</th><th scope="col">What was done</th><th scope="col">Now</th></tr></thead>
                <tbody>
                  {worked.tasks.map((t) => (
                    <tr key={t.taskId}>
                      <td>
                        {t.title}
                        <small><Link to={`/p2/journeys/${t.journeyId}/overview`}>{t.customerName || t.journeyReference || 'Journey'}</Link></small>
                      </td>
                      <td>{t.actions.map(actionLabel).join(', ')}</td>
                      <td>{t.closedOnDay ? <Tag tone="ok">Closed</Tag> : <Tag tone="neutral">{t.status === 'OPEN' ? 'Open' : t.status.replace(/_/g, ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase())}</Tag>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}
            {worked?.tasksTruncated ? <p className="pcx-note">Only the latest {worked.tasks.length} tasks are listed.</p> : null}
          </section>

          <section className="pcx-section">
            <h3>Delivery files closed{closed.length ? ` (${closed.length})` : ''}</h3>
            {work.data && !closed.length ? <p className="pcx-muted">None closed on the day.</p> : null}
            {closed.length ? (
              <ul className="pcx-list">
                {closed.map((f) => (
                  <li key={f.journeyId}>
                    <span>
                      <Link to={`/p2/journeys/${f.journeyId}/overview`}>{f.customerName || f.journeyReference || 'Journey'}</Link>
                      <small>{f.outletName ?? ''}</small>
                    </span>
                    <span className="pcx-muted">{clock(f.closedAtUtc)}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        </div>
      </aside>
    </div>
  );
}
