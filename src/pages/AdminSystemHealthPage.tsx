import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import '../styles/uc03-p2.css';
import '../styles/uc03-p2-workspace.css';
import '../styles/uc03-p2-daily-report.css';
import '../styles/task-manager.css';
import '../styles/system-health.css';

import PageHeader from '../components/PageHeader';
import SectionCard from '../components/SectionCard';
import DailyTrendTab from '../features/admin/systemHealth/DailyTrendTab';
import FailedRequestsTab from '../features/admin/systemHealth/FailedRequestsTab';
import InfrastructureTab from '../features/admin/systemHealth/InfrastructureTab';
import UploadPauseControl from '../features/admin/systemHealth/UploadPauseControl';
import { formatWhen } from '../features/task-manager/tmFormat';
import {
  agoText, alertCounts, barHeights, bytesText, connectionsInUse, cpuText, diTotals, errorRate, memoryText, overallStatus,
  pctTone, serviceStatusLabel, serviceTone, usePct, type Tone,
} from '../features/admin/systemHealth/systemHealthLogic';
import {
  getSystemHealth, type DatabaseHealth, type DocumentIntelligenceHealth, type ResourceHealth, type SystemHealth,
} from '../services/audit-core/systemHealth';
import { useSessionStore } from '../store/sessionStore';

/**
 * SuperAdmin System Health (product owner 2026-10-27): are the services up,
 * how often they restarted or crashed, failed requests, CPU and memory against
 * their limits, deployments that failed, documents and work stuck past 30
 * minutes per Project, and the database. Platform-wide; SuperAdmin only, and
 * the server enforces it.
 */

type HealthTab = 'overview' | 'errors' | 'infra' | 'daily';
const TABS: Array<{ key: HealthTab; label: string }> = [
  { key: 'overview', label: 'Overview' }, { key: 'errors', label: 'Failed requests' },
  { key: 'infra', label: 'Cloudflare & Neon' }, { key: 'daily', label: 'Daily trend' },
];

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
  const di = diTotals(data.pipeline.documentIntelligence);
  const over30 = data.pipeline.projects.reduce((n, p) => n + p.documents.over30m + p.work.over30m, 0) + di.over30m;
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
      <div className={over30 ? 'is-warn' : ''}><dt>Past 30 minutes</dt><dd>{over30}</dd><span>pages, work items and DI jobs still waiting</span></div>
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

function DatabaseCard({ title, db, windowNote }: { title: string; db: DatabaseHealth; windowNote: string }) {
  return (
    <SectionCard>
      <div className="p2w-card__title">
        <h3>{title}</h3>
        <p className="p2w-muted">
          {bytesText(db.sizeBytes)} · {connectionsInUse(db)} of {db.maxConnections} connections
          ({Object.entries(db.connections).map(([k, v]) => `${v} ${k}`).join(', ') || 'none'})
          · {db.activeOver1m} queries running over 1 min · {db.waitingOnLocks} waiting on locks
        </p>
      </div>
      <dl className="tm-tiles">
        <div className={db.window?.deadlocks ? 'is-warn' : ''}><dt>Deadlocks</dt><dd>{db.window?.deadlocks ?? '—'}</dd>
          <span>{db.deadlocks} since {db.statsResetAtUtc ? formatWhen(db.statsResetAtUtc) : 'stats began'}</span></div>
        <div className={(db.window?.rollbackRatio ?? 0) > 0.05 ? 'is-warn' : ''}><dt>Rolled back</dt>
          <dd>{db.window?.rollbackRatio !== undefined ? `${(100 * db.window.rollbackRatio).toFixed(1)}%` : '—'}</dd>
          <span>{db.window?.rollbacks ?? '—'} of {((db.window?.commits ?? 0) + (db.window?.rollbacks ?? 0)).toLocaleString('en-IN')} transactions</span></div>
        <div className={db.idleInTransactionOver5m ? 'is-warn' : ''}><dt>Held open &gt; 5 min</dt><dd>{db.idleInTransactionOver5m}</dd><span>idle in transaction</span></div>
        <div><dt>Temp files</dt><dd>{db.window?.tempFiles ?? '—'}</dd><span>queries spilling to disk</span></div>
      </dl>
      {db.window === null ? <p className="sh-note">{windowNote}</p> : null}
      {db.window?.note ? <p className="sh-note">{db.window.note}</p> : null}
      <h4>Slowest queries (average time)</h4>
      {db.slowQueries?.length ? (
        <div className="p2dr-scroll">
          <table className="p2dr-table">
            <thead><tr><th>Query</th><th className="sh-num">Calls</th><th className="sh-num">Avg ms</th><th className="sh-num">Max ms</th><th className="sh-num">Total ms</th></tr></thead>
            <tbody>
              {db.slowQueries.map((q, i) => (
                <tr key={i}>
                  <td className="sh-code">{q.query}</td><td className="sh-num">{q.calls.toLocaleString('en-IN')}</td>
                  <td className={q.meanMs >= 1000 ? 'sh-num tm-bad' : q.meanMs >= 200 ? 'sh-num tm-warn' : 'sh-num'}>{q.meanMs}</td>
                  <td className="sh-num">{q.maxMs}</td><td className="sh-num">{q.totalMs.toLocaleString('en-IN')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className="p2w-muted">{db.slowQueriesNote ?? 'No query statistics yet.'}</p>}
    </SectionCard>
  );
}

function QueueCells({ q }: { q: DocumentIntelligenceHealth['projects'][number]['extraction'] }) {
  return (
    <>
      <td className="sh-num">{q.inFlight}</td>
      <td className={q.over30m ? 'sh-num tm-warn' : 'sh-num'}>{q.over30m}</td>
      <td className={q.failed ? 'sh-num tm-bad' : 'sh-num'}>{q.failed}</td>
      <td className="sh-num">{q.completed}</td>
    </>
  );
}

function DocumentIntelligenceCard({ di }: { di: DocumentIntelligenceHealth | null }) {
  if (!di) return null;
  return (
    <SectionCard>
      <div className="p2w-card__title">
        <h3>Document Intelligence, per Project</h3>
        <p className="p2w-muted">
          {di.available
            ? 'Reported by Document Intelligence from its own database: classification and reading jobs in flight, past 30 minutes, failed and done in this window.'
            : `Document Intelligence could not be read: ${di.error ?? 'no answer'}.`}
        </p>
      </div>
      {di.available && di.projects.length ? (
        <div className="p2dr-scroll">
          <table className="p2dr-table">
            <thead>
              <tr>
                <th rowSpan={2}>Project</th><th colSpan={4}>Classification</th><th colSpan={4}>Reading (extraction)</th><th rowSpan={2}>Oldest waiting</th>
              </tr>
              <tr>
                <th className="sh-num">In flight</th><th className="sh-num">&gt; 30 min</th><th className="sh-num">Failed</th><th className="sh-num">Done</th>
                <th className="sh-num">In flight</th><th className="sh-num">&gt; 30 min</th><th className="sh-num">Failed</th><th className="sh-num">Done</th>
              </tr>
            </thead>
            <tbody>
              {di.projects.map((p) => {
                const oldest = [p.classification.oldestInFlightAtUtc, p.extraction.oldestInFlightAtUtc].filter(Boolean).sort()[0] ?? null;
                return (
                  <tr key={p.tenantId}>
                    <td>{p.projectName}{p.projectStatus && p.projectStatus !== 'ACTIVE' ? <span className="p2w-muted"> · {p.projectStatus.toLowerCase()}</span> : null}</td>
                    <QueueCells q={p.classification} />
                    <QueueCells q={p.extraction} />
                    <td>{oldest ? `${formatWhen(oldest)} (${agoText(oldest)})` : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : di.available ? <p className="p2w-muted">No Document Intelligence jobs in this window.</p> : null}
      {di.available && di.projects.some((p) => p.failureReasons.length) ? (
        <>
          <h4>Why Document Intelligence jobs failed</h4>
          <div className="p2dr-scroll">
            <table className="p2dr-table">
              <thead><tr><th>Project</th><th>Stage</th><th>Error code</th><th className="sh-num">Count</th></tr></thead>
              <tbody>
                {di.projects.flatMap((p) => p.failureReasons.map((r, i) => (
                  <tr key={`${p.tenantId}-${i}`}><td>{p.projectName}</td><td>{r.queue === 'extraction' ? 'Reading' : 'Classification'}</td>
                    <td className="sh-code">{r.errorCode}</td><td className="sh-num">{r.count}</td></tr>
                )))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
      {di.available && (di.leaseReclaims || di.schedulerProblems.length) ? (
        <ul>
          {di.leaseReclaims ? <li>{di.leaseReclaims} job(s) taken back from a worker that stopped while holding them.</li> : null}
          {di.schedulerProblems.map((s, i) => (
            <li key={i}>{s.runName} for {s.runDate}: {s.errorCode ? <span className="sh-code">{s.errorCode}</span> : 'did not finish'} · started {formatWhen(s.startedAtUtc)}</li>
          ))}
        </ul>
      ) : null}
    </SectionCard>
  );
}

export default function AdminSystemHealthPage() {
  const accessToken = useSessionStore((s) => s.accessToken);
  const [hours, setHours] = useState(24);
  const [tab, setTab] = useState<HealthTab>('overview');
  const health = useQuery({
    queryKey: ['admin', 'system-health', hours],
    queryFn: () => getSystemHealth(hours, accessToken!),
    enabled: Boolean(accessToken) && tab === 'overview',
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
        description="Services, restarts, failed requests, CPU and memory, deployments, stuck work, Cloudflare, R2 and the Neon database, across every Project."
      />

      {accessToken ? <UploadPauseControl accessToken={accessToken} /> : null}

      <div className="sh-tabs" role="tablist" aria-label="System health view">
        {TABS.map((t) => (
          <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} className={tab === t.key ? 'is-active' : ''}
            onClick={() => setTab(t.key)}>{t.label}</button>
        ))}
      </div>

      {tab === 'daily' && accessToken ? <DailyTrendTab accessToken={accessToken} /> : null}

      {tab !== 'daily' ? (
      <div className="p2w-listbar">
        <div className="p2w-segment" role="tablist" aria-label="Window">
          {WINDOWS.map((w) => (
            <button key={w.hours} type="button" role="tab" aria-selected={hours === w.hours}
              className={hours === w.hours ? 'is-active' : ''} onClick={() => setHours(w.hours)}>{w.label}</button>
          ))}
        </div>
        <div className="p2w-filters">
          {tab === 'overview' && data ? <span className="p2w-muted">Updated {formatWhen(data.generatedAtUtc)} · refreshes every minute</span> : null}
          {tab === 'overview' ? (
            <button type="button" className="p2w-btn p2w-btn--ghost" onClick={() => void health.refetch()} disabled={health.isFetching}>
              {health.isFetching ? 'Refreshing…' : 'Refresh'}
            </button>
          ) : null}
        </div>
      </div>
      ) : null}

      {tab === 'errors' && accessToken ? <FailedRequestsTab hours={hours} accessToken={accessToken} /> : null}
      {tab === 'infra' && accessToken ? <InfrastructureTab hours={hours} accessToken={accessToken} /> : null}

      {tab === 'overview' && health.isError ? <div className="p2w-alert p2w-alert--error" role="alert">{errorText(health.error)}</div> : null}
      {tab === 'overview' && health.isLoading ? <div className="p2w-skeleton">Loading…</div> : null}

      {tab === 'overview' && data && status && counts ? (
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
                <h4>Requests that failed, by route <button type="button" className="p2w-link" onClick={() => setTab('errors')}>See them by error code →</button></h4>
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

          <DocumentIntelligenceCard di={data.pipeline.documentIntelligence} />

          <DatabaseCard title={`Audit Core database (${data.database.database})`} db={data.database}
            windowNote="The change over the window shows once two 15-minute readings exist." />
          {data.diDatabase ? (
            <DatabaseCard title={`Document Intelligence database (${data.diDatabase.database})`} db={data.diDatabase}
              windowNote="Totals since the database's statistics began; the change over the window is kept for Audit Core's database only." />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
