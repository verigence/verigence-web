import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';

import PageHeader from '../components/PageHeader';
import { DocumentCard, RequirementChecklistRow } from '../features/uc03/CaptureDocumentCard';
import { getBookingWorkspace, startBooking } from '../services/audit-core/uc03Booking';
import { getBookingDetails } from '../services/audit-core/uc03BookingJourney';
import {
  captureV2HasPendingClassification,
  deleteBookingCaptureV2Document,
  getBookingCaptureV2,
  resyncBookingCaptureV2,
  type BookingCaptureV2,
  type CaptureV2Requirement,
  uploadBookingCaptureV2Files,
} from '../services/audit-core/uc03DocumentCaptureV2';
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

function hasClassificationInFlight(capture?: BookingCaptureV2): boolean {
  if (!capture) return false;
  return capture.uploads.some((document) => {
    const state = document.state.toUpperCase();
    return state === 'RECEIVING'
      || state === 'STORED'
      || state === 'CLASSIFYING'
      || (state === 'CLASSIFIED' && !document.classifiedDocumentTypeKey);
  });
}

export default function BookingCaptureV2CompactPage() {
  const { journeyId } = useParams<{ journeyId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const project = useProjectContextStore((state) => state.selectedProject);
  const accessToken = useSessionStore((state) => state.accessToken);

  const [startBusy, setStartBusy] = useState(false);
  const [activeUploadBatches, setActiveUploadBatches] = useState(0);
  const [busyDocumentId, setBusyDocumentId] = useState<string>();
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [checklistOpen, setChecklistOpen] = useState(false);
  const [resyncing, setResyncing] = useState(false);
  const readinessStartedAt = useRef<number | undefined>(undefined);

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

  const capture = captureQuery.data;
  const uploading = activeUploadBatches > 0;
  const classificationInFlight = hasClassificationInFlight(capture);
  const busy = Boolean(busyDocumentId);
  const canProceed = Boolean(capture) && !uploading && !busy;

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

  useEffect(() => {
    if (!enabled || !started || !project?.tenantId || !journeyId) return;
    void import('./BookingDetailsV2Page');
    void queryClient.prefetchQuery({
      queryKey: ['uc03-booking-details', project.tenantId, journeyId],
      queryFn: () => getBookingDetails(project.tenantId, journeyId, accessToken),
      staleTime: 5 * 60_000,
    });
  }, [accessToken, enabled, journeyId, project?.tenantId, queryClient, started]);

  if (!project || !journeyId) return null;

  const refresh = async () => {
    await Promise.all([workspaceQuery.refetch(), captureQuery.refetch()]);
  };

  const handleStart = async () => {
    const version = workspaceQuery.data?.aggregateVersion;
    if (version === undefined) return;
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
    if (files.length === 0) return;
    if (readinessStartedAt.current === undefined) readinessStartedAt.current = Date.now();
    setActiveUploadBatches((count) => count + 1);
    setError(undefined);
    setMessage(`Documents uploading · ${files.length} file${files.length === 1 ? '' : 's'}`);
    try {
      await uploadBookingCaptureV2Files(project.tenantId, journeyId, files, accessToken);
      await captureQuery.refetch();
      setMessage('Documents received. They are being classified and prepared for review.');
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'We could not upload these documents. Please try again.');
      setMessage(undefined);
    } finally {
      setActiveUploadBatches((count) => Math.max(0, count - 1));
    }
  };

  const handleResync = async () => {
    setResyncing(true);
    setError(undefined);
    try {
      const result = await resyncBookingCaptureV2(project.tenantId, journeyId, accessToken);
      setMessage(
        result.documentsResynced > 0
          ? `Rechecking ${result.documentsResynced} document${result.documentsResynced === 1 ? '' : 's'}…`
          : 'Every classified document is already up to date.',
      );
      await captureQuery.refetch();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Booking documents could not be rechecked.');
    } finally {
      setResyncing(false);
    }
  };

  const handleDelete = async (documentId: string) => {
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

  // DEF-01 fix (2026-09-07): navigate to Review, not Details.
  // Approved flow: Documents -> Review & Submit -> Booking Details (C-01, C-02).
  // A modal asking the PC to declare GST/Corporate/Trade-In applicability
  // before continuing added a step with no audit value -- these resolve
  // from evidence (or stay open for audit follow-up) same as any other
  // conditional document, never by gating Continue on a manual answer.
  const handleContinue = () => {
    if (!canProceed) return;
    navigate(`/v2/bookings/${journeyId}/review`);
  };

  if (workspaceQuery.isPending) return <div className="uc03-c1-loading" role="status">Opening Booking…</div>;

  if (workspaceQuery.isError || !workspaceQuery.data) {
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
  const customerName = String(workspace.capture.CUSTOMER_NAME || 'Customer');

  if (!started) {
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

  if (captureQuery.isPending) return <div className="uc03-c1-loading" role="status">Preparing Booking documents…</div>;

  if (captureQuery.isError || !capture) {
    return (
      <section className="dashboard-load-state" role="alert">
        <div className="dashboard-load-state__mark">!</div>
        <div className="dashboard-load-state__copy">
          <strong>Booking documents are temporarily unavailable.</strong>
          <p>{captureQuery.error instanceof Error ? captureQuery.error.message : 'Please try again.'}</p>
        </div>
        <button type="button" className="user-menu-button" onClick={() => void captureQuery.refetch()}>Try Again</button>
      </section>
    );
  }

  const uploadedCount = capture.uploads.length;
  const classifiedCount = capture.uploads.filter((item) => item.state.toUpperCase() === 'CLASSIFIED' && item.classifiedDocumentTypeKey).length;
  const extractionReadyCount = capture.uploads.filter((item) => item.processingStatus?.toUpperCase() === 'PROCESSED').length;
  const mandatoryTotal = expectedDocuments.length + (identityRequirements.length > 0 ? 1 : 0);
  const mandatoryReceived = expectedDocuments.filter((item) => item.document).length + (identitySatisfied ? 1 : 0);

  return (
    <div className="screen-stack uc03-booking-journey uc03-v2-capture uc03-booking-v2-cards">
      <div className="uc03-booking-v2-topbar">
        <button type="button" className="uc03-booking-v2-back" onClick={() => navigate('/dashboard')}>← Work List</button>
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
        {extractionReadyCount < classifiedCount ? (
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
        <button
          type="button"
          className="uc03-booking-v2-checklist-toggle"
          aria-expanded={checklistOpen}
          onClick={() => setChecklistOpen((value) => !value)}
        >
          Checklist <em>{mandatoryReceived}/{mandatoryTotal}</em>
        </button>
      </div>

      <PageHeader
        eyebrow="Capture New Booking · V2"
        title={customerName}
        description="Step 1 of 2 · Upload the Booking documents available to you. Verigence identifies the document type automatically."
      />

      <nav className="uc03-booking-steps" aria-label="Booking capture steps">
        <button type="button" className="is-active" disabled>1 <span>Documents</span></button>
        <button type="button" disabled>2 <span>Review &amp; Submit</span></button>
      </nav>

      {message ? <div className="uc03-booking-journey-feedback is-success" role="status">{message}</div> : null}
      {error ? <div className="uc03-booking-journey-feedback is-error" role="alert">{error}</div> : null}

      <section className="uc03-booking-v2-hero">
        <div className="uc03-booking-v2-hero__actions">
          <label className="uc03-delivery-v2-upload-button is-primary" aria-disabled={uploading}>
            {uploading ? 'Uploading…' : 'Choose Files'}
            <input
              className="uc03-delivery-v2-file-input"
              type="file"
              accept="image/*,.pdf"
              multiple
              disabled={uploading}
              onChange={(event) => {
                const files = Array.from(event.currentTarget.files ?? []);
                event.currentTarget.value = '';
                void handleUpload(files);
              }}
            />
          </label>
          <label className="uc03-delivery-v2-upload-button" aria-disabled={uploading}>
            Take Photo
            <input
              className="uc03-delivery-v2-file-input"
              type="file"
              accept="image/*"
              capture="environment"
              disabled={uploading}
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

      {capture.uploads.length > 0 ? (
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
      ) : (
        <p className="uc03-doc-card-grid__empty">No documents yet — choose files above to get started.</p>
      )}

      {checklistOpen ? (
        <aside className="uc03-capture-checklist-panel" role="dialog" aria-label="Booking document checklist">
          <header>
            <strong>Document checklist</strong>
            <button type="button" onClick={() => setChecklistOpen(false)} aria-label="Close checklist">×</button>
          </header>
          <p>These are audit expectations. A missing or still-processing document never blocks Continue.</p>
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
          {expectedDocuments.length === 0 && identityRequirements.length === 0 ? (
            <p className="uc03-checklist-empty">No configured checklist for this Booking.</p>
          ) : null}
        </aside>
      ) : null}

      <section className={`uc03-v2-compact-gate ${canProceed ? 'is-ready' : 'is-blocked'}`}>
        <div className="uc03-v2-compact-gate__copy">
          {uploading || busy ? (
            <>
              <strong>Finishing your current action · {formatElapsed(elapsedSeconds)}</strong>
              <span>Please wait for this upload or update to finish, then continue.</span>
            </>
          ) : classificationInFlight ? (
            <>
              <strong>Documents being classified · {formatElapsed(elapsedSeconds)}</strong>
              <span>You can continue now. Classification and review-value preparation will continue in the background.</span>
            </>
          ) : auditObservations.length > 0 ? (
            <>
              <strong>Documents received · {formatElapsed(elapsedSeconds)}</strong>
              <span>Some expected evidence is missing or needs audit attention. You can continue the Booking.</span>
            </>
          ) : (
            <>
              <strong>Documents received · {formatElapsed(elapsedSeconds)}</strong>
              <span>Continue when you are done uploading. Review values can continue to prepare in the background.</span>
            </>
          )}
        </div>

        {auditObservations.length > 0 ? (
          <div className="uc03-v2-compact-blockers" role="status">
            {auditObservations.map((observation) => (
              observation.target ? (
                <button
                  key={observation.key}
                  type="button"
                  onClick={() => document.getElementById(observation.target!)?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
                >{observation.text}</button>
              ) : <span key={observation.key}>{observation.text}</span>
            ))}
          </div>
        ) : null}

        <button type="button" className="uc03-c1-primary" disabled={!canProceed} onClick={handleContinue}>
          Continue to Review &rarr;
        </button>
      </section>
    </div>
  );
}
