import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';

import PageHeader from '../components/PageHeader';
import StatusPill from '../components/StatusPill';
import { getBookingWorkspace, startBooking } from '../services/audit-core/uc03Booking';
import { getBookingDetails } from '../services/audit-core/uc03BookingJourney';
import {
  captureV2HasPendingClassification,
  deleteBookingCaptureV2Document,
  getBookingCaptureV2,
  setBookingCaptureV2Declaration,
  type BookingCaptureV2,
  type CaptureV2Requirement,
  uploadBookingCaptureV2Files,
} from '../services/audit-core/uc03DocumentCaptureV2';
import { useProjectContextStore } from '../store/projectContextStore';
import { useSessionStore } from '../store/sessionStore';
import '../styles/uc03-document-capture-v2.css';
import '../styles/uc03-document-capture-v2-compact.css';

const CAPTURE_STALE_MS = 3_000;
const CAPTURE_POLL_MS = 1_000;
const GST_CONDITION = 'gstApplicable';
const CORPORATE_CONDITION = 'corporateCustomer';

const CONDITION_LABELS: Record<string, string> = {
  gstApplicable: 'Does the customer want to avail GST benefit for this Booking?',
  corporateCustomer: 'Is this Booking for a Corporate customer?',
  exchangeTaken: 'Does the customer want to avail Trade-In / Exchange?',
};

function formatElapsed(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
  const seconds = Math.max(0, totalSeconds % 60).toString().padStart(2, '0');
  return `${minutes}:${seconds}`;
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

function requirementLevel(requirement: CaptureV2Requirement): string {
  if (requirement.requirementLevel === 'REQUIRED') return 'REQUIRED';
  if (requirement.requirementLevel === 'CONDITIONAL') return 'OPTIONAL · IF APPLICABLE';
  return 'OPTIONAL';
}

function documentStatus(requirement: CaptureV2Requirement): string {
  if (requirement.document) return 'CLASSIFIED';
  if (requirement.requirementLevel !== 'REQUIRED') {
    return requirement.state === 'NOT_APPLICABLE' ? 'NOT APPLICABLE' : 'OPTIONAL';
  }
  return 'PENDING';
}

function requirementMessage(requirement: CaptureV2Requirement): string {
  if (requirement.document) {
    return requirement.document.processingStatus
      ? `Confirmed · Review values ${requirement.document.processingStatus.toLowerCase()}`
      : 'Confirmed for this Booking';
  }
  if (requirement.state === 'NOT_APPLICABLE') return 'Not required for this Booking';
  if (requirement.requirementLevel === 'REQUIRED') return 'Required for this Booking';
  return 'Upload only when available and applicable';
}

function RequirementRow({
  requirement,
  busyDocumentId,
  onDelete,
  onUpload,
}: {
  requirement: CaptureV2Requirement;
  busyDocumentId?: string;
  onDelete: (documentId: string) => Promise<void>;
  onUpload: (files: File[]) => Promise<void>;
}) {
  const document = requirement.document;
  const deleting = document?.documentId === busyDocumentId;

  return (
    <article
      id={`requirement-${requirement.requirementKey}`}
      className={`uc03-v2-compact-row ${document ? 'is-ready' : ''}`}
    >
      <div className="uc03-v2-compact-row__name">
        <strong>{requirement.label}</strong>
        <span>{requirementLevel(requirement)}</span>
      </div>

      <div className="uc03-v2-compact-row__status">
        <StatusPill value={documentStatus(requirement)} compact />
        <span title={document?.originalFilename || requirement.label}>{requirementMessage(requirement)}</span>
      </div>

      <div className="uc03-v2-compact-row__actions">
        {document && requirement.canView && document.contentUrl ? (
          <a href={document.contentUrl} target="_blank" rel="noreferrer">View</a>
        ) : null}
        {document && requirement.canDelete ? (
          <button type="button" disabled={deleting} onClick={() => void onDelete(document.documentId)}>
            {deleting ? 'Removing…' : 'Delete'}
          </button>
        ) : null}
        {document ? (
          <label aria-disabled={deleting}>
            Replace
            <input
              type="file"
              accept="image/*,.pdf"
              disabled={deleting}
              onChange={(event) => {
                const files = Array.from(event.currentTarget.files ?? []);
                event.currentTarget.value = '';
                void onUpload(files);
              }}
            />
          </label>
        ) : null}
      </div>
    </article>
  );
}

function OptionalChoiceDialog({
  capture,
  conditionKeys,
  busy,
  onClose,
  onSet,
  onContinue,
}: {
  capture: BookingCaptureV2;
  conditionKeys: string[];
  busy: boolean;
  onClose: () => void;
  onSet: (conditionKey: string, applicable: boolean) => Promise<void>;
  onContinue: () => void;
}) {
  const complete = conditionKeys.length === 0 && capture.canContinue;

  return (
    <div className="uc03-v2-choice-modal-backdrop" role="presentation">
      <section className="uc03-v2-choice-modal" role="dialog" aria-modal="true" aria-labelledby="optional-choice-title">
        <header>
          <div>
            <span className="uc03-c1-eyebrow">Before you continue</span>
            <h2 id="optional-choice-title">A quick customer confirmation</h2>
            <p>
              No supporting document was uploaded for the items below. Confirm the customer's choice only where applicable;
              your response will be recorded with this Booking.
            </p>
          </div>
          <button type="button" className="uc03-v2-choice-modal__close" onClick={onClose} aria-label="Close confirmation">×</button>
        </header>

        {conditionKeys.length > 0 ? (
          <div className="uc03-v2-choice-list">
            {conditionKeys.map((conditionKey) => (
              <article key={conditionKey} className="uc03-v2-choice-item">
                <strong>{CONDITION_LABELS[conditionKey] || conditionKey}</strong>
                <div className="uc03-v2-compact-choice" role="group" aria-label={CONDITION_LABELS[conditionKey] || conditionKey}>
                  <button type="button" disabled={busy} onClick={() => void onSet(conditionKey, true)}>Yes</button>
                  <button type="button" disabled={busy} onClick={() => void onSet(conditionKey, false)}>No</button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="uc03-v2-choice-complete" role="status">
            <strong>Thank you. The Booking document pack is ready.</strong>
            <span>You can continue to Booking Details.</span>
          </div>
        )}

        <footer>
          <button type="button" className="uc03-v2-choice-secondary" onClick={onClose}>Back to documents</button>
          <button type="button" className="uc03-c1-primary" disabled={!complete || busy} onClick={onContinue}>
            Continue to Booking Details →
          </button>
        </footer>
      </section>
    </div>
  );
}

export default function BookingCaptureV2CompactPage() {
  const { journeyId } = useParams<{ journeyId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const project = useProjectContextStore((state) => state.selectedProject);
  const accessToken = useSessionStore((state) => state.accessToken);

  const [startBusy, setStartBusy] = useState(false);
  const [activeUploadBatches, setActiveUploadBatches] = useState(0);
  const [pendingDeclarations, setPendingDeclarations] = useState(0);
  const [busyDocumentId, setBusyDocumentId] = useState<string>();
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [helpOpen, setHelpOpen] = useState(false);
  const [choiceDialogOpen, setChoiceDialogOpen] = useState(false);
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
  const busy = pendingDeclarations > 0 || Boolean(busyDocumentId);
  const exclusiveConflict = Boolean(
    capture?.declarations.find((item) => item.conditionKey === GST_CONDITION)?.applicable
    && capture?.declarations.find((item) => item.conditionKey === CORPORATE_CONDITION)?.applicable,
  );

  const unresolvedConditions = useMemo(() => {
    if (!capture || classificationInFlight) return [];
    const keys = capture.requirements
      .filter((requirement) => requirement.needsDecision && requirement.conditionKey && !requirement.document)
      .map((requirement) => requirement.conditionKey as string);
    return [...new Set(keys)];
  }, [capture, classificationInFlight]);

  const documentBlockers = useMemo(() => {
    if (!capture) return [] as Array<{ key: string; text: string; target?: string }>;
    const items: Array<{ key: string; text: string; target?: string }> = [];

    if (exclusiveConflict) {
      items.push({
        key: 'gst-corporate-conflict',
        text: 'GST and Corporate evidence cannot both apply to the same Booking. Please remove the incorrect document.',
      });
    }

    for (const upload of capture.uploads) {
      const state = upload.state.toUpperCase();
      if (state === 'RECEIVING' || state === 'STORED' || state === 'CLASSIFYING' || (state === 'CLASSIFIED' && !upload.classifiedDocumentTypeKey)) {
        items.push({ key: `upload-${upload.documentId}`, text: `${upload.originalFilename} is being checked.` });
      }
    }

    for (const requirement of capture.requirements) {
      if (!requirement.blocksContinue) continue;
      if (requirement.needsDecision && requirement.conditionKey) continue;
      if (!requirement.document) {
        items.push({
          key: `requirement-${requirement.requirementKey}`,
          text: `${requirement.label} is required for this Booking.`,
          target: `requirement-${requirement.requirementKey}`,
        });
      }
    }
    return items;
  }, [capture, exclusiveConflict]);

  const uploadReady = Boolean(capture)
    && !uploading
    && !busy
    && !classificationInFlight
    && !exclusiveConflict
    && documentBlockers.length === 0;

  useEffect(() => {
    if (!started || !capture) return undefined;
    if (readinessStartedAt.current === undefined) readinessStartedAt.current = Date.now();
    const update = () => {
      const startedAt = readinessStartedAt.current ?? Date.now();
      setElapsedSeconds(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
    };
    update();
    if (uploadReady) return undefined;
    const timer = window.setInterval(update, 1_000);
    return () => window.clearInterval(timer);
  }, [capture, started, uploadReady]);

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
      setMessage('Booking is ready for document capture.');
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
    setMessage(`Receiving ${files.length} Booking document${files.length > 1 ? 's' : ''}…`);
    try {
      await uploadBookingCaptureV2Files(project.tenantId, journeyId, files, accessToken);
      await captureQuery.refetch();
      setMessage('Documents received. We’re checking that the Booking pack is complete.');
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'We could not add this document to the Booking. Please try again.');
      setMessage(undefined);
    } finally {
      setActiveUploadBatches((count) => Math.max(0, count - 1));
    }
  };

  const handleDeclaration = async (conditionKey: string, applicable: boolean) => {
    setPendingDeclarations((count) => count + 1);
    setError(undefined);
    try {
      const response = await setBookingCaptureV2Declaration(
        project.tenantId,
        journeyId,
        conditionKey,
        applicable,
        applicable ? false : null,
        accessToken,
      );
      queryClient.setQueryData<BookingCaptureV2>(captureKey, response);
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'We could not save this customer confirmation. Please try again.');
    } finally {
      setPendingDeclarations((count) => Math.max(0, count - 1));
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

  const handleContinue = () => {
    if (!uploadReady) return;
    if (unresolvedConditions.length > 0) {
      setChoiceDialogOpen(true);
      return;
    }
    if (capture?.canContinue) {
      navigate(`/v2/bookings/${journeyId}/details`);
      return;
    }
    void captureQuery.refetch();
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
      <div className="screen-stack uc03-booking-journey uc03-v2-capture uc03-v2-compact">
        <div className="uc03-c1-topbar">
          <button type="button" className="uc03-c1-back" onClick={() => navigate('/dashboard')}>← Work List</button>
          <span>Project · {project.projectName}</span>
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

  const classifiedCount = capture.uploads.filter((item) => item.state.toUpperCase() === 'CLASSIFIED' && item.classifiedDocumentTypeKey).length;
  const extractionReadyCount = capture.uploads.filter((item) => item.processingStatus?.toUpperCase() === 'PROCESSED').length;
  const requiredDocuments = capture.requirements.filter((item) => item.requirementLevel === 'REQUIRED');
  const optionalDocuments = capture.requirements.filter((item) => item.requirementLevel !== 'REQUIRED');
  const unmatchedUploads = capture.uploads.filter((upload) =>
    !capture.requirements.some((requirement) => requirement.document?.documentId === upload.documentId));

  return (
    <div className="screen-stack uc03-booking-journey uc03-v2-capture uc03-v2-compact">
      <div className="uc03-c1-topbar">
        <button type="button" className="uc03-c1-back" onClick={() => navigate('/dashboard')}>← Work List</button>
        <span>Project · {project.projectName}</span>
      </div>

      <PageHeader
        eyebrow="Capture New Booking · V2"
        title={customerName}
        description="Step 1 of 2 · Add the Booking documents you have. We’ll identify them automatically."
      />

      <nav className="uc03-booking-steps" aria-label="Booking capture steps">
        <button type="button" className="is-active" disabled>1 <span>Documents</span></button>
        <button type="button" disabled>2 <span>Booking Details</span></button>
      </nav>

      {message ? <div className="uc03-booking-journey-feedback is-success" role="status">{message}</div> : null}
      {error ? <div className="uc03-booking-journey-feedback is-error" role="alert">{error}</div> : null}

      <section className="uc03-v2-compact-summary" aria-label="Booking document status">
        <div><strong>{classifiedCount}/{capture.uploads.length || 0}</strong><span>Documents confirmed</span></div>
        <div><strong>{extractionReadyCount}/{capture.uploads.length || 0}</strong><span>Review values ready</span></div>
        <div className={uploadReady ? 'is-ready' : 'is-waiting'}>
          <strong>{formatElapsed(elapsedSeconds)}</strong>
          <span>{uploadReady ? 'Ready to continue' : 'Time elapsed'}</span>
        </div>
      </section>

      <section className="uc03-v2-compact-panel">
        <div className="uc03-v2-compact-upload">
          <div className="uc03-v2-upload-copy">
            <div className="uc03-v2-upload-title-row">
              <strong>Booking documents</strong>
              <button
                type="button"
                className="uc03-v2-help-button"
                aria-label="Which Booking documents should I upload?"
                aria-expanded={helpOpen}
                onClick={() => setHelpOpen((value) => !value)}
              >?</button>
            </div>
            <span>Upload together. You do not need to select a document type.</span>
            {helpOpen ? (
              <div className="uc03-v2-document-help" role="status">
                <div>
                  <strong>Required</strong>
                  <ul>{requiredDocuments.map((item) => <li key={item.requirementKey}>{item.label}</li>)}</ul>
                </div>
                <div>
                  <strong>Optional / if applicable</strong>
                  <ul>{optionalDocuments.map((item) => <li key={item.requirementKey}>{item.label}</li>)}</ul>
                </div>
              </div>
            ) : null}
          </div>

          <div className="uc03-v2-upload-actions">
            <label className="uc03-c1-primary">
              {uploading ? 'Add More' : 'Choose Files'}
              <input
                type="file"
                accept="image/*,.pdf"
                multiple
                onChange={(event) => {
                  const files = Array.from(event.currentTarget.files ?? []);
                  event.currentTarget.value = '';
                  void handleUpload(files);
                }}
              />
            </label>
            <label className="uc03-v2-camera-action">
              Take Photo
              <input
                type="file"
                accept="image/*"
                capture="environment"
                onChange={(event) => {
                  const files = Array.from(event.currentTarget.files ?? []);
                  event.currentTarget.value = '';
                  void handleUpload(files);
                }}
              />
            </label>
          </div>
        </div>

        {classificationInFlight ? (
          <div className="uc03-v2-compact-checking" role="status">
            We’re checking the uploaded documents. You can continue as soon as the required Booking documents are confirmed.
          </div>
        ) : null}

        <div className="uc03-v2-compact-list">
          {capture.requirements.map((requirement) => (
            <RequirementRow
              key={requirement.requirementKey}
              requirement={requirement}
              busyDocumentId={busyDocumentId}
              onDelete={handleDelete}
              onUpload={handleUpload}
            />
          ))}
        </div>

        {unmatchedUploads.length ? (
          <div className="uc03-v2-compact-unmatched">
            {unmatchedUploads.map((upload) => (
              <div key={upload.documentId}>
                <span><strong>{upload.originalFilename}</strong> · We could not match this document to the Booking list yet.</span>
                <button type="button" disabled={busyDocumentId === upload.documentId} onClick={() => void handleDelete(upload.documentId)}>
                  Delete
                </button>
              </div>
            ))}
          </div>
        ) : null}
      </section>

      <section className={`uc03-v2-compact-gate ${uploadReady ? 'is-ready' : 'is-blocked'}`}>
        <div className="uc03-v2-compact-gate__copy">
          {uploadReady ? (
            <>
              <strong>Required Booking documents are ready · {formatElapsed(elapsedSeconds)}</strong>
              <span>
                {unresolvedConditions.length > 0
                  ? 'Continue to confirm any customer choices not supported by an uploaded document.'
                  : 'Continue to Booking Details. Review values are being prepared in the background.'}
              </span>
            </>
          ) : (
            <>
              <strong>Preparing Booking documents · {formatElapsed(elapsedSeconds)}</strong>
              <span>We’re confirming the required documents before you continue.</span>
            </>
          )}
        </div>

        {!uploadReady && documentBlockers.length > 0 ? (
          <div className="uc03-v2-compact-blockers" role="status">
            {documentBlockers.map((blocker) => (
              blocker.target ? (
                <button
                  key={blocker.key}
                  type="button"
                  onClick={() => document.getElementById(blocker.target!)?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
                >{blocker.text}</button>
              ) : <span key={blocker.key}>{blocker.text}</span>
            ))}
          </div>
        ) : null}

        <button type="button" className="uc03-c1-primary" disabled={!uploadReady} onClick={handleContinue}>
          Continue to Booking Details →
        </button>
      </section>

      {choiceDialogOpen ? (
        <OptionalChoiceDialog
          capture={capture}
          conditionKeys={unresolvedConditions}
          busy={pendingDeclarations > 0}
          onClose={() => setChoiceDialogOpen(false)}
          onSet={handleDeclaration}
          onContinue={() => navigate(`/v2/bookings/${journeyId}/details`)}
        />
      ) : null}
    </div>
  );
}
