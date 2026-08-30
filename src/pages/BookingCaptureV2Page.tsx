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
  gstApplicable: 'Is GST Certificate applicable?',
  corporateCustomer: 'Is this a Corporate customer?',
  exchangeTaken: 'Is Trade-In / Exchange applicable?',
};

function documentStatus(requirement: CaptureV2Requirement): string {
  switch (requirement.state) {
    case 'UPLOADED': return 'CLASSIFIED';
    case 'ACKNOWLEDGED_MISSING': return 'MISSING DECLARED';
    case 'NEEDS_DECISION': return 'DECISION REQUIRED';
    case 'NOT_APPLICABLE': return 'NOT APPLICABLE';
    default: return requirement.requirementLevel === 'OPTIONAL' ? 'OPTIONAL' : 'PENDING';
  }
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

function formatElapsed(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
  const seconds = Math.max(0, totalSeconds % 60).toString().padStart(2, '0');
  return `${minutes}:${seconds}`;
}

function scrollToCaptureItem(id: string): void {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
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
      className={`uc03-v2-compact-row ${requirement.state === 'UPLOADED' ? 'is-ready' : ''}`}
    >
      <div className="uc03-v2-compact-row__name">
        <strong>{requirement.label}</strong>
        <span>{requirement.requirementLevel}</span>
      </div>

      <div className="uc03-v2-compact-row__status">
        <StatusPill value={documentStatus(requirement)} compact />
        {document ? (
          <span title={document.originalFilename}>
            {document.classifiedDocumentTypeKey || requirement.documentTypeKey}
            {document.processingStatus ? ` · Extraction ${document.processingStatus}` : ''}
          </span>
        ) : requirement.state === 'ACKNOWLEDGED_MISSING' ? (
          <span>Missing declared for audit follow-up</span>
        ) : requirement.state === 'NEEDS_DECISION' ? (
          <span>Applicability decision required</span>
        ) : requirement.state === 'NOT_APPLICABLE' ? (
          <span>Not applicable for this Booking</span>
        ) : (
          <span>{requirement.requirementLevel === 'OPTIONAL' ? 'Optional evidence' : 'Waiting for matching classified evidence'}</span>
        )}
      </div>

      <div className="uc03-v2-compact-row__actions">
        {document && requirement.canView && document.contentUrl ? (
          <a href={document.contentUrl} target="_blank" rel="noreferrer">View</a>
        ) : null}
        {document && requirement.canDelete ? (
          <button type="button" disabled={deleting} onClick={() => void onDelete(document.documentId)}>
            {deleting ? 'Deleting…' : 'Delete'}
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

function ApplicabilityCard({
  conditionKey,
  capture,
  busy,
  onSet,
}: {
  conditionKey: string;
  capture: BookingCaptureV2;
  busy: boolean;
  onSet: (conditionKey: string, applicable: boolean, available: boolean | null) => Promise<void>;
}) {
  const declaration = capture.declarations.find((item) => item.conditionKey === conditionKey);
  const applicable = declaration?.applicable;
  const available = declaration?.documentAvailable;

  return (
    <article id={`condition-${conditionKey}`} className="uc03-v2-compact-condition">
      <strong>{CONDITION_LABELS[conditionKey] || conditionKey}</strong>
      <div className="uc03-v2-compact-choice" role="group" aria-label={CONDITION_LABELS[conditionKey] || conditionKey}>
        <button
          type="button"
          className={applicable === true ? 'is-selected' : ''}
          disabled={busy}
          onClick={() => void onSet(conditionKey, true, available ?? true)}
        >Yes</button>
        <button
          type="button"
          className={applicable === false ? 'is-selected' : ''}
          disabled={busy}
          onClick={() => void onSet(conditionKey, false, null)}
        >No</button>
      </div>

      {applicable === true ? (
        <div className="uc03-v2-compact-availability">
          <span>Document available now?</span>
          <div className="uc03-v2-compact-choice is-small" role="group" aria-label="Document available now">
            <button
              type="button"
              className={available === true ? 'is-selected' : ''}
              disabled={busy}
              onClick={() => void onSet(conditionKey, true, true)}
            >Yes</button>
            <button
              type="button"
              className={available === false ? 'is-selected' : ''}
              disabled={busy}
              onClick={() => void onSet(conditionKey, true, false)}
            >No</button>
          </div>
        </div>
      ) : null}
    </article>
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
  const readinessStartedAt = useRef<number>();

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
  const canContinue = Boolean(capture?.canContinue) && !uploading && !busy && !exclusiveConflict;

  useEffect(() => {
    if (!started || !capture) return undefined;
    if (readinessStartedAt.current === undefined) readinessStartedAt.current = Date.now();

    const update = () => {
      const startedAt = readinessStartedAt.current ?? Date.now();
      setElapsedSeconds(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
    };
    update();
    if (canContinue) return undefined;
    const timer = window.setInterval(update, 1_000);
    return () => window.clearInterval(timer);
  }, [canContinue, capture, started]);

  useEffect(() => {
    if (!enabled || !started || !project?.tenantId || !journeyId) return;
    void import('./BookingDetailsV2Page');
    void queryClient.prefetchQuery({
      queryKey: ['uc03-booking-details', project.tenantId, journeyId],
      queryFn: () => getBookingDetails(project.tenantId, journeyId, accessToken),
      staleTime: 5 * 60_000,
    });
  }, [accessToken, enabled, journeyId, project?.tenantId, queryClient, started]);

  const unresolvedConditions = useMemo(() => {
    if (!capture || classificationInFlight) return [];
    const keys = capture.requirements
      .filter((requirement) => requirement.needsDecision && requirement.conditionKey)
      .map((requirement) => requirement.conditionKey as string);
    return [...new Set(keys)];
  }, [capture, classificationInFlight]);

  const blockers = useMemo(() => {
    if (!capture) return [] as Array<{ key: string; text: string; target?: string }>;
    const items: Array<{ key: string; text: string; target?: string }> = [];

    if (exclusiveConflict) {
      items.push({
        key: 'gst-corporate-conflict',
        text: 'GST and Corporate cannot both apply. Remove or correct the contradictory GST/Corporate evidence before continuing.',
      });
    }

    for (const upload of capture.uploads) {
      const state = upload.state.toUpperCase();
      if (state === 'RECEIVING' || state === 'STORED' || state === 'CLASSIFYING' || (state === 'CLASSIFIED' && !upload.classifiedDocumentTypeKey)) {
        items.push({
          key: `upload-${upload.documentId}`,
          text: `${upload.originalFilename} is still being classified.`,
        });
      }
    }

    for (const requirement of capture.requirements.filter((item) => item.blocksContinue)) {
      if (exclusiveConflict && (requirement.conditionKey === GST_CONDITION || requirement.conditionKey === CORPORATE_CONDITION)) continue;
      if (requirement.needsDecision && requirement.conditionKey) {
        items.push({
          key: `decision-${requirement.requirementKey}`,
          text: `Please confirm whether ${requirement.label} is applicable.`,
          target: `condition-${requirement.conditionKey}`,
        });
      } else if (!requirement.document) {
        items.push({
          key: `requirement-${requirement.requirementKey}`,
          text: `${requirement.label} still needs matching classified evidence.`,
          target: `requirement-${requirement.requirementKey}`,
        });
      }
    }

    return items;
  }, [capture, exclusiveConflict]);

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
      setMessage('Booking started. Upload the available Booking documents.');
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'Booking could not be started.');
    } finally {
      setStartBusy(false);
    }
  };

  const handleUpload = async (files: File[]) => {
    if (files.length === 0) return;
    if (readinessStartedAt.current === undefined) readinessStartedAt.current = Date.now();
    setActiveUploadBatches((count) => count + 1);
    setError(undefined);
    setMessage(`Uploading ${files.length} document${files.length > 1 ? 's' : ''}…`);
    try {
      await uploadBookingCaptureV2Files(project.tenantId, journeyId, files, accessToken);
      await captureQuery.refetch();
      setMessage('Upload complete. Classification is running automatically; extraction starts as each document is classified.');
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'The document could not be uploaded.');
      setMessage(undefined);
    } finally {
      setActiveUploadBatches((count) => Math.max(0, count - 1));
    }
  };

  const handleDeclaration = async (conditionKey: string, applicable: boolean, available: boolean | null) => {
    setPendingDeclarations((count) => count + 1);
    setError(undefined);
    try {
      const response = await setBookingCaptureV2Declaration(
        project.tenantId,
        journeyId,
        conditionKey,
        applicable,
        available,
        accessToken,
      );
      queryClient.setQueryData<BookingCaptureV2>(captureKey, response);
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'The applicability decision could not be saved.');
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
      setMessage('Document removed. Upload a replacement if it remains required.');
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'The document could not be deleted.');
    } finally {
      setBusyDocumentId(undefined);
    }
  };

  if (workspaceQuery.isPending) return <div className="uc03-c1-loading" role="status">Loading Booking…</div>;

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

  if (captureQuery.isPending) return <div className="uc03-c1-loading" role="status">Loading document requirements…</div>;

  if (captureQuery.isError || !capture) {
    return (
      <section className="dashboard-load-state" role="alert">
        <div className="dashboard-load-state__mark">!</div>
        <div className="dashboard-load-state__copy">
          <strong>Document capture is temporarily unavailable.</strong>
          <p>{captureQuery.error instanceof Error ? captureQuery.error.message : 'Please try again.'}</p>
        </div>
        <button type="button" className="user-menu-button" onClick={() => void captureQuery.refetch()}>Try Again</button>
      </section>
    );
  }

  const classifiedCount = capture.uploads.filter((item) => item.state.toUpperCase() === 'CLASSIFIED' && item.classifiedDocumentTypeKey).length;
  const extractionReadyCount = capture.uploads.filter((item) => item.processingStatus?.toUpperCase() === 'PROCESSED').length;
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
        description="Step 1 of 2 · Upload evidence. Verigence classifies first and starts extraction immediately in the background."
      />

      <nav className="uc03-booking-steps" aria-label="Booking capture steps">
        <button type="button" className="is-active" disabled>1 <span>Documents</span></button>
        <button type="button" disabled>2 <span>Booking Details</span></button>
      </nav>

      {message ? <div className="uc03-booking-journey-feedback is-success" role="status">{message}</div> : null}
      {error ? <div className="uc03-booking-journey-feedback is-error" role="alert">{error}</div> : null}

      <section className="uc03-v2-compact-summary" aria-label="Document capture status">
        <div><strong>{classifiedCount}/{capture.uploads.length || 0}</strong><span>Classified</span></div>
        <div><strong>{extractionReadyCount}/{capture.uploads.length || 0}</strong><span>Extraction ready</span></div>
        <div className={canContinue ? 'is-ready' : 'is-waiting'}>
          <strong>{formatElapsed(elapsedSeconds)}</strong>
          <span>{canContinue ? 'Ready' : 'Gate timer'}</span>
        </div>
      </section>

      <section className="uc03-v2-compact-panel">
        <div className="uc03-v2-compact-upload">
          <div>
            <strong>Booking documents</strong>
            <span>Upload together. Document type selection is not required.</span>
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
            Checking uploaded documents… applicability questions will appear only if evidence cannot answer them.
          </div>
        ) : null}

        {unresolvedConditions.length > 0 ? (
          <div className="uc03-v2-compact-conditions">
            <header>
              <strong>Only information not established by documents</strong>
              {pendingDeclarations ? <span>Saving…</span> : null}
            </header>
            <div className="uc03-v2-compact-condition-grid">
              {unresolvedConditions.map((conditionKey) => (
                <ApplicabilityCard
                  key={conditionKey}
                  conditionKey={conditionKey}
                  capture={capture}
                  busy={pendingDeclarations > 0}
                  onSet={handleDeclaration}
                />
              ))}
            </div>
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
                <span><strong>{upload.originalFilename}</strong> · Classification {upload.state}</span>
                <button type="button" disabled={busyDocumentId === upload.documentId} onClick={() => void handleDelete(upload.documentId)}>
                  Delete
                </button>
              </div>
            ))}
          </div>
        ) : null}
      </section>

      <section className={`uc03-v2-compact-gate ${canContinue ? 'is-ready' : 'is-blocked'}`}>
        <div className="uc03-v2-compact-gate__copy">
          {canContinue ? (
            <>
              <strong>Document gate complete</strong>
              <span>Extraction can continue in the background while you enter Booking Details.</span>
            </>
          ) : (
            <>
              <strong>{blockers.length || 1} action{(blockers.length || 1) === 1 ? '' : 's'} before you can continue · {formatElapsed(elapsedSeconds)}</strong>
              <span>The button enables immediately when the actual classification/applicability gate is complete.</span>
            </>
          )}
        </div>

        {!canContinue ? (
          <div className="uc03-v2-compact-blockers" role="status">
            {blockers.length ? blockers.map((blocker) => (
              blocker.target ? (
                <button key={blocker.key} type="button" onClick={() => scrollToCaptureItem(blocker.target!)}>
                  {blocker.text}
                </button>
              ) : <span key={blocker.key}>{blocker.text}</span>
            )) : <span>Document checks are still being refreshed.</span>}
          </div>
        ) : null}

        <button
          type="button"
          className="uc03-c1-primary"
          disabled={!canContinue}
          onClick={() => navigate(`/v2/bookings/${journeyId}/details`)}
        >Continue to Booking Details →</button>
      </section>
    </div>
  );
}
