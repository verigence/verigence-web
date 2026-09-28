import { useCallback, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import '../styles/uc03-p2.css';
import '../styles/uc03-p2-workspace.css';

import PageHeader from '../components/PageHeader';
import P2VehiclePhotos from '../features/uc03-p2/photos/P2VehiclePhotos';
import P2RecheckButton from '../features/uc03-p2/workspace/P2RecheckButton';
import P2UploadStatus from '../features/uc03-p2/workspace/P2UploadStatus';
import { useP2LiveStatus } from '../features/uc03-p2/workspace/useP2LiveStatus';
import P2DocumentEditor from '../features/uc03-p2/workspace/P2DocumentEditor';
import P2DocumentList, { buildDocumentRows } from '../features/uc03-p2/workspace/P2DocumentList';
import P2UploadPanel from '../features/uc03-p2/workspace/P2UploadPanel';
import { BATCH_IN_FLIGHT, formatInr, PAGE_IN_FLIGHT } from '../features/uc03-p2/workspace/p2Format';
import { useP2EventFeed } from '../features/uc03-p2/workspace/useP2EventFeed';
import {
  createP2Journey,
  deleteP2Document,
  getP2Documents,
  getP2Stage,
  getP2Templates,
  p2UploadTransport,
  replaceP2Document,
  retryP2Page,
  setP2PageType,
} from '../services/audit-core/uc03P2';
import { useProjectContextStore } from '../store/projectContextStore';
import { useSessionStore } from '../store/sessionStore';

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
  const outlets = useProjectContextStore((s) => s.selectedProject?.scope.outlets ?? []);
  const queryClient = useQueryClient();
  // New booking and an existing booking are the same screen: until the first
  // upload creates the Journey, the route carries "new".
  const [createdJourneyId, setCreatedJourneyId] = useState<string>();
  const isNew = routeJourneyId === 'new' && !createdJourneyId;
  const journeyId = createdJourneyId ?? (routeJourneyId === 'new' ? '' : routeJourneyId);
  const [customerName, setCustomerName] = useState('');
  const [outletId, setOutletId] = useState(workingOutletId || outlets[0]?.outletId || '');
  const idempotencyKey = useRef(`p2-new-booking-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);
  const creating = useRef<Promise<string> | null>(null);
  const replaceInput = useRef<HTMLInputElement>(null);
  const [replaceTarget, setReplaceTarget] = useState<string>();
  const [removeTarget, setRemoveTarget] = useState<string>();
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string }>();
  const [busyKey, setBusyKey] = useState<string>();
  const enabled = Boolean(tenantId && journeyId && accessToken);

  const documents = useQuery({
    queryKey: ['p2-documents', tenantId, journeyId],
    queryFn: () => getP2Documents(tenantId!, journeyId, accessToken),
    enabled,
    staleTime: 3_000,
  });
  const stage = useQuery({
    queryKey: ['p2-stage', tenantId, journeyId],
    queryFn: () => getP2Stage(tenantId!, journeyId, accessToken),
    enabled,
    staleTime: 3_000,
  });
  const templates = useQuery({
    queryKey: ['p2-templates', tenantId],
    queryFn: () => getP2Templates(tenantId!, accessToken),
    enabled,
    staleTime: 60 * 60_000,
  });

  const rows = useMemo(
    () => buildDocumentRows(documents.data?.batches ?? [], documents.data?.documents ?? []),
    [documents.data],
  );
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
      const name = customerName.trim();
      if (!name) throw new Error("Enter the customer's name to start the booking.");
      if (!outletId) throw new Error('Choose the outlet for this booking.');
      // One creation even if several files are dropped at once (idempotent key).
      creating.current ??= createP2Journey(tenantId!, { outletId, customerName: name }, idempotencyKey.current, accessToken)
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
  }, [accessToken, customerName, journeyId, navigate, outletId, queryClient, tab, tenantId]);

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
    onSuccess: () => { setNotice({ tone: 'success', text: 'Document type set. It is being read again.' }); refresh(); },
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

  const booking = stage.data?.booking;
  const gates = booking ? Object.entries(booking.gates) : [];
  const nextGate = gates.find(([, gate]) => !gate.passed)?.[1];
  const paymentGate = booking?.gates.MINIMUM_BOOKING_PAYMENT;
  const paid = Number(booking?.bookingReceiptTotal || 0);
  const minimum = Number(booking?.minimumBookingAmount || 0);
  const removeName = rows.find((row) => row.documentId === removeTarget)?.name ?? 'this document';

  return (
    <div className={`screen-stack p2-screen p2w${documentId ? ' has-selection' : ''}`}>
      <PageHeader
        eyebrow={isNew ? 'New booking' : 'Booking'}
        title={isNew ? 'New booking' : 'Documents'}
        description={isNew
          ? "Enter the customer's name and add the booking documents. Everything else is read from the documents."
          : 'Upload, check and correct documents in one place.'}
        actions={(
          <div className="p2w-header-links">
            {!isNew && tenantId ? <P2RecheckButton tenantId={tenantId} journeyId={journeyId} accessToken={accessToken}
              onDone={(text, tone) => { setNotice({ text, tone }); refresh(); }} /> : null}
            {!isNew ? <Link className="p2w-link" to={`/p2/journeys/${journeyId}/overview`}>Journey 360</Link> : null}
            {!isNew ? <Link className="p2w-link" to={`/p2/journeys/${journeyId}/tasks`}>Tasks</Link> : null}
            <Link className="p2w-link" to="/p2/bookings">All bookings</Link>
          </div>
        )}
      />

      {isNew ? (
        <section className="p2w-start" aria-label="Start booking">
          <label>
            <span>Customer name</span>
            <input value={customerName} onChange={(event) => setCustomerName(event.target.value)}
              autoComplete="off" autoFocus placeholder="As written on the booking form" />
          </label>
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

      {booking ? (
        <section className="p2w-readiness" aria-label="Booking readiness">
          <details className="p2w-readiness__summary">
            <summary>
              {gates.filter(([, gate]) => gate.passed).length} of {gates.length} booking checks done
            </summary>
          </details>
          <ol className="p2w-gates">
            {gates.map(([key, gate]) => (
              <li key={key} className={gate.passed ? 'is-done' : 'is-open'} title={gate.passed ? undefined : gate.action}>
                <span aria-hidden="true">{gate.passed ? '✓' : '•'}</span>{gate.label || key}
              </li>
            ))}
          </ol>
          <div className="p2w-readiness__next">
            {booking.bookingCompletionState === 'COMPLETE' ? (
              <strong className="p2w-tone p2w-tone--success">Booking complete</strong>
            ) : (
              <>
                <span>Next</span>
                <strong>{nextGate?.action || 'Verify the highlighted fields.'}</strong>
              </>
            )}
          </div>
          {paymentGate ? (
            <div className="p2w-readiness__payment" aria-label="Booking payment">
              <span>{formatInr(paid)} of {formatInr(minimum)}</span>
              <progress max={Math.max(1, minimum)} value={Math.min(paid, minimum)} />
            </div>
          ) : null}
        </section>
      ) : null}

      {documents.isError ? (
        <div className="p2w-alert p2w-alert--error" role="alert">
          Documents could not be loaded. {errorText(documents.error, '')}
          <button type="button" className="p2w-link" onClick={() => void documents.refetch()}>Try again</button>
        </div>
      ) : null}
      {degraded && !live.connected ? <div className="p2w-alert">Live updates are delayed; the screen refreshes automatically.</div> : null}
      {notice ? (
        <div className={`p2w-alert p2w-alert--${notice.tone}`} role="status">
          {notice.text}
          <button type="button" className="p2w-link" onClick={() => setNotice(undefined)} aria-label="Dismiss">×</button>
        </div>
      ) : null}

      {!isNew && tenantId && journeyId ? (
        <P2UploadStatus counts={documents.data?.counts} live={live.connected} />
      ) : null}

      <div className="p2w-segment p2w-tabs-main" role="tablist" aria-label="What to add">
        <button type="button" role="tab" aria-selected={tab === 'documents'} className={tab === 'documents' ? 'is-active' : ''}
          onClick={() => switchTab('documents')}>Documents{rows.length ? <b>{rows.length}</b> : null}</button>
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
            <P2UploadPanel journeyId={journeyId || undefined} getTransport={getTransport} onAccepted={refresh} />
          ) : null}
          {isNew ? null : documents.isLoading ? <div className="p2w-skeleton" aria-busy="true">Loading documents…</div> : (
            <P2DocumentList
              rows={rows}
              checklist={documents.data?.checklist ?? []}
              templates={templates.data?.templates ?? []}
              selectedDocumentId={documentId}
              onOpen={openDocument}
              onRetry={(queueId) => retry.mutate(queueId)}
              onSetType={(queueId, templateKey) => setType.mutate({ queueId, templateKey })}
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
