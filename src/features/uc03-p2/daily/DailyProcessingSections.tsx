import { useState } from 'react';
import { Link } from 'react-router-dom';

import SectionCard from '../../../components/SectionCard';
import {
  getP2UploadFileLink,
  type P2DailyDocumentStatus,
  type P2DailyTeamWork,
  type P2DailyUploadedFile,
  type P2DailyWorkPerson,
} from '../../../services/audit-core/uc03P2';
import { customerLabel } from '../bookings/JourneyRow';
import {
  FILE_STATE_LABELS,
  actionLabel,
  filterFiles,
  personLabel,
  reviewText,
  type FileFilter,
} from './dailyReportLabels';

function clock(value: string | null, timezone: string): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-IN', { timeZone: timezone, hour: '2-digit', minute: '2-digit' }).format(date);
}

type FileLinkProps = { file: P2DailyUploadedFile; tenantId: string; accessToken?: string };

/** Opens the uploaded original in a new tab. A fresh link is asked for on the
 * click (the link in the report lasts 30 minutes); the report's own link is
 * the fallback. A file that never arrived has nothing to open. */
export function OpenFile({ file, tenantId, accessToken }: FileLinkProps) {
  const [failed, setFailed] = useState(false);
  if (!file.openUrl && !file.filePath) return <span className="p2w-muted">—</span>;
  const open = async () => {
    setFailed(false);
    const tab = window.open('about:blank', '_blank');
    if (tab) tab.opener = null;
    let url = file.openUrl;
    try {
      url = (await getP2UploadFileLink(tenantId, file.journeyId, file.batchId, accessToken)).url;
    } catch {
      // keep the report's own link
    }
    if (!url) {
      tab?.close();
      setFailed(true);
      return;
    }
    if (tab) tab.location.href = url; else window.location.assign(url);
  };
  return (
    <>
      <button type="button" className="p2dr-link" onClick={open}>Open file</button>
      {failed ? <span className="p2dr-bad p2dr-sub"> could not be opened</span> : null}
    </>
  );
}

/**
 * Uploads of more than the page limit (25), highlighted at the top of the
 * report (product owner 2026-10-26). Advice only: the PC was asked to review
 * the file and say whether all the pages are needed; nothing is blocked.
 */
export function LargeUploadsCard(
  { large, day, timezone, tenantId, accessToken }:
  { large: { threshold: number; count: number; files: P2DailyUploadedFile[] }; day: string; timezone: string; tenantId: string; accessToken?: string },
) {
  if (!large.count) {
    return (
      <SectionCard>
        <p className="p2w-muted">No file of more than {large.threshold} pages was uploaded on {day}.</p>
      </SectionCard>
    );
  }
  return (
    <SectionCard>
      <div className="p2dr-alertbox" role="note">
        <div className="p2w-card__title">
          <h3>⚠ {large.count} large upload{large.count === 1 ? '' : 's'} — more than {large.threshold} pages</h3>
          <p className="p2w-muted">
            The PC was asked to review each file and confirm that all its pages are really needed. Nothing is blocked:
            the upload went through and the PC can keep uploading. Their answer shows here once they close the notice.
          </p>
        </div>
        <div className="p2dr-scroll">
          <table className="p2dr-table">
            <thead>
              <tr><th>PC</th><th>Journey</th><th>File</th><th>Pages</th><th>Uploaded</th><th>PC's answer</th><th>File</th></tr>
            </thead>
            <tbody>
              {large.files.map((file) => {
                const customer = customerLabel(file.customerName);
                return (
                  <tr key={file.batchId}>
                    <td data-label="PC"><strong>{personLabel(file.pcName, 'PC', file.pcActorId)}</strong></td>
                    <td data-label="Journey">
                      <Link to={`/p2/journeys/${file.journeyId}/overview`} className={customer.known ? undefined : 'is-unknown'}>{customer.text}</Link>
                      <span className="p2w-muted p2dr-sub">{file.outletName || ''}</span>
                    </td>
                    <td data-label="File">{file.filename}</td>
                    <td data-label="Pages" className="p2dr-warn">{file.pages}</td>
                    <td data-label="Uploaded">{clock(file.uploadedAtUtc, timezone)}</td>
                    <td data-label="PC's answer" className="p2dr-wrap">{reviewText(file)}</td>
                    <td data-label="File"><OpenFile file={file} tenantId={tenantId} accessToken={accessToken} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </SectionCard>
  );
}

/** Per PC: files uploaded, not uploaded, documents rejected, retried, read, waiting. */
export function DocumentStatusCard({ status, day }: { status: P2DailyDocumentStatus; day: string }) {
  const rows = [...status.byPc, { ...status.total, pcActorId: null, pcName: 'All PCs', total: true }] as Array<
    P2DailyDocumentStatus['total'] & { pcActorId: string | null; pcName: string | null; total?: boolean }>;
  return (
    <SectionCard>
      <div className="p2w-card__title">
        <h3>Document status</h3>
        <p className="p2w-muted">
          For {day}, per PC: files that arrived, files that never uploaded, documents rejected by the scan-quality
          check, and documents retried (automatically, by the PC, or given up after the retries).
        </p>
      </div>
      <div className="p2dr-scroll">
        <table className="p2dr-table">
          <thead>
            <tr>
              <th>PC</th>
              <th>Files uploaded</th>
              <th title="Files that never finished uploading, or could not be split into pages">Not uploaded</th>
              <th>Documents</th>
              <th>Read</th>
              <th title="Refused by the scan-quality check: faded, blurred, too small, unreadable">Rejected</th>
              <th>Failed (other)</th>
              <th>Waiting</th>
              <th title="Automatic retries · the PC's retry or read-again · given up after the retries">Retried: auto · PC · gave up</th>
              <th>Large files</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const notUploaded = row.filesNotUploaded + row.filesNotSplit;
              return (
                <tr key={row.pcActorId ?? row.pcName ?? 'none'} className={row.total ? 'p2dr-total' : undefined}>
                  <td data-label="PC"><strong>{row.total ? 'All PCs' : personLabel(row.pcName, 'PC', row.pcActorId)}</strong></td>
                  <td data-label="Files uploaded">{row.filesUploaded}{row.duplicateFiles ? <span className="p2w-muted"> (+{row.duplicateFiles} repeat)</span> : null}</td>
                  <td data-label="Not uploaded" className={notUploaded ? 'p2dr-bad' : undefined}>
                    {notUploaded}{row.filesUploadPending ? <span className="p2w-muted"> (+{row.filesUploadPending} in progress)</span> : null}
                  </td>
                  <td data-label="Documents">{row.documents}</td>
                  <td data-label="Read">{row.read}</td>
                  <td data-label="Rejected" className={row.rejected ? 'p2dr-bad' : undefined}>{row.rejected}</td>
                  <td data-label="Failed (other)" className={row.failedOther ? 'p2dr-bad' : undefined}>{row.failedOther}</td>
                  <td data-label="Waiting" className={row.waiting ? 'p2dr-warn' : undefined}>{row.waiting}</td>
                  <td data-label="Retried">{row.retriedAutomatically} · {row.retriedByPc} · <span className={row.retriesExhausted ? 'p2dr-bad' : undefined}>{row.retriesExhausted}</span></td>
                  <td data-label="Large files" className={row.largeUploads ? 'p2dr-warn' : undefined}>{row.largeUploads}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}

const FILTERS: Array<[FileFilter, string]> = [
  ['ALL', 'All files'], ['ATTENTION', 'Needs a look'], ['LARGE', 'Large files'], ['NOT_UPLOADED', 'Not uploaded'],
];
const FILE_ROWS_SHOWN = 100;

/** Every file uploaded on the day, with its state and a link to the original. */
export function UploadedFilesCard(
  { files, truncated, day, timezone, tenantId, accessToken }:
  { files: P2DailyUploadedFile[]; truncated: boolean; day: string; timezone: string; tenantId: string; accessToken?: string },
) {
  const [filter, setFilter] = useState<FileFilter>('ALL');
  const [all, setAll] = useState(false);
  const shown = filterFiles(files, filter);
  const rows = all ? shown : shown.slice(0, FILE_ROWS_SHOWN);
  return (
    <SectionCard>
      <div className="p2w-card__title">
        <h3>Files uploaded</h3>
        <p className="p2w-muted">
          {files.length} file{files.length === 1 ? '' : 's'} on {day}. “Open file” shows the original exactly as the PC uploaded it.
        </p>
      </div>
      <div className="p2dr-filters" role="group" aria-label="Filter files">
        {FILTERS.map(([key, label]) => (
          <button key={key} type="button" className={`p2dr-chip${filter === key ? ' is-active' : ''}`}
            aria-pressed={filter === key} onClick={() => { setFilter(key); setAll(false); }}>
            {label} ({filterFiles(files, key).length})
          </button>
        ))}
      </div>
      {rows.length ? (
        <div className="p2dr-scroll">
          <table className="p2dr-table">
            <thead>
              <tr><th>Time</th><th>PC</th><th>Journey</th><th>File</th><th>Pages</th><th>Status</th><th>File</th></tr>
            </thead>
            <tbody>
              {rows.map((file) => {
                const customer = customerLabel(file.customerName);
                const state = FILE_STATE_LABELS[file.state];
                return (
                  <tr key={file.batchId} className={file.large ? 'p2dr-row-large' : undefined}>
                    <td data-label="Time">{clock(file.uploadedAtUtc, timezone)}</td>
                    <td data-label="PC">{personLabel(file.pcName, 'PC', file.pcActorId)}</td>
                    <td data-label="Journey">
                      <Link to={`/p2/journeys/${file.journeyId}/overview`} className={customer.known ? undefined : 'is-unknown'}>{customer.text}</Link>
                    </td>
                    <td data-label="File">{file.filename}</td>
                    <td data-label="Pages">
                      {file.pages}{file.large ? <span className="p2dr-badge p2dr-badge--warn" title="More pages than the limit; the PC was asked to review it">Large</span> : null}
                    </td>
                    <td data-label="Status" className="p2dr-wrap">
                      <span className={`p2dr-state p2dr-state--${state.tone}`}>{state.label}</span>
                      {file.documents.rejected ? <span className="p2w-muted p2dr-sub">{file.documents.rejected} rejected</span> : null}
                      {file.failureReason ? <span className="p2w-muted p2dr-sub">{file.failureReason}</span> : null}
                    </td>
                    <td data-label="File"><OpenFile file={file} tenantId={tenantId} accessToken={accessToken} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : <p className="p2w-muted">No files match.</p>}
      {shown.length > rows.length ? (
        <button type="button" className="p2dr-link" onClick={() => setAll(true)}>Show all {shown.length} files</button>
      ) : null}
      {truncated ? <p className="p2w-muted">Only the newest files are listed; narrow the day to see the rest.</p> : null}
    </SectionCard>
  );
}

function PersonTasks({ person }: { person: P2DailyWorkPerson }) {
  return (
    <>
      {person.tasks.map((task) => {
        const customer = customerLabel(task.customerName);
        return (
          <tr key={task.taskId} className="p2dr-child">
            <td data-label="Task" colSpan={2}>
              {task.title}
              <span className="p2w-muted p2dr-sub">
                <Link to={`/p2/journeys/${task.journeyId}/overview`}>{customer.text}</Link>
                {task.lastComment ? ` · “${task.lastComment}”` : ''}
              </span>
            </td>
            <td data-label="What was done" colSpan={3} className="p2dr-wrap">{task.actions.map(actionLabel).join(', ')}</td>
            <td data-label="Now">{task.closedOnDay ? 'Closed' : task.status.replace(/_/g, ' ').toLowerCase()}</td>
          </tr>
        );
      })}
      {person.tasksTruncated ? (
        <tr className="p2dr-child"><td colSpan={6} className="p2w-muted">Only the latest {person.tasks.length} tasks are listed.</td></tr>
      ) : null}
    </>
  );
}

function WorkRow({ person, timezone }: { person: P2DailyWorkPerson; timezone: string }) {
  const [open, setOpen] = useState(false);
  const actions = Object.entries(person.byAction).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${n} ${actionLabel(k).toLowerCase()}`).join(' · ');
  return (
    <>
      <tr className="p2dr-pc">
        <td data-label="Person">
          <button type="button" className="p2dr-toggle" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
            <span aria-hidden="true">{open ? '▾' : '▸'}</span> <strong>{personLabel(person.name, person.role, person.actorId)}</strong>
          </button>
          <span className="p2w-muted p2dr-sub">{person.role ?? ''} · {clock(person.firstAt, timezone)} – {clock(person.lastAt, timezone)}</span>
        </td>
        <td data-label="Tasks worked"><strong>{person.tasksWorked}</strong></td>
        <td data-label="Closed that day">{person.tasksClosed}</td>
        <td data-label="Journeys">{person.journeys}</td>
        <td data-label="Actions">{person.actions}</td>
        <td data-label="What they did" className="p2dr-wrap">{actions}</td>
      </tr>
      {open ? <PersonTasks person={person} /> : null}
    </>
  );
}

/** What each PC / Team Lead did on tasks that day. The system's own task events are not work. */
export function WorkDoneCard({ work, day, timezone }: { work: P2DailyTeamWork; day: string; timezone: string }) {
  return (
    <SectionCard>
      <div className="p2w-card__title">
        <h3>Work done on tasks</h3>
        <p className="p2w-muted">
          {work.people.length
            ? `${work.totals.tasksWorked} task${work.totals.tasksWorked === 1 ? '' : 's'} worked by ${work.totals.people} ${work.totals.people === 1 ? 'person' : 'people'} on ${day}; ${work.totals.tasksClosed} closed. Open a person for the tasks they worked.`
            : `Nobody worked on a task on ${day}.`}
        </p>
      </div>
      {work.people.length ? (
        <div className="p2dr-scroll">
          <table className="p2dr-table">
            <thead>
              <tr><th>Person</th><th>Tasks worked</th><th>Closed that day</th><th>Journeys</th><th>Actions</th><th>What they did</th></tr>
            </thead>
            <tbody>
              {work.people.map((person) => <WorkRow key={`${person.actorId}-${person.role}`} person={person} timezone={timezone} />)}
            </tbody>
          </table>
        </div>
      ) : null}
    </SectionCard>
  );
}
