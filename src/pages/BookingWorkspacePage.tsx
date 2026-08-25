import { useCallback, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';

import PageHeader from '../components/PageHeader';
import StatusPill from '../components/StatusPill';
import BookingDocumentDetails from '../features/uc03/BookingDocumentDetails';
import {
  createBookingFlag,
  decideExtractionProposal,
  getBookingWorkspace,
  refreshBookingExtraction,
  startBooking,
  uploadBookingDocument,
  type ExtractionProposalView,
} from '../services/audit-core/uc03Booking';
import {
  getBookingPart1,
  refreshPart1Evidence,
  type Part1EvidenceItem,
  type Part1Requirement,
} from '../services/audit-core/uc03BookingPart1';
import { useProjectContextStore } from '../store/projectContextStore';
import { useSessionStore } from '../store/sessionStore';
import { displayName } from '../utils/displayNames';

const HUMAN_FLAG_CATEGORIES = [
  'PHYSICAL_OBSERVATION',
  'DOCUMENT_EXCEPTION',
  'PAYMENT_EXCEPTION',
  'CUSTOMER_IDENTITY_CONCERN',
  'COMMERCIAL_EXCEPTION',
  'PROCESS_NON_COMPLIANCE',
  'OTHER',
];

const SUCCESS_PROCESSING_STATUSES = new Set([
  'COMPLETED',
  'COMPLETE',
  'PROCESSED',
  'SUCCEEDED',
  'READY',
  'VERIFIED',
]);

type EvidenceProcessingState = 'READY' | 'FAILED' | 'PROCESSING';

function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function requirementByKind(
  requirements: Part1Requirement[],
  kind: Part1Requirement['kind'],
): Part1Requirement | undefined {
  return requirements.find((item) => item.kind === kind);
}

function evidenceProcessingState(evidence: Part1EvidenceItem): EvidenceProcessingState {
  const status = (evidence.processingStatus || '').trim().toUpperCase();
  if (status === 'FAILED') return 'FAILED';
  if (SUCCESS_PROCESSING_STATUSES.has(status)) return 'READY';
  return 'PROCESSING';
}

function EvidenceList({
  evidence,
  busyEvidenceId,
  onGetDetails,
}: {
  evidence: Part1EvidenceItem[];
  busyEvidenceId?: string;
  onGetDetails: (evidence: Part1EvidenceItem, index: number) => Promise<void>;
}) {
  if (evidence.length === 0) return null;
  return (
    <div className="uc03-c1-evidence-list">
      {evidence.map((item, index) => {
        const state = evidenceProcessingState(item);
        const stateClass = state.toLowerCase();
        const mark = state === 'READY' ? '✓' : state === 'FAILED' ? '!' : '…';
        return (
          <div key={item.evidenceId} className={`uc03-c1-evidence-row is-${stateClass}`}>
            <div className="uc03-c1-evidence-summary">
              <span className="uc03-c1-evidence-mark" aria-hidden="true">{mark}</span>
              <div className="uc03-c1-evidence-copy">
                <strong>{`Document ${index + 1}`}</strong>
                <span>
                  {displayName(item.processingStatus || 'Processing')}
                  {item.verificationStatus ? ` · ${displayName(item.verificationStatus)}` : ''}
                </span>
              </div>
            </div>
            <button
              type="button"
              className="uc03-c1-get-details"
              disabled={busyEvidenceId === item.evidenceId}
              onClick={() => void onGetDetails(item, index)}
            >
              {busyEvidenceId === item.evidenceId ? 'Getting Details…' : 'Get Details'}
            </button>
          </div>
        );
      })}
    </div>
  );
}

function UploadCard({
  title,
  helper,
  requirement,
  uploadBusy,
  detailsBusyEvidenceId,
  multiple = false,
  onUpload,
  onGetDetails,
}: {
  title: string;
  helper: string;
  requirement?: Part1Requirement;
  uploadBusy: boolean;
  detailsBusyEvidenceId?: string;
  multiple?: boolean;
  onUpload: (requirement: Part1Requirement, files: File[]) => Promise<void>;
  onGetDetails: (requirement: Part1Requirement, evidence: Part1EvidenceItem, index: number) => Promise<void>;
}) {
  const evidence = requirement?.evidence ?? [];
  const count = evidence.length;
  const latestEvidence = count > 0 ? evidence[count - 1] : undefined;
  const latestState = latestEvidence ? evidenceProcessingState(latestEvidence) : undefined;
  const processingLocked = uploadBusy || latestState === 'PROCESSING';
  const canUpload = Boolean(requirement)
    && !uploadBusy
    && (multiple ? latestState !== 'PROCESSING' : count === 0 || latestState === 'FAILED');

  let cardStatus = 'PENDING';
  if (uploadBusy || latestState === 'PROCESSING') cardStatus = 'PROCESSING';
  else if (latestState === 'FAILED') cardStatus = 'FAILED';
  else if (count > 0) cardStatus = 'UPLOADED';

  const retrying = latestState === 'FAILED';
  const desktopLabel = retrying
    ? 'Retry / Replace'
    : multiple && count > 0
      ? 'Add Receipt'
      : 'Upload Document';
  const mobileCameraLabel = retrying ? 'Retake Photo' : 'Take Photo';
  const mobileFileLabel = retrying
    ? 'Choose Replacement'
    : multiple && count > 0
      ? 'Choose Receipt'
      : 'Choose File';
  const lockedLabel = uploadBusy
    ? 'Uploading…'
    : latestState === 'PROCESSING'
      ? multiple ? 'Processing receipt…' : 'Processing…'
      : 'Upload complete';

  const submitFiles = (files: File[]) => {
    if (!requirement || !canUpload || files.length === 0) return;
    void onUpload(requirement, files);
  };

  return (
    <article className="uc03-c1-card uc03-c1-document-card">
      <header>
        <div>
          <span className="uc03-c1-eyebrow">Mandatory Evidence</span>
          <h3 className="uc03-c1-document-name">{title}</h3>
        </div>
        <StatusPill value={cardStatus} compact />
      </header>
      <p className="uc03-c1-muted">{helper}</p>
      {requirement ? (
        <div className="uc03-c1-document-actions">
          {canUpload ? (
            <div className="uc03-c1-upload-controls">
              <label className="uc03-c1-upload-action uc03-c1-upload-action--desktop">
                <span>{desktopLabel}</span>
                <input
                  type="file"
                  accept="image/*,.pdf"
                  multiple={multiple}
                  onChange={(event) => {
                    submitFiles(Array.from(event.target.files ?? []));
                    event.currentTarget.value = '';
                  }}
                />
              </label>
              <label className="uc03-c1-upload-action uc03-c1-upload-action--mobile-camera">
                <span>{mobileCameraLabel}</span>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={(event) => {
                    submitFiles(Array.from(event.target.files ?? []));
                    event.currentTarget.value = '';
                  }}
                />
              </label>
              <label className="uc03-c1-upload-action uc03-c1-upload-action--mobile-file">
                <span>{mobileFileLabel}</span>
                <input
                  type="file"
                  accept="image/*,.pdf"
                  multiple={multiple}
                  onChange={(event) => {
                    submitFiles(Array.from(event.target.files ?? []));
                    event.currentTarget.value = '';
                  }}
                />
              </label>
              {multiple ? (
                <span className="uc03-c1-upload-hint">Add each Booking payment receipt. Multiple files can also be selected together.</span>
              ) : null}
            </div>
          ) : (
            <span className={`uc03-c1-upload-state ${latestState === 'FAILED' ? 'is-failed' : ''}`} aria-disabled="true">
              {processingLocked || (!multiple && count > 0) ? lockedLabel : 'Upload unavailable'}
            </span>
          )}
        </div>
      ) : (
        <div className="uc03-c1-feedback is-error">This mandatory evidence requirement is not configured for this Booking.</div>
      )}
      {requirement ? (
        <EvidenceList
          evidence={evidence}
          busyEvidenceId={detailsBusyEvidenceId}
          onGetDetails={(item, index) => onGetDetails(requirement, item, index)}
        />
      ) : null}
    </article>
  );
}

export default function BookingWorkspacePage() {
  const { journeyId } = useParams<{ journeyId: string }>();
  const navigate = useNavigate();
  const project = useProjectContextStore((state) => state.selectedProject);
  const accessToken = useSessionStore((state) => state.accessToken);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();
  const [uploadingKey, setUploadingKey] = useState<string>();
  const [detailsBusyEvidenceId, setDetailsBusyEvidenceId] = useState<string>();
  const [selectedEvidenceId, setSelectedEvidenceId] = useState<string>();
  const [selectedDocumentName, setSelectedDocumentName] = useState('Document');
  const [detailsRefreshKey, setDetailsRefreshKey] = useState<string>();
  const [flagCategory, setFlagCategory] = useState('PHYSICAL_OBSERVATION');
  const [flagSeverity, setFlagSeverity] = useState('MEDIUM');
  const [flagSummary, setFlagSummary] = useState('');
  const [flagRemarks, setFlagRemarks] = useState('');

  const enabled = Boolean(project?.tenantId && journeyId && accessToken);
  const workspaceQuery = useQuery({
    queryKey: ['uc03-booking-workspace', project?.tenantId, journeyId],
    queryFn: () => getBookingWorkspace(project!.tenantId, journeyId!, accessToken),
    enabled,
    refetchOnWindowFocus: false,
  });
  const part1Query = useQuery({
    queryKey: ['uc03-booking-part1', project?.tenantId, journeyId],
    queryFn: () => getBookingPart1(project!.tenantId, journeyId!, accessToken),
    enabled,
    refetchOnWindowFocus: false,
  });

  const refresh = useCallback(async () => {
    await Promise.all([workspaceQuery.refetch(), part1Query.refetch()]);
  }, [part1Query.refetch, workspaceQuery.refetch]);

  const selectedProposals = useMemo(
    () => workspaceQuery.data?.proposals.filter((proposal) => proposal.sourceEvidenceId === selectedEvidenceId) ?? [],
    [selectedEvidenceId, workspaceQuery.data?.proposals],
  );

  if (!project || !journeyId) return null;

  const workspace = workspaceQuery.data;
  const part1 = part1Query.data;
  if (workspaceQuery.isPending || part1Query.isPending) {
    return <div className="uc03-c1-loading" role="status">Loading Booking Capture…</div>;
  }
  if (workspaceQuery.isError || part1Query.isError || !workspace || !part1) {
    const cause = workspaceQuery.error || part1Query.error;
    return (
      <section className="dashboard-load-state" role="alert">
        <div className="dashboard-load-state__mark">!</div>
        <div className="dashboard-load-state__copy">
          <strong>We couldn't open this Booking.</strong>
          <p>{cause instanceof Error ? cause.message : 'Please try again.'}</p>
        </div>
        <button type="button" className="user-menu-button" onClick={() => void refresh()}>Try Again</button>
      </section>
    );
  }

  const started = Boolean(workspace.bookingStage.businessStatus);
  const customerName = displayValue(workspace.capture.CUSTOMER_NAME) || 'Customer';
  const bookingDocket = requirementByKind(part1.requirements, 'BOOKING_DOCKET');
  const pan = requirementByKind(part1.requirements, 'PAN');
  const aadhaar = requirementByKind(part1.requirements, 'AADHAAR');
  const paymentReceipt = requirementByKind(part1.requirements, 'BOOKING_PAYMENT_RECEIPT');

  const run = async (operation: () => Promise<unknown>, success: string) => {
    setBusy(true);
    setMessage(undefined);
    setError(undefined);
    try {
      await operation();
      setMessage(success);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The Booking action could not be completed.');
      throw cause;
    } finally {
      setBusy(false);
    }
  };

  const handleStart = async () => {
    try {
      await run(
        () => startBooking(project.tenantId, journeyId, workspace.aggregateVersion, accessToken),
        'Booking Started.',
      );
    } catch {
      // run() shows the error.
    }
  };

  const handleUpload = async (requirement: Part1Requirement, files: File[]) => {
    setUploadingKey(requirement.requirementKey);
    setMessage(undefined);
    setError(undefined);
    try {
      await Promise.all(files.map((file) => uploadBookingDocument(
        project.tenantId,
        journeyId,
        requirement.requirementKey,
        file,
        accessToken,
      )));
      setMessage(`${files.length} ${files.length === 1 ? 'document' : 'documents'} uploaded. Processing continues in the background.`);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The document could not be uploaded.');
    } finally {
      setUploadingKey(undefined);
    }
  };

  const handleGetDetails = async (
    requirement: Part1Requirement,
    evidence: Part1EvidenceItem,
    index: number,
  ) => {
    setDetailsBusyEvidenceId(evidence.evidenceId);
    setMessage(undefined);
    setError(undefined);
    try {
      await refreshPart1Evidence(project.tenantId, journeyId, evidence.evidenceId, accessToken);
      await refreshBookingExtraction(project.tenantId, journeyId, accessToken);
      await refresh();
      setSelectedEvidenceId(evidence.evidenceId);
      setSelectedDocumentName(
        requirement.kind === 'BOOKING_PAYMENT_RECEIPT'
          ? `Booking Payment Receipt ${index + 1}`
          : displayName(requirement.documentTypeKey || requirement.requirementKey),
      );
      setDetailsRefreshKey(`${Date.now()}-${evidence.evidenceId}`);
      setMessage('Latest extracted details loaded for PC review.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Document details could not be loaded.');
    } finally {
      setDetailsBusyEvidenceId(undefined);
    }
  };

  const handleProposal = async (
    proposal: ExtractionProposalView,
    mode: 'accept' | 'correct',
    correctedValue?: string,
  ) => {
    try {
      await run(
        () => decideExtractionProposal(
          project.tenantId,
          journeyId,
          proposal.proposalId,
          mode,
          workspace.aggregateVersion,
          accessToken,
          correctedValue,
        ),
        mode === 'accept'
          ? 'Extracted value approved.'
          : 'Corrected value saved. The required confidence-based Flag was created automatically.',
      );
      setDetailsRefreshKey(`${Date.now()}-${proposal.proposalId}`);
    } catch {
      // run() shows the error.
    }
  };

  const handleFlag = async () => {
    if (!flagSummary.trim()) return;
    try {
      await run(
        () => createBookingFlag(
          project.tenantId,
          journeyId,
          workspace.aggregateVersion,
          {
            category: flagCategory,
            severity: flagSeverity,
            summary: flagSummary.trim(),
            remarks: flagRemarks.trim() || undefined,
          },
          accessToken,
        ),
        'Observation logged as a Flag.',
      );
      setFlagSummary('');
      setFlagRemarks('');
    } catch {
      // run() shows the error.
    }
  };

  const masterMismatch = ['NO_MATCH', 'AMBIGUOUS', 'NO_EFFECTIVE_MASTER'].includes(part1.productMaster.status);

  return (
    <div className="screen-stack uc03-c1-workspace">
      <div className="uc03-c1-topbar">
        <button type="button" className="uc03-c1-back" onClick={() => navigate('/dashboard')}>← Work List</button>
        <span>Project · {project.projectName}</span>
      </div>

      <PageHeader
        eyebrow="Capture New Booking"
        title={customerName}
        description="Part 1 captures mandatory Booking evidence first. Upload the Booking Docket, at least one KYC document, and all Booking payment receipts. Use Get Details to review and approve or correct extracted values."
      />

      <section className="uc03-c1-customer-lock" aria-label="Entered Customer Name">
        <div>
          <span>Entered Name</span>
          <strong>{customerName}</strong>
          <small>Captured when Add Details created the Journey. The entered name remains unchanged; identity documents establish Legal Name separately.</small>
        </div>
        <span className="uc03-c1-customer-lock__badge">Locked</span>
      </section>

      {message && <div className="uc03-c1-feedback is-success" role="status">{message}</div>}
      {error && <div className="uc03-c1-feedback is-error" role="alert">{error}</div>}

      {!started ? (
        <section className="uc03-c1-start-panel">
          <div>
            <span className="uc03-c1-eyebrow">Booking Journey</span>
            <h2>Start Booking Capture</h2>
            <p>Start the Booking before uploading mandatory evidence.</p>
          </div>
          <button type="button" className="uc03-c1-primary" disabled={busy} onClick={() => void handleStart()}>
            Start Booking
          </button>
        </section>
      ) : (
        <>
          <section className="uc03-c1-stage-strip" aria-label="Part 1 Status">
            <div><span>Booking Docket</span><strong>{part1.mandatoryEvidence.bookingDocketComplete ? 'Captured' : 'Pending'}</strong></div>
            <div><span>KYC</span><strong>{part1.mandatoryEvidence.kycComplete ? 'Minimum Met' : 'Pending'}</strong></div>
            <div><span>Payment Receipts</span><strong>{part1.mandatoryEvidence.paymentReceiptCount}</strong></div>
            <div><span>Part 1 Evidence</span><StatusPill value={part1.mandatoryEvidence.part1EvidenceComplete ? 'COMPLETE' : 'IN_PROGRESS'} /></div>
          </section>

          <section className="uc03-c1-section uc03-c1-section--documents">
            <header className="uc03-c1-section-heading">
              <div>
                <span className="uc03-c1-eyebrow">1 · Mandatory Evidence</span>
                <h2>Capture Booking Documents</h2>
                <p>Only Part-1 mandatory evidence is shown here. Uploads are independent; the PC can continue capturing other documents while processing runs.</p>
              </div>
            </header>

            <div className="uc03-c1-document-grid uc03-c1-document-grid--single">
              <UploadCard
                title="Booking Form / Booking Docket"
                helper="Mandatory. Upload the Booking Form or Booking Docket and use Get Details to validate extracted Booking facts."
                requirement={bookingDocket}
                uploadBusy={uploadingKey === bookingDocket?.requirementKey}
                detailsBusyEvidenceId={detailsBusyEvidenceId}
                onUpload={handleUpload}
                onGetDetails={handleGetDetails}
              />
            </div>

            <div className="uc03-c1-card uc03-c1-kyc-group">
              <header>
                <div>
                  <span className="uc03-c1-eyebrow">KYC</span>
                  <h3>Customer KYC</h3>
                  <p>At least one is mandatory: PAN or Aadhaar. Capture both when both are available.</p>
                </div>
                <StatusPill value={part1.mandatoryEvidence.kycComplete ? 'COMPLETE' : 'PENDING'} compact />
              </header>
              {part1.mandatoryEvidence.kycComplete && !part1.mandatoryEvidence.kycBothProvided ? (
                <div className="uc03-c1-notice">KYC minimum is met. The second identity document is preferred when available.</div>
              ) : null}
              <div className="uc03-c1-document-grid">
                <UploadCard
                  title="PAN"
                  helper="Use PAN as KYC when available."
                  requirement={pan}
                  uploadBusy={uploadingKey === pan?.requirementKey}
                  detailsBusyEvidenceId={detailsBusyEvidenceId}
                  onUpload={handleUpload}
                  onGetDetails={handleGetDetails}
                />
                <UploadCard
                  title="Aadhaar"
                  helper="Use Aadhaar as KYC when available."
                  requirement={aadhaar}
                  uploadBusy={uploadingKey === aadhaar?.requirementKey}
                  detailsBusyEvidenceId={detailsBusyEvidenceId}
                  onUpload={handleUpload}
                  onGetDetails={handleGetDetails}
                />
              </div>
            </div>

            <div className="uc03-c1-document-grid uc03-c1-document-grid--single uc03-c1-payment-group">
              <UploadCard
                title="Booking Payment Receipt(s)"
                helper="Mandatory Booking-stage payment evidence. Capture every receipt when the customer made more than one Booking payment."
                requirement={paymentReceipt}
                uploadBusy={uploadingKey === paymentReceipt?.requirementKey}
                detailsBusyEvidenceId={detailsBusyEvidenceId}
                multiple
                onUpload={handleUpload}
                onGetDetails={handleGetDetails}
              />
            </div>

            {selectedEvidenceId ? (
              <BookingDocumentDetails
                key={`${selectedEvidenceId}-${detailsRefreshKey || 'initial'}`}
                tenantId={project.tenantId}
                journeyId={journeyId}
                accessToken={accessToken}
                evidenceId={selectedEvidenceId}
                documentName={selectedDocumentName}
                proposals={selectedProposals}
                lockedCustomerName={customerName}
                disabled={busy}
                refreshKey={detailsRefreshKey}
                onAccept={(proposal) => handleProposal(proposal, 'accept')}
                onCorrect={(proposal, value) => handleProposal(proposal, 'correct', value)}
                onClose={() => setSelectedEvidenceId(undefined)}
              />
            ) : null}
          </section>

          <section className="uc03-c1-section">
            <header className="uc03-c1-section-heading">
              <div>
                <span className="uc03-c1-eyebrow">2 · Product Master Match</span>
                <h2>Model & Variant</h2>
                <p>Model and Variant come from Booking Docket extraction and the effective Project Product Master. There is no manual Model/Variant key-in.</p>
              </div>
              <StatusPill value={part1.productMaster.status} compact />
            </header>
            <div className="uc03-c1-stage-strip">
              <div><span>System Read Model</span><strong>{part1.productMaster.extractedModel || 'Pending extraction'}</strong></div>
              <div><span>System Read Variant</span><strong>{part1.productMaster.extractedVariant || 'Pending extraction'}</strong></div>
              <div><span>Master Model</span><strong>{part1.productMaster.modelName || '—'}</strong></div>
              <div><span>Master Variant</span><strong>{part1.productMaster.variantName || '—'}</strong></div>
            </div>
            <div className={`uc03-c1-feedback ${masterMismatch ? 'is-error' : 'is-success'}`}>
              {part1.productMaster.message}
            </div>
            {masterMismatch ? (
              <button
                type="button"
                className="uc03-c1-secondary"
                onClick={() => {
                  setFlagCategory('DOCUMENT_EXCEPTION');
                  setFlagSeverity('MEDIUM');
                  setFlagSummary('Booking Model / Variant does not match Product Master');
                  setFlagRemarks(`System Read Model: ${part1.productMaster.extractedModel || 'Not Found'}; System Read Variant: ${part1.productMaster.extractedVariant || 'Not Found'}.`);
                }}
              >
                Log Product Master Observation
              </button>
            ) : null}
          </section>

          <section className="uc03-c1-section">
            <header className="uc03-c1-section-heading">
              <div>
                <span className="uc03-c1-eyebrow">3 · Observation</span>
                <h2>Log Observation / Raise Flag</h2>
                <p>Use this only when the PC notices an issue during evidence capture. DI corrections create their confidence-based Flags automatically.</p>
              </div>
            </header>
            <div className="uc03-c1-form-grid">
              <label>
                <span>Category</span>
                <select value={flagCategory} onChange={(event) => setFlagCategory(event.target.value)}>
                  {HUMAN_FLAG_CATEGORIES.map((category) => <option key={category} value={category}>{displayName(category)}</option>)}
                </select>
              </label>
              <label>
                <span>Priority</span>
                <select value={flagSeverity} onChange={(event) => setFlagSeverity(event.target.value)}>
                  {['INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((severity) => <option key={severity} value={severity}>{displayName(severity)}</option>)}
                </select>
              </label>
              <label className="uc03-c1-field-wide">
                <span>Observation</span>
                <input value={flagSummary} onChange={(event) => setFlagSummary(event.target.value)} placeholder="Describe what you observed" />
              </label>
              <label className="uc03-c1-field-wide">
                <span>Remarks</span>
                <textarea value={flagRemarks} onChange={(event) => setFlagRemarks(event.target.value)} placeholder="Optional supporting remarks" />
              </label>
            </div>
            <button type="button" className="uc03-c1-primary" disabled={busy || !flagSummary.trim()} onClick={() => void handleFlag()}>
              Log Observation
            </button>
          </section>

          <section className="uc03-c1-section">
            <div className="uc03-c1-notice">
              Part 1 ends here. Additional Booking input fields and later conditional evidence are intentionally not shown until the next approved step.
            </div>
          </section>
        </>
      )}
    </div>
  );
}
