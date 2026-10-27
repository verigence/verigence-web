import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import '../styles/uc03-p2.css';
import '../styles/uc03-p2-workspace.css';
import '../styles/uc03-p2-daily-report.css';

import PageHeader from '../components/PageHeader';
import SectionCard from '../components/SectionCard';
import TaskStatusSections from '../features/task-manager/TaskStatusSections';
import { customerLabel } from '../features/uc03-p2/bookings/JourneyRow';
import { WorkDoneCard } from '../features/uc03-p2/daily/DailyProcessingSections';
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
function sumCounts(rows: P2DailyCounts[]): P2DailyCounts {
  const zero = (): P2DailyCounts => ({
    files: 0, pages: 0, duplicateFiles: 0,
    documents: { extracted: 0, readNoValues: 0, notRead: 0, waiting: 0, failed: 0, rejectedScans: 0 },
    rejections: { faded: 0, blurred: 0, tooSmall: 0, unreadable: 0, other: 0 },
    pageMath: { multiPageDocuments: 0, pagesInMultiPage: 0, repeatPages: 0 },
    tasksOpened: 0, tasksOpenedPc: 0, tasksOpenedTl: 0, tasksReopened: 0, autoRetries: 0, retriesExhausted: 0,
    pcRetries: 0, readAgain: 0, resyncs: 0, nightRequests: 0, nightFixed: 0,
  });
  return rows.reduce<P2DailyCounts>((acc, row) => {
    const out = { ...acc, documents: { ...acc.documents }, rejections: { ...acc.rejections! }, pageMath: { ...acc.pageMath! } };
    for (const key of ['files', 'pages', 'duplicateFiles', 'tasksOpened', 'tasksOpenedPc', 'tasksOpenedTl', 'tasksReopened',
      'autoRetries', 'retriesExhausted', 'pcRetries', 'readAgain', 'resyncs', 'nightRequests', 'nightFixed'] as const) {
      out[key] += row[key] ?? 0;
    }
    for (const key of Object.keys(out.documents) as (keyof P2DailyCounts['documents'])[]) out.documents[key] += row.documents[key] ?? 0;
    for (const key of Object.keys(out.rejections) as (keyof P2RejectionReasons)[]) out.rejections[key] += row.rejections?.[key] ?? 0;
    for (const key of Object.keys(out.pageMath) as (keyof NonNullable<P2DailyCounts['pageMath']>)[]) out.pageMath[key] += row.pageMath?.[key] ?? 0;
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

/** Why there are fewer documents than pages, in the row's own numbers. */
function pageMathText(row: P2DailyCounts): string {
  const m = row.pageMath;
  if (!m) return '';
  const parts: string[] = [];
  if (m.multiPageDocuments) {
    parts.push(`${m.pagesInMultiPage} pages make ${m.multiPageDocuments} multi-page document${m.multiPageDocuments === 1 ? '' : 's'}`);
  }
  if (m.repeatPages) parts.push(`${m.repeatPages} repeated page${m.repeatPages === 1 ? '' : 's'} dropped`);
  return parts.join(' · ');
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
      <td data-label="Documents">{o.documents}{pageMathText(row) ? <span className="p2w-muted p2dr-sub">{pageMathText(row)}</span> : null}</td>
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
  // CP: currently processing (product owner 2026-10-20).
  if (!row.processingFinishedAt) return `${time(row.uploadStartedAt, timezone)} · CP`;
  return `${time(row.uploadStartedAt, timezone)} – ${time(row.processingFinishedAt, timezone)} · ${duration(row.processingMinutes)}`;
}

const uploadedOnDay = (row: P2DailyJourneyRow) => row.uploadedOnDay ?? Boolean(row.uploadStartedAt);
const samePc = (row: P2DailyJourneyRow, pc: P2DailyPcRow) => (row.pcActorId ?? null) === (pc.pcActorId ?? null);

/** One PC's uploads of the day; a click opens each journey with when its
 * upload started and when it was read (product owner 2026-10-20: "lets
 * have it back"). */
function PcUploads({ pc, journeys, timezone }: { pc: P2DailyPcRow; journeys: P2DailyJourneyRow[]; timezone: string }) {
  const [open, setOpen] = useState(false);
  const span = pc.stillProcessing
    ? `${time(pc.firstUploadAt, timezone)} · ${pc.stillProcessing} CP`
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
      {open ? journeys.map((row) => {
        const customer = customerLabel(row.customerName);
        return (
          <tr key={row.journeyId} className="p2dr-child">
            <td data-label="Journey">
              <Link to={`/p2/journeys/${row.journeyId}/overview`} className={customer.known ? undefined : 'is-unknown'}>{customer.text}</Link>
              <span className="p2w-muted p2dr-sub">{row.outletName || ''}</span>
            </td>
            <td data-label="Upload · read">{journeyTime(row, timezone)}</td>
            <UploadCells row={row} />
          </tr>
        );
      }) : null}
    </>
  );
}

/** The system's own work on the day: re-checks, retries and night corrections. */
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

  return (
    <div className="screen-stack p2-screen p2w p2dr">
      <PageHeader
        eyebrow="Booking & Delivery"
        title="Daily processing"
        description="One day: the status of Journey tasks and Task Manager tasks, the work each person did, and what each PC uploaded."
      />
      {project?.operatingRole === 'EXECUTIVE' ? (
        <p className="p2w-muted">Document Intelligence figures (read first time, retries, bad scans, failures and why, processing time) are on the <Link className="p2dr-link" to="/p2/reports/di">DI dashboard</Link>.</p>
      ) : null}

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
          {data.taskStatus ? <TaskStatusSections status={data.taskStatus} /> : null}
          {data.teamWork ? <WorkDoneCard work={data.teamWork} day={data.day} timezone={timezone} /> : null}
          <SectionCard>
            <div className="p2w-card__title">
              <h3>Uploads by PC</h3>
              <p className="p2w-muted">
                {uploaders.length
                  ? `${uploaders.length} PC${uploaders.length === 1 ? '' : 's'} uploaded on ${data.day}. Open a PC for each journey's upload and read times (CP: currently processing). A multi-page document counts once, so there are fewer documents than pages. Read + needs a look + rejected + failed + waiting = documents.`
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
