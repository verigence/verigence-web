import { lazy, Suspense, useCallback, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import '../styles/uc03-p2.css';
import '../styles/uc03-p2-workspace.css';
import '../styles/uc03-p2-cards.css';

import PageHeader from '../components/PageHeader';

// The two Phase 1 corrections a PC still makes by hand: the loan amount
// (when no sanction letter covers it) and the vehicle SKU (when the
// documents disagree). Loaded only when opened.
const ModifyModelModal = lazy(() => import('../features/uc03/ModifyModelModal'));
const LoanDisbursementModal = lazy(() => import('../features/uc03/LoanDisbursementPicker').then((m) => ({ default: m.LoanDisbursementModal })));
import P2VehiclePhotos from '../features/uc03-p2/photos/P2VehiclePhotos';
import P2RecheckButton from '../features/uc03-p2/workspace/P2RecheckButton';
import P2UploadStatus from '../features/uc03-p2/workspace/P2UploadStatus';
import { useP2LiveStatus } from '../features/uc03-p2/workspace/useP2LiveStatus';
import P2DocumentEditor from '../features/uc03-p2/workspace/P2DocumentEditor';
import P2DocumentList, { buildDocumentRows, OTHER_DOCUMENT_TEMPLATE } from '../features/uc03-p2/workspace/P2DocumentList';
import P2UploadPanel, { type P2UploadPanelHandle } from '../features/uc03-p2/workspace/P2UploadPanel';
import { BATCH_IN_FLIGHT, PAGE_IN_FLIGHT } from '../features/uc03-p2/workspace/p2Format';
import { useP2EventFeed } from '../features/uc03-p2/workspace/useP2EventFeed';
import {
  cancelP2Journey,
  createP2Journey,
  deleteP2Document,
  getP2Documents,
  getP2Templates,
  p2UploadTransport,
  replaceP2Document,
  retryP2Page,
  setP2PageType,
  type P2ChecklistItem,
  type P2Template,
} from '../services/audit-core/uc03P2';
import { useProjectContextStore } from '../store/projectContextStore';
import { useSessionStore } from '../store/sessionStore';

const KYC_GROUP = new Set(['pan_card', 'aadhaar']);

/** The checklist a Journey starts with: every document the templates expect,
 * none received yet. PAN and Aadhaar share one requirement, as they do once
 * the Journey exists. */
export function expectedDocuments(templates: P2Template[]): P2ChecklistItem[] {
  return templates
    .filter((t) => t.requirement !== 'SUPPORTING' && (t.stage === 'BOOKING' || t.stage === 'DELIVERY'))
    .map((t) => ({
      templateKey: t.key, displayName: t.displayName, stage: t.stage as 'BOOKING' | 'DELIVERY',
      requirement: t.requirement === 'CONDITIONAL' ? 'REQUIRED' : (t.requirement as P2ChecklistItem['requirement']),
      conditional: t.requirement === 'CONDITIONAL', reason: t.condition ?? null, status: 'MISSING', readyCount: 0, documentIds: [],
      group: KYC_GROUP.has(t.key) ? 'KYC' : null, groupLabel: KYC_GROUP.has(t.key) ? 'PAN Card or Aadhaar' : null,
    }));
}

function errorText(cause: unknown, fallback: string): string {
  return cause instanceof Error && cause.message ? cause.message : fallback;
}

export default function P2JourneyWorkspacePage() {
  const { journeyId: routeJourneyId = '', documentId } = useParams();
  const [search, setSearch] = useSearchParams();
  const tab = search.get('tab') === 'photos' ? 'photos' : 'documents';
  const navigate = useNavigate();
  const tenantId = useProjectContextStore((s) => s.selectedProject?.tenantId);
  const accessToken = useSessionStore((s) => s.accessToken);
  const workingOutletId = useSessionStore((s) => s.outletId);
  const signedInName = useSessionStore((s) => s.displayName);
  const outlets = useProjectContextStore((s) => s.selectedProject?.scope.outlets ?? []);
  const queryClient = useQueryClient();
  // New booking and an existing booking are the same screen: until the first
  // upload creates the Journey, the route carries "new".
  const [createdJourneyId, setCreatedJourneyId] = useState<string>();
  const isNew = routeJourneyId === 'new' && !createdJourneyId;
  const journeyId = createdJourneyId ?? (routeJourneyId === 'new' ? '' : routeJourneyId);
  const [outletId, setOutletId] = useState(workingOutletId || outlets[0]?.outletId || '');
  const idempotencyKey = useRef(`p2-new-booking-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);
  const creating = useRef<Promise<string> | null>(null);
  const replaceInput = useRef<HTMLInputElement>(null);
  const uploadPanel = useRef<P2UploadPanelHandle>(null);
  const [replaceTarget, setReplaceTarget] = useState<string>();
  const [removeTarget, setRemoveTarget] = useState<string>();
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string }>();
  const [busyKey, setBusyKey] = useState<string>();
  const [dialog, setDialog] = useState<'loan' | 'sku'>();
  const enabled = Boolean(tenantId && journeyId && accessToken);

  const documents = useQuery({
    queryKey: ['p2-documents', tenantId, journeyId],
    queryFn: () => getP2Documents(tenantId!, journeyId, accessToken),
    enabled,
    staleTime: 3_000,
  });
  const templates = useQuery({
    queryKey: ['p2-templates', tenantId],
    queryFn: () => getP2Templates(tenantId!, accessToken),
    enabled: Boolean(tenantId && accessToken),
    staleTime: 60 * 60_000,
  });

  const rows = useMemo(
    () => buildDocumentRows(documents.data?.batches ?? [], documents.data?.documents ?? []),
    [documents.data],
  );
  // A new booking lists the documents the Journey expects before any is
  // uploaded: the same list the edit view shows, all still missing.
  const expectedChecklist = useMemo(() => expectedDocuments(templates.data?.templates ?? []), [templates.data]);
  const inFlight = rows.some((row) => PAGE_IN_FLIGHT.has(row.status))
    || (documents.data?.batches ?? []).some((batch) => BATCH_IN_FLIGHT.has(batch.batch_status));
  const detailKeys = [['p2-documents', tenantId, journeyId], ['p2-stage', tenantId, journeyId], ['p2-tasks', tenantId],
    ['p2-overview', tenantId, journeyId], ['p2-document-review', tenantId, journeyId]];
  // Pushed the moment a page is uploaded, identified or read; polling only
  // while the push stream is down.
  const live = useP2LiveStatus({ tenantId, journeyId, accessToken, detailKeys });
  const { degraded } = useP2EventFeed({
    tenantId, journeyId, accessToken, active: inFlight, paused: live.connected, queryKeys: detailKeys,
  });

  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['p2-documents', tenantId, journeyId] });
    void queryClient.invalidateQueries({ queryKey: ['p2-stage', tenantId, journeyId] });
  }, [journeyId, queryClient, tenantId]);

  const ensureJourney = useCallback(async () => {
    let target = journeyId;
    if (!target) {
      if (!outletId) throw new Error('Choose the outlet for this booking.');
      // One creation even if several files are dropped at once (idempotent
      // key). No name is asked for: the customer is named from the documents.
      creating.current ??= createP2Journey(tenantId!, { outletId, createdByName: signedInName || undefined }, idempotencyKey.current, accessToken)
        .then((result) => result.journeyId);
      try {
        target = await creating.current;
      } catch (cause) {
        creating.current = null;
        throw cause;
      }
      setCreatedJourneyId(target);
      navigate(`/p2/journeys/${target}/documents${tab === 'photos' ? '?tab=photos' : ''}`, { replace: true });
      void queryClient.invalidateQueries({ queryKey: ['p2-journeys', tenantId] });
    }
    return target;
  }, [accessToken, journeyId, navigate, outletId, queryClient, signedInName, tab, tenantId]);

  const getTransport = useCallback(async () => {
    const target = await ensureJourney();
    return { journeyId: target, transport: p2UploadTransport(tenantId ?? '', target, accessToken) };
  }, [accessToken, ensureJourney, tenantId]);

  const switchTab = (next: 'documents' | 'photos') => {
    const params = new URLSearchParams(search);
    if (next === 'photos') params.set('tab', 'photos'); else params.delete('tab');
    setSearch(params, { replace: true });
  };

  const openDocument = (id: string) => navigate(`/p2/journeys/${journeyId}/documents/${id}`);
  const closeDocument = () => navigate(`/p2/journeys/${journeyId}/documents`);

  const retry = useMutation({
    mutationFn: (queueId: string) => retryP2Page(tenantId!, journeyId, queueId, accessToken),
    onMutate: (queueId) => setBusyKey(queueId),
    onSettled: () => setBusyKey(undefined),
    onSuccess: () => { setNotice({ tone: 'success', text: 'Sent for processing again.' }); refresh(); },
    onError: (cause) => setNotice({ tone: 'error', text: errorText(cause, 'The page could not be retried.') }),
  });
  const setType = useMutation({
    mutationFn: ({ queueId, templateKey }: { queueId: string; templateKey: string }) =>
      setP2PageType(tenantId!, journeyId, queueId, templateKey, accessToken),
    onSuccess: (_result, { templateKey }) => {
      setNotice({ tone: 'success', text: templateKey === OTHER_DOCUMENT_TEMPLATE
        ? 'Kept as Others. It stays on file and is not read.'
        : 'Document type set. It is being read again.' });
      refresh();
    },
    onError: (cause) => setNotice({ tone: 'error', text: errorText(cause, 'The document type could not be set.') }),
  });
  const replace = useMutation({
    mutationFn: ({ id, file }: { id: string; file: File }) => replaceP2Document(tenantId!, journeyId, id, file, accessToken),
    onSuccess: () => {
      setNotice({ tone: 'success', text: 'Replacement received. The current document stays until the new one is ready.' });
      refresh();
    },
    onError: (cause) => setNotice({ tone: 'error', text: errorText(cause, 'The replacement could not be uploaded.') }),
  });
  const remove = useMutation({
    mutationFn: (id: string) => deleteP2Document(tenantId!, journeyId, id, accessToken),
    onSuccess: () => {
      setRemoveTarget(undefined);
      setNotice({ tone: 'success', text: 'Document removed from the Journey. It stays in the audit history.' });
      closeDocument();
      refresh();
    },
    onError: (cause) => setNotice({ tone: 'error', text: errorText(cause, 'The document could not be removed.') }),
  });

  const removeName = rows.find((row) => row.documentId === removeTarget)?.name ?? 'this document';
  const processing = rows.filter((row) => PAGE_IN_FLIGHT.has(row.status));
  // Pages waiting for an automatic retry, and pages whose retries are spent.
  const retrying = rows.filter((row) => row.status === 'RETRY_WAIT');
  const failed = rows.filter((row) => row.status === 'FAILED' || row.status === 'DEAD_LETTER');
  const [deleting, setDeleting] = useState(false);
  const cancelJourney = useMutation({
    mutationFn: () => cancelP2Journey(tenantId!, journeyId, undefined, accessToken),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['p2-journeys', tenantId] });
      navigate('/p2/bookings', { replace: true });
    },
    onError: (cause) => { setDeleting(false); setNotice({ tone: 'error', text: errorText(cause, 'The booking could not be deleted.') }); },
  });

  return (
    <div className={`screen-stack p2-screen p2w${documentId ? ' has-selection' : ''}`}>
      <PageHeader
        eyebrow={isNew ? 'New booking' : 'Booking'}
        title={isNew ? 'New booking' : 'Upload / Edit Documents'}
        description={isNew
          ? 'Add the booking documents. The customer, the vehicle and the prices are read from the documents.'
          : 'Add what is missing and check what needs review. Booking and Delivery complete on their own once the documents are read.'}
        actions={(
          <div className="p2w-header-links">
            {!isNew && tenantId ? <P2RecheckButton tenantId={tenantId} journeyId={journeyId} accessToken={accessToken}
              onDone={(text, tone) => { setNotice({ text, tone }); refresh(); }} /> : null}
            {!isNew ? <button type="button" className="p2w-button p2w-button--secondary" onClick={() => setDialog('loan')}>Loan amount</button> : null}
            {!isNew ? <button type="button" className="p2w-button p2w-button--secondary" onClick={() => setDialog('sku')}>Resolve SKU</button> : null}
            {!isNew ? <Link className="p2w-button p2w-button--secondary" to={`/p2/journeys/${journeyId}/compliance-report`}>View compliance report</Link> : null}
          </div>
        )}
      />

      {isNew && outlets.length > 1 ? (
        <section className="p2w-start" aria-label="Start booking">
          {outlets.length > 1 ? (
            <label>
              <span>Outlet</span>
              <select value={outletId} onChange={(event) => setOutletId(event.target.value)}>
                {outlets.map((outlet) => (
                  <option key={outlet.outletId} value={outlet.outletId}>{outlet.outletName}</option>
                ))}
              </select>
            </label>
          ) : null}
          <p>The booking is created as soon as you add the first document.</p>
        </section>
      ) : null}

      {documents.isError ? (
        <div className="p2w-alert p2w-alert--error" role="alert">
          <span>
            Documents could not be loaded.
            {errorText(documents.error, '') ? <small>{errorText(documents.error, '')}</small> : null}
          </span>
          <button type="button" className="p2w-link" onClick={() => void documents.refetch()} disabled={documents.isFetching}>
            {documents.isFetching ? 'Trying…' : 'Try again'}
          </button>
        </div>
      ) : null}
      {degraded && !live.connected ? <div className="p2w-alert">Live updates are delayed; the screen refreshes automatically.</div> : null}
      {retrying.length && !isNew ? (
        <div className="p2w-alert" role="status">
          <span>{retrying.length === 1 ? 'One page' : `${retrying.length} pages`} could not be processed just now and will be retried automatically over the next hour. You can leave this page and check back later.</span>
        </div>
      ) : null}
      {failed.length && !isNew ? (
        <div className="p2w-alert p2w-alert--error p2w-alert--stack" role="alert">
          <strong>{failed.length === 1 ? 'One page' : `${failed.length} pages`} could not be processed.</strong>
          <ul>{failed.map((row) => <li key={row.key}><b>{row.subtitle || row.name}</b>{row.reason ? ` · ${row.reason}` : ''}</li>)}</ul>
          <span>Retry the page from its card, remove the upload and add the file again, or delete this booking if nothing on it can be used. Deleting keeps the documents and history in the audit record and tells your Team Lead.</span>
          <button type="button" className="p2w-button p2w-button--danger" onClick={() => setDeleting(true)}>Delete this booking</button>
        </div>
      ) : null}
      {notice ? (
        <div className={`p2w-alert p2w-alert--${notice.tone}`} role="status">
          {notice.text}
          <button type="button" className="p2w-link" onClick={() => setNotice(undefined)} aria-label="Dismiss">×</button>
        </div>
      ) : null}

      {!isNew && tenantId && journeyId ? (
        <P2UploadStatus counts={documents.data?.counts} rows={rows} live={live.connected} processing={processing.map((row) => ({ key: row.key, name: row.name === 'Identifying document…' ? row.subtitle : row.name, status: row.status }))} />
      ) : null}

      <div className="p2w-segment p2w-tabs-main" role="tablist" aria-label="What to add">
        <button type="button" role="tab" aria-selected={tab === 'documents'} className={tab === 'documents' ? 'is-active' : ''}
          onClick={() => switchTab('documents')}>Documents</button>
        <button type="button" role="tab" aria-selected={tab === 'photos'} className={tab === 'photos' ? 'is-active' : ''}
          onClick={() => switchTab('photos')}>Vehicle photos</button>
      </div>

      {tab === 'photos' && tenantId ? (
        <P2VehiclePhotos tenantId={tenantId} journeyId={journeyId || undefined} accessToken={accessToken}
          ensureJourney={ensureJourney} />
      ) : null}

      <div className="p2w-layout" hidden={tab === 'photos'}>
        <div className="p2w-layout__list">
          {tenantId ? (
            <P2UploadPanel ref={uploadPanel} journeyId={journeyId || undefined} getTransport={getTransport} onAccepted={refresh} />
          ) : null}
          {!isNew && documents.isLoading ? <div className="p2w-skeleton" aria-busy="true">Loading documents…</div> : (
            <P2DocumentList
              rows={rows}
              checklist={isNew ? expectedChecklist : (documents.data?.checklist ?? [])}
              templates={templates.data?.templates ?? []}
              selectedDocumentId={documentId}
              onOpen={openDocument}
              onRetry={(queueId) => retry.mutate(queueId)}
              onSetType={(queueId, templateKey) => setType.mutate({ queueId, templateKey })}
              onAdd={() => uploadPanel.current?.openFiles()}
              busyKey={busyKey}
            />
          )}
        </div>
        <div className="p2w-layout__editor">
          {documentId && tenantId ? (
            <P2DocumentEditor
              key={documentId}
              tenantId={tenantId}
              journeyId={journeyId}
              documentId={documentId}
              accessToken={accessToken}
              templates={templates.data?.templates ?? []}
              focusField={search.get('field') ?? undefined}
              onClose={closeDocument}
              onReplace={(id) => { setReplaceTarget(id); replaceInput.current?.click(); }}
              onRemove={(id) => setRemoveTarget(id)}
            />
          ) : (
            <div className="p2w-editor-placeholder">
              <strong>Select a document to check it</strong>
              <span>Values read from the page are boxed on the preview. Confirm what is right, correct what is not.</span>
            </div>
          )}
        </div>
      </div>

      <input
        ref={replaceInput}
        className="p2w-hidden-input"
        type="file"
        accept="application/pdf,image/jpeg,image/png"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file && replaceTarget) replace.mutate({ id: replaceTarget, file });
          event.currentTarget.value = '';
        }}
      />

      {dialog && tenantId && journeyId ? (
        <Suspense fallback={null}>
          {dialog === 'loan' ? (
            <LoanDisbursementModal tenantId={tenantId} journeyId={journeyId} accessToken={accessToken}
              onClose={() => setDialog(undefined)}
              onUpdated={() => { setNotice({ tone: 'success', text: 'Loan amount updated.' }); refresh(); }} />
          ) : (
            <ModifyModelModal tenantId={tenantId} journeyId={journeyId} accessToken={accessToken}
              onClose={() => setDialog(undefined)}
              onProposed={() => setNotice({ tone: 'success', text: 'SKU change proposed. The Team Lead reviews it from the Task Queue.' })} />
          )}
        </Suspense>
      ) : null}

      {deleting ? (
        <div className="p2w-dialog-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setDeleting(false);
        }}>
          <div className="p2w-dialog" role="alertdialog" aria-modal="true" aria-labelledby="p2w-delete-title">
            <h3 id="p2w-delete-title">Delete this booking?</h3>
            <p>The booking closes as cancelled because its document upload failed. Its documents and history stay in the audit record, and your Team Lead is told.</p>
            <div className="p2w-dialog__actions">
              <button type="button" className="p2w-button p2w-button--ghost" autoFocus onClick={() => setDeleting(false)}>Keep</button>
              <button type="button" className="p2w-button p2w-button--danger" disabled={cancelJourney.isPending}
                onClick={() => cancelJourney.mutate()}>{cancelJourney.isPending ? 'Deleting…' : 'Delete booking'}</button>
            </div>
          </div>
        </div>
      ) : null}
      {removeTarget ? (
        <div className="p2w-dialog-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setRemoveTarget(undefined);
        }}>
          <div className="p2w-dialog" role="alertdialog" aria-modal="true" aria-labelledby="p2w-remove-title">
            <h3 id="p2w-remove-title">Remove {removeName}?</h3>
            <p>It will no longer count for this Journey. The original stays in the audit history.</p>
            <div className="p2w-dialog__actions">
              <button type="button" className="p2w-button p2w-button--ghost" autoFocus onClick={() => setRemoveTarget(undefined)}>Keep</button>
              <button type="button" className="p2w-button p2w-button--danger" disabled={remove.isPending}
                onClick={() => remove.mutate(removeTarget)}>{remove.isPending ? 'Removing…' : 'Remove'}</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
