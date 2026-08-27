import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';

import PageHeader from '../components/PageHeader';
import StatusPill from '../components/StatusPill';
import {
  bookingDetailsOptionsQueryKey,
  bookingDetailsQueryKey,
  bookingPart1QueryKey,
  bookingWorkspaceQueryKey,
  pcVerificationQueryKey,
  UC03_OPERATIONAL_GC_MS,
  UC03_OPERATIONAL_STALE_MS,
} from '../features/uc03/queryKeys';
import {
  getBookingWorkspace,
  startBooking,
  uploadBookingDocument,
  type BookingWorkspace,
} from '../services/audit-core/uc03Booking';
import {
  getBookingDetails,
  getBookingDetailsOptions,
  saveBookingDetails,
  type BookingDetailsPayload,
  type BookingDetailsView,
  type BookingOptionalEvidence,
  type BookingReferenceOption,
} from '../services/audit-core/uc03BookingJourney';
import {
  getBookingPart1,
  type BookingPart1View,
  type Part1EvidenceItem,
  type Part1Requirement,
} from '../services/audit-core/uc03BookingPart1';
import {
  getPcVerification,
  submitPcBookingCapture,
  type PcVerificationView,
} from '../services/audit-core/uc03PcVerification';
import { useProjectContextStore } from '../store/projectContextStore';
import { useSessionStore } from '../store/sessionStore';
import { displayName } from '../utils/displayNames';

const SUCCESS_PROCESSING_STATUSES = new Set([
  'COMPLETED', 'COMPLETE', 'PROCESSED', 'SUCCEEDED', 'READY', 'VERIFIED',
]);
const FAILED_PROCESSING_STATUSES = new Set(['FAILED', 'REJECTED']);

type JourneyStep = 1 | 2;
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

function withMandatorySummary(view: BookingPart1View, requirements: Part1Requirement[]): BookingPart1View {
  const booking = requirementByKind(requirements, 'BOOKING_DOCKET')?.evidence.length ?? 0;
  const pan = requirementByKind(requirements, 'PAN')?.evidence.length ?? 0;
  const aadhaar = requirementByKind(requirements, 'AADHAAR')?.evidence.length ?? 0;
  const receipts = requirementByKind(requirements, 'BOOKING_PAYMENT_RECEIPT')?.evidence.length ?? 0;
  return {
    ...view,
    requirements,
    mandatoryEvidence: {
      bookingDocketComplete: booking > 0,
      kycComplete: pan > 0 || aadhaar > 0,
      kycBothProvided: pan > 0 && aadhaar > 0,
      paymentReceiptComplete: receipts > 0,
      paymentReceiptCount: receipts,
      part1EvidenceComplete: booking > 0 && (pan > 0 || aadhaar > 0) && receipts > 0,
    },
  };
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
  const processing = evidence?.processingStatus
    && !SUCCESS_PROCESSING_STATUSES.has(evidence.processingStatus.toUpperCase())
    && !FAILED_PROCESSING_STATUSES.has(evidence.processingStatus.toUpperCase());
  const failed = evidence?.processingStatus
    ? FAILED_PROCESSING_STATUSES.has(evidence.processingStatus.toUpperCase())
    : false;
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

export default function BookingWorkspacePage() {
  const { journeyId } = useParams<{ journeyId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
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

  const enabled = Boolean(project?.tenantId && journeyId && accessToken);
  const workspaceKey = bookingWorkspaceQueryKey(project?.tenantId, journeyId);
  const part1Key = bookingPart1QueryKey(project?.tenantId, journeyId);
  const detailsKey = bookingDetailsQueryKey(project?.tenantId, journeyId);
  const optionsKey = bookingDetailsOptionsQueryKey(project?.tenantId, journeyId);
  const verificationKey = pcVerificationQueryKey(project?.tenantId, journeyId);

  const workspaceQuery = useQuery({
    queryKey: workspaceKey,
    queryFn: () => getBookingWorkspace(project!.tenantId, journeyId!, accessToken),
    enabled,
    staleTime: UC03_OPERATIONAL_STALE_MS,
    gcTime: UC03_OPERATIONAL_GC_MS,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const part1Query = useQuery({
    queryKey: part1Key,
    queryFn: () => getBookingPart1(project!.tenantId, journeyId!, accessToken),
    enabled,
    staleTime: UC03_OPERATIONAL_STALE_MS,
    gcTime: UC03_OPERATIONAL_GC_MS,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const detailsQuery = useQuery({
    queryKey: detailsKey,
    queryFn: () => getBookingDetails(project!.tenantId, journeyId!, accessToken),
    enabled: enabled && step === 2,
    staleTime: UC03_OPERATIONAL_STALE_MS,
    gcTime: UC03_OPERATIONAL_GC_MS,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const optionsQuery = useQuery({
    queryKey: optionsKey,
    queryFn: () => getBookingDetailsOptions(project!.tenantId, journeyId!, accessToken),
    enabled: enabled && step === 2,
    staleTime: UC03_OPERATIONAL_STALE_MS,
    gcTime: UC03_OPERATIONAL_GC_MS,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const verificationQuery = useQuery({
    queryKey: verificationKey,
    queryFn: () => getPcVerification(project!.tenantId, journeyId!, accessToken),
    enabled: enabled && step === 2 && Boolean(workspaceQuery.data?.bookingStage.businessStatus),
    staleTime: UC03_OPERATIONAL_STALE_MS,
    gcTime: UC03_OPERATIONAL_GC_MS,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: false,
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

  if (!project || !journeyId) return null;
  if (workspaceQuery.isPending || part1Query.isPending) {
    return (
      <div className="screen-stack uc03-booking-journey">
        <div className="uc03-c1-topbar">
          <button type="button" className="uc03-c1-back" onClick={() => navigate('/dashboard')}>← Work List</button>
        </div>
        <PageHeader eyebrow="Capture New Booking" title="Booking" description="Opening Booking documents…" />
        <div className="uc03-c1-loading" role="status">Loading Booking…</div>
      </div>
    );
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
        <button
          type="button"
          className="user-menu-button"
          onClick={() => void Promise.all([workspaceQuery.refetch(), part1Query.refetch()])}
        >Try Again</button>
      </section>
    );
  }

  const workspace = workspaceQuery.data;
  const part1 = part1Query.data;
  const options = optionsQuery.data;
  const verification = verificationQuery.data;
  const started = Boolean(workspace.bookingStage.businessStatus);
  const customerName = String(workspace.capture.CUSTOMER_NAME || 'Customer');
  const bookingDocket = requirementByKind(part1.requirements, 'BOOKING_DOCKET');
  const pan = requirementByKind(part1.requirements, 'PAN');
  const aadhaar = requirementByKind(part1.requirements, 'AADHAAR');
  const paymentReceipt = requirementByKind(part1.requirements, 'BOOKING_PAYMENT_RECEIPT');
  const captureSubmitted = verification?.captureSubmitted ?? false;
  const verified = verification?.pcVerificationStatus === 'VERIFIED';

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
  };

  const detailsPayload = (): BookingDetailsPayload => {
    if (!formComplete || form.outrightPurchase === null || form.tradeIn === null || form.gstBenefit === null) {
      throw new Error('Complete all mandatory Booking Details before saving dependent optional documents.');
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

  const pcCaptureValues = (): Record<string, unknown> => {
    const values: Record<string, unknown> = {};
    const put = (key: string, value: string) => {
      const normalized = value.trim();
      if (normalized) values[key] = normalized;
    };
    put('CUSTOMER_TYPE', form.customerType);
    put('DEAL_TYPE', form.dealType);
    put('DEAL_SOURCE', form.dealSource);
    put('LEAD_SOURCE', form.leadSource);
    put('REGISTRATION_STATE', form.registrationState);
    put('TERRITORY_CATEGORIZATION', form.territoryCategorization);
    put('DISTRICT_NAME', form.districtName);
    put('REGISTRATION_TYPE', form.registrationType);
    put('REGISTRATION_CATEGORY', form.registrationCategory);
    if (form.tradeIn !== null) values.EXCHANGE_TAKEN = form.tradeIn;
    return values;
  };

  const handleStart = async () => {
    setBusy(true); setError(undefined); setMessage(undefined);
    try {
      const result = await startBooking(project.tenantId, journeyId, version, accessToken);
      setVersion(result.aggregateVersion);
      queryClient.setQueryData<BookingWorkspace>(workspaceKey, (current) => current ? {
        ...current,
        bookingStage: {
          ...current.bookingStage,
          businessStatus: result.businessStatus,
          auditState: result.auditState as BookingWorkspace['bookingStage']['auditState'],
          auditStatus: result.auditStatus as BookingWorkspace['bookingStage']['auditStatus'],
          closureDisposition: result.closureDisposition,
        },
        aggregateVersion: result.aggregateVersion,
      } : current);
      setMessage('Booking started.');
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'Booking could not be started.');
    } finally { setBusy(false); }
  };

  const handleUpload = async (requirement: Part1Requirement, files: File[]) => {
    setUploadingKey(requirement.requirementKey); setError(undefined); setMessage(undefined);
    try {
      for (const file of files) {
        const result = await uploadBookingDocument(
          project.tenantId,
          journeyId,
          requirement.requirementKey,
          file,
          accessToken,
        );
        const evidence: Part1EvidenceItem = {
          evidenceId: result.evidenceId,
          documentTypeKey: requirement.documentTypeKey,
          processingStatus: result.processingStatus,
          verificationStatus: null,
          linkedAtUtc: new Date().toISOString(),
        };
        queryClient.setQueryData<BookingPart1View>(part1Key, (current) => {
          if (!current) return current;
          const requirements = current.requirements.map((item) => {
            if (item.requirementKey !== requirement.requirementKey) return item;
            return {
              ...item,
              evidence: item.kind === 'BOOKING_PAYMENT_RECEIPT'
                ? [...item.evidence.filter((entry) => entry.evidenceId !== evidence.evidenceId), evidence]
                : [evidence],
            };
          });
          return withMandatorySummary(current, requirements);
        });
      }
      setMessage('Document accepted by Document Intelligence. Extraction continues asynchronously and does not block Booking submission.');
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'The document could not be uploaded.');
    } finally { setUploadingKey(undefined); }
  };

  const saveCurrentDetails = async () => {
    const payload = detailsPayload();
    const result = await saveBookingDetails(project.tenantId, journeyId, payload, version, accessToken);
    setVersion(result.aggregateVersion);
    setFormDirty(false);
    queryClient.setQueryData<BookingDetailsView>(detailsKey, (current) => current ? {
      ...current,
      ...payload,
      aggregateVersion: result.aggregateVersion,
      optionalEvidence: result.optionalEvidence,
    } : current);
    queryClient.setQueryData<BookingWorkspace>(workspaceKey, (current) => current ? {
      ...current,
      aggregateVersion: result.aggregateVersion,
    } : current);
    return result;
  };

  const handleOptionalUpload = async (requirementKey: string, file: File) => {
    setUploadingKey(requirementKey); setBusy(true); setError(undefined); setMessage(undefined);
    try {
      const saved = await saveCurrentDetails();
      const requirement = saved.optionalEvidence.find((item) => item.requirementKey === requirementKey);
      if (!requirement) throw new Error('This optional Booking document is not configured for the Journey.');
      const uploaded = await uploadBookingDocument(
        project.tenantId,
        journeyId,
        requirement.requirementKey,
        file,
        accessToken,
      );
      queryClient.setQueryData<BookingDetailsView>(detailsKey, (current) => current ? {
        ...current,
        optionalEvidence: current.optionalEvidence.map((item) => item.requirementKey === requirementKey ? {
          ...item,
          evidenceId: uploaded.evidenceId,
          processingStatus: uploaded.processingStatus,
        } : item),
      } : current);
      setMessage('Optional document accepted by Document Intelligence. Extraction continues asynchronously.');
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'The optional document could not be uploaded.');
    } finally { setUploadingKey(undefined); setBusy(false); }
  };

  const handleSubmitBooking = async () => {
    setBusy(true); setError(undefined); setMessage(undefined);
    try {
      let submitVersion = version;
      if (formComplete) {
        const saved = await saveCurrentDetails();
        submitVersion = saved.aggregateVersion;
      }
      const submitted = await submitPcBookingCapture(
        project.tenantId,
        journeyId,
        submitVersion,
        pcCaptureValues(),
        accessToken,
      );
      queryClient.setQueryData<PcVerificationView>(verificationKey, submitted);
      queryClient.setQueryData<BookingWorkspace>(workspaceKey, (current) => current ? {
        ...current,
        aggregateVersion: submitted.aggregateVersion,
      } : current);
      setVersion(submitted.aggregateVersion);
      navigate(`/bookings/${journeyId}/review`, { replace: true });
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'Booking capture could not be submitted.');
    } finally { setBusy(false); }
  };

  const optionalEvidence = detailsQuery.data?.optionalEvidence ?? [];
  const corporateEvidence = optionalEvidenceByKey(optionalEvidence, 'corporate_id');
  const gstEvidence = optionalEvidenceByKey(optionalEvidence, 'gst_certificate');
  const tradeEvidence = optionalEvidenceByKey(optionalEvidence, 'trade_in_vehicle_rc');

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
          ? 'Step 1 of 2 · Upload the Booking documents that are currently available.'
          : 'Step 2 of 2 · Capture the Booking details currently available, then submit Booking.'}
      />

      {started ? (
        <nav className="uc03-booking-steps" aria-label="Booking capture steps">
          <button type="button" className={step === 1 ? 'is-active' : ''} onClick={() => setStep(1)}>1 <span>Documents</span></button>
          <button type="button" className={step === 2 ? 'is-active' : ''} onClick={() => setStep(2)}>2 <span>Booking Details</span></button>
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
            <span>{part1.mandatoryEvidence.part1EvidenceComplete ? 'Expected uploads complete' : 'Some documents are still pending'}</span>
          </header>
          <div className="uc03-booking-document-grid">
            <UploadCard title="Booking Form / Booking Docket" requirement={bookingDocket} uploadBusy={uploadingKey === bookingDocket?.requirementKey} onUpload={handleUpload} />
            <UploadCard title="Booking Payment Receipt(s)" requirement={paymentReceipt} uploadBusy={uploadingKey === paymentReceipt?.requirementKey} multiple onUpload={handleUpload} />
            <UploadCard title="PAN" requirement={pan} uploadBusy={uploadingKey === pan?.requirementKey} optional onUpload={handleUpload} />
            <UploadCard title="Aadhaar" requirement={aadhaar} uploadBusy={uploadingKey === aadhaar?.requirementKey} optional onUpload={handleUpload} />
          </div>
          <div className="uc03-booking-step-footer">
            <span>Upload what is available now. Missing documents do not block Booking capture; they remain visible for follow-up and Review.</span>
            <button type="button" className="uc03-c1-primary" disabled={Boolean(uploadingKey)} onClick={() => setStep(2)}>Continue to Booking Details →</button>
          </div>
        </section>
      ) : (
        <section className="uc03-booking-step-panel">
          <header className="uc03-booking-step-heading">
            <div><span className="uc03-c1-eyebrow">Step 2</span><h2>Booking Details</h2></div>
            <span>Capture the Booking-stage information that is available to the PC.</span>
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
                    <small>This is non-blocking for Booking submission.</small>
                  </div>
                )}
              </div>
            </>
          ) : null}

          {!formComplete ? (
            <div className="uc03-booking-journey-feedback" role="status">
              You can submit the Booking with the information currently available. Fields that require a complete Booking Details record can be completed later.
            </div>
          ) : null}

          <div className="uc03-booking-step-footer">
            <button type="button" className="uc03-c1-secondary" disabled={busy} onClick={() => setStep(1)}>← Documents</button>
            {verified ? (
              <button type="button" className="uc03-c1-primary" disabled={busy} onClick={() => navigate(`/bookings/${journeyId}/review`)}>
                View Verification
              </button>
            ) : captureSubmitted ? (
              <button type="button" className="uc03-c1-primary" disabled={busy} onClick={() => navigate(`/bookings/${journeyId}/review`)}>
                Review Documents →
              </button>
            ) : (
              <button
                type="button"
                className="uc03-c1-primary"
                disabled={busy || Boolean(uploadingKey)}
                onClick={() => void handleSubmitBooking()}
              >
                {busy ? 'Submitting Booking…' : 'Submit Booking →'}
              </button>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
