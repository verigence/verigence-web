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
import '../styles/uc03-document-capture-v2-business.css';

const CAPTURE_STALE_MS = 3_000;
const CAPTURE_POLL_MS = 1_000;
const IDENTITY_MARKERS = ['PAN', 'AADHAAR', 'AADHAR'];

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

function requirementLevel(requirement: CaptureV2Requirement, alternativeSatisfied = false): string {
  if (alternativeSatisfied && !requirement.document) return 'ALTERNATIVE MET';
  if (requirement.requirementLevel === 'REQUIRED') return 'EXPECTED';
  if (requirement.requirementLevel === 'CONDITIONAL') return 'IF APPLICABLE';
  return 'OPTIONAL';
}

function documentStatus(requirement: CaptureV2Requirement, alternativeSatisfied = false): string {
  if (requirement.document) return 'CLASSIFIED';
  if (alternativeSatisfied) return 'NOT NEEDED';
  if (requirement.state === 'NOT_APPLICABLE') return 'NOT APPLICABLE';
  if (requirement.requirementLevel !== 'REQUIRED') return 'OPTIONAL';
  return 'NOT UPLOADED';
}

function requirementMessage(requirement: CaptureV2Requirement, alternativeSatisfied = false): string {
  if (requirement.document) {
    return requirement.document.processingStatus?.toUpperCase() === 'PROCESSED'
      ? 'Document classified · Review values ready'
      : 'Document classified · Review values being prepared';
  }
  if (alternativeSatisfied) return 'Customer ID evidence already available';
  if (requirement.state === 'NOT_APPLICABLE') return 'Not applicable to this Booking';
  if (requirement.requirementLevel === 'REQUIRED') return 'Expected for the audit pack · missing evidence will be flagged';
  return 'Upload only if applicable and available';
}

function RequirementRow({
  requirement,
  busyDocumentId,
  onDelete,
  onUpload,
  alternativeSatisfied = false,
  levelOverride,
}: {
  requirement: CaptureV2Requirement;
  busyDocumentId?: string;
  onDelete: (documentId: string) => Promise<void>;
  onUpload: (files: File[]) => Promise<void>;
  alternativeSatisfied?: boolean;
  levelOverride?: string;
}) {
  const document = requirement.document;
  const deleting = document?.documentId === busyDocumentId;

  return (
    <article
      id={`requirement-${requirement.requirementKey}`}
      className={`uc03-v2-compact-row ${document || alternativeSatisfied ? 'is-ready' : ''}`}
    >
      <div className="uc03-v2-compact-row__name">
        <strong>{requirement.label}</strong>
        <span>{levelOverride || requirementLevel(requirement, alternativeSatisfied)}</span>
      </div>

      <div className="uc03-v2-compact-row__status">
        <StatusPill value={documentStatus(requirement, alternativeSatisfied)} compact />
        <span title={document?.originalFilename || requirement.label}>
          {requirementMessage(requirement, alternativeSatisfied)}
        </span>
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
  conditionKeys,
  busy,
  onClose,
  onSet,
  onContinue,
}: {
  conditionKeys: string[];
  busy: boolean;
  onClose: () => void;
  onSet: (conditionKey: string, applicable: boolean) => Promise<void>;
  onContinue: () => void;
}) {
  return (
    <div className="uc03-v2-choice-modal-backdrop" role="presentation">
      <section className="uc03-v2-choice-modal" role="dialog" aria-modal="true" aria-labelledby="optional-choice-title">
        <header>
          <div>
            <span className="uc03-c1-eyebrow">Optional customer information</span>
            <h2 id="optional-choice-title">Customer choices</h2>
            <p>
              No supporting document was found for the items below. Answer only what you know.
              You can continue without answering; unresolved items remain available for audit follow-up.
            </p>
          </div>
          <button type="button" className="uc03-v2-choice-modal__close" onClick={onClose} aria-label="Close confirmation">×</button>
        </header>

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

        <footer>
          <button type="button" className="uc03-v2-choice-secondary" disabled={busy} onClick={onClose}>Back to documents</button>
          <button type="button" className="uc03-c1-primary" disabled={busy} onClick={onContinue}>
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
  const canProceed = Boolean(capture) && !uploading && !busy;

  const unresolvedConditions = useMemo(() => {
    if (!capture || classificationInFlight) return [];
    const keys = capture.requirements
      .filter((requirement) => requirement.needsDecision && requirement.conditionKey && !requirement.document)
      .map((requirement) => requirement.conditionKey as string);
    return [...new Set(keys)];
  }, [capture, classificationInFlight]);

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
  const additionalDocuments = useMemo(
    () => capture?.requirements.filter((item) => item.requirementLevel !== 'REQUIRED' && !isIdentityRequirement(item)) ?? [],
    [capture],
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
      setError(cause instanceof Error ? cause.message : 'We could not save this customer confirmation. You can still continue the Booking.');
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
    if (!canProceed) return;
    if (unresolvedConditions.length > 0) {
      setChoiceDialogOpen(true);
      return;
    }
    navigate(`/v2/bookings/${journeyId}/details`);
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

  const uploadedCount = capture.uploads.length;
  const classifiedCount = capture.uploads.filter((item) => item.state.toUpperCase() === 'CLASSIFIED' && item.classifiedDocumentTypeKey).length;
  const extractionReadyCount = capture.uploads.filter((item) => item.processingStatus?.toUpperCase() === 'PROCESSED').length;
  const unmatchedUploads = capture.uploads.filter((upload) =>
    !capture.requirements.some((requirement) => requirement.document?.documentId === upload.documentId));

  const businessStatus = uploading
    ? {
      title: 'Documents uploading',
      detail: 'The selected Booking documents are being uploaded.',
      className: 'is-active',
    }
    : classificationInFlight
      ? {
        title: 'Documents being classified',
        detail: `${classifiedCount} of ${uploadedCount} uploaded document${uploadedCount === 1 ? '' : 's'} identified so far. You can continue while this finishes.`,
        className: 'is-active',
      }
      : uploadedCount > 0
        ? {
          title: 'Documents uploaded',
          detail: `${classifiedCount} document${classifiedCount === 1 ? '' : 's'} identified. Review values continue to prepare in the background.`,
          className: 'is-ready',
        }
        : {
          title: 'Upload Booking documents',
          detail: 'Upload the documents available to you. Missing evidence will be highlighted for audit follow-up, not used to stop the Booking.',
          className: '',
        };

  return (
    <div className="screen-stack uc03-booking-journey uc03-v2-capture uc03-v2-compact">
      <div className="uc03-c1-topbar">
        <button type="button" className="uc03-c1-back" onClick={() => navigate('/dashboard')}>← Work List</button>
        <span>Project · {project.projectName}</span>
      </div>

      <PageHeader
        eyebrow="Capture New Booking · V2"
        title={customerName}
        description="Step 1 of 2 · Upload the Booking documents available to you. Verigence identifies the document type automatically."
      />

      <nav className="uc03-booking-steps" aria-label="Booking capture steps">
        <button type="button" className="is-active" disabled>1 <span>Documents</span></button>
        <button type="button" disabled>2 <span>Booking Details</span></button>
      </nav>

      {message ? <div className="uc03-booking-journey-feedback is-success" role="status">{message}</div> : null}
      {error ? <div className="uc03-booking-journey-feedback is-error" role="alert">{error}</div> : null}

      <section className={`uc03-v2-business-status ${businessStatus.className}`} role="status">
        <div>
          <strong>{businessStatus.title}</strong>
          <span>{businessStatus.detail}</span>
        </div>
        <strong className="uc03-v2-business-status__time">{formatElapsed(elapsedSeconds)}</strong>
      </section>

      <section className="uc03-v2-compact-summary business-summary" aria-label="Booking document status">
        <div><strong>{uploadedCount}</strong><span>Documents uploaded</span></div>
        <div><strong>{classifiedCount}/{uploadedCount || 0}</strong><span>Documents classified</span></div>
        <div><strong>{extractionReadyCount}/{uploadedCount || 0}</strong><span>Review values ready</span></div>
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
            <span>Upload all available documents together. No document type selection is required.</span>
            {helpOpen ? (
              <div className="uc03-v2-document-help uc03-v2-help-summary" role="status">
                <div>
                  <strong>Expected audit pack</strong>
                  <ul>
                    {bookingFormDocuments.map((item) => <li key={item.requirementKey}>{item.label}</li>)}
                    <li>Customer ID — PAN or Aadhaar</li>
                    {otherMandatoryDocuments.map((item) => <li key={item.requirementKey}>{item.label}</li>)}
                  </ul>
                </div>
                <div>
                  <strong>Additional / if applicable</strong>
                  <ul>{additionalDocuments.map((item) => <li key={item.requirementKey}>{item.label}</li>)}</ul>
                </div>
                <small>Missing documents are recorded as audit exceptions and do not stop the Booking.</small>
              </div>
            ) : null}
          </div>

          <div className="uc03-v2-upload-actions">
            <label className="uc03-c1-primary" aria-disabled={uploading}>
              {uploading ? 'Uploading…' : 'Choose Files'}
              <input
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
            <label className="uc03-v2-camera-action" aria-disabled={uploading}>
              Take Photo
              <input
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
        </div>

        <div className="uc03-v2-document-groups">
          <section className="uc03-v2-document-group">
            <header className="uc03-v2-document-group__header">
              <div>
                <strong>Expected audit documents</strong>
                <span>Booking Form and customer identification are expected evidence. Missing items will be flagged, not blocked.</span>
              </div>
              <span className="uc03-v2-document-group__badge">Expected</span>
            </header>

            <div className="uc03-v2-compact-list">
              {[...bookingFormDocuments, ...otherMandatoryDocuments].map((requirement) => (
                <RequirementRow
                  key={requirement.requirementKey}
                  requirement={requirement}
                  busyDocumentId={busyDocumentId}
                  onDelete={handleDelete}
                  onUpload={handleUpload}
                />
              ))}
            </div>

            {identityRequirements.length > 0 ? (
              <div id="identity-document-group" className="uc03-v2-identity-choice">
                <header className="uc03-v2-identity-choice__header">
                  <div>
                    <strong>Customer ID</strong>
                    <span>PAN or Aadhaar is sufficient when available.</span>
                  </div>
                  <span className="uc03-v2-identity-choice__state">
                    {identitySatisfied ? 'Evidence available' : 'Not uploaded'}
                  </span>
                </header>
                <div className="uc03-v2-compact-list">
                  {identityRequirements.map((requirement) => (
                    <RequirementRow
                      key={requirement.requirementKey}
                      requirement={requirement}
                      busyDocumentId={busyDocumentId}
                      onDelete={handleDelete}
                      onUpload={handleUpload}
                      levelOverride="ANY ONE"
                      alternativeSatisfied={identitySatisfied && !requirement.document}
                    />
                  ))}
                </div>
              </div>
            ) : null}
          </section>

          {additionalDocuments.length > 0 ? (
            <section className="uc03-v2-document-group is-additional">
              <header className="uc03-v2-document-group__header">
                <div>
                  <strong>Additional documents</strong>
                  <span>GST, Corporate and Trade-In documents only when applicable to the customer.</span>
                </div>
                <span className="uc03-v2-document-group__badge">If applicable</span>
              </header>
              <div className="uc03-v2-compact-list">
                {additionalDocuments.map((requirement) => (
                  <RequirementRow
                    key={requirement.requirementKey}
                    requirement={requirement}
                    busyDocumentId={busyDocumentId}
                    onDelete={handleDelete}
                    onUpload={handleUpload}
                  />
                ))}
              </div>
            </section>
          ) : null}
        </div>

        {unmatchedUploads.length ? (
          <div className="uc03-v2-compact-unmatched">
            {unmatchedUploads.map((upload) => (
              <div key={upload.documentId}>
                <span><strong>{upload.originalFilename}</strong> · Document received; classification is still being confirmed.</span>
                <button type="button" disabled={busyDocumentId === upload.documentId} onClick={() => void handleDelete(upload.documentId)}>
                  Delete
                </button>
              </div>
            ))}
          </div>
        ) : null}
      </section>

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
          Continue to Booking Details →
        </button>
      </section>

      {choiceDialogOpen ? (
        <OptionalChoiceDialog
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
