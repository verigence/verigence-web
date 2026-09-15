import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';

import PageHeader from '../components/PageHeader';
import AttributeEvidenceViewer, { hasBoxedEvidence } from '../features/uc03/AttributeEvidenceViewer';
import { AuditCoreHttpError } from '../services/audit-core/client';
import { getBookingCaptureV2, type CaptureV2Requirement } from '../services/audit-core/uc03DocumentCaptureV2';
import { getDeliveryCaptureV2 } from '../services/audit-core/uc03DeliveryCaptureV2';
import {
  getBookingReviewV2,
  getDeliveryReviewV2,
  submitFieldCorrection,
  type BookingReviewV2,
  type DeliveryReviewV2,
  type ReviewV2Document,
  type ReviewV2Field,
  type ReviewV2SourceValue,
} from '../services/audit-core/uc03DocumentReviewV2';
import {
  confirmModelResolutionSku,
  getModelResolutionCandidates,
} from '../services/audit-core/uc03ModelResolution';
import { reconcileUnifiedDocuments, uploadUnifiedCaptureFiles } from '../services/audit-core/uc03UnifiedDocumentCapture';
import { useProjectContextStore } from '../store/projectContextStore';
import { useSessionStore } from '../store/sessionStore';
import '../styles/uc03-journey-documents.css';

type Stage = 'BOOKING' | 'DELIVERY';
const REVIEW_THRESHOLD = 90;

function displayFieldKey(fieldKey: string): string {
  return fieldKey
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return 'Not extracted';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  try { return JSON.stringify(value); } catch { return String(value); }
}

function isHighConfidence(confidenceScore: number | null): boolean {
  return confidenceScore !== null && confidenceScore !== undefined && confidenceScore >= REVIEW_THRESHOLD;
}

function fieldSource(document: ReviewV2Document, field: ReviewV2Field): ReviewV2SourceValue {
  return {
    canonicalFieldId: field.canonicalFieldId,
    fieldKey: field.fieldKey,
    value: field.value,
    confidenceScore: field.confidenceScore,
    sourceFactVersion: field.sourceFactVersion,
    reviewState: field.reviewState,
    documentId: document.documentId,
    evidenceId: document.evidenceId,
    documentTypeKey: document.documentTypeKey,
    documentLabel: document.label,
    originalFilename: document.originalFilename,
    contentUrl: document.contentUrl,
    pageNo: field.pageNo,
    evidenceRegion: field.evidenceRegion,
  };
}

function fieldRowKey(field: ReviewV2Field): string {
  return `${field.canonicalFieldId}:${field.fieldKey}:${field.sourceFactVersion}`;
}

type LocalCorrectionState =
  | { kind: 'APPLIED'; value: unknown }
  | { kind: 'PENDING' };

/**
 * One field, one correction action. Every field -- whatever its confidence
 * -- gets the same inline form; what differs is server-side behavior (see
 * submitFieldCorrection's doc comment): a <90% save applies immediately and
 * closes on its own, a >=90% save raises a Team-Lead-adjudicated proposal
 * and stays visibly pending until someone acts on it. Saving here NEVER
 * touches the stage's Review Confirm/Submit flow -- each field is its own
 * small, always-repeatable action, not a batch queued for one big Save.
 */
function FieldCorrectionRow({
  stage,
  document,
  field,
  local,
  onLocalChange,
  onEvidence,
  tenantId,
  journeyId,
  accessToken,
}: {
  stage: Stage;
  document: ReviewV2Document;
  field: ReviewV2Field;
  local?: LocalCorrectionState;
  onLocalChange: (state: LocalCorrectionState) => void;
  onEvidence: (source: ReviewV2SourceValue) => void;
  tenantId: string;
  journeyId: string;
  accessToken?: string;
}) {
  const [open, setOpen] = useState(false);
  const [draftValue, setDraftValue] = useState('');
  const [remarks, setRemarks] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const currentValue = local?.kind === 'APPLIED' ? local.value : field.value;
  const highConf = isHighConfidence(field.confidenceScore);
  const source = fieldSource(document, field);
  const boxed = hasBoxedEvidence(source);
  const pending = local?.kind === 'PENDING';

  const openForm = () => {
    setDraftValue(displayValue(currentValue) === 'Not extracted' ? '' : displayValue(currentValue));
    setRemarks('');
    setError(undefined);
    setOpen(true);
  };

  const submit = async () => {
    if (!draftValue.trim()) return;
    if (highConf && !remarks.trim()) {
      setError('Remarks are required for a value at or above 90% confidence.');
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      await submitFieldCorrection(tenantId, journeyId, {
        stage,
        documentId: document.documentId,
        documentTypeKey: document.documentTypeKey || 'unknown',
        fieldKey: field.fieldKey,
        canonicalFieldId: field.canonicalFieldId,
        sourceFactVersion: field.sourceFactVersion,
        confidenceScore: field.confidenceScore,
        evidenceId: document.evidenceId,
        originalValue: field.value,
        newValue: draftValue,
        remarks: remarks.trim() || undefined,
      }, accessToken);
      onLocalChange(highConf ? { kind: 'PENDING' } : { kind: 'APPLIED', value: draftValue });
      setOpen(false);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'This correction could not be saved. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <tr className={field.reviewState === 'NEEDS_REVIEW' && !local ? 'needs-review' : ''}>
      <td><strong>{displayFieldKey(field.fieldKey)}</strong></td>
      <td>
        {displayValue(currentValue)}
        {local?.kind === 'APPLIED' ? <span className="uc03-jd-applied-badge">Corrected</span> : null}
      </td>
      <td>{field.confidenceScore === null || field.confidenceScore === undefined ? '—' : `${field.confidenceScore.toFixed(field.confidenceScore % 1 === 0 ? 0 : 1)}%`}</td>
      <td>
        {boxed ? (
          <button type="button" className="uc03-attribute-evidence-link" onClick={() => onEvidence(source)}>View boxed evidence</button>
        ) : <span className="uc03-jd-muted">Location unavailable</span>}
      </td>
      <td>
        {pending ? (
          <span className="uc03-jd-proposed-badge">Proposed — pending Team Lead review</span>
        ) : open ? (
          <form
            className="uc03-jd-propose-form"
            onSubmit={(event) => { event.preventDefault(); void submit(); }}
          >
            <label>
              {highConf ? 'Corrected value' : 'New value'}
              <input value={draftValue} onChange={(event) => setDraftValue(event.target.value)} required disabled={busy} />
            </label>
            {highConf ? (
              <label>
                Remarks — why is the extracted value wrong?
                <textarea value={remarks} onChange={(event) => setRemarks(event.target.value)} required rows={2} disabled={busy} />
              </label>
            ) : null}
            <div className="uc03-jd-propose-actions">
              <button type="button" onClick={() => setOpen(false)} disabled={busy}>Cancel</button>
              <button type="submit" disabled={busy || !draftValue.trim()}>
                {busy ? 'Saving…' : highConf ? 'Submit for Team Lead review' : 'Save'}
              </button>
            </div>
            {error ? <div className="uc03-jd-error" role="alert">{error}</div> : null}
          </form>
        ) : (
          <button type="button" className="uc03-jd-propose-link" onClick={openForm}>
            {highConf ? 'Propose correction' : 'Correct this value'}
          </button>
        )}
      </td>
    </tr>
  );
}

function DocumentFieldsPanel({
  stage,
  document,
  localByField,
  onLocalChange,
  onEvidence,
  tenantId,
  journeyId,
  accessToken,
}: {
  stage: Stage;
  document: ReviewV2Document;
  localByField: Map<string, LocalCorrectionState>;
  onLocalChange: (key: string, state: LocalCorrectionState) => void;
  onEvidence: (source: ReviewV2SourceValue) => void;
  tenantId: string;
  journeyId: string;
  accessToken?: string;
}) {
  if (!document.fields.length) {
    return <p className="uc03-jd-empty">No fields have been extracted from this document yet.</p>;
  }

  return (
    <div className="uc03-jd-fields-table-wrap">
      <table className="uc03-jd-fields-table">
        <thead>
          <tr>
            <th>Field</th>
            <th>Value</th>
            <th>Confidence</th>
            <th>Evidence</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {document.fields.map((field) => {
            const key = fieldRowKey(field);
            return (
              <FieldCorrectionRow
                key={key}
                stage={stage}
                document={document}
                field={field}
                local={localByField.get(key)}
                onLocalChange={(state) => onLocalChange(key, state)}
                onEvidence={onEvidence}
                tenantId={tenantId}
                journeyId={journeyId}
                accessToken={accessToken}
              />
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function StageBucket({
  stage,
  review,
  onEvidence,
  tenantId,
  journeyId,
  accessToken,
}: {
  stage: Stage;
  review: BookingReviewV2 | DeliveryReviewV2 | undefined;
  onEvidence: (source: ReviewV2SourceValue) => void;
  tenantId: string;
  journeyId: string;
  accessToken?: string;
}) {
  const [activeDocumentId, setActiveDocumentId] = useState<string>();
  const [localByField, setLocalByField] = useState<Map<string, LocalCorrectionState>>(new Map());

  const documents = review?.documents ?? [];
  const currentDocumentId = activeDocumentId && documents.some((document) => document.documentId === activeDocumentId)
    ? activeDocumentId
    : documents[0]?.documentId;
  const currentDocument = documents.find((document) => document.documentId === currentDocumentId);

  const setLocal = (key: string, state: LocalCorrectionState) => {
    setLocalByField((current) => {
      const next = new Map(current);
      next.set(key, state);
      return next;
    });
  };

  return (
    <section className="uc03-jd-bucket">
      <header className="uc03-jd-bucket-header">
        <h2>{stage === 'BOOKING' ? 'Booking documents' : 'Delivery documents'}</h2>
        <span>{documents.length} uploaded</span>
      </header>

      {!review ? (
        <p className="uc03-jd-empty">
          {stage === 'BOOKING'
            ? 'Booking has not started on this Journey yet.'
            : 'No Delivery document has been uploaded yet — Delivery starts automatically once one is.'}
        </p>
      ) : !documents.length ? (
        <p className="uc03-jd-empty">No documents have been uploaded for {stage === 'BOOKING' ? 'Booking' : 'Delivery'} yet.</p>
      ) : (
        <div className="uc03-jd-stage-panel">
          <div className="uc03-jd-doc-tabs" role="tablist" aria-label={`${stage === 'BOOKING' ? 'Booking' : 'Delivery'} documents`}>
            {documents.map((document) => (
              <button
                key={document.documentId}
                type="button"
                role="tab"
                aria-selected={document.documentId === currentDocumentId}
                className={document.documentId === currentDocumentId ? 'is-active' : ''}
                onClick={() => setActiveDocumentId(document.documentId)}
              >
                {document.label}
                {document.extractionState === 'PENDING' ? <span className="uc03-jd-tab-flag pending">extracting…</span> : null}
                {document.extractionState === 'FAILED' ? <span className="uc03-jd-tab-flag failed">failed</span> : null}
              </button>
            ))}
          </div>

          {currentDocument ? (
            <section className="uc03-jd-document-panel">
              <header>
                <div>
                  <span className="uc03-c1-eyebrow">{currentDocument.documentTypeKey || 'Document'}</span>
                  <h3>{currentDocument.originalFilename}</h3>
                </div>
                {currentDocument.extractionState === 'PENDING' ? <span className="uc03-jd-status pending">Extraction in progress</span> : null}
                {currentDocument.extractionState === 'FAILED' ? <span className="uc03-jd-status failed">Processing failed</span> : null}
              </header>
              <DocumentFieldsPanel
                stage={stage}
                document={currentDocument}
                localByField={localByField}
                onLocalChange={setLocal}
                onEvidence={onEvidence}
                tenantId={tenantId}
                journeyId={journeyId}
                accessToken={accessToken}
              />
            </section>
          ) : null}
        </div>
      )}
    </section>
  );
}

interface ChecklistEntry extends CaptureV2Requirement {
  stage: Stage;
}

function CombinedChecklist({ items }: { items: ChecklistEntry[] }) {
  const applicable = items.filter((item) => item.applicabilityState !== 'NOT_APPLICABLE');
  if (!applicable.length) return null;
  const received = applicable.filter((item) => item.document).length;

  return (
    <section className="uc03-jd-checklist">
      <header>
        <h2>Document checklist</h2>
        <span>{received} of {applicable.length} received</span>
      </header>
      <ul>
        {applicable.map((item) => (
          <li key={`${item.stage}:${item.requirementKey}`} className={item.document ? 'is-received' : 'is-missing'}>
            <span className={`uc03-jd-checklist-stage ${item.stage.toLowerCase()}`}>{item.stage === 'BOOKING' ? 'Booking' : 'Delivery'}</span>
            <span className="uc03-jd-checklist-label">{item.label}</span>
            {item.requirementLevel !== 'REQUIRED' ? <span className="uc03-jd-checklist-level">{item.requirementLevel.toLowerCase()}</span> : null}
            <span className="uc03-jd-checklist-status">{item.document ? '✓ Received' : 'Missing'}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function UploadDropzone({
  onFilesSelected,
  busy,
  message,
  error,
}: {
  onFilesSelected: (files: File[]) => void;
  busy: boolean;
  message?: string;
  error?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  return (
    <section
      className={`uc03-jd-upload ${dragOver ? 'is-dragover' : ''}`}
      onDragOver={(event) => { event.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragOver(false);
        const files = Array.from(event.dataTransfer.files || []);
        if (files.length) onFilesSelected(files);
      }}
    >
      <input
        ref={inputRef}
        type="file"
        multiple
        hidden
        onChange={(event) => {
          const files = Array.from(event.target.files || []);
          if (files.length) onFilesSelected(files);
          event.target.value = '';
        }}
      />
      <div>
        <strong>Upload documents</strong>
        <p>Drag files here, or choose files. Booking or Delivery — the system figures out which once it's classified.</p>
      </div>
      <button type="button" className="uc03-c3-primary" disabled={busy} onClick={() => inputRef.current?.click()}>
        {busy ? 'Uploading…' : 'Choose files'}
      </button>
      {message ? <div className="uc03-jd-success" role="status">{message}</div> : null}
      {error ? <div className="uc03-jd-error" role="alert">{error}</div> : null}
    </section>
  );
}

function formatMoney(amount: string | null): string {
  if (amount === null) return '—';
  const value = Number(amount);
  if (Number.isNaN(value)) return amount;
  return `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

/**
 * Shown only when MODEL_NOT_IDENTIFIED is open for this Journey: the Booking
 * model text couldn't be resolved to exactly one SKU automatically. Lists
 * the shortlisted candidates (from the same price masters the automatic
 * resolver itself matches against) so the PC can pick the one that matches
 * the scanned Booking Form, open right below in the Booking documents bucket.
 */
function ModelResolutionSkuPicker({
  tenantId,
  journeyId,
  accessToken,
  onResolved,
}: {
  tenantId: string;
  journeyId: string;
  accessToken?: string;
  onResolved: () => void;
}) {
  const [searchParams] = useSearchParams();
  const sectionRef = useRef<HTMLElement>(null);
  const [selectedSkuId, setSelectedSkuId] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [done, setDone] = useState<string>();

  const query = useQuery({
    queryKey: ['uc03-model-resolution-candidates', tenantId, journeyId],
    queryFn: () => getModelResolutionCandidates(tenantId, journeyId, accessToken),
    enabled: Boolean(tenantId && journeyId && accessToken),
    retry: false,
    refetchOnWindowFocus: false,
  });

  // Task Queue's "Select SKU →" CTA links here with ?selectSku=1 -- jump to
  // this section once its data (and so its DOM node) actually exists,
  // instead of racing the page-level mount.
  useEffect(() => {
    if (searchParams.get('selectSku') === '1' && query.data) {
      sectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [searchParams, query.data]);

  // A 404 here just means there's no open vehicle-model gap for this
  // Journey right now -- not an error state, nothing to render.
  const notApplicable = query.error instanceof AuditCoreHttpError && query.error.status === 404;
  if (notApplicable || query.isPending || query.isError || !query.data || done) {
    return done ? (
      <section id="model-resolution-picker" ref={sectionRef} className="uc03-jd-sku-picker">
        <div className="uc03-jd-success" role="status">{done}</div>
      </section>
    ) : null;
  }

  const { reviewedModelName, reviewedVariantName, reviewedColourName, candidates } = query.data;

  const confirm = async () => {
    if (!selectedSkuId) return;
    setBusy(true);
    setError(undefined);
    try {
      const result = await confirmModelResolutionSku(tenantId, journeyId, selectedSkuId, accessToken);
      setDone(`Confirmed ${result.modelName}${result.variantName ? ` ${result.variantName}` : ''} as the vehicle for this booking.`);
      onResolved();
    } catch (confirmError) {
      setError(confirmError instanceof Error ? confirmError.message : 'That SKU could not be confirmed. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section id="model-resolution-picker" ref={sectionRef} className="uc03-jd-sku-picker">
      <header>
        <h2>Select the vehicle SKU</h2>
        <p>
          The Booking Form's model text
          {reviewedModelName ? <> — <strong>“{reviewedModelName}{reviewedVariantName ? ` ${reviewedVariantName}` : ''}{reviewedColourName ? ` (${reviewedColourName})` : ''}”</strong> —</> : null}
          {' '}matched {candidates.length > 0 ? `${candidates.length} possible SKUs` : 'no SKU'} in the price masters and needs a human pick.
          Check the scanned Booking Form below, then choose the matching SKU here.
        </p>
      </header>

      {candidates.length === 0 ? (
        <p className="uc03-jd-empty">No SKU in the current price masters matches this model at all — this usually means the model wasn't captured correctly, or the price masters need updating. Correct the Booking Form fields above first.</p>
      ) : (
        <ul className="uc03-jd-sku-candidates">
          {candidates.map((candidate) => (
            <li key={candidate.productSkuId}>
              <label className={selectedSkuId === candidate.productSkuId ? 'is-selected' : ''}>
                <input
                  type="radio"
                  name="model-resolution-sku"
                  value={candidate.productSkuId}
                  checked={selectedSkuId === candidate.productSkuId}
                  onChange={() => setSelectedSkuId(candidate.productSkuId)}
                />
                <span className="uc03-jd-sku-candidate__label">
                  <strong>{candidate.modelName}{candidate.variantName ? ` ${candidate.variantName}` : ''}</strong>
                  {candidate.colourName ? <span className="uc03-jd-sku-candidate__colour">{candidate.colourName}</span> : null}
                  <span className="uc03-jd-sku-candidate__code">{candidate.skuCode}</span>
                </span>
                <span className="uc03-jd-sku-candidate__price">
                  <span>Ex-showroom {formatMoney(candidate.exShowroomPrice)}</span>
                  {candidate.totalPrice ? <span className="uc03-jd-sku-candidate__total">On-road {formatMoney(candidate.totalPrice)}</span> : null}
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}

      {candidates.length > 0 ? (
        <div className="uc03-jd-sku-picker__actions">
          <button type="button" className="uc03-c3-primary" disabled={!selectedSkuId || busy} onClick={() => void confirm()}>
            {busy ? 'Confirming…' : 'Confirm SKU'}
          </button>
        </div>
      ) : null}
      {error ? <div className="uc03-jd-error" role="alert">{error}</div> : null}
    </section>
  );
}

export default function JourneyDocumentsPage() {
  const { journeyId } = useParams<{ journeyId: string }>();
  const navigate = useNavigate();
  const project = useProjectContextStore((state) => state.selectedProject);
  const accessToken = useSessionStore((state) => state.accessToken);
  const queryClient = useQueryClient();
  const [selectedSource, setSelectedSource] = useState<ReviewV2SourceValue>();
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<string>();
  const [uploadError, setUploadError] = useState<string>();

  const enabled = Boolean(project?.tenantId && journeyId && accessToken);
  const bookingQuery = useQuery({
    queryKey: ['uc03-journey-documents-booking', project?.tenantId, journeyId],
    queryFn: () => getBookingReviewV2(project!.tenantId, journeyId!, accessToken),
    enabled,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const deliveryQuery = useQuery({
    queryKey: ['uc03-journey-documents-delivery', project?.tenantId, journeyId],
    queryFn: () => getDeliveryReviewV2(project!.tenantId, journeyId!, accessToken),
    enabled,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const bookingCaptureQuery = useQuery({
    queryKey: ['uc03-journey-documents-booking-checklist', project?.tenantId, journeyId],
    queryFn: () => getBookingCaptureV2(project!.tenantId, journeyId!, accessToken),
    enabled,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const deliveryCaptureQuery = useQuery({
    queryKey: ['uc03-journey-documents-delivery-checklist', project?.tenantId, journeyId],
    queryFn: () => getDeliveryCaptureV2(project!.tenantId, journeyId!, accessToken),
    enabled,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const bookingAvailable = Boolean(bookingQuery.data);
  const deliveryAvailable = Boolean(deliveryQuery.data);

  const handleUpload = async (files: File[]) => {
    if (!project || !journeyId) return;
    setUploading(true);
    setUploadMessage(undefined);
    setUploadError(undefined);
    try {
      const result = await uploadUnifiedCaptureFiles(project.tenantId, journeyId, files, accessToken);
      try {
        await reconcileUnifiedDocuments(project.tenantId, journeyId, accessToken);
      } catch {
        // Non-fatal -- the page's own polling / a later reconcile call will
        // still pick up correct dispatch; the upload itself already succeeded.
      }
      setUploadMessage(
        result.failed
          ? `${result.uploaded} of ${result.uploaded + result.failed} file(s) uploaded — ${result.failed} failed, try those again.`
          : `${result.uploaded} file${result.uploaded === 1 ? '' : 's'} uploaded. Extraction is running in the background — check back here shortly.`,
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['uc03-journey-documents-booking', project.tenantId, journeyId] }),
        queryClient.invalidateQueries({ queryKey: ['uc03-journey-documents-delivery', project.tenantId, journeyId] }),
        queryClient.invalidateQueries({ queryKey: ['uc03-journey-documents-booking-checklist', project.tenantId, journeyId] }),
        queryClient.invalidateQueries({ queryKey: ['uc03-journey-documents-delivery-checklist', project.tenantId, journeyId] }),
      ]);
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : 'These files could not be uploaded. Try again.');
    } finally {
      setUploading(false);
    }
  };

  if (!project || !journeyId) return null;

  const loading = bookingQuery.isPending || deliveryQuery.isPending;
  if (loading) return <div className="uc03-c1-loading" role="status">Loading Journey Documents…</div>;
  if (!bookingAvailable && !deliveryAvailable) {
    return (
      <section className="dashboard-load-state" role="alert">
        <div className="dashboard-load-state__mark">!</div>
        <div className="dashboard-load-state__copy">
          <strong>Documents are not available yet.</strong>
          <p>Start Booking on this Journey before opening its documents here.</p>
        </div>
        <button type="button" className="user-menu-button" onClick={() => navigate(`/journeys/${journeyId}/overview`)}>Back to Journey Details</button>
      </section>
    );
  }

  const checklist: ChecklistEntry[] = [
    ...(bookingCaptureQuery.data?.requirements ?? []).map((item) => ({ ...item, stage: 'BOOKING' as const })),
    ...(deliveryCaptureQuery.data?.requirements ?? []).map((item) => ({ ...item, stage: 'DELIVERY' as const })),
  ];

  return (
    <div className="screen-stack uc03-journey-documents-page">
      <div className="uc03-c1-topbar">
        <button type="button" className="uc03-c1-back" onClick={() => navigate(`/journeys/${journeyId}/overview`)}>← Journey Details</button>
      </div>

      <PageHeader
        eyebrow="Journey Documents"
        title="Upload, review & correct documents"
        description="One place for every Booking and Delivery document. Upload here any time — the system decides which stage a document belongs to once it's classified. Fields below 90% confidence can be corrected directly and take effect immediately; fields at or above 90% go through a Team Lead-reviewed correction instead."
      />

      <UploadDropzone onFilesSelected={(files) => void handleUpload(files)} busy={uploading} message={uploadMessage} error={uploadError} />

      <CombinedChecklist items={checklist} />

      <ModelResolutionSkuPicker
        tenantId={project.tenantId}
        journeyId={journeyId}
        accessToken={accessToken}
        onResolved={() => {
          void queryClient.invalidateQueries({ queryKey: ['uc03-journey-documents-booking', project.tenantId, journeyId] });
          void queryClient.invalidateQueries({ queryKey: ['uc03-journey-documents-booking-checklist', project.tenantId, journeyId] });
        }}
      />

      <div className="uc03-jd-buckets">
        <StageBucket stage="BOOKING" review={bookingQuery.data} onEvidence={setSelectedSource} tenantId={project.tenantId} journeyId={journeyId} accessToken={accessToken} />
        <StageBucket stage="DELIVERY" review={deliveryQuery.data} onEvidence={setSelectedSource} tenantId={project.tenantId} journeyId={journeyId} accessToken={accessToken} />
      </div>

      {selectedSource ? (
        <AttributeEvidenceViewer tenantId={project.tenantId} journeyId={journeyId} accessToken={accessToken} source={selectedSource} onClose={() => setSelectedSource(undefined)} />
      ) : null}
    </div>
  );
}
