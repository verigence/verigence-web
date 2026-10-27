import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import '../styles/uc03-p2.css';
import '../styles/uc03-p2-workspace.css';
import '../styles/uc03-p2-daily-report.css';
import '../styles/task-manager.css';
import '../styles/system-health.css';

import PageHeader from '../components/PageHeader';
import SectionCard from '../components/SectionCard';
import { formatWhen } from '../features/task-manager/tmFormat';
import {
  agoText, alertCounts, barHeights, bytesText, connectionsInUse, cpuText, errorRate, memoryText, overallStatus,
  pctTone, serviceStatusLabel, serviceTone, usePct, type Tone,
} from '../features/admin/systemHealth/systemHealthLogic';
import { getSystemHealth, type ResourceHealth, type SystemHealth } from '../services/audit-core/systemHealth';
import { useSessionStore } from '../store/sessionStore';

/**
 * SuperAdmin System Health (product owner 2026-10-27): are the services up,
 * how often they restarted or crashed, failed requests, CPU and memory against
 * their limits, deployments that failed, documents and work stuck past 30
 * minutes per Project, and the database. Platform-wide; SuperAdmin only, and
 * the server enforces it.
 */

const WINDOWS: Array<{ hours: number; label: string }> = [
  { hours: 1, label: '1 hour' }, { hours: 6, label: '6 hours' }, { hours: 24, label: '24 hours' }, { hours: 168, label: '7 days' },
];

function Dot({ tone }: { tone: Tone }) {
  return <span className={`sh-dot sh-dot--${tone}`} aria-hidden="true" />;
}

function Meter({ value, limit, text }: { value: number | null; limit: number | null; text: string }) {
  const pct = usePct(value, limit);
  const tone = pctTone(pct);
  return (
    <div className={`sh-meter sh-meter--${tone}`}>
      <div className="sh-meter__track" role="img" aria-label={pct === null ? text : `${pct}% of the limit`}>
        <span className="sh-meter__fill" style={{ width: `${Math.min(pct ?? 0, 100)}%` }} />
      </div>
      <small>{text}{pct !== null ? ` · ${pct}%` : ''}</small>
    </div>
  );
}

function Spark({ values, bad }: { values: number[]; bad?: boolean[] }) {
  if (!values.length) return <span className="p2w-muted">—</span>;
  const heights = barHeights(values);
  return (
    <div className="sh-spark" role="img" aria-label="Per hour">
      {heights.map((h, i) => <span key={i} className={bad?.[i] ? 'is-bad' : ''} style={{ height: `${Math.max(h, 2)}%` }} />)}
    </div>
  );
}

function errorText(cause: unknown): string {
  return cause instanceof Error ? cause.message : 'The system health could not be loaded.';
}

function Tiles({ data }: { data: SystemHealth }) {
  const up = data.services.filter((s) => s.status === 'UP').length;
  const restarts = data.services.reduce((n, s) => n + s.restarts, 0);
  const unclean = data.services.reduce((n, s) => n + s.uncleanStops, 0);
  const requests = data.services.reduce((n, s) => n + s.requests, 0);
  const c5 = data.services.reduce((n, s) => n + s.serverErrors, 0);
  const c4 = data.services.reduce((n, s) => n + s.clientErrors, 0);
  const over30 = data.pipeline.projects.reduce((n, p) => n + p.documents.over30m + p.work.over30m, 0);
  const dead = data.pipeline.projects.reduce((n, p) => n + p.work.deadLetter + p.deadLettersOpen, 0);
  const conns = connectionsInUse(data.database);
  const deadlocks = data.database.window?.deadlocks;
  return (
    <dl className="tm-tiles">
      <div className={up < data.services.length ? 'is-bad' : ''}><dt>Services up</dt><dd>{up} / {data.services.length}</dd>
        <span>{data.services.length ? 'from their own heartbeats' : 'no heartbeat yet'}</span></div>
      <div className={restarts || unclean ? 'is-warn' : ''}><dt>Restarts</dt><dd>{restarts}</dd>
        <span>{unclean} ended without a clean shutdown</span></div>
      <div className={c5 ? 'is-bad' : ''}><dt>Failed requests (5xx)</dt><dd>{c5}</dd>
        <span>{errorRate(c5, requests)} of {requests.toLocaleString('en-IN')}</span></div>
      <div className={requests && c4 / requests > 0.05 ? 'is-warn' : ''}><dt>Refused requests (4xx)</dt><dd>{c4}</dd>
        <span>{errorRate(c4, requests)} of requests</span></div>
      <div className={over30 ? 'is-warn' : ''}><dt>Past 30 minutes</dt><dd>{over30}</dd><span>pages and work items still waiting</span></div>
      <div className={dead ? 'is-bad' : ''}><dt>Gave up after retries</dt><dd>{dead}</dd><span>dead letters</span></div>
      <div className={conns >= 0.8 * data.database.maxConnections ? 'is-bad' : ''}><dt>DB connections</dt><dd>{conns}</dd>
        <span>of {data.database.maxConnections} · {data.database.idleInTransactionOver5m} held open &gt; 5 min</span></div>
      <div className={deadlocks ? 'is-warn' : ''}><dt>Deadlocks</dt><dd>{deadlocks ?? '—'}</dd>
        <span>{deadlocks === undefined ? `${data.database.deadlocks} since stats began` : 'in this window'}</span></div>
    </dl>
  );
}

function ResourceRow({ r }: { r: ResourceHealth }) {
  return (
    <tr>
      <td>{r.service}</td>
      <td><Meter value={r.cpuMax} limit={r.cpuLimit} text={cpuText(r)} /></td>
      <td className="sh-num">{r.cpuAvg === null ? '—' : r.cpuAvg.toFixed(2)}</td>
      <td className={r.cpuHotMinutes ? 'sh-num tm-warn' : 'sh-num'}>{r.cpuHotMinutes}</td>
      <td>{formatWhen(r.cpuPeakAtUtc)}</td>
      <td><Meter value={r.memoryMaxGb} limit={r.memoryLimitGb} text={memoryText(r)} /></td>
      <td>{formatWhen(r.memoryPeakAtUtc)}</td>
      <td><Spark values={r.hourly.map((h) => h.cpuMax ?? 0)} /></td>
    </tr>
  );
}

export default function AdminSystemHealthPage() {
  const accessToken = useSessionStore((s) => s.accessToken);
  const [hours, setHours] = useState(24);
  const health = useQuery({
    queryKey: ['admin', 'system-health', hours],
    queryFn: () => getSystemHealth(hours, accessToken!),
    enabled: Boolean(accessToken),
    refetchInterval: 60_000,
    retry: false,
  });
  const data = health.data;
  const status = data ? overallStatus(data.alerts) : null;
  const counts = data ? alertCounts(data.alerts) : null;

  return (
    <div className="screen-stack p2-screen p2w">
      <PageHeader
        eyebrow="Administration"
        title="System health"
        description="Services, restarts, failed requests, CPU and memory, deployments, stuck work and the database, across every Project."
      />

      <div className="p2w-listbar">
        <div className="p2w-segment" role="tablist" aria-label="Window">
          {WINDOWS.map((w) => (
            <button key={w.hours} type="button" role="tab" aria-selected={hours === w.hours}
              className={hours === w.hours ? 'is-active' : ''} onClick={() => setHours(w.hours)}>{w.label}</button>
          ))}
        </div>
        <div className="p2w-filters">
          {data ? <span className="p2w-muted">Updated {formatWhen(data.generatedAtUtc)} · refreshes every minute</span> : null}
          <button type="button" className="p2w-btn p2w-btn--ghost" onClick={() => void health.refetch()} disabled={health.isFetching}>
            {health.isFetching ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>

      {health.isError ? <div className="p2w-alert p2w-alert--error" role="alert">{errorText(health.error)}</div> : null}
      {health.isLoading ? <div className="p2w-skeleton">Loading…</div> : null}

      {data && status && counts ? (
        <div className="sh-stack">
          <section className={`sh-banner sh-banner--${status.tone}`} aria-live="polite">
            <div className="sh-banner__head">
              <strong><Dot tone={status.tone} />{status.label}</strong>
              <span className="p2w-muted">{counts.critical} critical · {counts.warning} warnings · last {WINDOWS.find((w) => w.hours === hours)?.label}</span>
            </div>
            {data.alerts.length ? (
              <ul>
                {data.alerts.map((a, i) => (
                  <li key={`${a.code}-${i}`}><span className={`sh-sev sh-sev--${a.severity}`}>{a.severity === 'CRITICAL' ? 'Critical' : 'Warning'}</span>{a.message}</li>
                ))}
              </ul>
            ) : null}
            <span className="sh-note">Alerts show here for now; WhatsApp alerts will follow.</span>
          </section>

          <Tiles data={data} />

          <SectionCard>
            <div className="p2w-card__title">
              <h3>Services</h3>
              <p className="p2w-muted">From each service's own heartbeat. A restart is a new start within the same deployment; a deploy is a start of a new deployment.</p>
            </div>
            {data.services.length ? (
              <div className="p2dr-scroll">
                <table className="p2dr-table">
                  <thead>
                    <tr>
                      <th>Service</th><th>Status</th><th>Up since</th><th>Version</th><th className="sh-num">Restarts</th><th className="sh-num">Deploys</th>
                      <th className="sh-num">Unclean stops</th><th className="sh-num">Requests</th><th className="sh-num">4xx</th><th className="sh-num">5xx</th>
                      <th className="sh-num">Slow</th><th>Requests per hour</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.services.map((s) => (
                      <tr key={s.service}>
                        <td>{s.service}</td>
                        <td><Dot tone={serviceTone(s)} />{serviceStatusLabel(s.status)}{s.replicasAlive > 1 ? ` · ${s.replicasAlive} replicas` : ''}
                          {s.status === 'DOWN' ? <div className="sh-note">last seen {agoText(s.lastSeenAtUtc)}</div> : null}</td>
                        <td>{formatWhen(s.upSinceUtc)}</td>
                        <td className="sh-code">{s.currentVersion ?? '—'}</td>
                        <td className={s.restarts ? 'sh-num tm-warn' : 'sh-num'}>{s.restarts}</td>
                        <td className="sh-num">{s.deploys}</td>
                        <td className={s.uncleanStops ? 'sh-num tm-warn' : 'sh-num'}>{s.uncleanStops}
                          {s.lastUncleanStopAtUtc ? <div className="sh-note">{formatWhen(s.lastUncleanStopAtUtc)}</div> : null}</td>
                        <td className="sh-num">{s.requests ? s.requests.toLocaleString('en-IN') : '—'}</td>
                        <td className="sh-num">{s.requests ? `${s.clientErrors} (${errorRate(s.clientErrors, s.requests)})` : '—'}</td>
                        <td className={s.serverErrors ? 'sh-num tm-bad' : 'sh-num'}>{s.requests ? s.serverErrors : '—'}</td>
                        <td className="sh-num">{s.requests ? s.slowRequests : '—'}</td>
                        <td><Spark values={s.hourly.map((h) => h.total)} bad={s.hourly.map((h) => h['5xx'] > 0)} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="p2w-muted">No service has sent a heartbeat yet. They start sending once their new versions are deployed.</p>}
            {data.services.some((s) => s.failingRoutes.length) ? (
              <>
                <h4>Requests that failed, by route</h4>
                <div className="p2dr-scroll">
                  <table className="p2dr-table">
                    <thead><tr><th>Service</th><th>Route</th><th className="sh-num">4xx</th><th className="sh-num">5xx</th></tr></thead>
                    <tbody>
                      {data.services.flatMap((s) => s.failingRoutes.map((r) => (
                        <tr key={`${s.service}${r.route}`}>
                          <td>{s.service}</td><td className="sh-code">{r.route}</td>
                          <td className="sh-num">{r['4xx']}</td><td className={r['5xx'] ? 'sh-num tm-bad' : 'sh-num'}>{r['5xx']}</td>
                        </tr>
                      )))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : null}
          </SectionCard>

          <SectionCard>
            <div className="p2w-card__title">
              <h3>CPU and memory</h3>
              <p className="p2w-muted">Each service reads its own container every 5 seconds; the peak and average of each minute are kept, so short spikes show. Hot minutes: CPU at 80% of the limit or more.</p>
            </div>
            {data.resources.length ? (
              <div className="p2dr-scroll">
                <table className="p2dr-table">
                  <thead>
                    <tr><th>Service</th><th>CPU peak</th><th className="sh-num">CPU avg</th><th className="sh-num">Hot minutes</th><th>CPU peak at</th>
                      <th>Memory peak</th><th>Memory peak at</th><th>CPU peak per hour</th></tr>
                  </thead>
                  <tbody>{data.resources.map((r) => <ResourceRow key={r.service} r={r} />)}</tbody>
                </table>
              </div>
            ) : <p className="p2w-muted">No CPU or memory readings yet.</p>}
          </SectionCard>

          <SectionCard>
            <div className="p2w-card__title">
              <h3>Deployments (Railway)</h3>
              <p className="p2w-muted">
                {data.railway.webhookConfigured
                  ? `Railway reports each deployment change here. Last report ${agoText(data.railway.lastEventAtUtc)}.`
                  : 'Railway deployment alerts are not connected yet.'}
              </p>
            </div>
            {data.railway.failedOrCrashed.length ? (
              <table className="p2dr-table">
                <thead><tr><th>Service</th><th>Outcome</th><th>When</th></tr></thead>
                <tbody>
                  {data.railway.failedOrCrashed.map((d, i) => (
                    <tr key={`${d.deploymentId}-${i}`}><td>{d.service ?? '—'}</td><td className="tm-bad">{d.status}</td><td>{formatWhen(d.atUtc)}</td></tr>
                  ))}
                </tbody>
              </table>
            ) : <p className="p2w-muted">{data.railway.webhookConfigured ? `No failed or crashed deployment in this window (${data.railway.deployments} deployment changes).` : ''}</p>}
            {data.railway.monitorAlerts.length ? (
              <>
                <h4>Railway resource alerts</h4>
                <ul>{data.railway.monitorAlerts.map((m, i) => <li key={i}>{formatWhen(m.atUtc)} · {m.service} · {m.type}</li>)}</ul>
              </>
            ) : null}
          </SectionCard>

          <SectionCard>
            <div className="p2w-card__title">
              <h3>Documents and work, per Project</h3>
              <p className="p2w-muted">In flight now, past the 30-minute rule, and what failed in this window. Counts only.</p>
            </div>
            {data.pipeline.projects.length ? (
              <div className="p2dr-scroll">
                <table className="p2dr-table">
                  <thead>
                    <tr>
                      <th>Project</th><th className="sh-num">Pages in flight</th><th className="sh-num">Pages &gt; 30 min</th><th className="sh-num">Pages failed</th>
                      <th className="sh-num">Pages read</th><th className="sh-num">Work open</th><th className="sh-num">Work &gt; 30 min</th>
                      <th>Oldest open work</th><th className="sh-num">Gave up</th><th className="sh-num">Events not sent</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.pipeline.projects.map((p) => (
                      <tr key={p.tenantId}>
                        <td>{p.projectName}{p.projectStatus && p.projectStatus !== 'ACTIVE' ? <span className="p2w-muted"> · {p.projectStatus.toLowerCase()}</span> : null}</td>
                        <td className="sh-num">{p.documents.inFlight}</td>
                        <td className={p.documents.over30m ? 'sh-num tm-warn' : 'sh-num'}>{p.documents.over30m}</td>
                        <td className={p.documents.failed ? 'sh-num tm-bad' : 'sh-num'}>{p.documents.failed}</td>
                        <td className="sh-num">{p.documents.ready}</td>
                        <td className="sh-num">{p.work.open}</td>
                        <td className={p.work.over30m ? 'sh-num tm-warn' : 'sh-num'}>{p.work.over30m}</td>
                        <td>{p.work.oldestOpenAtUtc ? `${formatWhen(p.work.oldestOpenAtUtc)} (${agoText(p.work.oldestOpenAtUtc)})` : '—'}</td>
                        <td className={p.work.deadLetter + p.deadLettersOpen ? 'sh-num tm-bad' : 'sh-num'}>{p.work.deadLetter + p.deadLettersOpen}</td>
                        <td className={p.outboxProblems ? 'sh-num tm-warn' : 'sh-num'}>{p.outboxProblems}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="p2w-muted">Nothing in flight and nothing failed in this window.</p>}
            {data.pipeline.projects.some((p) => p.failureReasons.length) ? (
              <>
                <h4>Why things failed</h4>
                <div className="p2dr-scroll">
                  <table className="p2dr-table">
                    <thead><tr><th>Project</th><th>Kind</th><th>Reason</th><th className="sh-num">Count</th></tr></thead>
                    <tbody>
                      {data.pipeline.projects.flatMap((p) => p.failureReasons.map((r, i) => (
                        <tr key={`${p.tenantId}-${i}`}><td>{p.projectName}</td><td>{r.kind}</td><td className="sh-code">{r.reason}</td><td className="sh-num">{r.count}</td></tr>
                      )))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : null}
          </SectionCard>

          <SectionCard>
            <div className="p2w-card__title">
              <h3>Database ({data.database.database})</h3>
              <p className="p2w-muted">
                {bytesText(data.database.sizeBytes)} · {connectionsInUse(data.database)} of {data.database.maxConnections} connections
                ({Object.entries(data.database.connections).map(([k, v]) => `${v} ${k}`).join(', ') || 'none'})
                · {data.database.activeOver1m} queries running over 1 min · {data.database.waitingOnLocks} waiting on locks
              </p>
            </div>
            <dl className="tm-tiles">
              <div className={data.database.window?.deadlocks ? 'is-warn' : ''}><dt>Deadlocks</dt><dd>{data.database.window?.deadlocks ?? '—'}</dd>
                <span>{data.database.deadlocks} since {data.database.statsResetAtUtc ? formatWhen(data.database.statsResetAtUtc) : 'stats began'}</span></div>
              <div className={(data.database.window?.rollbackRatio ?? 0) > 0.05 ? 'is-warn' : ''}><dt>Rolled back</dt>
                <dd>{data.database.window?.rollbackRatio !== undefined ? `${(100 * data.database.window.rollbackRatio).toFixed(1)}%` : '—'}</dd>
                <span>{data.database.window?.rollbacks ?? '—'} of {((data.database.window?.commits ?? 0) + (data.database.window?.rollbacks ?? 0)).toLocaleString('en-IN')} transactions</span></div>
              <div className={data.database.idleInTransactionOver5m ? 'is-warn' : ''}><dt>Held open &gt; 5 min</dt><dd>{data.database.idleInTransactionOver5m}</dd><span>idle in transaction</span></div>
              <div><dt>Temp files</dt><dd>{data.database.window?.tempFiles ?? '—'}</dd><span>queries spilling to disk</span></div>
            </dl>
            {data.database.window === null ? <p className="sh-note">The change over the window shows once two 15-minute readings exist.</p> : null}
            {data.database.window?.note ? <p className="sh-note">{data.database.window.note}</p> : null}
            <h4>Slowest queries (average time)</h4>
            {data.database.slowQueries?.length ? (
              <div className="p2dr-scroll">
                <table className="p2dr-table">
                  <thead><tr><th>Query</th><th className="sh-num">Calls</th><th className="sh-num">Avg ms</th><th className="sh-num">Max ms</th><th className="sh-num">Total ms</th></tr></thead>
                  <tbody>
                    {data.database.slowQueries.map((q, i) => (
                      <tr key={i}>
                        <td className="sh-code">{q.query}</td><td className="sh-num">{q.calls.toLocaleString('en-IN')}</td>
                        <td className={q.meanMs >= 1000 ? 'sh-num tm-bad' : q.meanMs >= 200 ? 'sh-num tm-warn' : 'sh-num'}>{q.meanMs}</td>
                        <td className="sh-num">{q.maxMs}</td><td className="sh-num">{q.totalMs.toLocaleString('en-IN')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="p2w-muted">{data.database.slowQueriesNote ?? 'No query statistics yet.'}</p>}
          </SectionCard>
        </div>
      ) : null}
    </div>
  );
}
