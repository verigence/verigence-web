import { useMemo } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';

import SectionCard from '../../../components/SectionCard';
import { formatWhen } from '../../task-manager/tmFormat';
import {
  getSystemHealthInfrastructure, type InfrastructureHealth, type LiveProbe, type NodeStatus,
} from '../../../services/audit-core/systemHealth';
import { AXIS, ChartTooltip, SERIES, SeriesLegend } from './chartParts';
import {
  R2_SERIES, alignHours, cuRange, durationText, emptyR2Hour, emptyWorkerHour, hourLabel, hourTick, msText, nodeLabel,
  nodeTone, pctFloor, probeText, r2Bars, ratioText, workerBars,
} from './infraLogic';
import { agoText, bytesText, errorRate } from './systemHealthLogic';

/**
 * Cloudflare (the web app's Worker and the documents' R2 bucket) and the Neon
 * database (product owner 2026-10-31: "add the cloudflare web and R2 nodes",
 * "NeonDB status health status.. spikes, CPU and all"). One card per node with
 * its live probe and key numbers, then hourly charts; each chart has one unit.
 */

function Chip({ status }: { status: NodeStatus }) {
  return <span className={`sh-chip-status sh-chip-status--${nodeTone(status)}`}><span className={`sh-dot sh-dot--${nodeTone(status)}`} aria-hidden="true" />{nodeLabel(status)}</span>;
}

function Probe({ label, probe }: { label: string; probe: LiveProbe }) {
  const tone = !probe.configured ? 'muted' : probe.ok ? 'ok' : 'bad';
  return (
    <p className="sh-probe">
      <span className={`sh-dot sh-dot--${tone}`} aria-hidden="true" />
      <span>{label}: <b>{probeText(probe)}</b></span>
      {probe.configured ? <span className="p2w-muted"> · checked {agoText(probe.checkedAtUtc)}</span> : null}
    </p>
  );
}

function Unavailable({ what, configured, error }: { what: string; configured: boolean; error: string | null }) {
  return (
    <p className={configured ? 'p2w-alert p2w-alert--error' : 'sh-note'}>
      {configured ? `${what} could not be read: ${error ?? 'no answer'}` : `${what}: not configured. ${error ?? ''}`}
    </p>
  );
}

type Tick = (iso: string) => string;

function Bars<T extends { hour: string | null }>({ rows, series, label, tick, unit = '' }: {
  rows: T[]; series: ReadonlyArray<{ key: string; label: string }>; label: string; tick: Tick; unit?: string;
}) {
  return (
    <div className="sh-chart" role="img" aria-label={label}>
      <SeriesLegend series={series} />
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: -8 }} barCategoryGap="18%">
          <CartesianGrid vertical={false} stroke="var(--sh-grid)" />
          <XAxis dataKey="hour" tickFormatter={tick} tick={AXIS} tickLine={false} axisLine={{ stroke: 'var(--sh-grid)' }} minTickGap={16} />
          <YAxis allowDecimals={unit !== ''} tick={AXIS} tickLine={false} axisLine={false} width={48} />
          <Tooltip content={<ChartTooltip labelFormat={hourLabel} unit={unit} />} cursor={{ fill: 'var(--sh-cursor)' }} />
          {series.map((s, i) => (
            <Bar key={s.key} dataKey={s.key} name={s.label} stackId="a" fill={SERIES[i]} stroke="var(--sh-surface)" strokeWidth={1}
              radius={i === series.length - 1 ? [3, 3, 0, 0] : 0} maxBarSize={22} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function Lines<T extends { hour: string | null }>({ rows, series, label, tick, unit = '', domain }: {
  rows: T[]; series: ReadonlyArray<{ key: string; label: string }>; label: string; tick: Tick; unit?: string;
  domain?: [number | 'auto', number | 'auto'];
}) {
  return (
    <div className="sh-chart" role="img" aria-label={label}>
      <SeriesLegend series={series} line />
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: -8 }}>
          <CartesianGrid vertical={false} stroke="var(--sh-grid)" />
          <XAxis dataKey="hour" tickFormatter={tick} tick={AXIS} tickLine={false} axisLine={{ stroke: 'var(--sh-grid)' }} minTickGap={16} />
          <YAxis unit={unit} tick={AXIS} tickLine={false} axisLine={false} width={52} domain={domain ?? [0, 'auto']} allowDataOverflow={false} />
          <Tooltip content={<ChartTooltip labelFormat={hourLabel} unit={unit} />} cursor={{ stroke: 'var(--sh-axis-text)', strokeDasharray: '3 3' }} />
          {series.map((s, i) => (
            <Line key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={SERIES[i]} strokeWidth={2}
              dot={false} activeDot={{ r: 4 }} connectNulls={false} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function NodeCards({ data }: { data: InfrastructureHealth }) {
  const { web, r2, neon } = data;
  const db = neon.database;
  const endpoint = neon.api.endpoints.find((e) => e.type === 'read_write') ?? neon.api.endpoints[0];
  return (
    <div className="sh-nodes">
      <section className={`sh-node sh-node--${nodeTone(web.status)}`} aria-label="Web app on Cloudflare">
        <header><h3>Web <small>Cloudflare Worker · {web.worker}</small></h3><Chip status={web.status} /></header>
        <Probe label="Live check" probe={web.probe} />
        {web.analytics.available ? (
          <dl>
            <div><dt>Requests</dt><dd>{(web.analytics.requests ?? 0).toLocaleString('en-IN')}</dd></div>
            <div><dt>Errors</dt><dd className={web.analytics.errors ? 'tm-bad' : ''}>{web.analytics.errors ?? 0} <small>{errorRate(web.analytics.errors ?? 0, web.analytics.requests ?? 0)}</small></dd></div>
            <div><dt>CPU p50 / p99</dt><dd>{msText(web.analytics.cpuTimeP50Ms)} / {msText(web.analytics.cpuTimeP99Ms)}</dd></div>
          </dl>
        ) : <Unavailable what="Cloudflare analytics" configured={web.analytics.configured} error={web.analytics.error} />}
      </section>

      <section className={`sh-node sh-node--${nodeTone(r2.status)}`} aria-label="Document storage on Cloudflare R2">
        <header><h3>R2 <small>{r2.bucket ?? 'no bucket configured'}</small></h3><Chip status={r2.status} /></header>
        <Probe label="Bucket check" probe={r2.probe} />
        {r2.analytics.available ? (
          <dl>
            <div><dt>Objects</dt><dd>{r2.analytics.storage ? r2.analytics.storage.objectCount.toLocaleString('en-IN') : '—'}</dd></div>
            <div><dt>Stored</dt><dd>{bytesText(r2.analytics.storage?.payloadBytes)}</dd></div>
            <div><dt>Operations</dt><dd>{(r2.analytics.operations ?? 0).toLocaleString('en-IN')}</dd></div>
            <div><dt>Server errors</dt><dd className={r2.analytics.serverErrors ? 'tm-bad' : ''}>{r2.analytics.serverErrors ?? 0} <small>{ratioText(r2.analytics.serverErrorRate, 2)}</small></dd></div>
          </dl>
        ) : <Unavailable what="Cloudflare analytics" configured={r2.analytics.configured} error={r2.analytics.error} />}
      </section>

      <section className={`sh-node sh-node--${nodeTone(neon.status)}`} aria-label="Neon database">
        <header><h3>Neon DB <small>{neon.projectId}</small></h3><Chip status={neon.status} /></header>
        {endpoint ? (
          <p className="sh-probe"><span className={`sh-dot sh-dot--${endpoint.state === 'active' || endpoint.state === 'idle' ? 'ok' : 'warn'}`} aria-hidden="true" />
            <span>Compute: <b>{endpoint.state ?? '—'}</b> · {cuRange(endpoint)}</span></p>
        ) : <p className="sh-probe"><span className="sh-dot sh-dot--muted" aria-hidden="true" /><span>Compute: <b>{neon.api.configured ? 'not read' : 'Neon API not configured'}</b></span></p>}
        {db.latest ? (
          <dl>
            <div><dt>Connections</dt><dd>{db.latest.connectionsTotal} <small>of {db.latest.maxConnections ?? '—'}</small></dd></div>
            <div><dt>TPS avg / peak</dt><dd>{db.window?.tps ?? '—'} / {db.window?.tpsPeak ?? '—'}</dd></div>
            <div><dt>Cache hit</dt><dd className={(db.window?.cacheHitRatio ?? 1) < 0.95 ? 'tm-warn' : ''}>{ratioText(db.lfcAvailable ? db.window?.lfcHitRatio : db.window?.cacheHitRatio)}</dd></div>
            <div><dt>Longest query</dt><dd className={(db.latest.longestQuerySeconds ?? 0) > 300 ? 'tm-warn' : ''}>{durationText(db.latest.longestQuerySeconds)}</dd></div>
          </dl>
        ) : <p className="sh-note">{db.note}</p>}
      </section>
    </div>
  );
}

export default function InfrastructureTab({ hours, accessToken }: { hours: number; accessToken: string }) {
  const infra = useQuery({
    queryKey: ['admin', 'system-health', 'infrastructure', hours],
    queryFn: () => getSystemHealthInfrastructure(hours, accessToken),
    placeholderData: keepPreviousData,
    refetchInterval: 60_000,
    retry: false,
  });
  const data = infra.data;
  const now = data ? new Date(data.generatedAtUtc).getTime() : Date.now();
  const tick = useMemo(() => (iso: string) => hourTick(iso, hours), [hours]);
  const web = useMemo(() => (data?.web.analytics.hourly
    ? workerBars(alignHours(data.web.analytics.hourly, hours, now, emptyWorkerHour)) : []), [data, hours, now]);
  const r2 = useMemo(() => (data?.r2.analytics.hourly
    ? r2Bars(alignHours(data.r2.analytics.hourly, hours, now, emptyR2Hour)) : []), [data, hours, now]);
  const neon = useMemo(() => {
    if (!data) return [];
    const lfc = data.neon.database.lfcAvailable;
    const rows = data.neon.database.hourly.map((h) => ({
      hour: h.hour, connectionsMax: h.connectionsMax, activeMax: h.activeMax, idleInTransactionMax: h.idleInTransactionMax,
      tps: h.tps, tpsPeak: h.tpsPeak, longestQueryMin: h.longestQuerySecondsMax === null ? null : Math.round(h.longestQuerySecondsMax / 6) / 10,
      cachePct: h.cacheHitRatio === null ? null : Math.round(h.cacheHitRatio * 1000) / 10,
      lfcPct: lfc && h.lfcHitRatio !== null ? Math.round(h.lfcHitRatio * 1000) / 10 : null,
    }));
    return alignHours(rows, hours, now, (hour) => ({
      hour, connectionsMax: null, activeMax: null, idleInTransactionMax: null, tps: null, tpsPeak: null, longestQueryMin: null,
      cachePct: null, lfcPct: null,
    } as unknown as (typeof rows)[number]));
  }, [data, hours, now]);
  const compute = useMemo(() => (data?.neon.api.compute
    ? alignHours(data.neon.api.compute.hourly, hours, now, (hour) => ({ hour, cuHours: 0 })) : []), [data, hours, now]);

  if (infra.isError) {
    return <div className="p2w-alert p2w-alert--error" role="alert">{infra.error instanceof Error ? infra.error.message : 'Cloudflare and Neon health could not be loaded.'}</div>;
  }
  if (!data) return <div className="p2w-skeleton">Loading…</div>;
  const db = data.neon.database;
  const api = data.neon.api;
  const cacheFloor = pctFloor(neon.flatMap((h) => [h.cachePct, h.lfcPct]));

  return (
    <div className="sh-stack sh-viz">
      {data.alerts.length ? (
        <section className={`sh-banner sh-banner--${data.alerts.some((a) => a.severity === 'CRITICAL') ? 'bad' : 'warn'}`} aria-live="polite">
          <ul>
            {data.alerts.map((a, i) => (
              <li key={`${a.code}-${i}`}><span className={`sh-sev sh-sev--${a.severity}`}>{a.severity === 'CRITICAL' ? 'Critical' : 'Warning'}</span>{a.message}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <NodeCards data={data} />

      <SectionCard>
        <div className="p2w-card__title">
          <h3>Web app (Cloudflare Worker {data.web.worker})</h3>
          <p className="p2w-muted">
            Requests the Worker served per hour (IST), from Cloudflare's analytics. Errors are invocations that threw,
            ran out of resources or hit an internal error. Analytics lag a few minutes.
          </p>
        </div>
        <Probe label={`Live check of ${data.web.probe.url ?? 'the web app'}`} probe={data.web.probe} />
        {data.web.analytics.available ? (
          <>
            <Bars rows={web} tick={tick} label="Web Worker requests per hour, answered and failed"
              series={[{ key: 'ok', label: 'Answered' }, { key: 'errors', label: 'Errors' }]} />
            <Lines rows={web} tick={tick} unit=" ms" label="Worker CPU time per request, per hour"
              series={[{ key: 'cpuP50Ms', label: 'CPU time p50' }, { key: 'cpuP99Ms', label: 'CPU time p99' }]} />
            <div className="sh-split">
              <div>
                <h4>By invocation status</h4>
                <table className="p2dr-table">
                  <thead><tr><th>Status</th><th className="sh-num">Requests</th></tr></thead>
                  <tbody>
                    {(data.web.analytics.byStatus ?? []).map((s) => (
                      <tr key={s.status}><td className={s.status === 'success' ? '' : 'tm-warn'}>{s.status}</td><td className="sh-num">{s.requests.toLocaleString('en-IN')}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <dl className="tm-tiles">
                <div><dt>Subrequests</dt><dd>{(data.web.analytics.subrequests ?? 0).toLocaleString('en-IN')}</dd><span>fetches the Worker made</span></div>
                <div><dt>Error rate</dt><dd>{ratioText(data.web.analytics.errorRate, 2)}</dd><span>alert above 1%</span></div>
              </dl>
            </div>
          </>
        ) : <Unavailable what="Cloudflare analytics" configured={data.web.analytics.configured} error={data.web.analytics.error} />}
      </SectionCard>

      <SectionCard>
        <div className="p2w-card__title">
          <h3>Documents storage (R2 {data.r2.bucket ?? ''})</h3>
          <p className="p2w-muted">
            Operations on the bucket per hour (IST). A 404 on a HEAD is how uploads check a key is free, so refusals (4xx)
            are counted but only server errors (5xx) raise an alert.
          </p>
        </div>
        <Probe label="Bucket check" probe={data.r2.probe} />
        {data.r2.analytics.available ? (
          <>
            <Bars rows={r2} tick={tick} label="R2 operations per hour by kind" series={R2_SERIES} />
            <div className="sh-split">
              <div className="p2dr-scroll">
                <table className="p2dr-table">
                  <thead><tr><th>Operation</th><th className="sh-num">Count</th><th className="sh-num">4xx</th><th className="sh-num">5xx</th></tr></thead>
                  <tbody>
                    {(data.r2.analytics.byAction ?? []).slice(0, 10).map((a) => (
                      <tr key={a.actionType}><td className="sh-code">{a.actionType}</td><td className="sh-num">{a.requests.toLocaleString('en-IN')}</td>
                        <td className="sh-num">{a.clientErrors}</td><td className={a.serverErrors ? 'sh-num tm-bad' : 'sh-num'}>{a.serverErrors}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <dl className="tm-tiles">
                <div><dt>Objects</dt><dd>{data.r2.analytics.storage?.objectCount.toLocaleString('en-IN') ?? '—'}</dd>
                  <span>{data.r2.analytics.storage?.atUtc ? `as of ${formatWhen(data.r2.analytics.storage.atUtc)}` : 'no storage reading yet'}</span></div>
                <div><dt>Stored</dt><dd>{bytesText(data.r2.analytics.storage?.payloadBytes)}</dd>
                  <span>{data.r2.analytics.storage?.pendingUploads ?? 0} unfinished multipart uploads</span></div>
                <div className={data.r2.analytics.clientErrors ? 'is-warn' : ''}><dt>Refused (4xx)</dt><dd>{(data.r2.analytics.clientErrors ?? 0).toLocaleString('en-IN')}</dd><span>mostly HEAD 404</span></div>
              </dl>
            </div>
          </>
        ) : <Unavailable what="Cloudflare analytics" configured={data.r2.analytics.configured} error={data.r2.analytics.error} />}
      </SectionCard>

      <SectionCard>
        <div className="p2w-card__title">
          <h3>Neon database</h3>
          <p className="p2w-muted">
            Sampled by Audit Core every minute: connections, locks, the longest query, and from the counters transactions
            per second (hourly average and the busiest minute) and the cache hit ratio.
          </p>
        </div>
        {db.sampled && db.latest ? (
          <>
            <dl className="tm-tiles">
              <div className={db.latest.maxConnections && db.latest.connectionsTotal >= 0.8 * db.latest.maxConnections ? 'is-bad' : ''}>
                <dt>Connections now</dt><dd>{db.latest.connectionsTotal}</dd>
                <span>of {db.latest.maxConnections ?? '—'} · {db.latest.connections.active} active · {db.latest.connections.idle} idle · {db.latest.connections.idleInTransaction} idle in transaction</span></div>
              <div className={db.window && db.window.maxConnections && db.window.connectionsMax >= 0.8 * db.window.maxConnections ? 'is-warn' : ''}>
                <dt>Peak connections</dt><dd>{db.window?.connectionsMax ?? '—'}</dd>
                <span>{db.window?.connectionsPeakAtUtc ? `at ${formatWhen(db.window.connectionsPeakAtUtc)}` : 'in this window'}</span></div>
              <div><dt>Transactions / s</dt><dd>{db.window?.tps ?? '—'}</dd>
                <span>peak {db.window?.tpsPeak ?? '—'}/s{db.window?.tpsPeakAtUtc ? ` at ${formatWhen(db.window.tpsPeakAtUtc)}` : ''}</span></div>
              <div className={(db.window?.cacheHitRatio ?? 1) < 0.95 ? 'is-warn' : ''}><dt>Buffer cache hit</dt><dd>{ratioText(db.window?.cacheHitRatio)}</dd>
                <span>{(db.window?.blocksRead ?? 0).toLocaleString('en-IN')} blocks read past shared buffers</span></div>
              <div className={db.lfcAvailable && (db.window?.lfcHitRatio ?? 1) < 0.95 ? 'is-warn' : ''}><dt>Local file cache hit</dt>
                <dd>{db.lfcAvailable ? ratioText(db.window?.lfcHitRatio) : '—'}</dd><span>{db.lfcAvailable ? 'reads not sent to Neon storage' : 'needs the neon extension'}</span></div>
              <div className={(db.latest.longestQuerySeconds ?? 0) > 300 ? 'is-warn' : ''}><dt>Longest query now</dt><dd>{durationText(db.latest.longestQuerySeconds)}</dd>
                <span>window peak {durationText(db.window?.longestQuerySecondsMax)} · {db.latest.waitingOnLocks} waiting on locks</span></div>
              <div className={db.window?.deadlocks ? 'is-warn' : ''}><dt>Deadlocks</dt><dd>{db.window?.deadlocks ?? '—'}</dd><span>{bytesText(db.window?.tempBytes)} spilled to temp files</span></div>
              <div><dt>Size</dt><dd>{bytesText(db.latest.sizeBytes)}</dd><span>sampled {agoText(db.latest.minuteUtc)}{db.latest.stale ? ' (stale)' : ''}</span></div>
            </dl>
            <Lines rows={neon} tick={tick} label="Database connections per hour, peak"
              series={[{ key: 'connectionsMax', label: 'Connections (peak)' }, { key: 'activeMax', label: 'Active (peak)' },
                { key: 'idleInTransactionMax', label: 'Idle in transaction (peak)' }]} />
            <Lines rows={neon} tick={tick} unit="/s" label="Transactions per second per hour, average and busiest minute"
              series={[{ key: 'tps', label: 'Average' }, { key: 'tpsPeak', label: 'Busiest minute' }]} />
            <Lines rows={neon} tick={tick} unit="%" domain={[cacheFloor, 100]} label="Cache hit ratio per hour"
              series={db.lfcAvailable ? [{ key: 'cachePct', label: 'Buffer cache' }, { key: 'lfcPct', label: 'Local file cache' }]
                : [{ key: 'cachePct', label: 'Buffer cache' }]} />
          </>
        ) : <p className="sh-note">{db.note}</p>}
        {db.note && db.sampled ? <p className="sh-note">{db.note}</p> : null}

        <h4>Compute (Neon API)</h4>
        {api.available ? (
          <>
            {api.endpoints.length ? (
              <div className="p2dr-scroll">
                <table className="p2dr-table">
                  <thead><tr><th>Compute</th><th>Type</th><th>State</th><th>Autoscaling</th><th>Last active</th></tr></thead>
                  <tbody>
                    {api.endpoints.map((e) => (
                      <tr key={e.id ?? e.branchId ?? ''}>
                        <td className="sh-code">{e.id}</td><td>{e.type === 'read_write' ? 'Primary (read-write)' : e.type}</td>
                        <td className={e.state === 'active' || e.state === 'idle' ? '' : 'tm-warn'}>{e.state ?? '—'}{e.pendingState ? ` → ${e.pendingState}` : ''}</td>
                        <td>{cuRange(e)}{e.suspendTimeoutSeconds !== null && e.suspendTimeoutSeconds < 0 ? ' · never suspends' : ''}</td>
                        <td>{formatWhen(e.lastActiveAtUtc)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
            {api.compute ? (
              <>
                <dl className="tm-tiles">
                  <div><dt>Compute used</dt><dd>{api.compute.totalCuHours} CU-h</dd><span>in this window</span></div>
                  <div><dt>Largest hour</dt><dd>{api.compute.peakCu ?? '—'} CU</dd><span>{api.compute.peakAtUtc ? `average size at ${formatWhen(api.compute.peakAtUtc)}` : '—'}</span></div>
                </dl>
                <Bars rows={compute} tick={tick} unit=" CU" label="Neon compute per hour, average size in CU"
                  series={[{ key: 'cuHours', label: 'Average compute size (CU-hours in the hour)' }]} />
              </>
            ) : <p className="p2w-muted">{api.error ? `Compute per hour could not be read: ${api.error}` : 'No compute figures yet.'}</p>}
          </>
        ) : <Unavailable what="Neon API" configured={api.configured} error={api.configured ? api.error : 'Set NEON_API_KEY on Audit Core to show the compute state and how far it autoscaled each hour.'} />}
        <p className="sh-note">{data.neon.cpuNote}</p>
      </SectionCard>
    </div>
  );
}
