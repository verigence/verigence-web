import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';

import SectionCard from '../../components/SectionCard';
import {
  getDiDashboard, type DiDay, type DiFailed, type DiOutcome, type TaskManagerMode,
} from '../../services/audit-core/taskManager';
import { addDays, formatWhen, istToday, minutesText, personName } from './tmFormat';
import { daysBetween } from './EngagementDashboard';
import { diHighlights, pcsByBadScans } from './diHighlights';
import '../../styles/task-manager.css';

/*
 * Document Intelligence dashboard of one Project (product owner 2026-10-27),
 * moved out of Daily processing. It opens on a few crisp figures and two short
 * tables; the full figures stay under "Show all figures": files and pages uploaded, what DI read the
 * first time, after retries, what it refused as a bad scan and what failed,
 * why (in plain words), with a link to every failed page, processing time per
 * file (min / average / max per day) and file size. Executive and Superadmin
 * only; the server enforces it.
 */

const MAX_DAYS = 31;

export const OUTCOME_LABELS: Record<DiOutcome, string> = {
  READ_FIRST: 'Read first time',
  READ_RETRIED: 'Read after retries',
  NEEDS_REVIEW: 'Read, needs a check',
  EXTRA_COPY: 'Extra copy (supporting)',
  BAD_SCAN: 'Bad scan',
  NOT_READ_IN_TIME: 'Not read in time',
  FAILED_OTHER: 'Failed (system)',
  DUPLICATE: 'Duplicate page',
  REMOVED: 'Removed by the user',
  IN_PROGRESS: 'Still being read',
};

const BAR_ORDER: DiOutcome[] = ['READ_FIRST', 'READ_RETRIED', 'NEEDS_REVIEW', 'EXTRA_COPY', 'BAD_SCAN', 'NOT_READ_IN_TIME', 'FAILED_OTHER', 'IN_PROGRESS'];
const FAILED: DiOutcome[] = ['BAD_SCAN', 'NOT_READ_IN_TIME', 'FAILED_OTHER'];

function errorText(cause: unknown): string {
  return cause instanceof Error && cause.message ? cause.message : 'The dashboard could not be loaded.';
}

function mins(value: number | null): string {
  if (value === null) return '—';
  return value < 1 ? `${Math.round(value * 60)} s` : value < 60 ? `${Math.round(value * 10) / 10} min` : minutesText(Math.round(value));
}

function pct(value: number | null): string {
  return value === null ? '—' : `${value}%`;
}

function mb(value: number | null): string {
  return value === null ? '—' : `${value} MB`;
}

function OutcomeBar({ day }: { day: DiDay }) {
  const total = BAR_ORDER.reduce((s, k) => s + day.outcomes[k], 0);
  if (!total) return <span className="p2w-muted">—</span>;
  return (
    <div className="tm-outcome-bar" role="img"
      aria-label={BAR_ORDER.filter((k) => day.outcomes[k]).map((k) => `${OUTCOME_LABELS[k]} ${day.outcomes[k]}`).join(', ')}>
      {BAR_ORDER.filter((k) => day.outcomes[k]).map((k) => (
        <span key={k} className={`tm-outcome tm-outcome--${k.toLowerCase()}`} style={{ flexGrow: day.outcomes[k] }}
          title={`${OUTCOME_LABELS[k]}: ${day.outcomes[k]}`} />
      ))}
    </div>
  );
}

function Legend() {
  return (
    <ul className="tm-outcome-legend">
      {BAR_ORDER.map((k) => <li key={k}><span className={`tm-outcome tm-outcome--${k.toLowerCase()}`} />{OUTCOME_LABELS[k]}</li>)}
    </ul>
  );
}

function FailedRow({ f, journeyLinks }: { f: DiFailed; journeyLinks: boolean }) {
  const booking = f.journeyReference || f.customerName || f.journeyId.slice(0, 8);
  return (
    <tr>
      <td>{formatWhen(f.uploadedAtUtc)}</td>
      <td>{personName(f.uploadedByName, f.uploadedBy)}</td>
      <td>
        {journeyLinks ? <Link className="p2dr-link" to={`/p2/journeys/${f.journeyId}/documents`}>{booking}</Link> : booking}
        {f.customerName && f.journeyReference ? <span className="p2w-muted"> · {f.customerName}</span> : null}
        {f.outletName ? <span className="p2w-muted"> · {f.outletName}</span> : null}
      </td>
      <td className="p2dr-wrap">{f.filename || '—'}<span className="p2w-muted">{f.pageNumbers.length ? ` · page ${f.pageNumbers.join(', ')}` : ''}</span></td>
      <td>{f.documentType ? f.documentType.replace(/_/g, ' ') : '—'}</td>
      <td><span className={f.group === 'Bad scan' ? 'p2dr-state p2dr-state--warn' : 'p2dr-state p2dr-state--bad'}>{f.group}</span></td>
      <td className="p2dr-wrap">{f.reason}{f.retried ? <span className="p2w-muted"> · retried</span> : null}</td>
      <td>{f.openUrl ? <a className="p2dr-link" href={f.openUrl} target="_blank" rel="noopener noreferrer">Open page</a> : '—'}</td>
    </tr>
  );
}

export default function DiDashboard({ mode, tenantId, accessToken }: {
  mode: TaskManagerMode; tenantId: string; accessToken?: string;
}) {
  const today = istToday();
  const [range, setRange] = useState({ from: addDays(today, -6), to: today });
  const [group, setGroup] = useState('ALL');
  const [details, setDetails] = useState(false);
  const span = daysBetween(range.from, range.to);
  const rangeOk = span >= 1 && span <= MAX_DAYS;
  const report = useQuery({
    queryKey: ['di-dashboard', mode, tenantId, range.from, range.to],
    queryFn: () => getDiDashboard(mode, tenantId, range.from, range.to, accessToken),
    enabled: Boolean(tenantId && accessToken && rangeOk),
    // Links to failed pages are valid 30 minutes; refresh well before.
    staleTime: 10 * 60_000,
    refetchInterval: 20 * 60_000,
  });
  const data = report.data;
  const groups = useMemo(() => [...new Set((data?.failed ?? []).map((f) => f.group))], [data]);
  const failed = useMemo(() => (data?.failed ?? []).filter((f) => group === 'ALL' || f.group === group), [data, group]);
  const t = data?.totals;
  const failedDocs = t ? FAILED.reduce((s, k) => s + t.outcomes[k], 0) : 0;
  const failedPages = t ? FAILED.reduce((s, k) => s + t.pagesByOutcome[k], 0) : 0;
  const hourTop = Math.max(1, ...(data?.byHour ?? []).map((h) => h.documents));
  const h = useMemo(() => (data ? diHighlights(data) : null), [data]);
  const quick: Array<[string, string, string]> = [
    ['Today', today, today], ['Yesterday', addDays(today, -1), addDays(today, -1)],
    ['Last 7 days', addDays(today, -6), today], ['Last 30 days', addDays(today, -29), today],
  ];

  return (
    <div className="tm-utilisation">
      <div className="p2w-listbar">
        <div className="p2w-segment" role="tablist" aria-label="Range">
          {quick.map(([label, from, to]) => {
            const active = range.from === from && range.to === to;
            return <button key={label} type="button" role="tab" aria-selected={active} className={active ? 'is-active' : ''}
              onClick={() => setRange({ from, to })}>{label}</button>;
          })}
        </div>
        <div className="p2w-filters">
          <label>From <input type="date" value={range.from} max={range.to} onChange={(e) => e.target.value && setRange({ ...range, from: e.target.value })} /></label>
          <label>To <input type="date" value={range.to} min={range.from} max={today} onChange={(e) => e.target.value && setRange({ ...range, to: e.target.value })} /></label>
          <button type="button" className="p2w-btn p2w-btn--ghost" onClick={() => void report.refetch()} disabled={report.isFetching}>
            {report.isFetching ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>
      {!rangeOk ? <div className="p2w-alert p2w-alert--error" role="alert">Choose a range of 1 to {MAX_DAYS} days.</div> : null}
      {report.isError ? <div className="p2w-alert p2w-alert--error" role="alert">{errorText(report.error)}</div> : null}
      {report.isLoading ? <div className="p2w-skeleton">Loading…</div> : null}
      {data && t ? (
        <>
          {h ? (
            <dl className="tm-tiles tm-glance">
              <div>
                <dt>Read first time</dt>
                <dd>{pct(h.readFirstPct)}</dd>
                <span>{h.readFirst} of {h.documents} documents{h.readRetried ? ` · ${h.readRetried} more after retries` : ''}</span>
              </div>
              <div className={h.badScans ? 'is-warn' : ''}>
                <dt>To scan again</dt>
                <dd>{h.badScanPages}<span> pages</span></dd>
                <span>{h.badScans} bad scans{h.topBadScanReason ? ` · main reason: ${h.topBadScanReason.reason}` : ''}</span>
              </div>
              <div className={h.failed ? 'is-bad' : ''}>
                <dt>Failed</dt>
                <dd>{h.failed}</dd>
                <span>{h.topFailReason ? `main reason: ${h.topFailReason.reason}` : 'nothing failed'}</span>
              </div>
              <div>
                <dt>Time per file</dt>
                <dd>{mins(t.processingMinutes.median)}</dd>
                <span>typical · slowest {mins(t.processingMinutes.max)}</span>
              </div>
              <div className={h.mostBadScans ? 'is-warn' : ''}>
                <dt>Most bad scans</dt>
                <dd>{h.mostBadScans ? personName(h.mostBadScans.name, h.mostBadScans.actorId) : '—'}</dd>
                <span>{h.mostBadScans ? `${h.mostBadScans.badScans} of ${h.mostBadScans.documents} documents (${pct(h.mostBadScans.badScanPct)})` : 'none'}{h.bestReader ? ` · cleanest: ${personName(h.bestReader.name, h.bestReader.actorId)} ${pct(h.bestReader.readFirstPct)}` : ''}</span>
              </div>
              <div>
                <dt>Fails most</dt>
                <dd>{h.hardestType ? h.hardestType.documentType.replace(/_/g, ' ') : '—'}</dd>
                <span>{h.hardestType ? `${h.hardestType.failed} of ${h.hardestType.documents} failed` : 'no document type failed'}{h.worstDay ? ` · worst day ${h.worstDay.day} (${pct(h.worstDay.failedPct)})` : ''}</span>
              </div>
            </dl>
          ) : null}

          <div className="tm-grid-2">
            <SectionCard>
              <div className="p2w-card__title"><h3>Day by day</h3><p className="p2w-muted">By the day of the upload (IST).</p></div>
              <div className="p2dr-scroll">
                <table className="p2dr-table">
                  <thead><tr><th>Day</th><th>Files</th><th>Read first</th><th>Bad scans</th><th>Failed</th><th>Time per file</th></tr></thead>
                  <tbody>
                    {[...data.days].reverse().filter((d) => d.files || d.documents).map((d) => (
                      <tr key={d.day}>
                        <td>{d.day}</td>
                        <td>{d.files}<span className="p2w-muted"> · {d.pages} p</span></td>
                        <td>{pct(d.readFirstPct)}</td>
                        <td className={d.outcomes.BAD_SCAN ? 'tm-warn' : ''}>{d.outcomes.BAD_SCAN}</td>
                        <td className={d.outcomes.NOT_READ_IN_TIME + d.outcomes.FAILED_OTHER ? 'tm-bad' : ''}>{d.outcomes.NOT_READ_IN_TIME + d.outcomes.FAILED_OTHER}</td>
                        <td>{mins(d.processingMinutes.avg)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </SectionCard>
            <SectionCard>
              <div className="p2w-card__title"><h3>By PC</h3><p className="p2w-muted">Most bad scans first.</p></div>
              <div className="p2dr-scroll">
                <table className="p2dr-table">
                  <thead><tr><th>PC</th><th>Documents</th><th>Read first</th><th>Bad scans</th><th>Failed</th></tr></thead>
                  <tbody>
                    {pcsByBadScans(data).map((p) => (
                      <tr key={p.actorId}>
                        <td>{personName(p.name, p.actorId)}</td><td>{p.documents}</td><td>{pct(p.readFirstPct)}</td>
                        <td className={p.badScanPct !== null && p.badScanPct >= 10 ? 'tm-warn' : ''}>{p.badScans}<span className="p2w-muted"> ({pct(p.badScanPct)})</span></td>
                        <td className={p.notReadInTime + p.failedOther ? 'tm-bad' : ''}>{p.notReadInTime + p.failedOther}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </SectionCard>
          </div>

          <button type="button" className="p2w-button p2w-button--ghost" aria-expanded={details} onClick={() => setDetails(!details)}>
            {details ? 'Hide all figures' : `Show all figures${data.failed.length ? ` and the ${data.failed.length} failed pages` : ''}`}
          </button>
          {details ? (
            <>
          <dl className="tm-tiles">
            <div><dt>Files uploaded</dt><dd>{t.files}</dd><span>{t.pages} pages · {t.avgPagesPerFile ?? '—'} per file{t.duplicateFiles ? ` · ${t.duplicateFiles} duplicate files` : ''}</span></div>
            <div><dt>Read first time</dt><dd>{t.outcomes.READ_FIRST}</dd><span>{pct(t.readFirstPct)} of documents · {t.pagesByOutcome.READ_FIRST} pages</span></div>
            <div><dt>Read after retries</dt><dd>{t.outcomes.READ_RETRIED}</dd><span>{t.pagesByOutcome.READ_RETRIED} pages</span></div>
            <div className={t.outcomes.BAD_SCAN ? 'is-warn' : ''}><dt>Bad scans</dt><dd>{t.outcomes.BAD_SCAN}</dd><span>{t.pagesByOutcome.BAD_SCAN} pages to scan again</span></div>
            <div className={failedDocs - t.outcomes.BAD_SCAN ? 'is-bad' : ''}><dt>Failed</dt><dd>{failedDocs - t.outcomes.BAD_SCAN}</dd>
              <span>{t.outcomes.NOT_READ_IN_TIME} not read in time · {t.outcomes.FAILED_OTHER} system</span></div>
            <div><dt>Processing time per file</dt><dd>{mins(t.processingMinutes.avg)}</dd>
              <span>median {mins(t.processingMinutes.median)} · min {mins(t.processingMinutes.min)} · max {mins(t.processingMinutes.max)}</span></div>
            <div><dt>Average file size</dt><dd>{mb(t.fileSizeMb.avg)}</dd><span>largest {mb(t.fileSizeMb.max)}</span></div>
          </dl>

          <SectionCard>
            <div className="p2w-card__title">
              <h3>Day by day</h3>
              <p className="p2w-muted">By the day of the upload (IST). Processing time is per file, from upload until its last document settled.</p>
            </div>
            <Legend />
            <div className="p2dr-scroll">
              <table className="p2dr-table tm-util-table">
                <thead>
                  <tr>
                    <th>Day</th><th>Files</th><th>Pages</th><th>Pages per file</th><th>Size avg / max</th><th>Documents</th>
                    <th>Outcome</th><th>Read first</th><th>After retries</th><th>Bad scan</th><th>Not read in time</th><th>System</th>
                    <th>Read first %</th><th>Failed %</th><th>Processing min</th><th>avg</th><th>max</th>
                  </tr>
                </thead>
                <tbody>
                  {[...data.days].reverse().map((d) => (
                    <tr key={d.day}>
                      <td>{d.day}</td>
                      <td>{d.files}{d.filesInProgress ? <span className="p2w-muted"> · {d.filesInProgress} reading</span> : null}</td>
                      <td>{d.pages}</td>
                      <td>{d.avgPagesPerFile ?? '—'}</td>
                      <td>{mb(d.fileSizeMb.avg)} / {mb(d.fileSizeMb.max)}</td>
                      <td>{d.documents}</td>
                      <td><OutcomeBar day={d} /></td>
                      <td>{d.outcomes.READ_FIRST}</td>
                      <td>{d.outcomes.READ_RETRIED}</td>
                      <td className={d.outcomes.BAD_SCAN ? 'tm-warn' : ''}>{d.outcomes.BAD_SCAN}</td>
                      <td className={d.outcomes.NOT_READ_IN_TIME ? 'tm-bad' : ''}>{d.outcomes.NOT_READ_IN_TIME}</td>
                      <td className={d.outcomes.FAILED_OTHER ? 'tm-bad' : ''}>{d.outcomes.FAILED_OTHER}</td>
                      <td>{pct(d.readFirstPct)}</td>
                      <td className={d.failedPct !== null && d.failedPct >= 10 ? 'tm-bad' : ''}>{pct(d.failedPct)}</td>
                      <td>{mins(d.processingMinutes.min)}</td>
                      <td>{mins(d.processingMinutes.avg)}</td>
                      <td className={d.processingMinutes.max !== null && d.processingMinutes.max >= 30 ? 'tm-warn' : ''}>{mins(d.processingMinutes.max)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>

          <div className="tm-grid-2">
            <SectionCard>
              <div className="p2w-card__title">
                <h3>Why documents failed</h3>
                <p className="p2w-muted">{failedDocs} documents · {failedPages} pages</p>
              </div>
              {data.failureReasons.length ? (
                <table className="p2dr-table">
                  <thead><tr><th>Kind</th><th>Reason</th><th>Documents</th><th>Pages</th></tr></thead>
                  <tbody>
                    {data.failureReasons.map((r) => (
                      <tr key={`${r.group}:${r.reason}`}><td>{r.group}</td><td className="p2dr-wrap">{r.reason}</td><td>{r.documents}</td><td>{r.pages}</td></tr>
                    ))}
                  </tbody>
                </table>
              ) : <p className="p2w-muted">Nothing failed in this range.</p>}
            </SectionCard>
            <SectionCard>
              <div className="p2w-card__title"><h3>Uploads by hour (IST)</h3><p className="p2w-muted">Documents per hour; the red part failed.</p></div>
              <div className="tm-hour-bars" role="img" aria-label="Documents uploaded per hour">
                {data.byHour.map((h) => (
                  <div key={h.hour} title={`${String(h.hour).padStart(2, '0')}:00 · ${h.documents} documents · ${h.failed} failed`}>
                    <span className="tm-hour-bars__all" style={{ height: `${(100 * h.documents) / hourTop}%` }}>
                      <span className="tm-hour-bars__failed" style={{ height: h.documents ? `${(100 * h.failed) / h.documents}%` : 0 }} />
                    </span>
                    <small>{h.hour % 3 === 0 ? h.hour : ''}</small>
                  </div>
                ))}
              </div>
            </SectionCard>
          </div>

          <div className="tm-grid-2">
            <SectionCard>
              <div className="p2w-card__title"><h3>By PC</h3><p className="p2w-muted">Highest bad-scan share first.</p></div>
              <div className="p2dr-scroll">
                <table className="p2dr-table">
                  <thead><tr><th>PC</th><th>Documents</th><th>Pages</th><th>Read first</th><th>Bad scans</th><th>Not read in time</th><th>System</th></tr></thead>
                  <tbody>
                    {data.byPc.map((p) => (
                      <tr key={p.actorId}>
                        <td>{personName(p.name, p.actorId)}</td><td>{p.documents}</td><td>{p.pages}</td>
                        <td>{p.readFirst} <span className="p2w-muted">({pct(p.readFirstPct)})</span></td>
                        <td className={p.badScanPct !== null && p.badScanPct >= 10 ? 'tm-warn' : ''}>{p.badScans} <span className="p2w-muted">({pct(p.badScanPct)})</span></td>
                        <td>{p.notReadInTime}</td><td>{p.failedOther}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </SectionCard>
            <SectionCard>
              <div className="p2w-card__title"><h3>By document type</h3></div>
              <div className="p2dr-scroll">
                <table className="p2dr-table">
                  <thead><tr><th>Document</th><th>Documents</th><th>Read first</th><th>After retries</th><th>Failed</th></tr></thead>
                  <tbody>
                    {data.byDocumentType.map((d) => (
                      <tr key={d.documentType}>
                        <td>{d.documentType.replace(/_/g, ' ')}</td><td>{d.documents}</td>
                        <td>{d.readFirst} <span className="p2w-muted">({pct(d.readFirstPct)})</span></td>
                        <td>{d.retried}</td><td className={d.failed ? 'tm-bad' : ''}>{d.failed}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {Object.keys(t.badScanReasons).length ? (
                <p className="p2w-muted">Bad scans: {Object.entries(t.badScanReasons).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(' · ')}</p>
              ) : null}
            </SectionCard>
          </div>

          <SectionCard>
            <div className="p2w-card__title">
              <h3>Failed pages</h3>
              <p className="p2w-muted">
                {data.failed.length}{data.failedTruncated ? ' (latest 500)' : ''} · newest first · “Open page” shows the page as uploaded (link valid 30 minutes; this page refreshes it).
              </p>
            </div>
            {groups.length > 1 ? (
              <div className="p2w-filters">
                <label>Kind <select value={group} onChange={(e) => setGroup(e.target.value)}>
                  <option value="ALL">All</option>
                  {groups.map((g) => <option key={g} value={g}>{g}</option>)}
                </select></label>
              </div>
            ) : null}
            {failed.length ? (
              <div className="p2dr-scroll">
                <table className="p2dr-table">
                  <thead><tr><th>Uploaded</th><th>By</th><th>Booking</th><th>File</th><th>Document</th><th>Kind</th><th>Why</th><th>Page</th></tr></thead>
                  <tbody>{failed.map((f) => <FailedRow key={f.queueId} f={f} journeyLinks={mode === 'project'} />)}</tbody>
                </table>
              </div>
            ) : <p className="p2w-muted">No failed pages in this range.</p>}
          </SectionCard>
          <ul className="p2dr-notes">{data.notes.map((n) => <li key={n}>{n}</li>)}</ul>
            </>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
