import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';

import PageHeader from '../components/PageHeader';
import { DocumentCard, RequirementChecklistRow } from '../features/uc03/CaptureDocumentCard';
import type { BookingWorkspace } from '../services/audit-core/uc03Booking';
import { getBookingWorkspace, startBooking } from '../services/audit-core/uc03Booking';
import { createBooking } from '../services/audit-core/uc03CreateBooking';
import { submitSimplifiedBookingV2 } from '../services/audit-core/uc03BookingV2';
import {
  captureV2HasPendingClassification,
  deleteBookingCaptureV2Document,
  getBookingCaptureV2,
  resyncBookingCaptureV2,
  type CaptureV2Document,
  type CaptureV2Requirement,
} from '../services/audit-core/uc03DocumentCaptureV2';
import { deleteDeliveryCaptureV2Document, getDeliveryCaptureV2 } from '../services/audit-core/uc03DeliveryCaptureV2';
import { reconcileUnifiedDocuments, uploadUnifiedCaptureFiles } from '../services/audit-core/uc03UnifiedDocumentCapture';
import { useProjectContextStore } from '../store/projectContextStore';
import { useSessionStore } from '../store/sessionStore';
import '../styles/uc03-document-capture-v2.css';
import '../styles/uc03-document-capture-v2-compact.css';
// The hero's upload buttons deliberately reuse .uc03-delivery-v2-upload-button
// (styled globally via uc03-delivery-v2-capture-hotfix.css, loaded in
// main.tsx) rather than duplicating the same button chrome under a new name.
import '../styles/uc03-booking-capture-cards.css';

const CAPTURE_STALE_MS = 3_000;
const CAPTURE_POLL_MS = 1_000;
const IDENTITY_MARKERS = ['PAN', 'AADHAAR', 'AADHAR'];

function formatElapsed(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
  const seconds = Math.max(0, totalSeconds % 60).toString().padStart(2, '0');
  return `${minutes}:${seconds}`;
}

function searchableRequirement(requirement: CaptureV2Requirement): string {
  return `${requirement.documentTypeKey} ${requirement.requirementKey} ${requirement.label}`.toUpperCase();
}

function isIdentityRequirement(requirement: CaptureV2Requirement): boolean {
  const searchable = searchableRequirement(requirement);
  return IDENTITY_MARKERS.some((marker) => searchable.includes(marker));
}

function isBookingFormRequirement(requirement: CaptureV2Requirement): boolean {
  const searchable = searchableRequirement(requirement);
  return searchable.includes('BOOKING') && (searchable.includes('FORM') || searchable.includes('DOCKET'));
}

function hasClassificationInFlight(documents: CaptureV2Document[]): boolean {
  return documents.some((document) => {
    const state = document.state.toUpperCase();
    return state === 'RECEIVING'
      || state === 'STORED'
      || state === 'CLASSIFYING'
      || (state === 'CLASSIFIED' && !document.classifiedDocumentTypeKey);
  });
}

function newBookingWorkspace(
  journeyId: string,
  businessStatus: string,
  aggregateVersion: number,
): BookingWorkspace {
  return {
    journeyId,
    bookingStage: {
      businessStatus,
      closureDisposition: null,
      auditState: 'NOT_STARTED',
      auditStatus: 'NOT_EVALUATED',
      closeReasonCode: null,
      closureRemarks: null,
    },
    capture: {},
    documents: [],
    proposals: [],
    flags: [],
    completion: { ready: false, blockers: [] },
    processingSummary: { pendingCount: 0, failedCount: 0, readyProposalCount: 0 },
    flagSummary: { openCount: 0, totalCount: 0 },
    permittedActions: [],
    aggregateVersion,
    operatingRole: 'PC',
  };
}

export default function BookingCaptureV2CompactPage() {
  const { journeyId: routeJourneyId } = useParams<{ journeyId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const project = useProjectContextStore((state) => state.selectedProject);
  const accessToken = useSessionStore((state) => state.accessToken);
  const outletId = useSessionStore((state) => state.outletId);

  const [startBusy, setStartBusy] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [activeUploadBatches, setActiveUploadBatches] = useState(0);
  const [busyDocumentId, setBusyDocumentId] = useState<string>();
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [checklistOpen, setChecklistOpen] = useState(false);
  const [resyncing, setResyncing] = useState(false);
  const readinessStartedAt = useRef<number | undefined>(undefined);

  // -- New Booking creation, folded into this same screen --------------------
  // /v2/bookings/new and /v2/bookings/:journeyId both render this exact
  // component (see App.tsx) so "Capture New Booking" never swaps to a
  // different screen or component while the Journey is created: the upload
  // screen's own shell (header, upload buttons) is on screen the instant the
  // route loads. journeyId itself resolves a moment later via
  // history.replaceState (a plain browser API, not a router navigation) so
  // nothing here unmounts or remounts when it does.
  const [createdJourneyId, setCreatedJourneyId] = useState<string>();
  const [creatingError, setCreatingError] = useState<string>();
  const creationStarted = useRef(false);
  const journeyId = routeJourneyId ?? createdJourneyId;

  const selectedOutlet = useMemo(
    () => project?.scope.outlets.find((outlet) => outlet.outletId === outletId),
    [outletId, project?.scope.outlets],
  );

  useEffect(() => {
    if (routeJourneyId || creationStarted.current) return;
    if (!project || !outletId || !accessToken || !selectedOutlet) return;
    creationStarted.current = true;
    setCreatingError(undefined);
    createBooking(project.tenantId, outletId, accessToken)
      .then((result) => {
        queryClient.setQueryData<BookingWorkspace>(
          ['uc03-booking-workspace', project.tenantId, result.journeyId],
          newBookingWorkspace(result.journeyId, result.businessStatus, result.aggregateVersion),
        );
        window.history.replaceState(null, '', `/v2/bookings/${result.journeyId}`);
        setCreatedJourneyId(result.journeyId);
      })
      .catch((cause: unknown) => {
        creationStarted.current = false;
        setCreatingError(cause instanceof Error ? cause.message : 'The Booking could not be started.');
      });
    // Runs once for the resolved working context; re-checking on every
    // keystroke-level dependency change would risk a second Journey.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeJourneyId, project?.tenantId, outletId, accessToken, selectedOutlet?.outletId]);
  // ---------------------------------------------------------------------------

  const enabled = Boolean(project?.tenantId && journeyId && accessToken);
  const captureKey = ['uc03-document-capture-v2', project?.tenantId, journeyId] as const;

  const workspaceQuery = useQuery({
    queryKey: ['uc03-booking-workspace', project?.tenantId, journeyId],
    queryFn: () => getBookingWorkspace(project!.tenantId, journeyId!, accessToken),
    enabled,
    refetchOnWindowFocus: false,
    staleTime: CAPTURE_STALE_MS,
  });
  const started = Boolean(workspaceQuery.data?.bookingStage.businessStatus);

  const captureQuery = useQuery({
    queryKey: captureKey,
    queryFn: () => getBookingCaptureV2(project!.tenantId, journeyId!, accessToken),
    enabled: enabled && started,
    refetchOnWindowFocus: false,
    staleTime: CAPTURE_STALE_MS,
    refetchInterval: (query) => captureV2HasPendingClassification(query.state.data) ? CAPTURE_POLL_MS : false,
  });

  // Read-only for this screen's own checklist: a Delivery-relevant file
  // dropped here already dispatches correctly via the unified upload path
  // (see handleUpload below) -- this query exists only so the checklist can
  // show what Delivery still needs too, segregated from Booking's own list,
  // instead of looking Booking-only when both stages' documents can land here.
  const deliveryCaptureQuery = useQuery({
    queryKey: ['uc03-booking-v2-delivery-checklist', project?.tenantId, journeyId],
    queryFn: () => getDeliveryCaptureV2(project!.tenantId, journeyId!, accessToken),
    enabled,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const capture = captureQuery.data;
  const deliveryCapture = deliveryCaptureQuery.data;
  // Every upload lands here regardless of which stage it's ultimately
  // classified into (see the unified upload path) -- this must cover both
  // capture.uploads (Booking) and deliveryCapture.uploads (Delivery), or a
  // document the system correctly routed to Delivery silently vanished
  // from every count and classification check on this screen.
  const allUploads = [...(capture?.uploads ?? []), ...(deliveryCapture?.uploads ?? [])];
  const uploading = activeUploadBatches > 0;
  const classificationInFlight = hasClassificationInFlight(allUploads);
  const busy = Boolean(busyDocumentId);
  // 2026-09-14: reversed from the earlier "submit while classification is
  // still running in the background" design at the user's explicit request
  // -- a PC must now wait for every uploaded document to finish classifying
  // before Submit is clickable. Accepted tradeoff: a slow or failing
  // extraction (e.g. a Gemini provider timeout) now blocks Submit until it
  // resolves, rather than letting the PC move on and review later.
  const canProceed = Boolean(capture) && !uploading && !busy && !submitting && !classificationInFlight;

  const identityRequirements = useMemo(
    () => capture?.requirements.filter(isIdentityRequirement) ?? [],
    [capture],
  );
  const identitySatisfied = identityRequirements.some((item) => Boolean(item.document));

  const mandatoryDocuments = useMemo(
    () => capture?.requirements.filter((item) => item.requirementLevel === 'REQUIRED' && !isIdentityRequirement(item)) ?? [],
    [capture],
  );
  const bookingFormDocuments = mandatoryDocuments.filter(isBookingFormRequirement);
  const otherMandatoryDocuments = mandatoryDocuments.filter((item) => !isBookingFormRequirement(item));
  const expectedDocuments = [...bookingFormDocuments, ...otherMandatoryDocuments];

  const deliveryIdentityRequirements = useMemo(
    () => deliveryCapture?.requirements.filter(isIdentityRequirement) ?? [],
    [deliveryCapture],
  );
  const deliveryIdentitySatisfied = deliveryIdentityRequirements.some((item) => Boolean(item.document));
  const deliveryExpectedDocuments = useMemo(
    () => deliveryCapture?.requirements.filter((item) => item.requirementLevel === 'REQUIRED' && !isIdentityRequirement(item)) ?? [],
    [deliveryCapture],
  );

  const auditObservations = useMemo(() => {
    if (!capture) return [] as Array<{ key: string; text: string; target?: string }>;
    const items: Array<{ key: string; text: string; target?: string }> = [];
    const gstApplicable = capture.declarations.find((item) => item.conditionKey === 'gstApplicable')?.applicable;
    const corporateCustomer = capture.declarations.find((item) => item.conditionKey === 'corporateCustomer')?.applicable;

    if (gstApplicable && corporateCustomer) {
      items.push({
        key: 'gst-corporate-conflict',
        text: 'GST and Corporate evidence both appear in this Booking. The Booking can continue; this will be highlighted for audit review.',
      });
    }

    const missingRequired = capture.requirements.filter(
      (requirement) => requirement.requirementLevel === 'REQUIRED' && !requirement.document,
    );
    const missingIdentity = identityRequirements.length > 0 && !identitySatisfied;
    let identityAdded = false;

    for (const requirement of missingRequired) {
      if (isIdentityRequirement(requirement)) {
        if (!identityAdded && missingIdentity) {
          items.push({
            key: 'identity-missing',
            text: 'Customer ID has not been uploaded. You can continue; missing evidence will be flagged for audit.',
            target: 'identity-document-group',
          });
          identityAdded = true;
        }
        continue;
      }
      items.push({
        key: `missing-${requirement.requirementKey}`,
        text: `${requirement.label} has not been uploaded. You can continue; missing evidence will be flagged for audit.`,
        target: `requirement-${requirement.requirementKey}`,
      });
    }

    return items;
  }, [capture, identityRequirements, identitySatisfied]);

  useEffect(() => {
    if (!started || !capture) return undefined;
    if (readinessStartedAt.current === undefined) readinessStartedAt.current = Date.now();
    const update = () => {
      const startedAt = readinessStartedAt.current ?? Date.now();
      setElapsedSeconds(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
    };
    update();
    const timer = window.setInterval(update, 1_000);
    return () => window.clearInterval(timer);
  }, [capture, started]);

  if (!project) return null;

  // Still resolving a journeyId (Booking being created) with no route param
  // to fall back on, and creation itself failed -- nothing to render a
  // workspace shell against.
  if (!journeyId && creatingError) {
    return (
      <section className="dashboard-load-state" role="alert">
        <div className="dashboard-load-state__mark">!</div>
        <div className="dashboard-load-state__copy">
          <strong>Booking could not be started.</strong>
          <p>{creatingError}</p>
        </div>
        <button
          type="button"
          className="user-menu-button"
          onClick={() => {
            creationStarted.current = false;
            setCreatingError(undefined);
          }}
        >
          Try Again
        </button>
      </section>
    );
  }

  const refresh = async () => {
    await Promise.all([workspaceQuery.refetch(), captureQuery.refetch(), deliveryCaptureQuery.refetch()]);
  };

  const handleStart = async () => {
    const version = workspaceQuery.data?.aggregateVersion;
    if (version === undefined || !journeyId) return;
    setStartBusy(true);
    setError(undefined);
    try {
      await startBooking(project.tenantId, journeyId, version, accessToken);
      await workspaceQuery.refetch();
      readinessStartedAt.current = Date.now();
      setElapsedSeconds(0);
      setMessage('Booking opened. Upload the customer documents available to you.');
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'This Booking could not be started.');
    } finally {
      setStartBusy(false);
    }
  };

  const handleUpload = async (files: File[]) => {
    if (files.length === 0 || !journeyId) return;
    if (readinessStartedAt.current === undefined) readinessStartedAt.current = Date.now();
    setActiveUploadBatches((count) => count + 1);
    setError(undefined);
    setMessage(`Documents uploading · ${files.length} file${files.length === 1 ? '' : 's'}`);
    try {
      // Unified upload path (2026-09-13): this screen is Booking-labeled,
      // but a PC does not always have Booking-only documents in hand at
      // upload time -- the same merged-candidate, classify-then-dispatch
      // endpoint Journey Documents uses means a Delivery-relevant file
      // dropped here still classifies and routes correctly (Delivery
      // auto-starts if needed) instead of being misclassified against a
      // Booking-only candidate list. This screen's own checklist/grid
      // below still shows Booking documents only -- anything dispatched
      // to Delivery appears on Journey Documents' Delivery bucket instead.
      const result = await uploadUnifiedCaptureFiles(project.tenantId, journeyId, files, accessToken);
      try {
        await reconcileUnifiedDocuments(project.tenantId, journeyId, accessToken);
      } catch {
        // Non-fatal -- this screen's own polling will still pick up
        // correct dispatch shortly; the upload itself already succeeded.
      }
      await Promise.all([captureQuery.refetch(), deliveryCaptureQuery.refetch()]);
      setMessage(
        result.failed
          ? `${result.uploaded} of ${result.uploaded + result.failed} file(s) uploaded — ${result.failed} failed, try those again.`
          : 'Documents received. They are being classified and prepared for review.',
      );
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'We could not upload these documents. Please try again.');
      setMessage(undefined);
    } finally {
      setActiveUploadBatches((count) => Math.max(0, count - 1));
    }
  };

  const handleResync = async () => {
    if (!journeyId) return;
    setResyncing(true);
    setError(undefined);
    try {
      const result = await resyncBookingCaptureV2(project.tenantId, journeyId, accessToken);
      setMessage(
        result.documentsResynced > 0
          ? `Rechecking ${result.documentsResynced} document${result.documentsResynced === 1 ? '' : 's'}…`
          : 'Every classified document is already up to date.',
      );
      await Promise.all([captureQuery.refetch(), deliveryCaptureQuery.refetch()]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Booking documents could not be rechecked.');
    } finally {
      setResyncing(false);
    }
  };

  const handleDelete = async (documentId: string) => {
    if (!journeyId) return;
    setBusyDocumentId(documentId);
    setError(undefined);
    try {
      await deleteBookingCaptureV2Document(project.tenantId, journeyId, documentId, accessToken);
      await captureQuery.refetch();
      setMessage('Document removed from this Booking.');
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'We could not remove this document. Please try again.');
    } finally {
      setBusyDocumentId(undefined);
    }
  };

  const handleDeleteDelivery = async (documentId: string) => {
    if (!journeyId) return;
    setBusyDocumentId(documentId);
    setError(undefined);
    try {
      await deleteDeliveryCaptureV2Document(project.tenantId, journeyId, documentId, accessToken);
      await deliveryCaptureQuery.refetch();
      setMessage('Document removed from this Delivery.');
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'We could not remove this document. Please try again.');
    } finally {
      setBusyDocumentId(undefined);
    }
  };

  // 2026-09-13: Review & Submit removed as a separate step -- document
  // completeness alone is now the sole criterion for Booking to finish
  // (see uc03_simplified_booking_flow.py::submit_booking_from_review,
  // relaxed the same day). Confidence review/correction is a permanently
  // available, separate concern on the Journey Documents page, not a
  // precondition for Submit, so there is nothing left for an intermediate
  // Review screen to gate. Submitting now happens directly from here.
  const handleSubmit = async () => {
    const version = workspaceQuery.data?.aggregateVersion;
    if (!canProceed || !journeyId || version === undefined) return;
    setSubmitting(true);
    setError(undefined);
    try {
      await submitSimplifiedBookingV2(project.tenantId, journeyId, version, accessToken);
      navigate(`/journeys/${journeyId}/overview`, { replace: true, state: { bookingSubmitted: true } });
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'Booking could not be submitted. Please try again.');
      await workspaceQuery.refetch();
    } finally {
      setSubmitting(false);
    }
  };

  if (workspaceQuery.isError) {
    return (
      <section className="dashboard-load-state" role="alert">
        <div className="dashboard-load-state__mark">!</div>
        <div className="dashboard-load-state__copy">
          <strong>We couldn't open this Booking.</strong>
          <p>{workspaceQuery.error instanceof Error ? workspaceQuery.error.message : 'Please try again.'}</p>
        </div>
        <button type="button" className="user-menu-button" onClick={() => void refresh()}>Try Again</button>
      </section>
    );
  }

  const workspace = workspaceQuery.data;
  const customerName = workspace ? String(workspace.capture.CUSTOMER_NAME || 'Customer') : 'New Booking';

  // A real, distinct state: an EXISTING Booking that was fetched but hasn't
  // been started (e.g. a stale draft resumed later) -- not the "Capture New
  // Booking" hot path, since a freshly created Booking's businessStatus is
  // already BOOKING_STARTED from the moment createBooking() returns. Kept as
  // its own small screen since starting it is a genuine, separate action.
  if (workspace && !started) {
    return (
      <div className="screen-stack uc03-booking-journey uc03-v2-capture uc03-booking-v2-cards">
        <div className="uc03-c1-topbar">
          <button type="button" className="uc03-c1-back" onClick={() => navigate('/dashboard')}>← Work List</button>
        </div>
        <PageHeader eyebrow="Capture New Booking · V2" title={customerName} description="Step 1 of 2 · Documents" />
        <section className="uc03-c1-start-panel">
          <div><span className="uc03-c1-eyebrow">Booking Journey</span><h2>Start Booking Capture</h2></div>
          <button type="button" className="uc03-c1-primary" disabled={startBusy} onClick={() => void handleStart()}>
            {startBusy ? 'Starting…' : 'Start Booking'}
          </button>
        </section>
      </div>
    );
  }

  // The one real workspace screen -- rendered immediately whether the
  // Journey is still being created, its workspace is still loading, or
  // everything is ready. Upload buttons unblock the moment a journeyId
  // exists (uploading never actually depended on the capture read below);
  // the document list and counters hydrate in place once that read resolves.
  const ready = Boolean(journeyId) && Boolean(workspace) && started;
  const uploadedCount = allUploads.length;
  const classifiedCount = allUploads.filter((item) => item.state.toUpperCase() === 'CLASSIFIED' && item.classifiedDocumentTypeKey).length;
  const extractionReadyCount = allUploads.filter((item) => item.processingStatus?.toUpperCase() === 'PROCESSED').length;
  const mandatoryTotal = expectedDocuments.length + (identityRequirements.length > 0 ? 1 : 0)
    + deliveryExpectedDocuments.length + (deliveryIdentityRequirements.length > 0 ? 1 : 0);
  const mandatoryReceived = expectedDocuments.filter((item) => item.document).length + (identitySatisfied ? 1 : 0)
    + deliveryExpectedDocuments.filter((item) => item.document).length + (deliveryIdentitySatisfied ? 1 : 0);
  const uploadDisabled = !ready || uploading;

  return (
    <div className="screen-stack uc03-booking-journey uc03-v2-capture uc03-booking-v2-cards">
      <div className="uc03-booking-v2-topbar">
        <button type="button" className="uc03-booking-v2-back" onClick={() => navigate('/dashboard')}>← Work List</button>
        {capture && (
          <div className="uc03-booking-v2-topbar__stats">
            <div className="uc03-booking-v2-stat">
              <span>Uploaded</span>
              <strong>{uploadedCount}</strong>
            </div>
            <div className="uc03-booking-v2-stat">
              <span>Classified</span>
              <strong>{classifiedCount}</strong>
            </div>
            <div className={`uc03-booking-v2-stat ${uploadedCount > 0 && extractionReadyCount === uploadedCount ? 'is-ready' : ''}`}>
              <span>Extracted</span>
              <strong>{extractionReadyCount}</strong>
            </div>
          </div>
        )}
        {capture && extractionReadyCount < classifiedCount ? (
          <button
            type="button"
            className="uc03-booking-v2-checklist-toggle"
            disabled={resyncing}
            onClick={() => void handleResync()}
            title="A classified document sometimes finishes extracting after the page already stopped watching it. Recheck picks those up."
          >
            {resyncing ? 'Rechecking…' : 'Recheck documents'}
          </button>
        ) : null}
        {capture && (
          <button
            type="button"
            className="uc03-booking-v2-checklist-toggle"
            aria-expanded={checklistOpen}
            onClick={() => setChecklistOpen((value) => !value)}
          >
            Checklist <em>{mandatoryReceived}/{mandatoryTotal}</em>
          </button>
        )}
        {capture && journeyId ? (
          <button
            type="button"
            className="uc03-booking-v2-checklist-toggle"
            onClick={() => navigate(`/journeys/${journeyId}/documents`)}
          >
            Review / View Scanned Docs
          </button>
        ) : null}
      </div>

      <PageHeader
        eyebrow="Capture New Booking · V2"
        title={customerName}
        description="Upload any document you have for this Journey — Booking or Delivery, whichever is available — Verigence identifies the document type and stage automatically. Submit once every mandatory Booking document is received; correcting any extracted value happens anytime afterward on Journey Documents."
      />

      {message ? <div className="uc03-booking-journey-feedback is-success" role="status">{message}</div> : null}
      {error ? <div className="uc03-booking-journey-feedback is-error" role="alert">{error}</div> : null}

      <section className="uc03-booking-v2-hero">
        <div className="uc03-booking-v2-hero__actions">
          <label className="uc03-delivery-v2-upload-button is-primary" aria-disabled={uploadDisabled}>
            {!ready ? 'Preparing…' : uploading ? 'Uploading…' : 'Choose Files'}
            <input
              className="uc03-delivery-v2-file-input"
              type="file"
              accept="image/*,.pdf"
              multiple
              disabled={uploadDisabled}
              onChange={(event) => {
                const files = Array.from(event.currentTarget.files ?? []);
                event.currentTarget.value = '';
                void handleUpload(files);
              }}
            />
          </label>
          <label className="uc03-delivery-v2-upload-button" aria-disabled={uploadDisabled}>
            Take Photo
            <input
              className="uc03-delivery-v2-file-input"
              type="file"
              accept="image/*"
              capture="environment"
              disabled={uploadDisabled}
              onChange={(event) => {
                const files = Array.from(event.currentTarget.files ?? []);
                event.currentTarget.value = '';
                void handleUpload(files);
              }}
            />
          </label>
        </div>
        <p>Select multiple files together — Verigence identifies each document type in the background.</p>
      </section>

      {captureQuery.isError ? (
        <section className="dashboard-load-state" role="alert">
          <div className="dashboard-load-state__mark">!</div>
          <div className="dashboard-load-state__copy">
            <strong>Booking documents are temporarily unavailable.</strong>
            <p>{captureQuery.error instanceof Error ? captureQuery.error.message : 'Please try again.'}</p>
          </div>
          <button type="button" className="user-menu-button" onClick={() => void captureQuery.refetch()}>Try Again</button>
        </section>
      ) : !capture ? (
        <p className="uc03-doc-card-grid__empty">Preparing the document checklist…</p>
      ) : capture.uploads.length > 0 ? (
        <>
          <p className="uc03-checklist-stage-heading">Booking</p>
          <div className="uc03-doc-card-grid">
            {capture.uploads.map((document, index) => (
              <DocumentCard
                key={document.documentId}
                document={document}
                index={index}
                busy={busyDocumentId === document.documentId}
                onDelete={handleDelete}
              />
            ))}
          </div>
        </>
      ) : (
        <p className="uc03-doc-card-grid__empty">No documents yet — choose files above to get started.</p>
      )}

      {/* A document uploaded here dispatches to whichever stage it's
          classified into (see the unified upload path) -- Delivery's own
          cards must show here too, segregated from Booking's, or a
          correctly-routed Delivery document is invisible on this screen. */}
      {deliveryCapture && deliveryCapture.uploads.length > 0 ? (
        <>
          <p className="uc03-checklist-stage-heading">Delivery</p>
          <div className="uc03-doc-card-grid">
            {deliveryCapture.uploads.map((document, index) => (
              <DocumentCard
                key={document.documentId}
                document={document}
                index={index}
                busy={busyDocumentId === document.documentId}
                onDelete={handleDeleteDelivery}
              />
            ))}
          </div>
        </>
      ) : null}

      {checklistOpen ? (
        <aside className="uc03-capture-checklist-panel" role="dialog" aria-label="Journey document checklist">
          <header>
            <strong>Document checklist</strong>
            <button type="button" onClick={() => setChecklistOpen(false)} aria-label="Close checklist">×</button>
          </header>
          <p>
            These are audit expectations for this Journey&apos;s Booking and its upcoming Delivery — whichever
            documents you have, upload them here. A missing or still-processing document never blocks Continue.
          </p>
          {expectedDocuments.length || identityRequirements.length > 0 ? (
            <>
              <p className="uc03-checklist-stage-heading">Booking</p>
              {expectedDocuments.length ? (
                <section className="uc03-checklist-group">
                  <h3>Expected audit documents <span>{expectedDocuments.length}</span></h3>
                  {expectedDocuments.map((requirement) => (
                    <RequirementChecklistRow key={requirement.requirementKey} requirement={requirement} />
                  ))}
                </section>
              ) : null}
              {identityRequirements.length > 0 ? (
                <section className="uc03-checklist-group" id="identity-document-group">
                  <h3>Customer ID <span>Any one</span></h3>
                  <div className={`uc03-checklist-row ${identitySatisfied ? 'is-received' : ''}`}>
                    <span className="uc03-checklist-row__dot" aria-hidden="true" />
                    <div>
                      <strong>PAN or Aadhaar</strong>
                      <span>Either is sufficient when available</span>
                    </div>
                    <em>{identitySatisfied ? 'Received' : 'Not received'}</em>
                  </div>
                </section>
              ) : null}
            </>
          ) : null}
          {deliveryExpectedDocuments.length || deliveryIdentityRequirements.length > 0 ? (
            <>
              <p className="uc03-checklist-stage-heading">Delivery</p>
              {deliveryExpectedDocuments.length ? (
                <section className="uc03-checklist-group">
                  <h3>Expected audit documents <span>{deliveryExpectedDocuments.length}</span></h3>
                  {deliveryExpectedDocuments.map((requirement) => (
                    <RequirementChecklistRow key={requirement.requirementKey} requirement={requirement} />
                  ))}
                </section>
              ) : null}
              {deliveryIdentityRequirements.length > 0 ? (
                <section className="uc03-checklist-group">
                  <h3>Customer ID <span>Any one</span></h3>
                  <div className={`uc03-checklist-row ${deliveryIdentitySatisfied ? 'is-received' : ''}`}>
                    <span className="uc03-checklist-row__dot" aria-hidden="true" />
                    <div>
                      <strong>PAN or Aadhaar</strong>
                      <span>Either is sufficient when available</span>
                    </div>
                    <em>{deliveryIdentitySatisfied ? 'Received' : 'Not received'}</em>
                  </div>
                </section>
              ) : null}
            </>
          ) : null}
          {expectedDocuments.length === 0 && identityRequirements.length === 0
            && deliveryExpectedDocuments.length === 0 && deliveryIdentityRequirements.length === 0 ? (
            <p className="uc03-checklist-empty">No configured checklist for this Journey.</p>
          ) : null}
        </aside>
      ) : null}

      <section className={`uc03-v2-compact-gate ${canProceed ? 'is-ready' : 'is-blocked'}`}>
        <div className="uc03-v2-compact-gate__copy">
          {!ready ? (
            <>
              <strong>Preparing your Booking…</strong>
              <span>This only takes a moment.</span>
            </>
          ) : uploading || busy ? (
            <>
              <strong>Finishing your current action · {formatElapsed(elapsedSeconds)}</strong>
              <span>Please wait for this upload or update to finish, then continue.</span>
            </>
          ) : classificationInFlight ? (
            <>
              <strong>Documents being classified · {formatElapsed(elapsedSeconds)}</strong>
              <span>Submit unlocks once every uploaded document has finished classifying.</span>
            </>
          ) : auditObservations.length > 0 ? (
            <>
              <strong>Documents received · {formatElapsed(elapsedSeconds)}</strong>
              <span>Some expected evidence is missing or needs audit attention. You can still submit the Booking.</span>
            </>
          ) : (
            <>
              <strong>Documents received · {formatElapsed(elapsedSeconds)}</strong>
              <span>Submit when you are done uploading. Extracted values can be reviewed and corrected anytime afterward on Journey Documents.</span>
            </>
          )}
        </div>

        <button type="button" className="uc03-c1-primary" disabled={!canProceed} onClick={() => void handleSubmit()}>
          {submitting ? 'Submitting…' : 'Submit Booking'}
        </button>
      </section>
    </div>
  );
}
