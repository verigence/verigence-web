import { Fragment, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import SectionCard from '../../components/SectionCard';
import { getPcDay, type PcDayDuty, type PcDayPerson, type PcDayRegister } from '../../services/audit-core/pcDay';
import type { TaskManagerMode } from '../../services/audit-core/taskManager';
import PersonDayPanel from './PersonDayPanel';
import { addDays, istToday, minutesText, personName } from './tmFormat';
import '../../styles/uc03-p2-my-work.css';
import '../../styles/uc03-p2-project-tracker.css';
import '../../styles/pc-day.css';

/**
 * Every PC's day in one window (product owner 2026-11-23: "a single window where i can see what all
 * my PC are doing in a day"): one row per PC with their Journeys, files, tasks, delivery files
 * closed, daily duties, the gate register they owe that day and what is pending; time on Verigence
 * for an Executive or the Superadmin. The figures are the Project Tracker's and the engagement
 * report's own, read through the same Audit Core functions.
 */

const SOURCE_LABELS: Record<string, string> = { WEB: 'Computer', MOBILE_WEB: 'Phone browser', ANDROID: 'Android app', IOS: 'iPhone app' };
const REGISTER_LABELS: Record<string, string> = {
  MISSED: 'Missed', NOT_UPLOADED: 'Not uploaded yet', COUNTS_PENDING: 'Counts not entered',
  ANSWER_PENDING: 'Uploaded, answer pending', DONE: 'Uploaded',
};

function clock(at?: string | null): string {
  if (!at) return '—';
  return new Date(at).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false });
}

function dayText(day: string): string {
  return new Date(`${day}T00:00:00+05:30`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });
}

function dutyDone(d: PcDayDuty): number { return d.onTime + d.late; }

function registerTone(r: PcDayRegister): string {
  if (r.status === 'MISSED') return 'pcd-bad';
  if (r.status === 'NOT_UPLOADED' || r.status === 'COUNTS_PENDING') return 'pcd-warn';
  return 'pcd-good';
}

function Tile({ label, value, hint, tone }: { label: string; value: string | number; hint?: string; tone?: 'bad' | 'good' }) {
  return (
    <div className={`p2mw-tile${tone ? ` pcd-tile--${tone}` : ''}`}>
      <span className="p2mw-tile__label">{label}</span>
      <strong className="p2mw-tile__value">{value}</strong>
      {hint ? <span className="p2mw-tile__hint">{hint}</span> : null}
    </div>
  );
}

function Details({ p, onMinutes }: { p: PcDayPerson; onMinutes?: () => void }) {
  return (
    <div className="pcd-details">
      <div>
        <h4>Daily duties</h4>
        {p.duties.length ? (
          <ul className="pcd-list">
            {p.duties.map((d) => (
              <li key={d.title} className={d.notDone ? 'pcd-bad' : d.pending ? 'pcd-warn' : 'pcd-good'}>
                {d.title}: {d.notDone ? 'not done' : d.pending ? 'pending' : d.late ? 'done late' : 'done'}
              </li>
            ))}
          </ul>
        ) : <p className="p2w-muted">No duty due on the day.</p>}
      </div>
      <div>
        <h4>Gate register</h4>
        {p.gateRegister.length ? (
          <ul className="pcd-list">
            {p.gateRegister.map((g) => (
              <li key={g.outletId} className={registerTone(g)}>
                {g.outletName ?? 'Outlet'} ({dayText(g.date)}): {REGISTER_LABELS[g.status] ?? g.status}
                {g.onRegister != null ? ` · ${g.onRegister} on the register, ${g.inTool} in the tool` : ''}
                {g.notIntimated ? ` · ${g.notIntimated} not intimated` : ''}
                {g.pendingWithPc ? ` · ${g.pendingWithPc} with the PC` : ''}
                {g.uploadedBy && !g.byThisPc ? ` · uploaded by ${g.uploadedBy}` : ''}
                {g.uploadedLate ? ' · late' : ''}
              </li>
            ))}
          </ul>
        ) : <p className="p2w-muted">No register owed.</p>}
      </div>
      <div>
        <h4>Files and pages</h4>
        <ul className="pcd-list">
          <li>{p.files.direct} direct · {p.files.bulk} bulk upload · {p.files.drive} Google Drive</li>
          <li>{p.pagesUploaded} pages{p.pagesRejected ? `, ${p.pagesRejected} rejected on image quality` : ''}</li>
        </ul>
      </div>
      <div>
        <h4>Pending now</h4>
        <ul className="pcd-list">
          <li>{p.pending.deliveriesNotUploaded} deliveries on the register not uploaded</li>
          <li>{p.pending.deliveryFilesOpen} delivery files not closed</li>
          <li className={p.pending.tasksOverdue ? 'pcd-bad' : undefined}>{p.pending.tasksOpen} open tasks, {p.pending.tasksOverdue} overdue</li>
          {p.pending.paymentsNotReconciled ? <li>{p.pending.paymentsNotReconciled} payments not reconciled</li> : null}
          {p.pending.pagesToReupload ? <li>{p.pending.pagesToReupload} pages to upload again</li> : null}
        </ul>
      </div>
      {p.activity ? (
        <div>
          <h4>Time on Verigence</h4>
          <ul className="pcd-list">
            <li>{clock(p.activity.firstActiveAtUtc)} to {clock(p.activity.lastActiveAtUtc)}, {minutesText(p.activity.activeMinutes)} active</li>
            <li>{Object.entries(p.activity.bySource).filter(([, m]) => m).map(([s, m]) => `${SOURCE_LABELS[s] ?? s} ${minutesText(m)}`).join(' · ') || '—'}</li>
            {p.activity.productiveMinutes != null ? <li>{minutesText(p.activity.productiveMinutes)} followed by output, {minutesText(p.activity.activeNoOutputMinutes ?? 0)} with none</li> : null}
          </ul>
          {onMinutes ? <button type="button" className="p2w-button p2w-button--ghost" onClick={onMinutes}>Minute by minute</button> : null}
        </div>
      ) : null}
    </div>
  );
}

export default function PcDayView({ mode, tenantId, accessToken }: { mode: TaskManagerMode; tenantId: string; accessToken?: string }) {
  const today = istToday();
  const [day, setDay] = useState(today);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState<string>();
  const [minutesOf, setMinutesOf] = useState<string>();
  const report = useQuery({
    queryKey: ['pc-day', mode, tenantId, day],
    queryFn: () => getPcDay(mode, tenantId, day, accessToken),
    enabled: Boolean(tenantId && accessToken),
    staleTime: 60_000,
    refetchInterval: day === today ? 5 * 60_000 : false,
  });
  const data = report.data;
  const people = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data?.people ?? []).filter((p) => !q || personName(p.name, p.actorId).toLowerCase().includes(q)
      || p.outlets.some((o) => (o.outletName ?? '').toLowerCase().includes(q)));
  }, [data, search]);
  const activity = Boolean(data?.showsActivity);
  const t = data?.totals;
  const columns = 12 + (activity ? 2 : 0);  // PC, 11 figures; Active and Longest with no output

  return (
    <div className="screen-stack p2mw pcd">
      <div className="p2mw-controls">
        <span className="p2mw-range">
          <button type="button" className="p2w-button p2w-button--ghost" aria-label="Previous day" onClick={() => setDay(addDays(day, -1))}>‹</button>
          <label>Day <input type="date" value={day} max={today} onChange={(e) => e.target.value && setDay(e.target.value)} /></label>
          <button type="button" className="p2w-button p2w-button--ghost" aria-label="Next day" disabled={day >= today} onClick={() => setDay(addDays(day, 1))}>›</button>
          <strong>{dayText(day)}</strong>
          {day !== today ? <button type="button" className="p2w-button p2w-button--secondary" onClick={() => setDay(today)}>Today</button> : null}
        </span>
        <label className="pcd-search">PC or outlet <input type="search" value={search} placeholder="Name" onChange={(e) => setSearch(e.target.value)} /></label>
        {data ? <span className="p2w-muted">As of {clock(data.asOfUtc)}{data.current ? ' · refreshes every 5 minutes' : ''}</span> : null}
      </div>

      {report.isError ? <div className="p2w-alert p2w-alert--error" role="alert">The PCs' day could not be loaded. Try again.</div> : null}
      {report.isLoading ? <div className="p2w-skeleton">Loading…</div> : null}

      {data && t ? (
        <>
          <div className="p2mw-tiles">
            <Tile label="PCs at work" value={`${t.seen} of ${t.pcs}`} hint={t.pcs - t.seen ? `${t.pcs - t.seen} not seen` : 'everyone seen'} tone={t.pcs - t.seen ? 'bad' : undefined} />
            <Tile label="New bookings" value={t.bookings} />
            <Tile label="New deliveries" value={t.deliveries} />
            <Tile label="Journeys updated" value={t.updated} hint={`${t.files.total} files: ${t.files.direct} direct · ${t.files.bulk} bulk · ${t.files.drive} Drive`} />
            <Tile label="Tasks closed" value={t.tasksClosed} hint={`${t.tasksWorked} worked`} />
            <Tile label="Delivery files closed" value={t.deliveryFilesClosed} />
            <Tile label="Daily duties done" value={`${t.duties.onTime + t.duties.late} of ${t.duties.due}`}
              hint={t.duties.notDone ? `${t.duties.notDone} not done` : t.duties.pending ? `${t.duties.pending} pending` : undefined}
              tone={t.duties.notDone ? 'bad' : undefined} />
            <Tile label={`Gate registers for ${dayText(data.registerDate)}`} value={`${t.registers.uploaded} of ${t.registers.outlets}`}
              hint={t.registers.missed ? `${t.registers.missed} missed` : undefined} tone={t.registers.missed ? 'bad' : undefined} />
          </div>

          <SectionCard>
            <div className="p2w-card__title">
              <h3>Each PC, {dayText(day)}</h3>
              <p className="p2w-muted">PCs who did nothing on the day are at the bottom. Click a PC for duties, gate register, pending work{activity ? ' and time on Verigence' : ''}.</p>
            </div>
            <div className="p2pt-scroll">
              <table className="p2w-table p2mw-table pcd-table" aria-label="Each PC's day">
                <thead>
                  <tr>
                    <th scope="col">PC</th>
                    {activity ? <th scope="col" title="Active time on Verigence; first and last use (IST)">Active</th> : null}
                    <th scope="col" title="A Journey's first day">New bookings</th>
                    <th scope="col" title="A Journey's first delivery files">New deliveries</th>
                    <th scope="col" title="Files added to a Journey already booked or delivered">Journeys updated</th>
                    <th scope="col" title="Every file uploaded: direct · bulk · Drive">Files</th>
                    <th scope="col" title="Journey tasks acted on in any way plus Task Manager tasks done">Tasks worked</th>
                    <th scope="col">Tasks closed</th>
                    <th scope="col">Delivery files closed</th>
                    <th scope="col">Duties done</th>
                    <th scope="col" title={`The register for ${data.registerDate}, uploaded on ${data.date}`}>Gate register</th>
                    <th scope="col" title="As of now: deliveries on the register not uploaded">Deliveries not uploaded</th>
                    <th scope="col" title="As of now">Open tasks (overdue)</th>
                    {activity ? <th scope="col" title="The longest stretch with no file uploaded, task acted on or value saved">Longest with no output</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {people.map((p) => {
                    const due = p.duties.reduce((n, d) => n + d.due, 0);
                    const done = p.duties.reduce((n, d) => n + dutyDone(d), 0);
                    const notDone = p.duties.reduce((n, d) => n + d.notDone, 0);
                    const missed = p.gateRegister.filter((g) => g.status === 'MISSED').length;
                    const isOpen = open === p.actorId;
                    return (
                      <Fragment key={p.actorId}>
                        <tr className={`pcd-row${p.seen ? '' : ' pcd-row--unseen'}${isOpen ? ' is-open' : ''}`}
                          onClick={() => setOpen(isOpen ? undefined : p.actorId)} aria-expanded={isOpen}>
                          <th scope="row">
                            <button type="button" className="pcd-name">{personName(p.name, p.actorId)}</button>
                            {p.seen ? null : <span className="pcd-tag">Not seen</span>}
                            <div className="p2w-muted pcd-sub">{p.outlets.map((o) => o.outletName).filter(Boolean).join(', ') || 'No outlet mapped'}</div>
                          </th>
                          {activity ? (
                            <td>
                              {p.activity?.activeMinutes ? minutesText(p.activity.activeMinutes) : '—'}
                              {p.activity?.firstActiveAtUtc
                                ? <div className="p2w-muted pcd-time">{clock(p.activity.firstActiveAtUtc)}–{clock(p.activity.lastActiveAtUtc)}</div> : null}
                            </td>
                          ) : null}
                          <td className="pcd-num">{p.journeys.bookings || '—'}</td>
                          <td className="pcd-num">{p.journeys.deliveries || '—'}</td>
                          <td className="pcd-num">{p.journeys.updated || '—'}</td>
                          <td className="pcd-num">{p.files.total ? <>{p.files.total}<span className="p2w-muted pcd-split"> {p.files.direct}·{p.files.bulk}·{p.files.drive}</span></> : '—'}</td>
                          <td className="pcd-num">{p.tasksWorked || '—'}</td>
                          <td className="pcd-num">{p.tasksClosed || '—'}</td>
                          <td className="pcd-num">{p.deliveryFilesClosed || '—'}</td>
                          <td className={`pcd-num${notDone ? ' pcd-bad' : ''}`}>{due ? `${done} / ${due}` : '—'}</td>
                          <td className={missed ? 'pcd-bad' : undefined}>
                            {p.gateRegister.length
                              ? (missed ? `${missed} missed` : `${p.gateRegister.filter((g) => g.status !== 'NOT_UPLOADED' && g.status !== 'MISSED').length} of ${p.gateRegister.length}`)
                              : '—'}
                          </td>
                          <td className={`pcd-num${p.pending.deliveriesNotUploaded ? ' pcd-warn' : ''}`}>{p.pending.deliveriesNotUploaded || '—'}</td>
                          <td className={`pcd-num${p.pending.tasksOverdue ? ' pcd-bad' : ''}`}>{p.pending.tasksOpen ? `${p.pending.tasksOpen} (${p.pending.tasksOverdue})` : '—'}</td>
                          {activity ? (
                            <td>{p.activity?.longestNoOutputMinutes != null ? (
                              <>{minutesText(p.activity.longestNoOutputMinutes)}
                                <div className="p2w-muted pcd-time">{p.activity.longestNoOutputFrom}–{p.activity.longestNoOutputTo}</div></>
                            ) : '—'}</td>
                          ) : null}
                        </tr>
                        {isOpen ? (
                          <tr className="pcd-detail-row">
                            <td colSpan={columns}>
                              <Details p={p} onMinutes={activity ? () => setMinutesOf(p.actorId) : undefined} />
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    );
                  })}
                  {!people.length ? <tr><td colSpan={columns} className="p2w-muted">No PC matches.</td></tr> : null}
                </tbody>
              </table>
            </div>
            <ul className="pcd-notes p2w-muted">{data.notes.map((n) => <li key={n}>{n}</li>)}</ul>
          </SectionCard>
          {minutesOf ? (
            <PersonDayPanel mode={mode} tenantId={tenantId} accessToken={accessToken} actorId={minutesOf} day={day}
              onClose={() => setMinutesOf(undefined)} />
          ) : null}
        </>
      ) : null}
    </div>
  );
}
