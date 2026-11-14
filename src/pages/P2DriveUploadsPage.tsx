import { Fragment, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import '../styles/uc03-p2.css';
import '../styles/uc03-p2-workspace.css';
import '../styles/uc03-p2-bulk-upload.css';
import '../styles/uc03-p2-data-uploads.css';

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
  askDriveAccess,
  clockTime,
  setDriveSettings,
  startDriveRun,
  type DriveAccess,
  type DriveConnection,
  type DrivePerson,
  type DriveCustomer,
  type DriveFile,
  type DriveListedFile,
  type DriveRun,
  type DriveTotals,
} from '../services/audit-core/uc03DriveIntake';
import { istDate } from '../services/audit-core/uc03MyWork';
import { selectOperationalProject } from '../features/uc03/projectContext';
import { useProjectContextStore } from '../store/projectContextStore';
import { useSessionStore } from '../store/sessionStore';

type DriveView = 'runs' | 'waiting' | 'setup';
const DRIVE_VIEWS: { key: DriveView; label: string }[] = [
  { key: 'runs', label: 'Runs' },
  { key: 'waiting', label: 'Waiting in Drive' },
  { key: 'setup', label: 'Folders & settings' },
];

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


const ATTENTION_STATES = new Set<DriveFile['state']>(['DUPLICATE', 'KEPT_FOR_REVIEW', 'SET_ASIDE', 'FAILED']);
const fileNeedsAttention = (f: DriveFile) => ATTENTION_STATES.has(f.state) || f.rescan.length > 0;

type RunFilter = 'attention' | 'new' | 'added' | 'all';

/**
 * An opened run (product owner 2026-11-14: "this view i asked you to make better..its still same"):
 * one table for the whole run -- a slim row per customer folder (its booking, outlet and tasks),
 * that customer's files under it -- in place of a table with its own header per customer. Opens on
 * what needs attention (pages to scan again, not taken, failed, kept for review) when there is any;
 * a file's explanation is shown only where something needs doing.
 */
export function RunReportTable({ customers }: { customers: DriveCustomer[] }) {
  const counts = {
    attention: customers.filter((c) => c.manualVerificationTasks > 0 || c.files.some(fileNeedsAttention)).length,
    new: customers.filter((c) => c.files.some((f) => f.state === 'NEW_BOOKING')).length,
    added: customers.filter((c) => c.files.some((f) => f.state === 'ADDED_TO_BOOKING' || f.state === 'TAKEN')).length,
    all: customers.length,
  };
  const [filter, setFilter] = useState<RunFilter>(counts.attention ? 'attention' : 'all');
  const shown = customers.filter((c) => (filter === 'all' ? true
    : filter === 'attention' ? c.manualVerificationTasks > 0 || c.files.some(fileNeedsAttention)
      : filter === 'new' ? c.files.some((f) => f.state === 'NEW_BOOKING')
        : c.files.some((f) => f.state === 'ADDED_TO_BOOKING' || f.state === 'TAKEN')));
  const labels: Record<RunFilter, string> = {
    attention: 'Needs attention', new: 'New bookings', added: 'Added to bookings', all: 'All customers',
  };
  return (
    <>
      <div className="p2du-switcher p2du-switcher--sm" role="tablist" aria-label="Customers in this run">
        {(['attention', 'new', 'added', 'all'] as RunFilter[]).map((key) => (
          <button key={key} type="button" role="tab" aria-selected={filter === key}
            onClick={(event) => { event.stopPropagation(); setFilter(key); }}>
            {labels[key]}<b>{counts[key]}</b>
          </button>
        ))}
      </div>
      {!shown.length ? <p className="p2w-muted">Nothing here.</p> : (
        <table className="p2du-table p2du-runfiles">
          <thead>
            <tr><th>File</th><th>Result</th><th className="num">Pages read</th><th>Scan again</th></tr>
          </thead>
          <tbody>
            {shown.map((c, i) => (
              <Fragment key={`${c.outletId}:${c.customerFolder}:${i}`}>
                <tr className="p2du-group">
                  <td colSpan={4}>
                    <strong>{c.customerFolder ?? 'Files in no customer folder'}</strong>
                    <span className="p2w-muted"> · {c.outletName}</span>
                    {c.journeyId ? (
                      <> · <Link className="p2w-link" to={`/p2/journeys/${c.journeyId}/documents`}
                        onClick={(event) => event.stopPropagation()}>{c.journeyReference || 'Open booking'}</Link></>
                    ) : null}
                    {c.manualVerificationTasks ? (
                      <span className="p2du-tag p2du-tag--warn p2du-group__tag">{plural(c.manualVerificationTasks, 'manual verification task')}</span>
                    ) : null}
                  </td>
                </tr>
                {c.files.filter((f) => filter !== 'attention' || fileNeedsAttention(f) || !c.files.some(fileNeedsAttention))
                  .map((f, n) => {
                    const state = DRIVE_STATE_LABELS[f.state] ?? DRIVE_STATE_LABELS.WAITING;
                    const attention = fileNeedsAttention(f);
                    return (
                      <tr key={`${f.filename}:${n}`} className="p2du-file-row">
                        <td data-label="File">{f.filename}{f.kind === 'PHOTO' ? <span className="p2w-muted"> · photo</span> : null}</td>
                        <td data-label="Result">
                          <span className={`p2du-tag p2du-tag--${state.tone}`} title={f.detail ?? undefined}>{state.label}</span>
                          {attention && f.detail ? <small className="p2w-muted p2du-why">{f.detail}</small> : null}
                        </td>
                        <td className="num" data-label="Pages read">
                          {f.pages ? <>{f.pagesRead}/{f.pages}{f.pagesRead === f.pages ? <span className="p2du-ok" aria-label="all read"> ✓</span> : null}</> : '—'}
                        </td>
                        <td data-label="Scan again">
                          {f.rescan.length
                            ? f.rescan.map((r, k) => <div key={k}><strong>{rescanPages(r)}</strong> <span className="p2w-muted">{r.reason}</span></div>)
                            : <span className="p2w-muted">—</span>}
                        </td>
                      </tr>
                    );
                  })}
              </Fragment>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

/** A run's figures for the runs table. */
function RunFigures({ totals }: { totals: DriveTotals | undefined }) {
  if (!totals) return <><td className="num">—</td><td className="num">—</td><td className="num">—</td><td className="num">—</td><td className="num">—</td></>;
  const notTaken = totals.setAside + totals.failed;
  return (
    <>
      <td className="num" data-label="Files">{totals.files}</td>
      <td className="num" data-label="Pages read">{totals.pagesRead} / {totals.pages}</td>
      <td className="num" data-label="Scan again">{totals.pagesToRescan ? <span className="p2du-tag p2du-tag--warn">{totals.pagesToRescan}</span> : 0}</td>
      <td className="num" data-label="Not taken">{notTaken ? <span className="p2du-tag p2du-tag--bad">{notTaken}</span> : 0}
        {totals.duplicates ? <small className="p2w-muted"><br />{plural(totals.duplicates, 'duplicate')}</small> : null}</td>
      <td className="num" data-label="Tasks">{totals.manualVerificationTasks}</td>
    </>
  );
}

function runTag(run: DriveRun) {
  const busy = driveRunInProgress(run);
  if (busy) return <span className="p2du-tag p2du-tag--busy">Processing</span>;
  return run.status === 'DONE' ? <span className="p2du-tag p2du-tag--ok">Done</span> : <span className="p2du-tag p2du-tag--bad">Failed</span>;
}

/** One run as a table row; opened, every customer's files below it. */
function RunRow({ run, tenantId, accessToken, open, onToggle }: {
  run: DriveRun; tenantId: string; accessToken?: string; open: boolean; onToggle: () => void;
}) {
  const busy = driveRunInProgress(run);
  const report = useQuery({
    queryKey: ['p2-drive-run', tenantId, run.runId],
    queryFn: () => getDriveRun(tenantId, run.runId, accessToken),
    enabled: open,
    refetchInterval: busy ? 20_000 : false,
  });
  const totals = report.data?.totals ?? run.summary.totals;
  return (
    <>
      <tr className={`is-clickable${open ? ' is-selected' : ''}`} onClick={onToggle} aria-expanded={open}>
        <td data-label="Run"><strong>{when(run.requestedAtUtc)}</strong>
          <small className="p2w-muted"><br />{DRIVE_TRIGGER_LABELS[run.trigger]}{run.requestedByName ? ` · ${run.requestedByName}` : ''}
            {run.date ? ` · files of ${run.date}` : ''}</small></td>
        <RunFigures totals={totals} />
        <td data-label="Status">{runTag(run)}</td>
      </tr>
      {open ? (
        <tr className="p2du-run-detail">
          <td colSpan={7}>
            {run.status === 'FAILED' && run.detail ? <div className="p2w-alert p2w-alert--error" role="alert">{run.detail}</div> : null}
            {totals ? <p className="p2w-muted">{totalsLine(totals)}</p> : null}
            {report.isLoading ? <p className="p2w-muted">Loading…</p> : null}
            {report.data && !report.data.customers.length ? <p className="p2w-muted">No file was waiting for this run.</p> : null}
            {report.data?.customers.length ? <RunReportTable customers={report.data.customers} /> : null}
          </td>
        </tr>
      ) : null}
    </>
  );
}

/** The files waiting in Drive, one row per customer folder. */
function WaitingTable({ files }: { files: DriveListedFile[] }) {
  const folders = new Map<string, DriveListedFile[]>();
  for (const f of files) {
    const key = `${f.outletId}:${f.customerFolder ?? ''}`;
    folders.set(key, [...(folders.get(key) ?? []), f]);
  }
  return (
    <div className="p2du-scroll">
      <table className="p2du-table">
        <thead><tr><th>Customer folder</th><th className="num">Files</th><th>Files waiting</th><th>Put in Drive</th></tr></thead>
        <tbody>
          {[...folders.entries()].map(([key, group]) => {
            const days = group.map((f) => f.uploadDate).filter(Boolean).sort() as string[];
            return (
              <tr key={key}>
                <td data-label="Customer folder"><strong>{group[0].customerFolder ?? 'Files in no customer folder'}</strong></td>
                <td className="num" data-label="Files">{group.length}</td>
                <td data-label="Files waiting">
                  {group.map((f, i) => (
                    <div key={`${f.filename}:${i}`}>{f.filename}{f.kind === 'PHOTO' ? <span className="p2w-muted"> · photo</span> : null}
                      {f.detail ? <small className="p2w-muted"> · {f.detail}</small> : null}</div>
                  ))}
                </td>
                <td data-label="Put in Drive">{days.length ? (days[0] === days[days.length - 1] ? days[0] : `${days[0]} – ${days[days.length - 1]}`) : '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/**
 * A PC's own way into Drive (product owner 2026-11-12, "I need option B"): the folders of the
 * outlets they upload for are shared with their own Google account -- the email they sign in
 * to Verigence with -- so no PC holds the password of the Project's Google account.
 */
function DriveMyFolders({ access, email, busy, onAsk }: {
  access: DriveAccess; email: string; busy: boolean; onAsk: () => void;
}) {
  const waiting = access.folders.filter((f) => !f.shared);
  return (
    <div className="p2bu-result">
      <p><strong>My folders in Drive</strong>
        {access.googleEmail ? <span className="p2w-muted"> · shared with {access.googleEmail}</span> : null}
      </p>
      {access.folders.length === 0 ? <p className="p2w-muted">None of your outlets has a folder in Drive yet.</p> : null}
      {access.folders.map((f) => (
        <p key={f.outletId} className="p2bu-sub">
          {f.dealerName} · {f.outletName}{' '}
          {f.shared && f.url
            ? <a className="p2w-link" href={f.url} target="_blank" rel="noreferrer">Open in Drive</a>
            : <span className="p2w-muted">· {f.problem ? `not shared: ${f.problem}` : 'not shared with you yet'}</span>}
        </p>
      ))}
      {waiting.length ? (
        <div className="p2bu-actions">
          <span className="p2w-muted">
            {email
              ? `The folders will be shared with your Google account ${email}. Open them signed in to that account.`
              : 'Sign out and sign in again, so that your email is known, then ask here.'}
          </span>
          <button type="button" className="p2w-button p2w-button--primary" disabled={busy || !email} onClick={onAsk}>
            Get my Drive folders
          </button>
        </div>
      ) : null}
    </div>
  );
}

/** For an administrator: every PC, the Google account their folders are shared with, and the state. */
function DrivePeople({ people }: { people: DrivePerson[] }) {
  const asked = people.filter((p) => p.googleEmail).length;
  return (
    <details className="p2bu-result">
      <summary><strong>PCs and their folders</strong>
        <span className="p2w-muted"> · {asked} of {people.length} have their folders</span>
      </summary>
      <div className="p2bu-scroll">
        <table className="p2w-table">
          <thead><tr><th>PC</th><th>Google account</th><th>Folders</th></tr></thead>
          <tbody>
            {people.map((p) => (
              <tr key={p.actorId}>
                <td>{p.name ?? p.actorId}</td>
                <td>{p.googleEmail ?? <span className="p2w-muted">Has not asked yet (Drive uploads → Get my Drive folders)</span>}</td>
                <td>
                  {p.folders.map((f) => (
                    <div key={f.outletId}>
                      {f.outletName}
                      <span className="p2w-muted"> · {f.shared ? 'shared' : f.problem ? `not shared: ${f.problem}` : 'not shared'}</span>
                    </div>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

/**
 * The Project's Drive settings, for an administrator (product owner 2026-11-12): when the daily
 * run starts and whether it runs, how long a closed booking's folder stays in Drive, and which
 * outlets use Drive -- only they get a folder and only their files are taken by the daily run.
 */
function DriveSettingsForm({ link, busy, onSave }: {
  link: DriveConnection; busy: boolean; onSave: (settings: Parameters<typeof setDriveSettings>[1]) => void;
}) {
  const outlets = link.outlets ?? [];
  const [time, setTime] = useState(link.dailyRunTime ?? '21:00');
  const [daily, setDaily] = useState(link.dailyRunEnabled !== false);
  const [days, setDays] = useState(String(link.retentionDays ?? 30));
  const [all, setAll] = useState(link.outletIds == null);
  const [chosen, setChosen] = useState<Set<string>>(
    () => new Set(link.outletIds ?? outlets.filter((o) => o.pcs > 0).map((o) => o.outletId)));
  const dealers = [...new Map(outlets.map((o) => [o.dealerId, o.dealerName])).entries()];
  const toggle = (ids: string[], on: boolean) => setChosen((before) => {
    const next = new Set(before);
    ids.forEach((id) => (on ? next.add(id) : next.delete(id)));
    return next;
  });
  const validDays = /^\d+$/.test(days.trim()) && Number(days) <= 3650;
  return (
    <details className="p2bu-result">
      <summary><strong>Settings</strong><span className="p2w-muted"> · daily run, archive and outlets</span></summary>
      <div className="p2bu-actions">
        <label className="p2w-muted">
          <input type="checkbox" checked={daily} onChange={(e) => setDaily(e.target.checked)} /> Take files every day at
        </label>
        <input type="time" aria-label="Daily run time (India time)" value={time} disabled={!daily}
          onChange={(e) => setTime(e.target.value)} />
        <label className="p2w-muted" htmlFor="p2dr-retention">Days in Drive after a booking is closed</label>
        <input id="p2dr-retention" type="number" min={0} max={3650} inputMode="numeric" value={days}
          onChange={(e) => setDays(e.target.value)} />
      </div>
      <p className="p2w-muted">
        <label>
          <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> Every outlet that has a PC uses Drive
        </label>
      </p>
      {!all ? dealers.map(([dealerId, dealerName]) => {
        const mine = outlets.filter((o) => o.dealerId === dealerId);
        const ids = mine.map((o) => o.outletId);
        return (
          <fieldset key={dealerId} className="p2bu-scroll">
            <legend>
              <label>
                <input type="checkbox" checked={ids.every((id) => chosen.has(id))}
                  onChange={(e) => toggle(ids, e.target.checked)} /> <strong>{dealerName}</strong>
              </label>
            </legend>
            {mine.map((o) => (
              <label key={o.outletId} className="p2bu-sub">
                <input type="checkbox" checked={chosen.has(o.outletId)} onChange={(e) => toggle([o.outletId], e.target.checked)} />
                {' '}{o.outletName}{o.pcs === 0 ? <span className="p2w-muted"> · no PC mapped</span> : null}
              </label>
            ))}
          </fieldset>
        );
      }) : null}
      <div className="p2bu-actions">
        <button type="button" className="p2w-button p2w-button--secondary" disabled={busy || !validDays || !time}
          onClick={() => onSave({ dailyRunEnabled: daily, dailyRunTime: time, retentionDays: Number(days),
            outletIds: all ? null : [...chosen] })}>
          Save settings
        </button>
      </div>
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
  const signInEmail = useSessionStore((s) => s.email);
  const tenantId = project?.tenantId;
  const outlets = project?.scope.outlets ?? [];
  const isPc = project?.operatingRole === 'PC';
  const myOutlet = outlets.find((o) => o.outletId === sessionOutletId) ?? outlets[0];
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [openRun, setOpenRun] = useState<string | null>(null);
  const returned = DRIVE_RETURN_MESSAGES[params.get('drive') ?? ''];
  // Google sends the browser back to this page whichever Project asked: the answer is about
  // that Project (product owner 2026-11-12: "both are showing only mahindra where is hyundai").
  const returnedTenantId = params.get('project');
  const projects = useProjectContextStore((s) => s.projects);
  const returnedProject = returnedTenantId && returnedTenantId !== tenantId
    ? projects.find((p) => p.tenantId === returnedTenantId) ?? null : undefined;
  // A Project is told apart on screen by its dealerships (its name is not shown on operational screens).
  const returnedDealers = [...new Set((returnedProject?.scope.outlets ?? []).map((o) => o.dealerName).filter(Boolean))];
  const [outletId, setOutletId] = useState<string>('');
  const [date, setDate] = useState<string>(istDate());
  const [allDays, setAllDays] = useState(false);
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
  const askAccess = () => act(async () => {
    const access = await askDriveAccess(tenantId!, signInEmail, accessToken);
    const shared = access.folders.filter((f) => f.shared).length;
    return shared
      ? `Shared with ${access.googleEmail}. Google has emailed you the link; the folders are also listed here.`
      : 'Google could not share the folders just now. Try again in a few minutes.';
  });
  const saveSettings = (settings: Parameters<typeof setDriveSettings>[1]) => act(async () => {
    await setDriveSettings(tenantId!, settings, accessToken);
    return 'Saved.';
  });

  const link = connection.data;
  const myWaiting = myOutlet ? link?.waitingByOutlet[myOutlet.outletId] ?? 0 : 0;
  const waitingFiles = (waiting.data?.files ?? []).filter((f) => !isPc || !myOutlet || f.outletId === myOutlet.outletId);
  const runItems = runs.data?.items ?? [];
  const lastRun = runItems[0];
  const lastTotals = lastRun?.summary.totals;
  const waitingCount = isPc ? myWaiting : link?.waiting ?? 0;
  const view = DRIVE_VIEWS.some((v) => v.key === params.get('view')) ? params.get('view') as DriveView : 'runs';
  const setView = (next: DriveView) => {
    const nextParams = new URLSearchParams(params);
    nextParams.delete('drive');
    nextParams.delete('project');
    if (next === 'runs') nextParams.delete('view'); else nextParams.set('view', next);
    setParams(nextParams, { replace: true });
  };

  const actions = connected && link?.canRun ? (
    isPc ? (
      <div className="p2du-toolbar">
        <span className="p2w-muted">
          <strong>Submit {myOutlet ? `for ${myOutlet.outletName}` : ''}</strong>{' · '}
          {myOutlet
            ? `${plural(myWaiting, 'file')} waiting in Drive for this outlet. To submit for another outlet, change the outlet in the menu first.`
            : 'No outlet is mapped to you in this Project.'}
        </span>
        <div className="p2du-toolbar__end">
          <button type="button" className="p2w-button p2w-button--primary" disabled={busy || !myOutlet} onClick={() => void submit()}>
            Submit Drive uploads
          </button>
        </div>
      </div>
    ) : (
      <div className="p2du-toolbar">
        <label htmlFor="p2dr-outlet">Outlet
          <select id="p2dr-outlet" value={outletId} onChange={(e) => setOutletId(e.target.value)}>
            <option value="">All my outlets</option>
            {outlets.map((o) => <option key={o.outletId} value={o.outletId}>{o.dealerName} · {o.outletName}</option>)}
          </select>
        </label>
        <label htmlFor="p2dr-date">Files put in Drive on
          <input id="p2dr-date" type="date" value={date} max={istDate()} disabled={allDays} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className="p2du-check">
          <span><input type="checkbox" checked={allDays} onChange={(e) => setAllDays(e.target.checked)} /> Any day</span>
        </label>
        <div className="p2du-toolbar__end">
          <span className="p2w-muted">{plural(link.waiting, 'file')} waiting in Drive across your outlets.</span>
          <button type="button" className="p2w-button p2w-button--primary" disabled={busy} onClick={() => void runOnDemand()}>
            Take files now
          </button>
        </div>
      </div>
    )
  ) : null;

  return (
    <div className="screen-stack p2-screen p2w p2bu">
      <PageHeader
        eyebrow="Booking & Delivery"
        title="Drive uploads"
        description="Keep each customer's files in one folder in the Project's Google Drive: Name-OTF, or Name-Mobile where there is no OTF. Keep adding to the same folder — the booking papers, then the delivery file, then anything that was missing. Only what is new is taken."
      />
      {returned ? (
        <div className={returned.ok ? 'p2bu-notice' : 'p2w-alert p2w-alert--error'} role="status">
          {returnedProject === undefined ? returned.text : (
            <>
              <strong>{returnedDealers.length ? returnedDealers.join(', ') : 'Another Project'}:</strong> {returned.text}{' '}
              This page shows a different Project, the one you have open.{' '}
              {returnedProject ? (
                <button type="button" className="p2w-button p2w-button--secondary" onClick={() => selectOperationalProject(returnedProject, queryClient)}>
                  Open that Project
                </button>
              ) : null}
            </>
          )}
        </div>
      ) : null}
      {error ? <div className="p2w-alert p2w-alert--error" role="alert">{error}</div> : null}
      {notice ? <div className="p2bu-notice" role="status">{notice}</div> : null}

      {connection.isLoading ? <SectionCard><p className="p2w-muted">Loading…</p></SectionCard> : null}
      {link && !connected ? (
        <SectionCard>
          <div className="p2w-card__title"><h3>Google Drive</h3></div>
          <p className="p2w-muted">
            {link.status === 'ERROR'
              ? `Google no longer accepts the approval${link.problem ? ` (${link.problem})` : ''}. An administrator has to connect the account again.`
              : 'This Project’s Google Drive is not connected yet.'}
          </p>
          {link.canConnect ? (
            <button type="button" className="p2w-button p2w-button--primary" disabled={busy || !link.configured} onClick={() => void connect()}>
              Connect Google Drive
            </button>
          ) : null}
          {link.canConnect && !link.configured ? <p className="p2w-muted">Google Drive is not set up for Verigence yet.</p> : null}
        </SectionCard>
      ) : null}

      {link && connected ? (
        <>
          <section className="p2du-tiles" aria-label="Drive status">
            <div className="p2du-tile p2du-tile--ok">
              <span>Google Drive</span>
              <strong>Connected</strong>
              {/* A PC opens Drive with their own Google account, so the Project's account is not named to them. */}
              <small>{link.myAccess && !link.canConnect ? 'Connected' : <>Connected as <strong>{link.account}</strong></>}
                {link.lastCheckedAtUtc ? ` · checked ${when(link.lastCheckedAtUtc)}` : ''}</small>
            </div>
            <div className={`p2du-tile${waitingCount ? ' p2du-tile--warn' : ''}`}>
              <span>Waiting in Drive</span>
              <strong>{waitingCount}</strong>
              <small>{isPc && myOutlet ? myOutlet.outletName : 'Across your outlets'}</small>
            </div>
            <div className="p2du-tile">
              <span>Daily run</span>
              <strong>{link.dailyRunEnabled === false ? 'Off' : clockTime(link.dailyRunTime)}</strong>
              <small>{link.dailyRunEnabled === false
                ? 'The daily run is off: files are taken only when submitted here.'
                : `Files are taken at ${clockTime(link.dailyRunTime)} every day, or sooner when submitted here.`}</small>
            </div>
            <div className="p2du-tile">
              <span>Last run</span>
              <strong>{lastRun ? (driveRunInProgress(lastRun) ? 'Processing' : lastRun.status === 'DONE' ? 'Done' : 'Failed') : '—'}</strong>
              <small>{lastRun ? `${when(lastRun.requestedAtUtc)}${lastTotals ? ` · ${plural(lastTotals.files, 'file')}` : ''}` : 'No run yet'}</small>
            </div>
            <div className={`p2du-tile${lastTotals?.pagesToRescan ? ' p2du-tile--bad' : ''}`}>
              <span>Pages to scan again</span>
              <strong>{lastTotals?.pagesToRescan ?? 0}</strong>
              <small>In the last run</small>
            </div>
          </section>

          <SectionCard>
            <div className="p2du-switcher" role="tablist" aria-label="Drive uploads">
              {DRIVE_VIEWS.map((v) => (
                <button key={v.key} type="button" role="tab" aria-selected={view === v.key} onClick={() => setView(v.key)}>
                  {v.label}{v.key === 'waiting' ? <b>{waitingFiles.length}</b> : v.key === 'runs' ? <b>{runItems.length}</b> : null}
                </button>
              ))}
            </div>

            {view === 'runs' ? (
              <>
                {actions}
                {runs.isLoading ? <p className="p2w-muted">Loading…</p> : null}
                {runs.data && !runItems.length ? <p className="p2w-empty">No run yet.</p> : null}
                {tenantId && runItems.length ? (
                  <div className="p2du-scroll">
                    <table className="p2du-table p2du-table--stack">
                      <thead>
                        <tr><th>Run</th><th className="num">Files</th><th className="num">Pages read</th><th className="num">Scan again</th>
                          <th className="num">Not taken</th><th className="num">Tasks</th><th>Status</th></tr>
                      </thead>
                      <tbody>
                        {runItems.map((r) => (
                          <RunRow key={r.runId} run={r} tenantId={tenantId} accessToken={accessToken}
                            open={openRun === r.runId} onToggle={() => setOpenRun(openRun === r.runId ? null : r.runId)} />
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </>
            ) : null}

            {view === 'waiting' ? (
              <>
                {waiting.isLoading ? <p className="p2w-muted">Loading…</p> : null}
                {waiting.data && !waitingFiles.length ? <p className="p2w-empty">Nothing is waiting to be taken.</p> : null}
                {waitingFiles.length ? <WaitingTable files={waitingFiles} /> : null}
              </>
            ) : null}

            {view === 'setup' ? (
              <div className="screen-stack">
                <p>
                  {link.myAccess && !link.canConnect ? 'Connected' : <>Connected as <strong>{link.account}</strong></>}
                  {link.canConnect && link.folderUrl ? <> · <a className="p2w-link" href={link.folderUrl} target="_blank" rel="noreferrer">Open the Project’s folder</a></> : null}
                </p>
                <p className="p2w-muted">
                  A customer’s folder goes to the Archive folder {link.retentionDays} days after the booking is closed; Verigence deletes nothing.
                </p>
                {link.myAccess ? (
                  <DriveMyFolders access={link.myAccess} email={signInEmail} busy={busy} onAsk={() => void askAccess()} />
                ) : null}
                {link.canConnect && link.people ? <DrivePeople people={link.people} /> : null}
                {link.canConnect ? (
                  <DriveSettingsForm key={JSON.stringify([link.dailyRunTime, link.dailyRunEnabled, link.retentionDays, link.outletIds])}
                    link={link} busy={busy} onSave={(settings) => void saveSettings(settings)} />
                ) : null}
              </div>
            ) : null}
          </SectionCard>
        </>
      ) : null}
    </div>
  );
}
