import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import '../styles/uc03-p2.css';
import '../styles/uc03-p2-workspace.css';
import '../styles/uc03-p2-daily-report.css';

import PageHeader from '../components/PageHeader';
import SectionCard from '../components/SectionCard';
import { customerLabel } from '../features/uc03-p2/bookings/JourneyRow';
import {
  getP2DailyProcessingReport,
  type P2DailyCounts,
  type P2DailyJourneyRow,
  type P2DailyPcRow,
  type P2DailyQuality,
  type P2DailyTrendDay,
  type P2RejectionReasons,
} from '../services/audit-core/uc03P2';
import { useProjectContextStore } from '../store/projectContextStore';
import { useSessionStore } from '../store/sessionStore';

/** Today in the browser's calendar (the report itself uses the Project's timezone). */
function todayIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function time(value: string | null, timezone: string): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-IN', { timeZone: timezone, hour: '2-digit', minute: '2-digit' }).format(date);
}

function duration(minutes: number | null): string {
  if (minutes === null || minutes === undefined) return '—';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `${hours} h ${minutes % 60} min`;
}

function pcLabel(name: string | null, actorId: string | null): string {
  return name?.trim() || (actorId ? `PC ••••${actorId.replace(/[^a-zA-Z0-9]/g, '').slice(-6)}` : 'PC not recorded');
}

const REASON_LABELS: [keyof P2RejectionReasons, string][] = [
  ['faded', 'faded'], ['blurred', 'blurred'], ['tooSmall', 'too small'], ['unreadable', 'unreadable'], ['other', 'other'],
];

function reasonText(reasons: P2RejectionReasons): string {
  return REASON_LABELS.filter(([key]) => reasons[key]).map(([key, label]) => `${reasons[key]} ${label}`).join(', ');
}

function pct(value: number | null | undefined): string {
  return value === null || value === undefined ? '—' : `${value}%`;
}

/** Scan quality of the day's uploads, and the last 14 days. */
function QualityCard({ quality, trend, day }: { quality: P2DailyQuality; trend: P2DailyTrendDay[]; day: string }) {
  const peak = Math.max(1, ...trend.map((t) => t.documents));
  return (
    <SectionCard>
      <div className="p2w-card__title">
        <h3>Scan quality</h3>
        <p className="p2w-muted">Pages rejected at upload by the scan-quality check: never read, the PC is asked to re-scan.</p>
      </div>
      <div className="p2dr-quality">
        <div><span className="p2w-muted">Documents uploaded {day}</span><strong>{quality.documents}</strong></div>
        <div className={quality.rejected ? 'p2dr-bad' : undefined}><span className="p2w-muted">Rejected</span><strong>{quality.rejected}</strong></div>
        <div><span className="p2w-muted">Rejection rate</span><strong>{pct(quality.rejectedPct)}</strong></div>
        <div><span className="p2w-muted">Why</span><strong>{quality.rejected ? reasonText(quality.byReason) : '—'}</strong></div>
      </div>
      {trend.length ? (
        <div className="p2dr-scroll">
          <table className="p2dr-table p2dr-trend">
            <thead><tr><th>Day</th><th>Documents</th><th>Rejected</th><th>Rate</th><th>Why</th><th aria-hidden="true" /></tr></thead>
            <tbody>
              {[...trend].reverse().map((t) => (
                <tr key={t.day} className={t.day === day ? 'is-current' : undefined}>
                  <td data-label="Day">{t.day}</td>
                  <td data-label="Documents">{t.documents}</td>
                  <td data-label="Rejected" className={t.rejected ? 'p2dr-bad' : undefined}>{t.rejected}</td>
                  <td data-label="Rate">{pct(t.rejectedPct)}</td>
                  <td data-label="Why">{t.rejected ? reasonText(t.byReason) : '—'}</td>
                  <td aria-hidden="true" className="p2dr-bar">
                    <span style={{ width: `${(100 * t.documents) / peak}%` }}>
                      <span className="p2dr-bar__bad" style={{ width: t.documents ? `${(100 * t.rejected) / t.documents}%` : '0%' }} />
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </SectionCard>
  );
}

/** Field-by-field sum of several rows' counts. */
function sumCounts(rows: P2DailyCounts[]): P2DailyCounts {
  const zero = (): P2DailyCounts => ({
    files: 0, pages: 0, duplicateFiles: 0,
    documents: { extracted: 0, readNoValues: 0, notRead: 0, waiting: 0, failed: 0, rejectedScans: 0 },
    rejections: { faded: 0, blurred: 0, tooSmall: 0, unreadable: 0, other: 0 },
    tasksOpened: 0, tasksOpenedPc: 0, tasksOpenedTl: 0, tasksReopened: 0, autoRetries: 0, retriesExhausted: 0,
    pcRetries: 0, readAgain: 0, resyncs: 0, nightRequests: 0, nightFixed: 0,
  });
  return rows.reduce<P2DailyCounts>((acc, row) => {
    const out = { ...acc, documents: { ...acc.documents }, rejections: { ...acc.rejections! } };
    for (const key of ['files', 'pages', 'duplicateFiles', 'tasksOpened', 'tasksOpenedPc', 'tasksOpenedTl', 'tasksReopened',
      'autoRetries', 'retriesExhausted', 'pcRetries', 'readAgain', 'resyncs', 'nightRequests', 'nightFixed'] as const) {
      out[key] += row[key] ?? 0;
    }
    for (const key of Object.keys(out.documents) as (keyof P2DailyCounts['documents'])[]) out.documents[key] += row.documents[key] ?? 0;
    for (const key of Object.keys(out.rejections) as (keyof P2RejectionReasons)[]) out.rejections[key] += row.rejections?.[key] ?? 0;
    return out;
  }, zero());
}

/**
 * What the day's pages became, so each row adds up: every document an
 * upload produced is read, needs a look (read with no values, or not read),
 * rejected at upload, failed, or still waiting.
 */
function outcome(row: P2DailyCounts) {
  const d = row.documents;
  const failed = Math.max(0, d.failed - d.rejectedScans);
  const needsLook = d.notRead + d.readNoValues;
  return { read: d.extracted, needsLook, rejected: d.rejectedScans, failed, waiting: d.waiting,
    documents: d.extracted + needsLook + d.rejectedScans + failed + d.waiting };
}

function rate(part: number, whole: number): string {
  return whole ? ` (${Math.round((1000 * part) / whole) / 10}%)` : '';
}

/** Files, pages and what they became: the PC row and each of its journeys. */
function UploadCells({ row }: { row: P2DailyCounts }) {
  const o = outcome(row);
  return (
    <>
      <td data-label="Files">{row.files}{row.duplicateFiles ? <span className="p2w-muted"> ({row.duplicateFiles} repeat)</span> : null}</td>
      <td data-label="Pages">{row.pages}</td>
      <td data-label="Documents">{o.documents}</td>
      <td data-label="Read"><strong>{o.read}</strong><span className="p2w-muted">{rate(o.read, o.documents)}</span></td>
      <td data-label="Needs a look" className={o.needsLook ? 'p2dr-warn' : undefined}>{o.needsLook}</td>
      <td data-label="Rejected at upload" className={o.rejected ? 'p2dr-bad' : undefined}>
        {o.rejected}{o.rejected && row.rejections ? <span className="p2w-muted"> ({reasonText(row.rejections)})</span> : null}
      </td>
      <td data-label="Failed" className={o.failed ? 'p2dr-bad' : undefined}>{o.failed}</td>
      <td data-label="Waiting" className={o.waiting ? 'p2dr-warn' : undefined}>{o.waiting}</td>
    </>
  );
}

const UPLOAD_HEAD = (
  <>
    <th>Files</th>
    <th>Pages</th>
    <th title="What the pages became: one document can span several pages">Documents</th>
    <th>Read</th>
    <th title="Read with no values, or classified but not read">Needs a look</th>
    <th>Rejected at upload</th>
    <th>Failed</th>
    <th>Waiting</th>
  </>
);

function journeyTime(row: P2DailyJourneyRow, timezone: string): string {
  if (!row.uploadStartedAt) return '—';
  const span = `${time(row.uploadStartedAt, timezone)} – ${time(row.processingFinishedAt, timezone)}`;
  return row.processingFinishedAt ? `${span} · ${duration(row.processingMinutes)}` : `${time(row.uploadStartedAt, timezone)} · still processing`;
}

function JourneyCell({ row }: { row: P2DailyJourneyRow }) {
  const customer = customerLabel(row.customerName);
  return (
    <td data-label="Journey">
      <Link to={`/p2/journeys/${row.journeyId}/overview`} className={customer.known ? undefined : 'is-unknown'}>{customer.text}</Link>
      <span className="p2w-muted p2dr-sub">{row.outletName}{row.outletCode ? ` · ${row.outletCode}` : ''}</span>
    </td>
  );
}

const uploadedOnDay = (row: P2DailyJourneyRow) => row.uploadedOnDay ?? Boolean(row.uploadStartedAt);
const samePc = (row: P2DailyJourneyRow, pc: P2DailyPcRow) => (row.pcActorId ?? null) === (pc.pcActorId ?? null);

/** One PC's uploads of the day; a click opens the journeys they went into. */
function PcUploads({ pc, journeys, timezone }: { pc: P2DailyPcRow; journeys: P2DailyJourneyRow[]; timezone: string }) {
  const [open, setOpen] = useState(false);
  const span = pc.stillProcessing
    ? `${time(pc.firstUploadAt, timezone)} · ${pc.stillProcessing} still processing`
    : `${time(pc.firstUploadAt, timezone)} – ${time(pc.lastFinishedAt, timezone)} · ${duration(pc.spanMinutes)}`;
  return (
    <>
      <tr className="p2dr-pc">
        <td data-label="PC">
          <button type="button" className="p2dr-toggle" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
            <span aria-hidden="true">{open ? '▾' : '▸'}</span> <strong>{pcLabel(pc.pcName, pc.pcActorId)}</strong>
          </button>
          <span className="p2w-muted p2dr-sub">{span}</span>
        </td>
        <td data-label="Journeys">{pc.journeysUploaded}</td>
        <UploadCells row={pc} />
      </tr>
      {open ? journeys.map((row) => (
        <tr key={row.journeyId} className="p2dr-child">
          <JourneyCell row={row} />
          <td data-label="Uploaded">{journeyTime(row, timezone)}</td>
          <UploadCells row={row} />
        </tr>
      )) : null}
    </>
  );
}

/** The system's own work on the day: re-checks, retries and night corrections. */
function activity(row: P2DailyCounts) {
  return row.tasksOpened + row.tasksReopened + row.autoRetries + row.pcRetries + row.readAgain + row.resyncs
    + row.nightRequests + row.nightFixed;
}

function ActivityCells({ row }: { row: P2DailyCounts }) {
  return (
    <>
      <td data-label="Tasks opened">{row.tasksOpened}{row.tasksReopened ? <span className="p2w-muted"> +{row.tasksReopened} reopened</span> : null}</td>
      <td data-label="Night: asked · fixed">{row.nightRequests} · {row.nightFixed}</td>
      <td data-label="Auto retries · gave up">{row.autoRetries} · <span className={row.retriesExhausted ? 'p2dr-bad' : undefined}>{row.retriesExhausted}</span></td>
      <td data-label="PC retry · read again · re-sync">{row.pcRetries} · {row.readAgain} · {row.resyncs}</td>
    </>
  );
}

/**
 * Daily processing (TL, PM, Executive): how the system handled each PC's day.
 * Every figure comes from what Audit Core stores (see the report's notes);
 * nothing is estimated.
 */
export default function P2DailyProcessingReportPage() {
  const project = useProjectContextStore((s) => s.selectedProject);
  const accessToken = useSessionStore((s) => s.accessToken);
  const tenantId = project?.tenantId;
  const [day, setDay] = useState(todayIso());
  const report = useQuery({
    queryKey: ['p2-daily-processing', tenantId, day],
    queryFn: () => getP2DailyProcessingReport(tenantId!, day, accessToken),
    enabled: Boolean(tenantId && accessToken && day),
    staleTime: 60_000,
  });
  const data = report.data;
  const timezone = data?.timezone || project?.timezoneName || 'Asia/Kolkata';
  const uploaders = (data?.pcs ?? []).filter((pc) => pc.journeysUploaded > 0);
  // The system's work per PC: on the day's uploads and on earlier journeys.
  const systemRows = (data?.pcs ?? []).map((pc) => {
    const row = pc.earlier ? sumCounts([pc, pc.earlier]) : pc;
    return { pc, row, journeys: pc.journeysUploaded + (pc.earlier?.journeys ?? 0) };
  }).filter(({ row }) => activity(row) > 0);

  return (
    <div className="screen-stack p2-screen p2w p2dr">
      <PageHeader
        eyebrow="Booking & Delivery"
        title="Daily processing"
        description="One day: what each PC uploaded and what the pages became, then what the system did on its own (night corrections, retries, re-reads)."
      />

      <div className="p2w-listbar">
        <label className="p2dr-day">
          <span>Day</span>
          <input type="date" value={day} max={todayIso()} onChange={(event) => setDay(event.target.value)} />
        </label>
        {report.isFetching ? <span className="p2w-muted">Loading…</span> : null}
      </div>

      {report.isError ? (
        <div className="p2w-alert p2w-alert--error" role="alert">
          {report.error instanceof Error ? report.error.message : 'The report could not be loaded.'}
        </div>
      ) : null}

      {data ? (
        <>
          {data.quality ? <QualityCard quality={data.quality} trend={data.trend ?? []} day={data.day} /> : null}
          <SectionCard>
            <div className="p2w-card__title">
              <h3>Uploads by PC</h3>
              <p className="p2w-muted">
                {uploaders.length
                  ? `${uploaders.length} PC${uploaders.length === 1 ? '' : 's'} uploaded on ${data.day}. Open a PC to see each journey's files and pages. Read + needs a look + rejected + failed + waiting = documents.`
                  : `No PC uploaded on ${data.day}.`}
              </p>
            </div>
            {uploaders.length ? (
              <div className="p2dr-scroll">
                <table className="p2dr-table">
                  <thead>
                    <tr>
                      <th>PC</th>
                      <th>Journeys</th>
                      {UPLOAD_HEAD}
                    </tr>
                  </thead>
                  <tbody>
                    {uploaders.map((pc) => (
                      <PcUploads key={pc.pcActorId ?? 'none'} pc={pc} timezone={timezone}
                        journeys={data.journeys.filter((row) => uploadedOnDay(row) && samePc(row, pc))} />
                    ))}
                  </tbody>
                  {uploaders.length > 1 ? (
                    <tfoot>
                      <tr className="p2dr-total">
                        <td>All PCs</td>
                        <td>{uploaders.reduce((n, pc) => n + pc.journeysUploaded, 0)}</td>
                        <UploadCells row={sumCounts(uploaders)} />
                      </tr>
                    </tfoot>
                  ) : null}
                </table>
              </div>
            ) : null}
          </SectionCard>

          {systemRows.length ? (
            <SectionCard>
              <div className="p2w-card__title">
                <h3>System activity</h3>
                <p className="p2w-muted">Night corrections, automatic retries, re-reads and tasks the system opened on {data.day}, by the PC whose journeys they were.</p>
              </div>
              <div className="p2dr-scroll">
                <table className="p2dr-table">
                  <thead>
                    <tr>
                      <th>PC</th>
                      <th>Journeys</th>
                      <th>Tasks opened</th>
                      <th>Night: asked · fixed</th>
                      <th>Auto retries · gave up</th>
                      <th>PC retry · read again · re-sync</th>
                    </tr>
                  </thead>
                  <tbody>
                    {systemRows.map(({ pc, row, journeys }) => (
                      <tr key={pc.pcActorId ?? 'none'}>
                        <td data-label="PC"><strong>{pcLabel(pc.pcName, pc.pcActorId)}</strong></td>
                        <td data-label="Journeys">{journeys}</td>
                        <ActivityCells row={row} />
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </SectionCard>
          ) : null}

          <SectionCard>
            <div className="p2w-card__title"><h3>How these are counted</h3></div>
            <ul className="p2dr-notes">
              {data.notes.map((note) => <li key={note}>{note}</li>)}
              <li>Times are in {timezone}.</li>
            </ul>
          </SectionCard>
        </>
      ) : null}
    </div>
  );
}
