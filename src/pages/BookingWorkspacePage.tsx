import { useCallback, useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';

import PageHeader from '../components/PageHeader';
import StatusPill from '../components/StatusPill';
import BookingReviewDocumentPanel from '../features/uc03/BookingReviewDocumentPanel';
import { raiseAuditFlag } from '../services/audit-core/uc03Audit';
import {
  getBookingWorkspace,
  startBooking,
  uploadBookingDocument,
} from '../services/audit-core/uc03Booking';
import {
  approveBookingReviewDocument,
  getBookingDetails,
  getBookingDetailsOptions,
  getBookingReviewDocuments,
  saveBookingDetails,
  startBookingDetailsReview,
  type BookingDetailsPayload,
  type BookingOptionalEvidence,
  type BookingReferenceOption,
  type BookingReviewDocument,
} from '../services/audit-core/uc03BookingJourney';
import {
  getBookingPart1,
  type Part1EvidenceItem,
  type Part1Requirement,
} from '../services/audit-core/uc03BookingPart1';
import { useProjectContextStore } from '../store/projectContextStore';
import { useSessionStore } from '../store/sessionStore';
import { displayName } from '../utils/displayNames';

const SUCCESS_PROCESSING_STATUSES = new Set([
  'COMPLETED', 'COMPLETE', 'PROCESSED', 'SUCCEEDED', 'READY', 'VERIFIED',
]);
const FAILED_PROCESSING_STATUSES = new Set(['FAILED', 'REJECTED']);

type JourneyStep = 1 | 2 | 3;
type EvidenceProcessingState = 'READY' | 'FAILED' | 'PROCESSING';

type BookingDetailsForm = {
  priceListId: string;
  customerType: string;
  dealType: string;
  dealSource: string;
  leadSource: string;
  registrationState: string;
  territoryCategorization: string;
  districtName: string;
  registrationType: string;
  registrationCategory: string;
  outrightPurchase: boolean | null;
  tradeIn: boolean | null;
  gstBenefit: boolean | null;
  corporateIdAvailable: boolean | null;
};

const EMPTY_FORM: BookingDetailsForm = {
  priceListId: '',
  customerType: '',
  dealType: '',
  dealSource: '',
  leadSource: '',
  registrationState: '',
  territoryCategorization: '',
  districtName: '',
  registrationType: '',
  registrationCategory: '',
  outrightPurchase: null,
  tradeIn: null,
  gstBenefit: null,
  corporateIdAvailable: null,
};

function requirementByKind(
  requirements: Part1Requirement[],
  kind: Part1Requirement['kind'],
): Part1Requirement | undefined {
  return requirements.find((item) => item.kind === kind);
}

function evidenceProcessingState(evidence: Part1EvidenceItem): EvidenceProcessingState {
  const status = (evidence.processingStatus || '').trim().toUpperCase();
  if (FAILED_PROCESSING_STATUSES.has(status)) return 'FAILED';
  if (SUCCESS_PROCESSING_STATUSES.has(status)) return 'READY';
  return 'PROCESSING';
}

function reviewProcessingState(document: BookingReviewDocument): EvidenceProcessingState {
  const status = (document.processingStatus || '').trim().toUpperCase();
  if (FAILED_PROCESSING_STATUSES.has(status)) return 'FAILED';
  if (SUCCESS_PROCESSING_STATUSES.has(status)) return 'READY';
  return 'PROCESSING';
}

function reviewDocumentsFromUploads(requirements: Part1Requirement[]): BookingReviewDocument[] {
  return requirements.flatMap((requirement) => requirement.evidence.map((evidence) => ({
    evidenceId: evidence.evidenceId,
    requirementKey: requirement.requirementKey,
    documentTypeKey: evidence.documentTypeKey || requirement.documentTypeKey,
    processingStatus: evidence.processingStatus,
    verificationStatus: evidence.verificationStatus,
  })));
}

function UploadCard({
  title,
  requirement,
  uploadBusy,
  multiple = false,
  optional = false,
  onUpload,
}: {
  title: string;
  requirement?: Part1Requirement;
  uploadBusy: boolean;
  multiple?: boolean;
  optional?: boolean;
  onUpload: (requirement: Part1Requirement, files: File[]) => Promise<void>;
}) {
  const evidence = requirement?.evidence ?? [];
  const latest = evidence.at(-1);
  const latestState = latest ? evidenceProcessingState(latest) : undefined;
  const canUpload = Boolean(requirement)
    && !uploadBusy
    && (multiple ? latestState !== 'PROCESSING' : evidence.length === 0 || latestState === 'FAILED');
  const retrying = latestState === 'FAILED';
  const status = uploadBusy || latestState === 'PROCESSING'
    ? 'PROCESSING'
    : retrying
      ? 'FAILED'
      : evidence.length > 0
        ? 'UPLOADED'
        : optional ? 'OPTIONAL' : 'PENDING';

  const submit = (files: File[]) => {
    if (!requirement || !canUpload || files.length === 0) return;
    void onUpload(requirement, files);
  };

  return (
    <article className="uc03-booking-upload-card">
      <header>
        <div>
          <strong>{title}</strong>
          {optional ? <small>Optional</small> : null}
        </div>
        <StatusPill value={status} compact />
      </header>
      {requirement ? (
        <>
          <div className="uc03-booking-upload-actions">
            {canUpload ? (
              <>
                <label className="uc03-booking-upload-action is-desktop">
                  <span>{retrying ? 'Retry / Replace' : multiple && evidence.length ? 'Add Receipt' : 'Upload'}</span>
                  <input
                    type="file"
                    accept="image/*,.pdf"
                    multiple={multiple}
                    onChange={(event) => {
                      submit(Array.from(event.currentTarget.files ?? []));
                      event.currentTarget.value = '';
                    }}
                  />
                </label>
                <label className="uc03-booking-upload-action is-mobile">
                  <span>{retrying ? 'Retake Photo' : 'Take Photo'}</span>
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={(event) => {
                      submit(Array.from(event.currentTarget.files ?? []));
                      event.currentTarget.value = '';
                    }}
                  />
                </label>
                <label className="uc03-booking-upload-action is-mobile">
                  <span>{retrying ? 'Choose Replacement' : multiple && evidence.length ? 'Choose Receipt' : 'Choose File'}</span>
                  <input
                    type="file"
                    accept="image/*,.pdf"
                    multiple={multiple}
                    onChange={(event) => {
                      submit(Array.from(event.currentTarget.files ?? []));
                      event.currentTarget.value = '';
                    }}
                  />
                </label>
              </>
            ) : (
              <span className="uc03-booking-upload-state">
                {uploadBusy ? 'Uploading…' : latestState === 'PROCESSING' ? 'Processing…' : evidence.length ? 'Uploaded' : 'Upload unavailable'}
              </span>
            )}
          </div>
          {evidence.length ? (
            <div className="uc03-booking-upload-summary">
              {evidence.map((item, index) => (
                <span key={item.evidenceId}>
                  ✓ {multiple ? `Document ${index + 1}` : 'Document'} · {displayName(item.processingStatus || 'Accepted')}
                </span>
              ))}
            </div>
          ) : null}
        </>
      ) : (
        <div className="uc03-booking-journey-feedback is-error">This Booking document requirement is not configured.</div>
      )}
    </article>
  );
}

function MasterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: BookingReferenceOption[];
  onChange: (value: string) => void;
}) {
  const configured = options.length > 0;
  return (
    <label className="uc03-booking-field">
      <span>{label}</span>
      <select value={value} disabled={!configured} onChange={(event) => onChange(event.target.value)}>
        <option value="">{configured ? `Select ${label}` : `${label} master not configured`}</option>
        {options.map((option) => <option key={option.code} value={option.code}>{option.label}</option>)}
      </select>
    </label>
  );
}

function YesNo({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean | null;
  onChange: (value: boolean) => void;
}) {
  return (
    <fieldset className="uc03-booking-choice">
      <legend>{label}</legend>
      <label><input type="radio" checked={value === true} onChange={() => onChange(true)} /> Yes</label>
      <label><input type="radio" checked={value === false} onChange={() => onChange(false)} /> No</label>
    </fieldset>
  );
}

function optionalEvidenceByKey(items: BookingOptionalEvidence[], key: string) {
  return items.find((item) => item.requirementKey === key);
}

function OptionalEvidenceUpload({
  title,
  evidence,
  busy,
  onUpload,
}: {
  title: string;
  evidence?: BookingOptionalEvidence;
  busy: boolean;
  onUpload: (file: File) => Promise<void>;
}) {
  const uploaded = Boolean(evidence?.evidenceId);
  const processing = evidence?.processingStatus && !SUCCESS_PROCESSING_STATUSES.has(evidence.processingStatus.toUpperCase())
    && !FAILED_PROCESSING_STATUSES.has(evidence.processingStatus.toUpperCase());
  const failed = evidence?.processingStatus ? FAILED_PROCESSING_STATUSES.has(evidence.processingStatus.toUpperCase()) : false;
  const canUpload = !busy && !processing && (!uploaded || failed);
  const submit = (file?: File) => { if (file && canUpload) void onUpload(file); };
  return (
    <div className="uc03-booking-optional-upload">
      <div>
        <strong>{title}</strong>
        <span>{uploaded ? displayName(evidence?.processingStatus || 'Uploaded') : 'Optional document'}</span>
      </div>
      {canUpload ? (
        <div className="uc03-booking-upload-actions">
          <label className="uc03-booking-upload-action is-desktop">
            <span>{failed ? 'Retry / Replace' : 'Upload'}</span>
            <input type="file" accept="image/*,.pdf" onChange={(event) => { submit(event.currentTarget.files?.[0]); event.currentTarget.value = ''; }} />
          </label>
          <label className="uc03-booking-upload-action is-mobile">
            <span>Take Photo</span>
            <input type="file" accept="image/*" capture="environment" onChange={(event) => { submit(event.currentTarget.files?.[0]); event.currentTarget.value = ''; }} />
          </label>
          <label className="uc03-booking-upload-action is-mobile">
            <span>Choose File</span>
            <input type="file" accept="image/*,.pdf" onChange={(event) => { submit(event.currentTarget.files?.[0]); event.currentTarget.value = ''; }} />
          </label>
        </div>
      ) : <span className="uc03-booking-upload-state">{busy ? 'Uploading…' : processing ? 'Processing…' : 'Uploaded'}</span>}
    </div>
  );
}

function reviewDocumentName(document: BookingReviewDocument, index: number): string {
  switch (document.requirementKey) {
    case 'booking_docket': return 'Booking Form / Booking Docket';
    case 'pan_card': return 'PAN';
    case 'aadhaar': return 'Aadhaar';
    case 'booking_payment_receipt': return `Booking Payment Receipt ${index + 1}`;
    case 'corporate_id': return 'Corporate ID';
    case 'gst_certificate': return 'GST Certificate';
    case 'trade_in_vehicle_rc': return 'Trade-In Document';
    default: return displayName(document.documentTypeKey || document.requirementKey || 'Document');
  }
}

export default function BookingWorkspacePage() {
  const { journeyId } = useParams<{ journeyId: string }>();
  const navigate = useNavigate();
  const project = useProjectContextStore((state) => state.selectedProject);
  const accessToken = useSessionStore((state) => state.accessToken);
  const [step, setStep] = useState<JourneyStep>(1);
  const [busy, setBusy] = useState(false);
  const [uploadingKey, setUploadingKey] = useState<string>();
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();
  const [form, setForm] = useState<BookingDetailsForm>(EMPTY_FORM);
  const [formDirty, setFormDirty] = useState(false);
  const [version, setVersion] = useState(0);
  const [reviewDocuments, setReviewDocuments] = useState<BookingReviewDocument[]>([]);
  const [reviewIndex, setReviewIndex] = useState(0);
  const [reviewedDocumentIds, setReviewedDocumentIds] = useState<Set<string>>(() => new Set());
  const [reviewWaitingDocuments, setReviewWaitingDocuments] = useState<BookingReviewDocument[]>([]);
  const [showMissingEvidenceWarning, setShowMissingEvidenceWarning] = useState(false);

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
  const detailsQuery = useQuery({
    queryKey: ['uc03-booking-details', project?.tenantId, journeyId],
    queryFn: () => getBookingDetails(project!.tenantId, journeyId!, accessToken),
    enabled,
    refetchOnWindowFocus: false,
  });
  const optionsQuery = useQuery({
    queryKey: ['uc03-booking-details-options', project?.tenantId, journeyId],
    queryFn: () => getBookingDetailsOptions(project!.tenantId, journeyId!, accessToken),
    enabled,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (workspaceQuery.data?.aggregateVersion !== undefined) setVersion(workspaceQuery.data.aggregateVersion);
  }, [workspaceQuery.data?.aggregateVersion]);

  useEffect(() => {
    const details = detailsQuery.data;
    if (!details || formDirty) return;
    setForm({
      priceListId: details.priceListId || '',
      customerType: details.customerType || '',
      dealType: details.dealType || '',
      dealSource: details.dealSource || '',
      leadSource: details.leadSource || '',
      registrationState: details.registrationState || '',
      territoryCategorization: details.territoryCategorization || '',
      districtName: details.districtName || '',
      registrationType: details.registrationType || '',
      registrationCategory: details.registrationCategory || '',
      outrightPurchase: details.outrightPurchase ?? null,
      tradeIn: details.tradeIn ?? null,
      gstBenefit: details.gstBenefit ?? null,
      corporateIdAvailable: details.corporateIdAvailable ?? null,
    });
  }, [detailsQuery.data, formDirty]);

  const refreshAll = useCallback(async () => {
    const [workspaceResult] = await Promise.all([
      workspaceQuery.refetch(),
      part1Query.refetch(),
      detailsQuery.refetch(),
    ]);
    if (workspaceResult.data) setVersion(workspaceResult.data.aggregateVersion);
  }, [detailsQuery, part1Query, workspaceQuery]);

  if (!project || !journeyId) return null;
  if (workspaceQuery.isPending || part1Query.isPending) {
    return <div className="uc03-c1-loading" role="status">Loading Booking…</div>;
  }
  if (workspaceQuery.isError || part1Query.isError || !workspaceQuery.data || !part1Query.data) {
    const cause = workspaceQuery.error || part1Query.error;
    return (
      <section className="dashboard-load-state" role="alert">
        <div className="dashboard-load-state__mark">!</div>
        <div className="dashboard-load-state__copy">
          <strong>We couldn't open this Booking.</strong>
          <p>{cause instanceof Error ? cause.message : 'Please try again.'}</p>
        </div>
        <button type="button" className="user-menu-button" onClick={() => void refreshAll()}>Try Again</button>
      </section>
    );
  }

  const workspace = workspaceQuery.data;
  const part1 = part1Query.data;
  const options = optionsQuery.data;
  const started = Boolean(workspace.bookingStage.businessStatus);
  const customerName = String(workspace.capture.CUSTOMER_NAME || 'Customer');
  const bookingDocket = requirementByKind(part1.requirements, 'BOOKING_DOCKET');
  const pan = requirementByKind(part1.requirements, 'PAN');
  const aadhaar = requirementByKind(part1.requirements, 'AADHAAR');
  const paymentReceipt = requirementByKind(part1.requirements, 'BOOKING_PAYMENT_RECEIPT');
  const currentReviewDocument = reviewDocuments[reviewIndex];
  const currentReviewProposals = currentReviewDocument
    ? workspace.proposals.filter((proposal) => proposal.sourceEvidenceId === currentReviewDocument.evidenceId)
    : [];

  const missingMandatoryDocuments = [
    ...(!part1.mandatoryEvidence.bookingDocketComplete ? ['Booking Form / Booking Docket'] : []),
    ...(!part1.mandatoryEvidence.kycComplete ? ['PAN or Aadhaar'] : []),
    ...(!part1.mandatoryEvidence.paymentReceiptComplete ? ['Booking Payment Receipt'] : []),
  ];

  const formComplete = Boolean(
    form.customerType && form.dealType && form.dealSource && form.leadSource
    && form.registrationState && form.territoryCategorization && form.districtName
    && form.registrationType && form.registrationCategory
    && form.outrightPurchase !== null && form.tradeIn !== null && form.gstBenefit !== null
    && (form.customerType !== 'CORPORATE' || form.corporateIdAvailable !== null)
  );

  const updateForm = <K extends keyof BookingDetailsForm>(key: K, value: BookingDetailsForm[K]) => {
    setForm((current) => ({
      ...current,
      [key]: value,
      ...(key === 'customerType' && value !== 'CORPORATE' ? { corporateIdAvailable: null } : {}),
    }));
    setFormDirty(true);
    setReviewWaitingDocuments([]);
  };

  const detailsPayload = (): BookingDetailsPayload => {
    if (!formComplete || form.outrightPurchase === null || form.tradeIn === null || form.gstBenefit === null) {
      throw new Error('Complete all mandatory Booking Details before continuing.');
    }
    return {
      priceListId: form.priceListId || null,
      customerType: form.customerType,
      dealType: form.dealType,
      dealSource: form.dealSource,
      leadSource: form.leadSource,
      registrationState: form.registrationState,
      territoryCategorization: form.territoryCategorization,
      districtName: form.districtName,
      registrationType: form.registrationType,
      registrationCategory: form.registrationCategory,
      outrightPurchase: form.outrightPurchase,
      tradeIn: form.tradeIn,
      gstBenefit: form.gstBenefit,
      corporateIdAvailable: form.customerType === 'CORPORATE' ? form.corporateIdAvailable : null,
    };
  };

  const handleStart = async () => {
    setBusy(true); setError(undefined); setMessage(undefined);
    try {
      await startBooking(project.tenantId, journeyId, version, accessToken);
      await refreshAll();
      setMessage('Booking started.');
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'Booking could not be started.');
    } finally { setBusy(false); }
  };

  const handleUpload = async (requirement: Part1Requirement, files: File[]) => {
    setUploadingKey(requirement.requirementKey); setError(undefined); setMessage(undefined);
    try {
      for (const file of files) {
        await uploadBookingDocument(project.tenantId, journeyId, requirement.requirementKey, file, accessToken);
      }
      await refreshAll();
      setReviewWaitingDocuments([]);
      setMessage('Document accepted by Document Intelligence. Extraction continues asynchronously; readiness is checked when you continue to Review.');
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'The document could not be uploaded.');
    } finally { setUploadingKey(undefined); }
  };

  const saveCurrentDetails = async () => {
    const result = await saveBookingDetails(project.tenantId, journeyId, detailsPayload(), version, accessToken);
    setVersion(result.aggregateVersion);
    setFormDirty(false);
    return result;
  };

  const handleOptionalUpload = async (requirementKey: string, file: File) => {
    setUploadingKey(requirementKey); setBusy(true); setError(undefined); setMessage(undefined);
    try {
      const saved = await saveCurrentDetails();
      const requirement = saved.optionalEvidence.find((item) => item.requirementKey === requirementKey);
      if (!requirement) throw new Error('This optional Booking document is not configured for the Journey.');
      await uploadBookingDocument(project.tenantId, journeyId, requirement.requirementKey, file, accessToken);
      await refreshAll();
      setReviewWaitingDocuments([]);
      setMessage('Optional document accepted by Document Intelligence. Extraction continues asynchronously; readiness is checked when you continue to Review.');
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'The optional document could not be uploaded.');
    } finally { setUploadingKey(undefined); setBusy(false); }
  };

  const performStartReview = async () => {
    setShowMissingEvidenceWarning(false);
    setBusy(true); setError(undefined); setMessage(undefined);
    try {
      const preparedDocuments = await getBookingReviewDocuments(project.tenantId, journeyId, accessToken);
      const failed = preparedDocuments.filter((document) => reviewProcessingState(document) === 'FAILED');
      if (failed.length > 0) {
        setReviewWaitingDocuments(failed);
        setError('One or more uploaded documents failed extraction. Return to Documents and retry or replace them before Review.');
        return;
      }
      const waiting = preparedDocuments.filter((document) => reviewProcessingState(document) === 'PROCESSING');
      if (waiting.length > 0) {
        setReviewWaitingDocuments(waiting);
        setMessage('Document extraction is still completing. Review is not opened until uploaded extraction-required documents are ready.');
        return;
      }

      const saved = await saveCurrentDetails();
      const review = await startBookingDetailsReview(
        project.tenantId,
        journeyId,
        saved.aggregateVersion,
        accessToken,
        preparedDocuments,
      );
      setVersion(review.aggregateVersion);

      if (missingMandatoryDocuments.length > 0) {
        await raiseAuditFlag(
          project.tenantId,
          journeyId,
          'BOOKING',
          review.aggregateVersion,
          {
            category: 'DOCUMENT_EXCEPTION',
            severity: 'INFO',
            summary: 'Booking continued with mandatory evidence pending',
            remarks: `PC chose Continue Anyway. Pending mandatory evidence: ${missingMandatoryDocuments.join(', ')}. Booking remains In Progress.`,
          },
          accessToken,
        );
      }

      setReviewDocuments(review.documents);
      setReviewIndex(0);
      setReviewWaitingDocuments([]);
      setStep(3);
      setMessage(review.raisedObservationIds.length || missingMandatoryDocuments.length
        ? 'Booking details saved. Missing evidence/configuration was recorded as non-blocking INFO audit information.'
        : 'Booking details saved. Document review is ready.');
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'Booking review could not be started.');
    } finally { setBusy(false); }
  };

  const handleStartReview = () => {
    setError(undefined); setMessage(undefined);
    if (!formComplete) {
      setError('Complete the mandatory Booking Details before opening Review. Optional fields and missing evidence remain non-blocking.');
      return;
    }
    if (missingMandatoryDocuments.length > 0) {
      setShowMissingEvidenceWarning(true);
      return;
    }
    void performStartReview();
  };

  const handleReviewStepClick = () => {
    setError(undefined);
    if (reviewDocuments.length > 0) {
      setStep(3);
      return;
    }
    handleStartReview();
  };

  const handleApproveDocument = async () => {
    if (!currentReviewDocument) return;
    setBusy(true); setError(undefined); setMessage(undefined);
    try {
      const result = await approveBookingReviewDocument(
        project.tenantId,
        journeyId,
        currentReviewDocument.evidenceId,
        version,
        accessToken,
      );
      setVersion(result.aggregateVersion);
      const nextReviewed = new Set(reviewedDocumentIds);
      nextReviewed.add(currentReviewDocument.evidenceId);
      setReviewedDocumentIds(nextReviewed);

      const nextIndex = reviewDocuments.findIndex((document, index) =>
        index !== reviewIndex && !nextReviewed.has(document.evidenceId));
      if (nextIndex >= 0) {
        setReviewIndex(nextIndex);
        setMessage('Document approved. Select any remaining document to continue review.');
      } else {
        setMessage('All uploaded Booking documents have been reviewed and approved.');
      }
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'The document could not be approved.');
      throw cause;
    } finally { setBusy(false); }
  };

  const optionalEvidence = detailsQuery.data?.optionalEvidence ?? [];
  const corporateEvidence = optionalEvidenceByKey(optionalEvidence, 'corporate_id');
  const gstEvidence = optionalEvidenceByKey(optionalEvidence, 'gst_certificate');
  const tradeEvidence = optionalEvidenceByKey(optionalEvidence, 'trade_in_vehicle_rc');
  const reviewedCount = reviewDocuments.filter((document) => reviewedDocumentIds.has(document.evidenceId)).length;
  const reviewDone = reviewDocuments.length > 0 && reviewedCount === reviewDocuments.length;

  return (
    <div className="screen-stack uc03-booking-journey">
      <div className="uc03-c1-topbar">
        <button type="button" className="uc03-c1-back" onClick={() => navigate('/dashboard')}>← Work List</button>
        <span>Project · {project.projectName}</span>
      </div>

      <PageHeader
        eyebrow="Capture New Booking"
        title={customerName}
        description={step === 1
          ? 'Step 1 of 3 · Upload Booking documents.'
          : step === 2
            ? 'Step 2 of 3 · Capture Booking details.'
            : 'Step 3 of 3 · Review uploaded documents and System Read fields.'}
      />

      {started ? (
        <nav className="uc03-booking-steps" aria-label="Booking capture steps">
          <button type="button" className={step === 1 ? 'is-active' : ''} onClick={() => setStep(1)}>1 <span>Documents</span></button>
          <button type="button" className={step === 2 ? 'is-active' : ''} onClick={() => setStep(2)}>2 <span>Booking Details</span></button>
          <button type="button" className={step === 3 ? 'is-active' : ''} onClick={handleReviewStepClick}>3 <span>Review</span></button>
        </nav>
      ) : null}

      {message ? <div className="uc03-booking-journey-feedback is-success" role="status">{message}</div> : null}
      {error ? <div className="uc03-booking-journey-feedback is-error" role="alert">{error}</div> : null}

      {!started ? (
        <section className="uc03-c1-start-panel">
          <div><span className="uc03-c1-eyebrow">Booking Journey</span><h2>Start Booking Capture</h2></div>
          <button type="button" className="uc03-c1-primary" disabled={busy} onClick={() => void handleStart()}>Start Booking</button>
        </section>
      ) : step === 1 ? (
        <section className="uc03-booking-step-panel">
          <header className="uc03-booking-step-heading">
            <div><span className="uc03-c1-eyebrow">Step 1</span><h2>Upload Documents</h2></div>
            <span>{part1.mandatoryEvidence.part1EvidenceComplete ? 'Mandatory uploads complete' : 'Mandatory uploads pending'}</span>
          </header>
          <div className="uc03-booking-document-grid">
            <UploadCard title="Booking Form / Booking Docket" requirement={bookingDocket} uploadBusy={uploadingKey === bookingDocket?.requirementKey} onUpload={handleUpload} />
            <UploadCard title="Booking Payment Receipt(s)" requirement={paymentReceipt} uploadBusy={uploadingKey === paymentReceipt?.requirementKey} multiple onUpload={handleUpload} />
            <UploadCard title="PAN" requirement={pan} uploadBusy={uploadingKey === pan?.requirementKey} optional onUpload={handleUpload} />
            <UploadCard title="Aadhaar" requirement={aadhaar} uploadBusy={uploadingKey === aadhaar?.requirementKey} optional onUpload={handleUpload} />
          </div>
          <div className="uc03-booking-step-footer">
            <span>Booking Docket + at least one KYC document + one payment receipt are expected. You may continue and complete missing evidence later.</span>
            <button type="button" className="uc03-c1-primary" disabled={Boolean(uploadingKey)} onClick={() => setStep(2)}>Continue to Booking Details →</button>
          </div>
        </section>
      ) : step === 2 ? (
        <section className="uc03-booking-step-panel">
          <header className="uc03-booking-step-heading">
            <div><span className="uc03-c1-eyebrow">Step 2</span><h2>Booking Details</h2></div>
            <span>Only Booking-stage PC inputs are captured here.</span>
          </header>

          {optionsQuery.isPending || detailsQuery.isPending ? <div className="uc03-booking-review-loading">Loading Project masters…</div> : null}
          {optionsQuery.isError ? <div className="uc03-booking-journey-feedback is-error">Booking Project masters could not be loaded.</div> : null}

          {options ? (
            <>
              <div className="uc03-booking-form-grid">
                <MasterSelect label="Type of Customer" value={form.customerType} options={options.customerTypes} onChange={(value) => updateForm('customerType', value)} />
                <MasterSelect label="Type of Deal" value={form.dealType} options={options.dealTypes} onChange={(value) => updateForm('dealType', value)} />
                <MasterSelect label="Deal Source" value={form.dealSource} options={options.dealSources} onChange={(value) => updateForm('dealSource', value)} />
                <MasterSelect label="Lead Generated Through" value={form.leadSource} options={options.leadSources} onChange={(value) => updateForm('leadSource', value)} />
              </div>

              <div className="uc03-booking-yesno-grid">
                <YesNo label="Outright Purchase" value={form.outrightPurchase} onChange={(value) => updateForm('outrightPurchase', value)} />
                <YesNo label="Trade In" value={form.tradeIn} onChange={(value) => updateForm('tradeIn', value)} />
                <YesNo label="GST Benefit" value={form.gstBenefit} onChange={(value) => updateForm('gstBenefit', value)} />
                {form.customerType === 'CORPORATE' ? (
                  <YesNo label="Corporate ID Available" value={form.corporateIdAvailable} onChange={(value) => updateForm('corporateIdAvailable', value)} />
                ) : null}
              </div>

              <div className="uc03-booking-conditional-evidence">
                {form.customerType === 'CORPORATE' && form.corporateIdAvailable === true ? (
                  <OptionalEvidenceUpload title="Corporate ID" evidence={corporateEvidence} busy={uploadingKey === 'corporate_id'} onUpload={(file) => handleOptionalUpload('corporate_id', file)} />
                ) : null}
                {form.gstBenefit === true ? (
                  <OptionalEvidenceUpload title="GST Certificate" evidence={gstEvidence} busy={uploadingKey === 'gst_certificate'} onUpload={(file) => handleOptionalUpload('gst_certificate', file)} />
                ) : null}
                {form.tradeIn === true ? (
                  <OptionalEvidenceUpload title="Trade-In Document" evidence={tradeEvidence} busy={uploadingKey === 'trade_in_vehicle_rc'} onUpload={(file) => handleOptionalUpload('trade_in_vehicle_rc', file)} />
                ) : null}
              </div>

              <div className="uc03-booking-form-grid">
                <MasterSelect label="Registration State" value={form.registrationState} options={options.registrationStates} onChange={(value) => updateForm('registrationState', value)} />
                <MasterSelect label="Territory Categorization" value={form.territoryCategorization} options={options.territoryCategories} onChange={(value) => updateForm('territoryCategorization', value)} />
                <MasterSelect label="District Name" value={form.districtName} options={options.districts} onChange={(value) => updateForm('districtName', value)} />
                <MasterSelect label="Registration Type" value={form.registrationType} options={options.registrationTypes} onChange={(value) => updateForm('registrationType', value)} />
                <MasterSelect label="Registration Category" value={form.registrationCategory} options={options.registrationCategories} onChange={(value) => updateForm('registrationCategory', value)} />
                {options.priceLists.length ? (
                  <label className="uc03-booking-field">
                    <span>Price List <small>(optional)</small></span>
                    <select value={form.priceListId} onChange={(event) => updateForm('priceListId', event.target.value)}>
                      <option value="">Continue without Price List</option>
                      {options.priceLists.map((item) => <option key={item.priceListId} value={item.priceListId}>{item.name}</option>)}
                    </select>
                  </label>
                ) : (
                  <div className="uc03-booking-field uc03-booking-journey-feedback" role="status">
                    <span>Price List</span>
                    <strong>Not configured for this Booking date.</strong>
                    <small>This is non-blocking. Booking can continue and an INFO audit observation will record the missing configuration.</small>
                  </div>
                )}
              </div>
            </>
          ) : null}

          {showMissingEvidenceWarning ? (
            <div className="uc03-booking-evidence-warning" role="alert">
              <div>
                <strong>Mandatory Booking documents are still pending.</strong>
                <p>You can continue. The Booking will remain In Progress and an INFO audit flag will record the missing evidence.</p>
                <ul>
                  {missingMandatoryDocuments.map((item) => <li key={item}>{item}</li>)}
                </ul>
              </div>
              <div className="uc03-booking-evidence-warning__actions">
                <button type="button" className="uc03-c1-secondary" disabled={busy} onClick={() => setShowMissingEvidenceWarning(false)}>Go Back</button>
                <button type="button" className="uc03-c1-primary" disabled={busy || Boolean(uploadingKey)} onClick={() => void performStartReview()}>{busy ? 'Checking…' : 'Continue Anyway'}</button>
              </div>
            </div>
          ) : null}

          {reviewWaitingDocuments.length > 0 ? (
            <div className="uc03-booking-review-waiting" role="status">
              <strong>{reviewWaitingDocuments.some((document) => reviewProcessingState(document) === 'FAILED') ? 'Document extraction needs attention.' : 'Document extraction is still running.'}</strong>
              <ul>
                {reviewWaitingDocuments.map((document, index) => (
                  <li key={document.evidenceId}>{reviewDocumentName(document, index)} · {displayName(document.processingStatus || 'Processing')}</li>
                ))}
              </ul>
              <div className="uc03-booking-evidence-warning__actions">
                <button type="button" className="uc03-c1-secondary" disabled={busy} onClick={() => setStep(1)}>Documents</button>
                <button type="button" className="uc03-c1-primary" disabled={busy} onClick={() => void performStartReview()}>{busy ? 'Checking…' : 'Check Again'}</button>
              </div>
            </div>
          ) : null}

          <div className="uc03-booking-step-footer">
            <button type="button" className="uc03-c1-secondary" onClick={() => setStep(1)}>← Documents</button>
            <button
              type="button"
              className="uc03-c1-primary"
              disabled={busy || Boolean(uploadingKey)}
              onClick={handleStartReview}
            >
              {busy ? 'Checking Documents…' : 'Review Booking Documents →'}
            </button>
          </div>
        </section>
      ) : (
        <section className="uc03-booking-step-panel uc03-booking-step-panel--review">
          <header className="uc03-booking-step-heading">
            <div><span className="uc03-c1-eyebrow">Step 3</span><h2>Review Booking Documents</h2></div>
            <span>{reviewDocuments.length ? `${reviewedCount} of ${reviewDocuments.length} reviewed` : 'No documents'}</span>
          </header>

          {reviewDocuments.length > 0 ? (
            <div className="uc03-booking-review-selector">
              <label>
                <span>Select document to review</span>
                <select
                  value={currentReviewDocument?.evidenceId || ''}
                  disabled={busy}
                  onChange={(event) => {
                    const nextIndex = reviewDocuments.findIndex((document) => document.evidenceId === event.target.value);
                    if (nextIndex >= 0) setReviewIndex(nextIndex);
                  }}
                >
                  {reviewDocuments.map((document, index) => (
                    <option key={document.evidenceId} value={document.evidenceId}>
                      {reviewedDocumentIds.has(document.evidenceId) ? '✓ ' : ''}{reviewDocumentName(document, index)}
                    </option>
                  ))}
                </select>
              </label>
              <span className={`uc03-booking-review-selector__status ${currentReviewDocument && reviewedDocumentIds.has(currentReviewDocument.evidenceId) ? 'is-reviewed' : ''}`}>
                {currentReviewDocument && reviewedDocumentIds.has(currentReviewDocument.evidenceId) ? '✓ Reviewed' : reviewDone ? 'All reviewed' : 'Pending review'}
              </span>
            </div>
          ) : null}

          {currentReviewDocument ? (
            <>
              {currentReviewDocument.requirementKey === 'booking_docket' ? (
                <div className="uc03-booking-product-confirmation">
                  <div><span>System Read Model</span><strong>{part1.productMaster.extractedModel || 'Pending extraction'}</strong></div>
                  <div><span>System Read Variant</span><strong>{part1.productMaster.extractedVariant || 'Pending extraction'}</strong></div>
                  <div><span>Product Master Model</span><strong>{part1.productMaster.modelName || '—'}</strong></div>
                  <div><span>Product Master Variant</span><strong>{part1.productMaster.variantName || '—'}</strong></div>
                  <StatusPill value={part1.productMaster.status} compact />
                  <p>{part1.productMaster.message}</p>
                </div>
              ) : null}
              <BookingReviewDocumentPanel
                key={currentReviewDocument.evidenceId}
                tenantId={project.tenantId}
                journeyId={journeyId}
                accessToken={accessToken}
                evidenceId={currentReviewDocument.evidenceId}
                documentName={reviewDocumentName(currentReviewDocument, reviewIndex)}
                proposals={currentReviewProposals}
                aggregateVersion={version}
                disabled={busy}
                approved={reviewedDocumentIds.has(currentReviewDocument.evidenceId)}
                onVersion={setVersion}
                onApprove={handleApproveDocument}
              />
            </>
          ) : reviewDone ? (
            <div className="uc03-booking-review-complete"><strong>Booking document review complete.</strong><span>All uploaded Booking evidence has been reviewed.</span></div>
          ) : (
            <div className="uc03-booking-review-empty">No uploaded Booking documents are available for review.</div>
          )}

          <div className="uc03-booking-step-footer">
            <button type="button" className="uc03-c1-secondary" disabled={busy} onClick={() => setStep(2)}>← Booking Details</button>
          </div>
        </section>
      )}
    </div>
  );
}
