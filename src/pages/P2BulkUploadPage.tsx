import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import '../styles/uc03-p2.css';
import '../styles/uc03-p2-workspace.css';
import '../styles/uc03-p2-bulk-upload.css';

import PageHeader from '../components/PageHeader';
import SectionCard from '../components/SectionCard';
import {
  BULK_ACCEPT,
  OUTCOME_LABELS,
  acceptedForBulk,
  bulkContentType,
  completeBulkFile,
  listBulkUploads,
  openBulkUpload,
  prepareBulkFiles,
  putToStorage,
  submitBulkUpload,
  type BulkUpload,
} from '../services/audit-core/uc03BulkUpload';
import { useProjectContextStore } from '../store/projectContextStore';
import { useSessionStore } from '../store/sessionStore';

type Picked = { key: string; file: File; progress: number; state: 'waiting' | 'uploading' | 'done' | 'failed'; error?: string };

function sizeLabel(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function when(value: string | null): string {
  if (!value) return '';
  return new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    .format(new Date(value));
}

/** One drop and where each of its files went. */
function BulkResult({ bulk }: { bulk: BulkUpload }) {
  const busy = bulk.status === 'SUBMITTED' || bulk.status === 'PROCESSING';
  return (
    <details className="p2bu-result" open={busy}>
      <summary>
        <strong>{when(bulk.submittedAtUtc ?? bulk.createdAtUtc)}</strong>
        <span className="p2w-muted"> · {bulk.files.length} file{bulk.files.length === 1 ? '' : 's'}</span>
        <span className={`p2bu-status p2bu-status--${busy ? 'busy' : bulk.status === 'DONE' ? 'done' : 'open'}`}>
          {busy ? 'Processing' : bulk.status === 'DONE' ? 'Done' : bulk.status === 'OPEN' ? 'Not submitted' : bulk.status}
        </span>
      </summary>
      <div className="p2bu-scroll">
        <table className="p2w-table">
          <thead><tr><th>File</th><th>Result</th><th>Booking</th></tr></thead>
          <tbody>
            {bulk.files.map((f) => {
              const outcome = OUTCOME_LABELS[f.outcome] ?? OUTCOME_LABELS.PENDING;
              return (
                <tr key={f.fileId}>
                  <td data-label="File">{f.filename}</td>
                  <td data-label="Result">
                    <span className={`p2bu-chip p2bu-chip--${outcome.tone}`}>{outcome.label}</span>
                    {f.detail ? <span className="p2w-muted p2bu-sub">{f.detail}</span> : null}
                  </td>
                  <td data-label="Booking">
                    {f.journeyId && f.outcome !== 'FAILED' ? (
                      <Link className="p2w-link" to={`/p2/journeys/${f.journeyId}/documents`}>{f.journeyReference || 'Open'}</Link>
                    ) : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </details>
  );
}

/**
 * Bulk upload (product owner 2026-11-03): the PC drops all their files for the selected outlet,
 * then submits. Nothing is asked afterwards: each file becomes a new booking, an update to an
 * existing booking, or is set aside as an exact duplicate, and the list below says which.
 */
export default function P2BulkUploadPage() {
  const project = useProjectContextStore((s) => s.selectedProject);
  const accessToken = useSessionStore((s) => s.accessToken) ?? undefined;
  const sessionOutletId = useSessionStore((s) => s.outletId);
  const displayName = useSessionStore((s) => s.displayName);
  const tenantId = project?.tenantId;
  const outlets = project?.scope.outlets ?? [];
  const outlet = outlets.find((o) => o.outletId === sessionOutletId) ?? outlets[0];
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [picked, setPicked] = useState<Picked[]>([]);
  const [bulk, setBulk] = useState<BulkUpload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [dragging, setDragging] = useState(false);

  const history = useQuery({
    queryKey: ['p2-bulk-uploads', tenantId],
    queryFn: () => listBulkUploads(tenantId!, accessToken),
    enabled: Boolean(tenantId && accessToken),
    refetchInterval: (query) => (query.state.data?.inProgress ? 15_000 : false),
  });

  function add(files: FileList | File[]) {
    setError(null);
    setSubmitted(false);
    const list = Array.from(files);
    const refused = list.filter((f) => !acceptedForBulk(f));
    if (refused.length) setError(`${refused.length} file(s) left out: only PDF, JPEG and PNG up to 50 MB.`);
    setPicked((current) => [
      ...current,
      ...list.filter(acceptedForBulk)
        .filter((f) => !current.some((c) => c.file.name === f.name && c.file.size === f.size))
        .map((file) => ({ key: `${file.name}:${file.size}:${file.lastModified}`, file, progress: 0, state: 'waiting' as const })),
    ]);
  }

  async function uploadAll() {
    if (!tenantId || !outlet || !picked.length) return;
    setBusy(true);
    setError(null);
    try {
      const drop = bulk ?? await openBulkUpload(tenantId, outlet.outletId, displayName ?? null, accessToken);
      setBulk(drop);
      const waiting = picked.filter((p) => p.state === 'waiting' || p.state === 'failed');
      for (let i = 0; i < waiting.length; i += 20) {
        const chunk = waiting.slice(i, i + 20);
        const prepared = await prepareBulkFiles(tenantId, drop.bulkId, chunk.map((p) => p.file), accessToken);
        for (const [n, item] of prepared.files.entries()) {
          const entry = chunk[n];
          const update = (patch: Partial<Picked>) => setPicked((all) => all.map((p) => (p.key === entry.key ? { ...p, ...patch } : p)));
          update({ state: 'uploading', progress: 0 });
          try {
            await putToStorage(item.uploadUrl, entry.file, bulkContentType(entry.file), (share) => update({ progress: share }));
            await completeBulkFile(tenantId, drop.bulkId, item.fileId, accessToken);
            update({ state: 'done', progress: 1 });
          } catch (cause) {
            update({ state: 'failed', error: cause instanceof Error ? cause.message : 'Upload failed.' });
          }
        }
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The files could not be uploaded.');
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    if (!tenantId || !bulk) return;
    setBusy(true);
    setError(null);
    try {
      await submitBulkUpload(tenantId, bulk.bulkId, accessToken);
      setSubmitted(true);
      setPicked([]);
      setBulk(null);
      await queryClient.invalidateQueries({ queryKey: ['p2-bulk-uploads', tenantId] });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The bulk upload could not be submitted.');
    } finally {
      setBusy(false);
    }
  }

  const uploaded = picked.filter((p) => p.state === 'done').length;
  const pending = picked.filter((p) => p.state === 'waiting' || p.state === 'failed').length;
  const inFlight = picked.some((p) => p.state === 'uploading');

  return (
    <div className="screen-stack p2-screen p2w p2bu">
      <PageHeader
        eyebrow="Booking & Delivery"
        title="Bulk upload"
        description="Drop all the files for your outlet at once, then submit. Each file is placed by the system: a new booking, an update to an existing booking, or delivery documents. Nothing is asked of you afterwards."
      />
      {!outlet ? (
        <SectionCard><p className="p2w-muted">No outlet is mapped to you in this Project.</p></SectionCard>
      ) : (
        <SectionCard>
          <div className="p2w-card__title">
            <h3>Files for {outlet.outletName}</h3>
            <p className="p2w-muted">
              {outlet.dealerName} · {outlet.outletName}. To upload for another outlet, change the outlet in the menu first.
            </p>
          </div>
          {submitted ? (
            <div className="p2bu-notice" role="status">
              Submitted. Your files are being processed — please do not upload new files until they are done.
              Where each file went is listed below.
            </div>
          ) : null}
          <div
            className={`p2bu-drop${dragging ? ' is-dragging' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => { e.preventDefault(); setDragging(false); add(e.dataTransfer.files); }}
          >
            <p><strong>Drag and drop files here</strong> or</p>
            <button type="button" className="p2w-button p2w-button--secondary" onClick={() => inputRef.current?.click()} disabled={busy}>
              Choose files
            </button>
            <input ref={inputRef} type="file" multiple accept={BULK_ACCEPT} hidden
              onChange={(e) => { if (e.target.files) add(e.target.files); e.target.value = ''; }} />
            <p className="p2w-muted">PDF, JPEG or PNG, up to 50 MB each. Files keep the names you gave them.</p>
          </div>
          {error ? <div className="p2w-alert p2w-alert--error" role="alert">{error}</div> : null}
          {picked.length ? (
            <>
              <ul className="p2bu-files" aria-label="Files picked">
                {picked.map((p) => (
                  <li key={p.key} className={`p2bu-file p2bu-file--${p.state}`}>
                    <span className="p2bu-file__name">{p.file.name}</span>
                    <span className="p2w-muted">{sizeLabel(p.file.size)}</span>
                    <span className="p2bu-bar" aria-hidden="true"><span style={{ width: `${Math.round(p.progress * 100)}%` }} /></span>
                    <span className="p2bu-file__state">
                      {p.state === 'done' ? 'Uploaded' : p.state === 'uploading' ? `${Math.round(p.progress * 100)}%`
                        : p.state === 'failed' ? (p.error ?? 'Failed') : 'Ready'}
                    </span>
                    {p.state === 'waiting' && !busy ? (
                      <button type="button" className="p2w-link" onClick={() => setPicked((all) => all.filter((x) => x.key !== p.key))}>Remove</button>
                    ) : null}
                  </li>
                ))}
              </ul>
              <div className="p2bu-actions">
                <span className="p2w-muted">{uploaded} of {picked.length} uploaded</span>
                <button type="button" className="p2w-button p2w-button--secondary" onClick={() => void uploadAll()}
                  disabled={busy || !pending}>
                  {pending ? `Upload ${pending} file${pending === 1 ? '' : 's'}` : 'All uploaded'}
                </button>
                <button type="button" className="p2w-button p2w-button--primary" onClick={() => void submit()}
                  disabled={busy || inFlight || !uploaded || pending > 0}>
                  Submit
                </button>
              </div>
            </>
          ) : null}
        </SectionCard>
      )}

      <SectionCard>
        <div className="p2w-card__title"><h3>Your bulk uploads</h3></div>
        {history.isLoading ? <p className="p2w-muted">Loading…</p> : null}
        {history.data && !history.data.items.length ? <p className="p2w-muted">No bulk upload yet.</p> : null}
        {history.data?.items.filter((b) => b.status !== 'OPEN' || b.files.length).map((b) => <BulkResult key={b.bulkId} bulk={b} />)}
      </SectionCard>
    </div>
  );
}
