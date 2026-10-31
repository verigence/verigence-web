import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { sortByName } from '../utils/sortByName';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import '../styles/uc03-p2.css';
import '../styles/uc03-p2-workspace.css';
import '../styles/uc03-p2-cards.css';

import BackLink from '../components/BackLink';
import PageHeader from '../components/PageHeader';

// The two Phase 1 corrections a PC still makes by hand: the loan amount
// (when no sanction letter covers it) and the vehicle SKU (when the
// documents disagree). Loaded only when opened.
const ModifyModelModal = lazy(() => import('../features/uc03/ModifyModelModal'));
const LoanDisbursementModal = lazy(() => import('../features/uc03/LoanDisbursementPicker').then((m) => ({ default: m.LoanDisbursementModal })));
import P2VehiclePhotos from '../features/uc03-p2/photos/P2VehiclePhotos';
import P2StageReviewPanel from '../features/uc03-p2/review/P2StageReviewPanel';
import { getResyncPreview } from '../services/audit-core/uc03P2Reviewer';
import { getMyDisplayName } from '../services/security/profile';
import P2CompleteDeliveryButton from '../features/uc03-p2/workspace/P2CompleteDeliveryButton';
import P2RecheckButton from '../features/uc03-p2/workspace/P2RecheckButton';
import P2UploadStatus from '../features/uc03-p2/workspace/P2UploadStatus';
import { useP2LiveStatus } from '../features/uc03-p2/workspace/useP2LiveStatus';
import P2DocumentEditor from '../features/uc03-p2/workspace/P2DocumentEditor';
import P2DocumentList, {
  buildDocumentRows, type DocumentRow, OTHER_DOCUMENT_TEMPLATE, removablePage,
} from '../features/uc03-p2/workspace/P2DocumentList';
import RemovePageDialog from '../features/uc03-p2/workspace/RemovePageDialog';
import P2UploadPanel, { type P2UploadActivity, type P2UploadPanelHandle } from '../features/uc03-p2/workspace/P2UploadPanel';
import { P2BookingBanner, P2BookingCreatedNotice, P2ForeignFileNotices } from '../features/uc03-p2/workspace/P2BookingContext';
import { bookingKnownNames, customerIsNamed } from '../features/uc03-p2/workspace/customerNameGuard';
import {
  carryTaken,
  followRoute,
  journeyCreated,
  NEW_BOOKING_ROUTE,
  newBookingIdempotencyKey,
  openSession,
  startNextBooking,
  type NextBookingCarry,
} from '../features/uc03-p2/workspace/workspaceSession';
import { P2_NEW_BOOKING_PATH } from '../features/uc03-p2/newBookingPath';
import { BATCH_IN_FLIGHT, PAGE_IN_FLIGHT } from '../features/uc03-p2/workspace/p2Format';
import { useP2EventFeed } from '../features/uc03-p2/workspace/useP2EventFeed';
import {
  cancelP2Journey,
  createP2Journey,
  deleteP2Document,
  removeP2Page,
  getP2Documents,
  getP2Journey360,
  getP2OldScreenDocuments,
  getP2Templates,
  splitP2OldScreenDocument,
  p2UploadTransport,
  replaceP2Document,
  rereadP2Page,
  restoreP2DocumentCopy,
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
function expectedDocuments(templates: P2Template[]): P2ChecklistItem[] {
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

/** "file.pdf pages 11, 13, 15" per file: the task carries the rest. */
function failedSummary(rows: DocumentRow[]): string {
  const byFile = new Map<string, number[]>();
  for (const row of rows) {
    const file = row.batch?.original_filename || row.name;
    const pages = row.unit ? (row.unit.pageNumbers?.length ? row.unit.pageNumbers : [row.unit.page_number]) : [];
    byFile.set(file, [...(byFile.get(file) ?? []), ...pages.filter((n): n is number => typeof n === 'number')]);
  }
  return [...byFile.entries()].map(([file, pages]) => {
    const sorted = [...new Set(pages)].sort((a, b) => a - b);
    return sorted.length ? `${file} ${sorted.length === 1 ? 'page' : 'pages'} ${sorted.join(', ')}` : file;
  }).join('; ');
}

type WorkspaceScreenProps = {
  /** What "Start next booking" brought to this fresh new-booking screen. */
  carry?: NextBookingCarry;
  /** This screen created the Journey (its address follows). */
  onCreated: (journeyId: string) => void;
  /** Open a fresh new-booking screen. */
  onStartNext: (carry: NextBookingCarry) => void;
  onCarryTaken: () => void;
};

function WorkspaceScreen({ carry, onCreated, onStartNext, onCarryTaken }: WorkspaceScreenProps) {
  const { journeyId: routeJourneyId = '', documentId } = useParams();
  const [search, setSearch] = useSearchParams();
  // ?resolveSku=1: arrived from a rejected closest-match suggestion -- open
  // the model picker straight away (once).
  const resolveSku = search.get('resolveSku') === '1';
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
  const isNew = routeJourneyId === NEW_BOOKING_ROUTE && !createdJourneyId;
  const journeyId = createdJourneyId ?? (routeJourneyId === NEW_BOOKING_ROUTE ? '' : routeJourneyId);
  // "Start next booking" keeps the outlet of the booking the PC was on.
  const [outletId, setOutletId] = useState(() => (
    carry?.outletId && outlets.some((outlet) => outlet.outletId === carry.outletId)
      ? carry.outletId
      : workingOutletId || outlets[0]?.outletId || ''));
  // A fresh screen per booking (see workspaceSession): a new key, so a new Journey.
  const [idempotencyKey] = useState(newBookingIdempotencyKey);
  const creating = useRef<Promise<string> | null>(null);
  // This screen created the Journey; its first upload is announced once.
  const createdHere = useRef(false);
  const createdAnnounced = useRef(false);
  const [createdNotice, setCreatedNotice] = useState(false);
  // Files "Start new booking with this file" brought: uploaded straight away,
  // or once the PC has chosen the outlet when they work several.
  const [carriedFiles, setCarriedFiles] = useState(carry?.files);
  const carriedSent = useRef(false);
  const tookCarry = useRef(Boolean(carry));
  const replaceInput = useRef<HTMLInputElement>(null);
  const uploadPanel = useRef<P2UploadPanelHandle>(null);
  const [replaceTarget, setReplaceTarget] = useState<string>();
  const [removeTarget, setRemoveTarget] = useState<string>();
  // A refused or failed page to take off the booking (2026-10-21).
  const [removePage, setRemovePage] = useState<{ queueId: string; label: string }>();
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string }>();
  const [busyKey, setBusyKey] = useState<string>();
  const [dialog, setDialog] = useState<'loan' | 'sku'>();
  useEffect(() => {
    if (!resolveSku || !journeyId) return;
    setDialog('sku');
    const next = new URLSearchParams(search);
    next.delete('resolveSku');
    setSearch(next, { replace: true });
  }, [resolveSku, journeyId, search, setSearch]);
  const operatingRole = useProjectContextStore((s) => s.selectedProject?.operatingRole);
  // Reading a page again replaces its values with Document Intelligence's own,
  // so any hand-made correction on it is lost and has to be redone. The
  // warning is asked for first and only raised when there is something to
  // lose: a dialogue that always appears is one people learn to click through.
  const [rereadConfirm, setRereadConfirm] = useState<{
    queueId: string;
    modifiedFieldCount: number;
  }>();
  const enabled = Boolean(tenantId && journeyId && accessToken);

  const documents = useQuery({
    queryKey: ['p2-documents', tenantId, journeyId],
    queryFn: () => getP2Documents(tenantId!, journeyId, accessToken),
    enabled,
    staleTime: 3_000,
  });
  // A file uploaded through the old capture screen went to DI as ONE
  // document; it can be split into pages here without uploading it again.
  const oldScreen = useQuery({
    queryKey: ['p2-old-screen-documents', tenantId, journeyId],
    queryFn: () => getP2OldScreenDocuments(tenantId!, journeyId, accessToken),
    enabled,
    staleTime: 30_000,
  });
  const splitOldScreen = useMutation({
    mutationFn: (documentId: string) => splitP2OldScreenDocument(tenantId!, journeyId, documentId, accessToken),
    onSuccess: () => {
      setNotice({ tone: 'success', text: 'The file is being split into pages and read page by page. Nothing needs to be uploaded again.' });
      void queryClient.invalidateQueries({ queryKey: ['p2-old-screen-documents', tenantId, journeyId] });
      refresh();
    },
    onError: (cause) => setNotice({ tone: 'error', text: errorText(cause, 'The file could not be split into pages.') }),
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
  // A page rejected at upload (scan quality) or failed has no document to
  // open: say so instead of "Document was not found" (product owner
  // 2026-10-20, arriving from a task).
  const selectedFailure = useMemo(() => {
    if (!documentId) return null;
    const row = rows.find((r) => r.documentId === documentId);
    if (!row) return null;
    const state = row.health?.state;
    const failed = state === 'REJECTED' || state === 'FAILED' || ['FAILED', 'DEAD_LETTER'].includes(row.status);
    if (!failed) return null;
    return {
      rejected: state === 'REJECTED',
      name: row.name,
      where: row.subtitle,
      reason: row.reason || (state === 'REJECTED' ? 'The scan-quality check rejected it.' : 'Reading it failed.'),
      queueId: removablePage(row) ? row.unit!.queueId : undefined,
    };
  }, [documentId, rows]);
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
      // The PC's real name comes from Security at the moment of creation (the sign-in session
      // only knows the email). If it cannot be read the journey is still created, unnamed.
      creating.current ??= (async () => {
        const knownName = accessToken
          ? await queryClient.fetchQuery({
              queryKey: ['my-display-name'],
              queryFn: async () => (await getMyDisplayName(accessToken)) ?? null,
              staleTime: 5 * 60_000,
            })
          : null;
        if (!knownName) queryClient.removeQueries({ queryKey: ['my-display-name'] });
        const createdByName = knownName ?? undefined;
        const result = await createP2Journey(tenantId!, { outletId, createdByName }, idempotencyKey, accessToken);
        return result.journeyId;
      })();
      try {
        target = await creating.current;
      } catch (cause) {
        creating.current = null;
        throw cause;
      }
      createdHere.current = true;
      onCreated(target);
      setCreatedJourneyId(target);
      navigate(`/p2/journeys/${target}/documents${tab === 'photos' ? '?tab=photos' : ''}`, { replace: true });
      void queryClient.invalidateQueries({ queryKey: ['p2-journeys', tenantId] });
    }
    return target;
  }, [accessToken, idempotencyKey, journeyId, navigate, onCreated, outletId, queryClient, tab, tenantId]);

  const getTransport = useCallback(async () => {
    const target = await ensureJourney();
    return { journeyId: target, transport: p2UploadTransport(tenantId ?? '', target, accessToken) };
  }, [accessToken, ensureJourney, tenantId]);

  // An upload finishes after the screen has become the booking it created:
  // refresh that booking, not the one the upload started on.
  const refreshLatest = useRef(refresh);
  refreshLatest.current = refresh;
  const onAccepted = useCallback(() => {
    refreshLatest.current();
    if (createdHere.current && !createdAnnounced.current) {
      createdAnnounced.current = true;
      setCreatedNotice(true);
    }
  }, []);

  // The booking's reference and customer, for the banner. The documents read
  // names the customer once Audit Core sends it (2026-10-31); until then the
  // Journey 360 summary does, asked again while pages are still being read.
  const documentsNameCustomer = documents.data?.customerName !== undefined;
  const summary = useQuery({
    queryKey: ['p2-360', tenantId, journeyId, 'summary'],
    queryFn: () => getP2Journey360(tenantId!, journeyId, accessToken),
    enabled,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    retry: 1,
    refetchInterval: (query) => (
      !documentsNameCustomer && inFlight && !customerIsNamed(query.state.data?.journey.customerName) ? 30_000 : false),
  });
  const summaryCustomer = summary.data?.journey.customerName;
  const refetchSummary = summary.refetch;
  const customerName = documentsNameCustomer ? documents.data?.customerName : summaryCustomer;
  const reference = summary.data?.journey.reference ?? null;
  const wasInFlight = useRef(inFlight);
  useEffect(() => {
    // The last page has been read: ask once more who the customer is.
    if (wasInFlight.current && !inFlight && !documentsNameCustomer && !customerIsNamed(summaryCustomer)) void refetchSummary();
    wasInFlight.current = inFlight;
  }, [documentsNameCustomer, inFlight, refetchSummary, summaryCustomer]);
  const knownNames = useMemo(() => bookingKnownNames(documents.data, customerName), [customerName, documents.data]);

  // Starting bookings is the PC's (as "Capture New Booking" is).
  const startsBookings = operatingRole === 'PC';
  // Files still being sent would be left unwatched by a new screen (a failed
  // one could no longer be retried): the next booking opens once they are
  // received, and not if one fails until the PC has seen it.
  const [uploads, setUploads] = useState<P2UploadActivity>({ sending: false, failed: 0 });
  const [waitingToStart, setWaitingToStart] = useState<{ carry: NextBookingCarry; failedBefore: number; blocked?: boolean }>();
  const startNext = (files?: File[]) => {
    // The outlet of the booking the PC is on: the one chosen here, or the
    // booking's own when it was opened from the list.
    const bookingOutlet = createdHere.current
      ? outletId
      : outlets.find((outlet) => outlet.outletName === summary.data?.journey.outletName)?.outletId ?? outletId;
    const next = { files, outletId: bookingOutlet };
    if (uploads.sending) setWaitingToStart({ carry: next, failedBefore: uploads.failed });
    else onStartNext(next);
  };
  useEffect(() => {
    if (!waitingToStart || uploads.sending) return;
    if (uploads.failed > waitingToStart.failedBefore) {
      if (!waitingToStart.blocked) setWaitingToStart({ ...waitingToStart, blocked: true });
      return;
    }
    setWaitingToStart(undefined);
    onStartNext(waitingToStart.carry);
  }, [onStartNext, uploads, waitingToStart]);
  const choosesOutlet = isNew && outlets.length > 1;
  useEffect(() => {
    // Once, for what this screen was opened with.
    if (tookCarry.current) onCarryTaken();
  }, []);
  useEffect(() => {
    if (!carriedFiles?.length || carriedSent.current || !isNew || choosesOutlet || !tenantId) return;
    carriedSent.current = true;
    uploadPanel.current?.addFiles(carriedFiles);
    setCarriedFiles(undefined);
  }, [carriedFiles, choosesOutlet, isNew, tenantId]);

  const switchTab = (next: 'documents' | 'photos') => {
    const params = new URLSearchParams(search);
    if (next === 'photos') params.set('tab', 'photos'); else params.delete('tab');
    setSearch(params, { replace: true });
  };

  const openDocument = (id: string) => navigate(`/p2/journeys/${journeyId}/documents/${id}`);
  const closeDocument = () => navigate(`/p2/journeys/${journeyId}/documents`);

  const reread = useMutation({
    mutationFn: (queueId: string) => rereadP2Page(tenantId!, journeyId, queueId, accessToken),
    onMutate: (queueId) => setBusyKey(queueId),
    onSettled: () => setBusyKey(undefined),
    onSuccess: () => { setNotice({ tone: 'success', text: 'Document Intelligence is asked to read this page again. Nothing is uploaded again.' }); refresh(); },
    onError: (cause) => setNotice({ tone: 'error', text: errorText(cause, 'The page could not be sent for reading again.') }),
  });

  /** Ask what a re-read would cost before doing it; warn only if it costs something. */
  const requestReread = async (queueId: string) => {
    setNotice(undefined);
    if (!tenantId || !journeyId) return;
    try {
      const preview = await getResyncPreview(tenantId, journeyId, queueId, accessToken);
      if (preview.modifiedFieldCount > 0) {
        setRereadConfirm({ queueId, modifiedFieldCount: preview.modifiedFieldCount });
        return;
      }
    } catch {
      // If the preview cannot be read, fall through: the server still refuses
      // a reviewed stage, so the worst case is a re-read with no warning
      // rather than a blocked action.
    }
    reread.mutate(queueId);
  };
  const restore = useMutation({
    mutationFn: (evidenceId: string) => restoreP2DocumentCopy(tenantId!, journeyId, evidenceId, accessToken),
    onMutate: (evidenceId) => setBusyKey(rows.find((row) => row.evidenceId === evidenceId)?.key),
    onSettled: () => setBusyKey(undefined),
    onSuccess: () => { setNotice({ tone: 'success', text: 'The earlier copy is in use again; the newer one is kept as replaced.' }); refresh(); },
    onError: (cause) => setNotice({ tone: 'error', text: errorText(cause, 'The copy could not be restored.') }),
  });
  const retry = useMutation({
    mutationFn: (queueId: string) => retryP2Page(tenantId!, journeyId, queueId, accessToken),
    onMutate: (queueId) => setBusyKey(queueId),
    onSettled: () => setBusyKey(undefined),
    onSuccess: () => { setNotice({ tone: 'success', text: 'Sent for processing again.' }); refresh(); },
    onError: (cause) => setNotice({ tone: 'error', text: errorText(cause, 'The page could not be retried.') }),
  });
  const setType = useMutation({
    mutationFn: ({ queueId, templateKey, name }: { queueId: string; templateKey: string; name?: string }) =>
      setP2PageType(tenantId!, journeyId, queueId, templateKey, accessToken, name),
    onSuccess: (_result, { templateKey, name }) => {
      setNotice({ tone: 'success', text: templateKey === OTHER_DOCUMENT_TEMPLATE
        ? `Kept as Others (${name}). It stays on file under that name and is not read.`
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

  const removePageMutation = useMutation({
    mutationFn: ({ queueId, reason }: { queueId: string; reason: string }) =>
      removeP2Page(tenantId!, journeyId, queueId, reason, accessToken),
    onSuccess: () => {
      setRemovePage(undefined);
      setNotice({ tone: 'success', text: 'Page removed from the booking. Its task closes; it stays in the audit history.' });
      closeDocument();
      refresh();
    },
    onError: (cause) => setNotice({ tone: 'error', text: errorText(cause, 'The page could not be removed.') }),
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
      <BackLink
        fallbackTo={journeyId
          ? `/p2/journeys/${journeyId}/overview`
          : operatingRole === 'REVIEWER' ? '/p2/review' : '/p2/bookings'}
        fallbackLabel={journeyId
          ? 'Journey 360'
          : operatingRole === 'REVIEWER' ? 'Document Review' : 'Booking & Delivery'} />
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
            {!isNew && tenantId && operatingRole === 'REVIEWER' ? (
              <P2CompleteDeliveryButton tenantId={tenantId} journeyId={journeyId} accessToken={accessToken}
                onDone={(text, tone) => { setNotice({ text, tone }); refresh(); }} />
            ) : null}
            {!isNew ? <button type="button" className="p2w-button p2w-button--secondary" onClick={() => setDialog('loan')}>Loan amount</button> : null}
            {!isNew ? <button type="button" className="p2w-button p2w-button--secondary" onClick={() => setDialog('sku')}>Resolve SKU</button> : null}
            {!isNew ? <Link className="p2w-button p2w-button--secondary" to={`/p2/journeys/${journeyId}/compliance-report`}>View compliance report</Link> : null}
          </div>
        )}
      />

      {isNew && outlets.length > 1 ? (
        <section className="p2w-start" aria-label="Start booking">
          <fieldset className="p2w-start__outlets">
            <legend>Which outlet is this booking for?</legend>
            {sortByName(outlets, (o) => o.outletName).map((outlet) => (
              <label key={outlet.outletId} className="p2w-start__outlet">
                <input type="radio" name="booking-outlet" value={outlet.outletId}
                  checked={outletId === outlet.outletId} onChange={() => setOutletId(outlet.outletId)} />
                <span>{outlet.outletName}</span>
              </label>
            ))}
          </fieldset>
          {carriedFiles?.length ? (
            <div className="p2w-choice p2w-choice--guard" role="group" aria-label="Upload the file to this new booking">
              <span>
                {carriedFiles.length === 1 ? `“${carriedFiles[0].name}” is ready` : `${carriedFiles.length} files are ready`} for
                this new booking. Check the outlet, then upload.
              </span>
              <div>
                <button type="button" className="p2w-button p2w-button--primary" onClick={() => {
                  carriedSent.current = true;
                  uploadPanel.current?.addFiles(carriedFiles);
                  setCarriedFiles(undefined);
                }}>
                  Upload to this booking
                </button>
                <button type="button" className="p2w-button p2w-button--ghost" onClick={() => setCarriedFiles(undefined)}>
                  Do not upload
                </button>
              </div>
            </div>
          ) : <p>The booking is created as soon as you add the first document.</p>}
        </section>
      ) : null}

      {!isNew && journeyId ? (
        <P2BookingBanner reference={reference} customerName={customerName} starting={Boolean(waitingToStart)}
          onStartNext={startsBookings ? () => startNext() : undefined} />
      ) : null}
      {waitingToStart ? (
        <div className={`p2w-alert p2w-alert--next${waitingToStart.blocked ? ' p2w-alert--error' : ''}`} role="status">
          <span>
            {waitingToStart.blocked
              ? 'A file of this booking did not upload. Retry it below; the next booking opens once it is received.'
              : 'The next booking opens as soon as the files below are received.'}
          </span>
          {waitingToStart.blocked ? (
            <button type="button" className="p2w-button p2w-button--secondary" onClick={() => {
              const { carry: next } = waitingToStart;
              setWaitingToStart(undefined);
              onStartNext(next);
            }}>Start next booking anyway</button>
          ) : null}
          <button type="button" className="p2w-link" onClick={() => setWaitingToStart(undefined)}>Cancel</button>
        </div>
      ) : null}
      {createdNotice && startsBookings && !isNew && !waitingToStart ? (
        <P2BookingCreatedNotice reference={reference}
          onStartNext={() => startNext()} onDismiss={() => setCreatedNotice(false)} />
      ) : null}
      {!isNew ? <P2ForeignFileNotices files={documents.data?.files} /> : null}

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
          <span>{retrying.length === 1 ? 'One page' : `${retrying.length} pages`} could not be processed just now and will be retried automatically over the next few hours (15, 30, 60 and 120 minutes apart). You can leave this page and check back later.</span>
        </div>
      ) : null}
      {failed.length && !isNew ? (
        <div className="p2w-alert p2w-alert--stack" role="status">
          <span>
            <strong>{failed.length === 1 ? 'One page' : `${failed.length} pages`} could not be processed:</strong> {failedSummary(failed)}.
            {' '}Your task says which pages to upload again. <Link className="p2w-link" to={`/p2/journeys/${journeyId}/tasks?tab=DOCUMENTS&open=PC_UPLOAD_STATUS,PC_PAGE_QUALITY_REJECTED`}>Open the task</Link>
          </span>
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
        <P2UploadStatus counts={documents.data?.counts} rows={rows} live={live.connected} health={documents.data?.documentHealth}
          processing={processing.map((row) => ({ key: row.key, name: row.name === 'Identifying document…' ? row.subtitle : row.name, status: row.status }))} />
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
          {operatingRole === 'REVIEWER' && tenantId && journeyId ? (
            <P2StageReviewPanel
              tenantId={tenantId}
              journeyId={journeyId}
              accessToken={accessToken}
              onMarked={refresh}
            />
          ) : null}
          {rereadConfirm ? (
            <div className="p2w-review">
              <strong>
                Reading this page again will erase {rereadConfirm.modifiedFieldCount}{' '}
                corrected {rereadConfirm.modifiedFieldCount === 1 ? 'value' : 'values'}
              </strong>
              <p className="p2w-muted">
                Document Intelligence&apos;s own reading replaces what is stored, so those
                corrections will need to be made again afterwards.
              </p>
              <div className="p2w-row" style={{ gap: 8 }}>
                <button
                  type="button"
                  className="uc02-button uc02-button--primary"
                  onClick={() => {
                    const target = rereadConfirm.queueId;
                    setRereadConfirm(undefined);
                    reread.mutate(target);
                  }}
                >
                  Read again anyway
                </button>
                <button type="button" className="uc02-button" onClick={() => setRereadConfirm(undefined)}>
                  Keep the corrections
                </button>
              </div>
            </div>
          ) : null}
          {tenantId ? (
            <>
              {(oldScreen.data?.documents ?? []).map((doc) => (
                <div key={doc.documentId} className="p2w-alert" role="status">
                  <span>
                    <strong>{doc.filename || 'A file'}</strong> came in through the old screen and was read as one document,
                    so only one page was read. Split it into pages to read every page.
                  </span>
                  <button type="button" className="p2w-button p2w-button--primary" disabled={splitOldScreen.isPending}
                    onClick={() => splitOldScreen.mutate(doc.documentId)}>
                    {splitOldScreen.isPending ? 'Splitting…' : 'Split into pages'}
                  </button>
                </div>
              ))}
              <P2UploadPanel ref={uploadPanel} journeyId={journeyId || undefined} getTransport={getTransport} onAccepted={onAccepted}
                knownNames={knownNames} onStartNewWith={startsBookings ? (files) => startNext(files) : undefined}
                onActivity={setUploads} />
            </>
          ) : null}
          {!isNew && documents.isLoading ? <div className="p2w-skeleton" aria-busy="true">Loading documents…</div> : (
            <P2DocumentList
              rows={rows}
              checklist={isNew ? expectedChecklist : (documents.data?.checklist ?? [])}
              templates={templates.data?.templates ?? []}
              selectedDocumentId={documentId}
              onOpen={openDocument}
              onRetry={(queueId) => retry.mutate(queueId)}
              onReread={(queueId) => void requestReread(queueId)}
              onRestore={(evidenceId) => restore.mutate(evidenceId)}
              onSetType={(queueId, templateKey, name) => setType.mutate({ queueId, templateKey, name })}
              onAdd={() => uploadPanel.current?.openFiles()}
              onRemovePage={(queueId, label) => setRemovePage({ queueId, label })}
              busyKey={busyKey}
            />
          )}
        </div>
        <div className="p2w-layout__editor">
          {selectedFailure ? (
            <div className="p2w-editor-placeholder p2w-editor-rejected" role="status">
              <strong>{selectedFailure.rejected ? 'This page was rejected at upload' : 'This page could not be read'}</strong>
              <span>{selectedFailure.name} · {selectedFailure.where}</span>
              <span>{selectedFailure.reason}</span>
              <span>Nothing was read from it, so there are no values to check. Upload the page again{selectedFailure.rejected ? ' as a clear, well-lit scan' : ''}.</span>
              <div className="p2w-editor-rejected__actions">
                <button type="button" className="p2w-button p2w-button--primary" onClick={() => uploadPanel.current?.openFiles()}>Upload again</button>
                {selectedFailure.queueId ? (
                  <button type="button" className="p2w-button p2w-button--danger"
                    onClick={() => setRemovePage({ queueId: selectedFailure.queueId!, label: selectedFailure.where || selectedFailure.name })}>
                    Remove this page
                  </button>
                ) : null}
                <button type="button" className="p2w-button p2w-button--secondary" onClick={closeDocument}>Close</button>
              </div>
            </div>
          ) : documentId && tenantId ? (
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
              onProposed={() => { setNotice({ tone: 'success', text: 'Vehicle updated. See the popup for what happens next.' }); refresh(); }} />
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
      {removePage ? (
        <RemovePageDialog pageLabel={removePage.label} busy={removePageMutation.isPending}
          onCancel={() => setRemovePage(undefined)}
          onConfirm={(reason) => removePageMutation.mutate({ queueId: removePage.queueId, reason })} />
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

/**
 * The Booking & Delivery documents screen. Each booking gets a screen of its
 * own (2026-10-31): a new booking and an existing one share this route, and
 * one screen kept across them stayed on the booking it had created after the
 * address changed, so the next customer's files went into it.
 */
export default function P2JourneyWorkspacePage() {
  const { journeyId: route = '' } = useParams();
  const navigate = useNavigate();
  const [session, setSession] = useState(() => openSession(route));
  const current = followRoute(session, route);
  if (current !== session) setSession(current);

  const onStartNext = useCallback((carry: NextBookingCarry) => {
    setSession((latest) => startNextBooking(followRoute(latest, route), carry, route));
    if (route !== NEW_BOOKING_ROUTE) navigate(P2_NEW_BOOKING_PATH);
  }, [navigate, route]);
  const onCreated = useCallback((journeyId: string) => setSession((latest) => journeyCreated(latest, journeyId)), []);
  const onCarryTaken = useCallback(() => setSession(carryTaken), []);

  return (
    <WorkspaceScreen key={current.key} carry={current.carry}
      onCreated={onCreated} onStartNext={onStartNext} onCarryTaken={onCarryTaken} />
  );
}
