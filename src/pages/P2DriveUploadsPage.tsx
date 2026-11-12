import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import '../styles/uc03-p2.css';
import '../styles/uc03-p2-workspace.css';
import '../styles/uc03-p2-bulk-upload.css';

import PageHeader from '../components/PageHeader';
import SectionCard from '../components/SectionCard';
import {
  DRIVE_RETURN_MESSAGES,
  DRIVE_STATE_LABELS,
  DRIVE_TRIGGER_LABELS,
  connectDrive,
  driveRunInProgress,
  getDriveConnection,
  getDriveRun,
  listDriveRuns,
  listWaitingDriveFiles,
  rescanPages,
  setDriveRetention,
  startDriveRun,
  type DriveFile,
  type DriveRun,
  type DriveTotals,
} from '../services/audit-core/uc03DriveIntake';
import { istDate } from '../services/audit-core/uc03MyWork';
import { useProjectContextStore } from '../store/projectContextStore';
import { useSessionStore } from '../store/sessionStore';

function when(value: string | null): string {
  if (!value) return '';
  return new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    .format(new Date(value));
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** What a run did, in one line. */
function totalsLine(t: DriveTotals): string {
  const parts = [plural(t.files, 'file'), `${t.pagesRead} of ${plural(t.pages, 'page')} read`];
  if (t.pagesToRescan) parts.push(`${plural(t.pagesToRescan, 'page')} to scan again`);
  if (t.duplicates) parts.push(plural(t.duplicates, 'exact duplicate'));
  if (t.setAside) parts.push(`${t.setAside} not taken`);
  if (t.failed) parts.push(`${t.failed} failed`);
  parts.push(plural(t.manualVerificationTasks, 'manual verification task'));
  return parts.join(' · ');
}

function FileRow({ file }: { file: DriveFile }) {
  const state = DRIVE_STATE_LABELS[file.state] ?? DRIVE_STATE_LABELS.WAITING;
  return (
    <tr>
      <td data-label="File">{file.filename}{file.kind === 'PHOTO' ? <span className="p2w-muted"> · photo</span> : null}</td>
      <td data-label="Result">
        <span className={`p2bu-chip p2bu-chip--${state.tone}`}>{state.label}</span>
        {file.detail ? <span className="p2w-muted p2bu-sub">{file.detail}</span> : null}
      </td>
      <td data-label="Pages">{file.pages ? `${file.pagesRead} of ${file.pages} read` : '—'}</td>
      <td data-label="Scan again">
        {file.rescan.length
          ? file.rescan.map((r, i) => (
            <span key={i} className="p2bu-sub"><strong>{rescanPages(r)}</strong>: {r.reason}</span>
          ))
          : '—'}
      </td>
    </tr>
  );
}

/** One run: who asked, what it did, and (when opened) every customer's files. */
function RunResult({ run, tenantId, accessToken }: { run: DriveRun; tenantId: string; accessToken?: string }) {
  const busy = driveRunInProgress(run);
  const [open, setOpen] = useState(false);
  const report = useQuery({
    queryKey: ['p2-drive-run', tenantId, run.runId],
    queryFn: () => getDriveRun(tenantId, run.runId, accessToken),
    enabled: open,
    refetchInterval: busy ? 20_000 : false,
  });
  const totals = report.data?.totals ?? run.summary.totals;
  return (
    <details className="p2bu-result" onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
      <summary>
        <strong>{when(run.requestedAtUtc)}</strong>
        <span className="p2w-muted"> · {DRIVE_TRIGGER_LABELS[run.trigger]}{run.requestedByName ? ` · ${run.requestedByName}` : ''}
          {run.date ? ` · files of ${run.date}` : ''}</span>
        <span className={`p2bu-status p2bu-status--${busy ? 'busy' : run.status === 'DONE' ? 'done' : 'open'}`}>
          {busy ? 'Processing' : run.status === 'DONE' ? 'Done' : 'Failed'}
        </span>
      </summary>
      {run.status === 'FAILED' && run.detail ? <div className="p2w-alert p2w-alert--error" role="alert">{run.detail}</div> : null}
      {totals ? <p className="p2w-muted">{totalsLine(totals)}</p> : null}
      {report.isLoading ? <p className="p2w-muted">Loading…</p> : null}
      {report.data && !report.data.customers.length ? <p className="p2w-muted">No file was waiting for this run.</p> : null}
      {report.data?.customers.map((c, i) => (
        <div key={`${c.outletId}:${c.customerFolder}:${i}`} className="p2bu-scroll">
          <p>
            <strong>{c.customerFolder ?? 'Files in no customer folder'}</strong>
            <span className="p2w-muted"> · {c.outletName}</span>
            {c.journeyId ? (
              <> · <Link className="p2w-link" to={`/p2/journeys/${c.journeyId}/documents`}>{c.journeyReference || 'Open booking'}</Link></>
            ) : null}
            {c.manualVerificationTasks ? <span className="p2w-muted"> · {plural(c.manualVerificationTasks, 'manual verification task')}</span> : null}
          </p>
          <table className="p2w-table">
            <thead><tr><th>File</th><th>Result</th><th>Pages</th><th>Scan again</th></tr></thead>
            <tbody>{c.files.map((f, n) => <FileRow key={`${f.filename}:${n}`} file={f} />)}</tbody>
          </table>
        </div>
      ))}
    </details>
  );
}

/**
 * Drive uploads (product owner 7 and 12 Nov 2026): the files PCs keep in the Project's Google
 * Drive, one folder per customer. A PC submits their outlet; a Team Lead, PM, Executive or
 * Reviewer takes a day's files on demand; the end of the day takes whatever is left. Each run
 * says how many files were processed, pages read, tasks opened and which pages to scan again.
 */
export default function P2DriveUploadsPage() {
  const project = useProjectContextStore((s) => s.selectedProject);
  const accessToken = useSessionStore((s) => s.accessToken) ?? undefined;
  const sessionOutletId = useSessionStore((s) => s.outletId);
  const displayName = useSessionStore((s) => s.displayName);
  const tenantId = project?.tenantId;
  const outlets = project?.scope.outlets ?? [];
  const isPc = project?.operatingRole === 'PC';
  const myOutlet = outlets.find((o) => o.outletId === sessionOutletId) ?? outlets[0];
  const queryClient = useQueryClient();
  const [params] = useSearchParams();
  const returned = DRIVE_RETURN_MESSAGES[params.get('drive') ?? ''];
  const [outletId, setOutletId] = useState<string>('');
  const [date, setDate] = useState<string>(istDate());
  const [allDays, setAllDays] = useState(false);
  const [retention, setRetention] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const enabled = Boolean(tenantId && accessToken);
  const connection = useQuery({
    queryKey: ['p2-drive-connection', tenantId],
    queryFn: () => getDriveConnection(tenantId!, accessToken),
    enabled, refetchInterval: 60_000,
  });
  const connected = Boolean(connection.data?.connected);
  const runs = useQuery({
    queryKey: ['p2-drive-runs', tenantId],
    queryFn: () => listDriveRuns(tenantId!, accessToken),
    enabled: enabled && connected,
    refetchInterval: (query) => (query.state.data?.inProgress ? 15_000 : 60_000),
  });
  const waiting = useQuery({
    queryKey: ['p2-drive-waiting', tenantId],
    queryFn: () => listWaitingDriveFiles(tenantId!, accessToken),
    enabled: enabled && connected, refetchInterval: 60_000,
  });

  async function act(work: () => Promise<string | null>) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      setNotice(await work());
      await Promise.all(['p2-drive-connection', 'p2-drive-runs', 'p2-drive-waiting'].map(
        (key) => queryClient.invalidateQueries({ queryKey: [key, tenantId] })));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'That could not be done.');
    } finally {
      setBusy(false);
    }
  }

  const submit = () => act(async () => {
    await startDriveRun(tenantId!, { outletId: myOutlet!.outletId, requestedByName: displayName ?? null }, accessToken);
    return 'Submitted. The files are being taken from Drive — where each one went is listed below.';
  });
  const runOnDemand = () => act(async () => {
    await startDriveRun(tenantId!, { outletId: outletId || null, date: allDays ? null : date, requestedByName: displayName ?? null },
      accessToken);
    return 'Started. The files are being taken from Drive — the run is listed below.';
  });
  const connect = () => act(async () => {
    const { authUrl } = await connectDrive(tenantId!, accessToken);
    window.location.assign(authUrl);
    return null;
  });
  const saveRetention = () => act(async () => {
    const saved = await setDriveRetention(tenantId!, Number(retention), accessToken);
    setRetention('');
    return `Saved: a customer's folder goes to the archive ${saved.retentionDays} days after the booking is closed.`;
  });

  const link = connection.data;
  const myWaiting = myOutlet ? link?.waitingByOutlet[myOutlet.outletId] ?? 0 : 0;
  const waitingFiles = (waiting.data?.files ?? []).filter((f) => !isPc || !myOutlet || f.outletId === myOutlet.outletId);

  return (
    <div className="screen-stack p2-screen p2w p2bu">
      <PageHeader
        eyebrow="Booking & Delivery"
        title="Drive uploads"
        description="Keep each customer's files in one folder in the Project's Google Drive: Name-OTF, or Name-Mobile where there is no OTF. Keep adding to the same folder — the booking papers, then the delivery file, then anything that was missing. Only what is new is taken."
      />
      {returned ? (
        <div className={returned.ok ? 'p2bu-notice' : 'p2w-alert p2w-alert--error'} role="status">{returned.text}</div>
      ) : null}
      {error ? <div className="p2w-alert p2w-alert--error" role="alert">{error}</div> : null}
      {notice ? <div className="p2bu-notice" role="status">{notice}</div> : null}

      <SectionCard>
        <div className="p2w-card__title"><h3>Google Drive</h3></div>
        {connection.isLoading ? <p className="p2w-muted">Loading…</p> : null}
        {link && !connected ? (
          <>
            <p className="p2w-muted">
              {link.status === 'ERROR'
                ? `Google no longer accepts the approval${link.problem ? ` (${link.problem})` : ''}. An administrator has to connect the account again.`
                : 'This Project’s Google Drive is not connected yet.'}
            </p>
            {link.canConnect ? (
              <button type="button" className="p2w-button p2w-button--primary" disabled={busy || !link.configured}
                onClick={() => void connect()}>
                Connect Google Drive
              </button>
            ) : null}
            {link.canConnect && !link.configured ? <p className="p2w-muted">Google Drive is not set up for Verigence yet.</p> : null}
          </>
        ) : null}
        {link && connected ? (
          <>
            <p>
              Connected as <strong>{link.account}</strong>
              {link.folderUrl ? <> · <a className="p2w-link" href={link.folderUrl} target="_blank" rel="noreferrer">Open the Project’s folder</a></> : null}
              {link.lastCheckedAtUtc ? <span className="p2w-muted"> · last checked {when(link.lastCheckedAtUtc)}</span> : null}
            </p>
            <p className="p2w-muted">
              Files are taken at 9:00 pm every day, or sooner when submitted here. A customer’s folder goes to the
              Archive folder {link.retentionDays} days after the booking is closed; nothing is deleted.
            </p>
            {link.canConnect ? (
              <div className="p2bu-actions">
                <label className="p2w-muted" htmlFor="p2dr-retention">Days in Drive after a booking is closed</label>
                <input id="p2dr-retention" type="number" min={0} max={3650} inputMode="numeric"
                  placeholder={String(link.retentionDays ?? 30)} value={retention} onChange={(e) => setRetention(e.target.value)} />
                <button type="button" className="p2w-button p2w-button--secondary" disabled={busy || retention.trim() === ''}
                  onClick={() => void saveRetention()}>
                  Save
                </button>
              </div>
            ) : null}
          </>
        ) : null}
      </SectionCard>

      {connected && link?.canRun ? (
        <SectionCard>
          {isPc ? (
            <>
              <div className="p2w-card__title">
                <h3>Submit {myOutlet ? `for ${myOutlet.outletName}` : ''}</h3>
                <p className="p2w-muted">
                  {myOutlet
                    ? `${plural(myWaiting, 'file')} waiting in Drive for this outlet. To submit for another outlet, change the outlet in the menu first.`
                    : 'No outlet is mapped to you in this Project.'}
                </p>
              </div>
              <div className="p2bu-actions">
                <button type="button" className="p2w-button p2w-button--primary" disabled={busy || !myOutlet}
                  onClick={() => void submit()}>
                  Submit Drive uploads
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="p2w-card__title">
                <h3>Take files now</h3>
                <p className="p2w-muted">{plural(link.waiting, 'file')} waiting in Drive across your outlets.</p>
              </div>
              <div className="p2bu-actions">
                <label className="p2w-muted" htmlFor="p2dr-outlet">Outlet</label>
                <select id="p2dr-outlet" value={outletId} onChange={(e) => setOutletId(e.target.value)}>
                  <option value="">All my outlets</option>
                  {outlets.map((o) => <option key={o.outletId} value={o.outletId}>{o.dealerName} · {o.outletName}</option>)}
                </select>
                <label className="p2w-muted" htmlFor="p2dr-date">Files put in Drive on</label>
                <input id="p2dr-date" type="date" value={date} max={istDate()} disabled={allDays}
                  onChange={(e) => setDate(e.target.value)} />
                <label className="p2w-muted">
                  <input type="checkbox" checked={allDays} onChange={(e) => setAllDays(e.target.checked)} /> Any day
                </label>
                <button type="button" className="p2w-button p2w-button--primary" disabled={busy} onClick={() => void runOnDemand()}>
                  Take files now
                </button>
              </div>
            </>
          )}
        </SectionCard>
      ) : null}

      {connected ? (
        <SectionCard>
          <div className="p2w-card__title"><h3>Waiting in Drive</h3></div>
          {waiting.isLoading ? <p className="p2w-muted">Loading…</p> : null}
          {waiting.data && !waitingFiles.length ? <p className="p2w-muted">Nothing is waiting to be taken.</p> : null}
          {waitingFiles.length ? (
            <div className="p2bu-scroll">
              <table className="p2w-table">
                <thead><tr><th>Customer folder</th><th>File</th><th>Put in Drive</th><th>Status</th></tr></thead>
                <tbody>
                  {waitingFiles.map((f, i) => (
                    <tr key={`${f.customerFolder}:${f.filename}:${i}`}>
                      <td data-label="Customer folder">{f.customerFolder ?? '—'}</td>
                      <td data-label="File">{f.filename}{f.kind === 'PHOTO' ? <span className="p2w-muted"> · photo</span> : null}</td>
                      <td data-label="Put in Drive">{f.uploadDate ?? '—'}</td>
                      <td data-label="Status">
                        <span className="p2bu-chip p2bu-chip--open">{DRIVE_STATE_LABELS.WAITING.label}</span>
                        {f.detail ? <span className="p2w-muted p2bu-sub">{f.detail}</span> : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </SectionCard>
      ) : null}

      {connected ? (
        <SectionCard>
          <div className="p2w-card__title"><h3>Runs</h3></div>
          {runs.isLoading ? <p className="p2w-muted">Loading…</p> : null}
          {runs.data && !runs.data.items.length ? <p className="p2w-muted">No run yet.</p> : null}
          {tenantId ? runs.data?.items.map((r) => <RunResult key={r.runId} run={r} tenantId={tenantId} accessToken={accessToken} />) : null}
        </SectionCard>
      ) : null}
    </div>
  );
}
