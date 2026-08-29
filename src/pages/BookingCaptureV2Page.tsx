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
  type CaptureV2Declaration,
  type CaptureV2Requirement,
  type UploadBookingCaptureV2Result,
  uploadBookingCaptureV2Files,
} from '../services/audit-core/uc03DocumentCaptureV2';
import { useProjectContextStore } from '../store/projectContextStore';
import { useSessionStore } from '../store/sessionStore';
import '../styles/uc03-document-capture-v2.css';

const CAPTURE_STALE_MS = 3_000;
const CLASSIFICATION_POLL_MS = 1_000;

const CONDITION_LABELS: Record<string, string> = {
  gstApplicable: 'Is GST Certificate applicable?',
  corporateCustomer: 'Is this a Corporate customer?',
  exchangeTaken: 'Is Trade-In / Exchange applicable?',
};

function declarationFor(capture: BookingCaptureV2, conditionKey: string): CaptureV2Declaration | undefined {
  return capture.declarations.find((item) => item.conditionKey === conditionKey);
}

function documentStatus(requirement: CaptureV2Requirement): string {
  switch (requirement.state) {
    case 'UPLOADED': return 'CLASSIFIED';
    case 'ACKNOWLEDGED_MISSING': return 'MISSING DECLARED';
    case 'NEEDS_DECISION': return 'DECISION REQUIRED';
    case 'NOT_APPLICABLE': return 'NOT APPLICABLE';
    default: return requirement.requirementLevel === 'OPTIONAL' ? 'OPTIONAL' : 'PENDING';
  }
}

function optimisticDeclaration(
  capture: BookingCaptureV2,
  conditionKey: string,
  applicable: boolean,
  documentAvailable: boolean | null,
): BookingCaptureV2 {
  const declaration: CaptureV2Declaration = {
    conditionKey,
    applicable,
    documentAvailable: applicable ? documentAvailable : null,
    source: 'PC',
  };
  const declarations = [
    ...capture.declarations.filter((item) => item.conditionKey !== conditionKey),
    declaration,
  ];
  const requirements = capture.requirements.map((requirement) => {
    if (requirement.conditionKey !== conditionKey || requirement.document) return requirement;
    if (!applicable) {
      return {
        ...requirement,
        applicabilityState: 'NOT_APPLICABLE' as const,
        state: 'NOT_APPLICABLE',
        needsDecision: false,
        blocksContinue: false,
      };
    }
    const missingAcknowledged = documentAvailable === false;
    const blocksContinue = documentAvailable === true;
    return {
      ...requirement,
      applicabilityState: 'APPLICABLE' as const,
      state: missingAcknowledged ? 'ACKNOWLEDGED_MISSING' : 'NOT_UPLOADED',
      needsDecision: false,
      blocksContinue,
    };
  });
  return {
    ...capture,
    declarations,
    requirements,
    canContinue: requirements.every((requirement) => !requirement.blocksContinue),
  };
}

function mergeDeclarationResponse(
  current: BookingCaptureV2 | undefined,
  response: BookingCaptureV2,
  conditionKey: string,
): BookingCaptureV2 {
  if (!current) return response;

  const responseUploadById = new Map(response.uploads.map((upload) => [upload.documentId, upload]));
  const currentUploadById = new Map(current.uploads.map((upload) => [upload.documentId, upload]));
  const uploads = response.uploads.map((upload) => {
    const previous = currentUploadById.get(upload.documentId);
    if (!previous) return upload;
    return {
      ...previous,
      ...upload,
      contentUrl: upload.contentUrl || previous.contentUrl,
      processingStatus: upload.processingStatus || previous.processingStatus,
    };
  });
  for (const upload of current.uploads) {
    if (!responseUploadById.has(upload.documentId)) uploads.push(upload);
  }

  const serverDeclaration = response.declarations.find((item) => item.conditionKey === conditionKey);
  const declarations = current.declarations.filter((item) => item.conditionKey !== conditionKey);
  if (serverDeclaration) declarations.push(serverDeclaration);

  const serverRequirementByKey = new Map(
    response.requirements
      .filter((requirement) => requirement.conditionKey === conditionKey)
      .map((requirement) => [requirement.requirementKey, requirement]),
  );
  const requirements = current.requirements.map((requirement) => {
    if (requirement.conditionKey !== conditionKey) return requirement;
    const next = serverRequirementByKey.get(requirement.requirementKey);
    if (!next) return requirement;
    const document = next.document && requirement.document
      ? {
          ...requirement.document,
          ...next.document,
          contentUrl: next.document.contentUrl || requirement.document.contentUrl,
          processingStatus: next.document.processingStatus || requirement.document.processingStatus,
        }
      : next.document;
    return { ...next, document };
  });

  return {
    ...current,
    externalContextRef: response.externalContextRef || current.externalContextRef,
    uploads,
    declarations,
    requirements,
    canContinue: requirements.every((requirement) => !requirement.blocksContinue),
  };
}

function rollbackDeclaration(
  current: BookingCaptureV2 | undefined,
  previous: BookingCaptureV2 | undefined,
  conditionKey: string,
): BookingCaptureV2 | undefined {
  if (!current || !previous) return current;
  const previousDeclaration = previous.declarations.find((item) => item.conditionKey === conditionKey);
  const declarations = current.declarations.filter((item) => item.conditionKey !== conditionKey);
  if (previousDeclaration) declarations.push(previousDeclaration);

  const previousRequirements = new Map(
    previous.requirements
      .filter((requirement) => requirement.conditionKey === conditionKey)
      .map((requirement) => [requirement.requirementKey, requirement]),
  );
  const requirements = current.requirements.map((requirement) =>
    requirement.conditionKey === conditionKey
      ? previousRequirements.get(requirement.requirementKey) ?? requirement
      : requirement,
  );
  return {
    ...current,
    declarations,
    requirements,
    canContinue: requirements.every((requirement) => !requirement.blocksContinue),
  };
}

function addPendingUploads(
  capture: BookingCaptureV2 | undefined,
  uploads: UploadBookingCaptureV2Result[],
): BookingCaptureV2 | undefined {
  if (!capture || uploads.length === 0) return capture;
  const existing = new Set(capture.uploads.map((upload) => upload.documentId));
  const additions = uploads
    .filter((upload) => !existing.has(upload.documentId))
    .map((upload) => ({
      documentId: upload.documentId,
      clientUploadId: upload.clientUploadId,
      state: upload.state,
      classifiedDocumentTypeKey: null,
      originalFilename: upload.originalFilename,
      contentUrl: null,
      processingStatus: null,
    }));
  return additions.length ? { ...capture, uploads: [...capture.uploads, ...additions] } : capture;
}

function ConditionalDecision({
  conditionKey,
  capture,
  onSet,
}: {
  conditionKey: string;
  capture: BookingCaptureV2;
  onSet: (applicable: boolean, available: boolean | null) => Promise<void>;
}) {
  const declaration = declarationFor(capture, conditionKey);
  const inferred = declaration?.source === 'DOCUMENT';
  const applicable = declaration?.applicable;
  const available = declaration?.documentAvailable;

  return (
    <article className="uc03-v2-decision-card">
      <div className="uc03-v2-decision-question">
        <div>
          <strong>{CONDITION_LABELS[conditionKey] || conditionKey}</strong>
          {inferred ? <small>Detected from an uploaded document</small> : null}
        </div>
        <div className="uc03-v2-choice-row" role="group" aria-label={CONDITION_LABELS[conditionKey] || conditionKey}>
          <button
            type="button"
            className={applicable === true ? 'is-selected' : ''}
            disabled={inferred}
            onClick={() => void onSet(true, available ?? true)}
          >Yes</button>
          <button
            type="button"
            className={applicable === false ? 'is-selected' : ''}
            disabled={inferred}
            onClick={() => void onSet(false, null)}
          >No</button>
        </div>
      </div>

      {applicable === true && !inferred ? (
        <div className="uc03-v2-decision-question is-secondary">
          <strong>Is the document available now?</strong>
          <div className="uc03-v2-choice-row" role="group" aria-label="Document available now">
            <button
              type="button"
              className={available === true ? 'is-selected' : ''}
              onClick={() => void onSet(true, true)}
            >Yes</button>
            <button
              type="button"
              className={available === false ? 'is-selected' : ''}
              onClick={() => void onSet(true, false)}
            >No</button>
          </div>
        </div>
      ) : null}

      {applicable === true && available === false ? (
        <div className="uc03-v2-missing-note" role="status">
          Missing document declared. You can continue after the other required documents are classified; this declaration remains available for audit follow-up.
        </div>
      ) : null}
    </article>
  );
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
  const passive = requirement.state !== 'UPLOADED';

  return (
    <article className={`uc03-v2-requirement ${passive ? 'is-passive' : 'is-active'}`}>
      <div className="uc03-v2-requirement-main">
        <div className="uc03-v2-requirement-title">
          <strong>{requirement.label}</strong>
          <span>{requirement.requirementLevel}</span>
        </div>
        <StatusPill value={documentStatus(requirement)} compact />
      </div>

      <div className="uc03-v2-requirement-detail">
        {requirement.state === 'UPLOADED' && document ? (
          <>
            <span>✓ {document.originalFilename}</span>
            <span>Classified as {document.classifiedDocumentTypeKey || requirement.documentTypeKey}</span>
            {document.processingStatus ? <span>Extraction: {document.processingStatus}</span> : null}
          </>
        ) : requirement.state === 'ACKNOWLEDGED_MISSING' ? (
          <span>Applicable, but document is not available. Declaration recorded.</span>
        ) : requirement.state === 'NEEDS_DECISION' ? (
          <span>Answer the applicability question above before continuing.</span>
        ) : requirement.state === 'NOT_APPLICABLE' ? (
          <span>Not applicable for this Booking.</span>
        ) : (
          <span>{requirement.requirementLevel === 'OPTIONAL' ? 'Upload when available.' : 'Waiting for a matching classified upload.'}</span>
        )}
      </div>

      {document ? (
        <div className="uc03-v2-requirement-actions">
          {requirement.canView && document.contentUrl ? (
            <a href={document.contentUrl} target="_blank" rel="noreferrer">View</a>
          ) : null}
          {requirement.canDelete ? (
            <button type="button" disabled={deleting} onClick={() => void onDelete(document.documentId)}>
              {deleting ? 'Deleting…' : 'Delete'}
            </button>
          ) : null}
          <label aria-disabled={deleting}>
            Upload Again
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
        </div>
      ) : null}
    </article>
  );
}

export default function BookingCaptureV2Page() {
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
  const declarationSequence = useRef(new Map<string, number>());

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
    refetchInterval: (query) => captureV2HasPendingClassification(query.state.data) ? CLASSIFICATION_POLL_MS : false,
  });

  useEffect(() => {
    if (!captureQuery.data || !captureV2HasPendingClassification(captureQuery.data)) return undefined;
    setMessage('Document received. Classification is running automatically…');
    return undefined;
  }, [captureQuery.data]);

  useEffect(() => {
    if (!enabled || !started || !project?.tenantId || !journeyId) return;
    void import('./BookingDetailsV2Page');
    void queryClient.prefetchQuery({
      queryKey: ['uc03-booking-details', project.tenantId, journeyId],
      queryFn: () => getBookingDetails(project.tenantId, journeyId, accessToken),
      staleTime: 5 * 60_000,
    });
  }, [accessToken, enabled, journeyId, project?.tenantId, queryClient, started]);

  const conditionKeys = useMemo(() => {
    const keys = captureQuery.data?.requirements
      .map((requirement) => requirement.conditionKey)
      .filter((value): value is string => Boolean(value)) ?? [];
    return [...new Set(keys)];
  }, [captureQuery.data?.requirements]);

  if (!project || !journeyId) return null;

  const refresh = async () => {
    await Promise.all([workspaceQuery.refetch(), captureQuery.refetch()]);
  };

  const handleStart = async () => {
    const version = workspaceQuery.data?.aggregateVersion;
    if (version === undefined) return;
    setStartBusy(true); setError(undefined); setMessage(undefined);
    try {
      await startBooking(project.tenantId, journeyId, version, accessToken);
      await workspaceQuery.refetch();
      setMessage('Booking started. You can now upload documents.');
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'Booking could not be started.');
    } finally {
      setStartBusy(false);
    }
  };

  const handleUpload = async (files: File[]) => {
    if (files.length === 0) return;
    setActiveUploadBatches((count) => count + 1);
    setError(undefined);
    setMessage('Uploading directly to secure document storage…');
    try {
      const finalized = await uploadBookingCaptureV2Files(project.tenantId, journeyId, files, accessToken);
      queryClient.setQueryData<BookingCaptureV2>(captureKey, (current) => addPendingUploads(current, finalized));
      setMessage('Upload complete. Classification is running automatically. You can continue working.');
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'The document could not be uploaded.');
      setMessage(undefined);
    } finally {
      setActiveUploadBatches((count) => Math.max(0, count - 1));
    }
  };

  const handleDeclaration = async (conditionKey: string, applicable: boolean, available: boolean | null) => {
    const previous = queryClient.getQueryData<BookingCaptureV2>(captureKey);
    const sequence = (declarationSequence.current.get(conditionKey) ?? 0) + 1;
    declarationSequence.current.set(conditionKey, sequence);
    queryClient.setQueryData<BookingCaptureV2>(captureKey, (current) =>
      current ? optimisticDeclaration(current, conditionKey, applicable, available) : current,
    );
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
      if (declarationSequence.current.get(conditionKey) === sequence) {
        queryClient.setQueryData<BookingCaptureV2>(captureKey, (current) =>
          mergeDeclarationResponse(current, response, conditionKey),
        );
      }
    } catch (cause: unknown) {
      if (declarationSequence.current.get(conditionKey) === sequence) {
        queryClient.setQueryData<BookingCaptureV2>(captureKey, (current) =>
          rollbackDeclaration(current, previous, conditionKey),
        );
      }
      setError(cause instanceof Error ? cause.message : 'The applicability declaration could not be saved.');
    } finally {
      setPendingDeclarations((count) => Math.max(0, count - 1));
    }
  };

  const handleDelete = async (documentId: string) => {
    setBusyDocumentId(documentId); setError(undefined); setMessage(undefined);
    try {
      await deleteBookingCaptureV2Document(project.tenantId, journeyId, documentId, accessToken);
      await captureQuery.refetch();
      setMessage('Document deleted. Upload a replacement if it is still required.');
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'The document could not be deleted.');
    } finally {
      setBusyDocumentId(undefined);
    }
  };

  if (workspaceQuery.isPending) {
    return <div className="uc03-c1-loading" role="status">Loading Booking…</div>;
  }
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
  const capture = captureQuery.data;
  const unmatchedUploads = capture?.uploads.filter((upload) =>
    !capture.requirements.some((requirement) => requirement.document?.documentId === upload.documentId)) ?? [];
  const uploading = activeUploadBatches > 0;

  return (
    <div className="screen-stack uc03-booking-journey uc03-v2-capture">
      <div className="uc03-c1-topbar">
        <button type="button" className="uc03-c1-back" onClick={() => navigate('/dashboard')}>← Work List</button>
        <span>Project · {project.projectName}</span>
      </div>

      <PageHeader
        eyebrow="Capture New Booking · V2"
        title={customerName}
        description="Step 1 of 2 · Upload documents first. Verigence identifies each document automatically; extraction continues in the background."
      />

      <nav className="uc03-booking-steps" aria-label="Booking capture steps">
        <button type="button" className="is-active" disabled>1 <span>Documents</span></button>
        <button type="button" disabled>2 <span>Booking Details</span></button>
      </nav>

      {message ? <div className="uc03-booking-journey-feedback is-success" role="status">{message}</div> : null}
      {error ? <div className="uc03-booking-journey-feedback is-error" role="alert">{error}</div> : null}

      {!started ? (
        <section className="uc03-c1-start-panel">
          <div><span className="uc03-c1-eyebrow">Booking Journey</span><h2>Start Booking Capture</h2></div>
          <button type="button" className="uc03-c1-primary" disabled={startBusy} onClick={() => void handleStart()}>
            {startBusy ? 'Starting…' : 'Start Booking'}
          </button>
        </section>
      ) : captureQuery.isPending ? (
        <div className="uc03-c1-loading" role="status">Loading document requirements…</div>
      ) : captureQuery.isError || !capture ? (
        <section className="dashboard-load-state" role="alert">
          <div className="dashboard-load-state__mark">!</div>
          <div className="dashboard-load-state__copy">
            <strong>Document capture is temporarily unavailable.</strong>
            <p>{captureQuery.error instanceof Error ? captureQuery.error.message : 'Please try again.'}</p>
          </div>
          <button type="button" className="user-menu-button" onClick={() => void captureQuery.refetch()}>Try Again</button>
        </section>
      ) : (
        <>
          {conditionKeys.length ? (
            <section className="uc03-v2-section">
              <header>
                <div><span className="uc03-c1-eyebrow">Applicability</span><h2>Booking conditions</h2></div>
                {pendingDeclarations ? <span role="status">Saving {pendingDeclarations > 1 ? 'answers' : 'answer'}…</span> : null}
              </header>
              <div className="uc03-v2-decision-grid">
                {conditionKeys.map((conditionKey) => (
                  <ConditionalDecision
                    key={conditionKey}
                    conditionKey={conditionKey}
                    capture={capture}
                    onSet={(applicable, available) => handleDeclaration(conditionKey, applicable, available)}
                  />
                ))}
              </div>
            </section>
          ) : null}

          <section className="uc03-v2-section">
            <header className="uc03-v2-section-header">
              <div><span className="uc03-c1-eyebrow">Step 1</span><h2>Documents</h2></div>
              <span>{capture.canContinue ? 'Required document checks complete' : 'Required document checks pending'}</span>
            </header>

            <div className="uc03-v2-dropzone">
              <div>
                <strong>Upload any Booking document</strong>
                <span>You do not need to select a document type. Classification happens automatically.</span>
                {uploading ? <span role="status">Upload is running in the background; you can keep answering questions or add more files.</span> : null}
              </div>
              <div className="uc03-v2-upload-actions">
                <label className="uc03-c1-primary">
                  {uploading ? 'Add More Files' : 'Choose Files'}
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

            <div className="uc03-v2-requirement-list">
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
              <div className="uc03-v2-unmatched">
                <h3>Uploads awaiting a usable classification</h3>
                {unmatchedUploads.map((upload) => (
                  <div key={upload.documentId} className="uc03-v2-unmatched-row">
                    <div>
                      <strong>{upload.originalFilename}</strong>
                      <span>{upload.state === 'UNKNOWN' ? 'Document type could not be identified. Upload a clearer/replacement document.' : `Classification: ${upload.state}`}</span>
                    </div>
                    <button type="button" disabled={busyDocumentId === upload.documentId} onClick={() => void handleDelete(upload.documentId)}>
                      {busyDocumentId === upload.documentId ? 'Deleting…' : 'Delete'}
                    </button>
                  </div>
                ))}
              </div>
            ) : null}

            <div className="uc03-booking-step-footer">
              <span>{capture.canContinue
                ? 'You can continue. Extraction may still be running; it does not block Booking Details.'
                : 'Continue becomes available after required documents are classified and applicability decisions are complete.'}</span>
              <button
                type="button"
                className="uc03-c1-primary"
                disabled={!capture.canContinue || pendingDeclarations > 0 || Boolean(busyDocumentId)}
                onClick={() => navigate(`/v2/bookings/${journeyId}/details`)}
              >Continue to Booking Details →</button>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
