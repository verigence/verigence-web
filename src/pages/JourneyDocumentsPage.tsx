import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';

import { ErrorBoundary } from '../components/ErrorBoundary';
import PageHeader from '../components/PageHeader';
import AttributeEvidenceViewer, { hasBoxedEvidence } from '../features/uc03/AttributeEvidenceViewer';
import { DocumentCard, ReviewDocumentStatusCard } from '../features/uc03/CaptureDocumentCard';
import ModifyModelModal from '../features/uc03/ModifyModelModal';
import { LoanDisbursementModal } from '../features/uc03/LoanDisbursementPicker';
import { categoryFor, categoryTitle, FIELD_CATEGORY_ORDER, type FieldCategory } from '../features/uc03/fieldCategoryGroups';
import { displayName } from '../utils/displayNames';
import { AuditCoreHttpError } from '../services/audit-core/client';
import {
  captureV2HasPendingClassification,
  getBookingCaptureV2,
  type CaptureV2Requirement,
} from '../services/audit-core/uc03DocumentCaptureV2';
import { deliveryCaptureV2IsProcessing, getDeliveryCaptureV2 } from '../services/audit-core/uc03DeliveryCaptureV2';
import {
  getBookingReviewV2,
  getDeliveryReviewV2,
  submitFieldCorrection,
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
// Matches BookingCaptureV2WorkspacePage's CAPTURE_POLL_MS -- direct user
// correction (2026-09-24): this screen shares the exact same status card
// and the exact same getBookingCaptureV2/getDeliveryCaptureV2 read
// functions as Capture New Booking, so status transitions (Uploaded ->
// Classified -> Extracted) should visibly advance at the same pace, not
// lag three times behind it for no reason.
const POLL_MS = 1_000;
// Classification/extraction is a background DI step, not instant -- editing
// a document before its own status has settled risks correcting a value
// that's about to be overwritten by the real extraction. Blocks edits while
// any document is still short of Classified/Extracted/Failed/Unrecognized,
// but only for up to this long -- a document DI never manages to classify
// must not trap the PC on this page forever.
const EDIT_BLOCK_TIMEOUT_MS = 5 * 60 * 1000;

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
 * closes on its own, a >=90% save raises a Task Queue item owned by a Team
 * Lead (carrying the old value, the new value, and this document's own
 * name/type already) and stays visibly pending until someone completes or
 * cancels it there.
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

/** One document's fields, grouped (Customer / Vehicle / Financial / Other)
 * instead of a single flat list -- payment-related fields, say, land
 * together instead of scattered between unrelated ones. */
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

  const byCategory = new Map<FieldCategory, ReviewV2Field[]>();
  for (const field of document.fields) {
    const category = categoryFor(field.fieldKey, field.fieldKey);
    const bucket = byCategory.get(category) ?? [];
    bucket.push(field);
    byCategory.set(category, bucket);
  }

  return (
    <>
      {FIELD_CATEGORY_ORDER.filter((category) => byCategory.has(category)).map((category) => (
        <div key={category} className="uc03-jd-field-group">
          <h4 className="uc03-jd-field-group__title">{categoryTitle(category)}</h4>
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
                {(byCategory.get(category) ?? []).map((field) => {
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
        </div>
      ))}
    </>
  );
}

/** The boxed view a document opens into: one document, its fields grouped
 * and editable, nothing else on screen competing for attention. Replaces
 * the page's own always-visible document panel -- there is now exactly one
 * place a document's values are shown, opened on demand. */
function DocumentReviewModal({
  stage,
  document,
  onClose,
  onEvidence,
  tenantId,
  journeyId,
  accessToken,
}: {
  stage: Stage;
  document: ReviewV2Document;
  onClose: () => void;
  onEvidence: (source: ReviewV2SourceValue) => void;
  tenantId: string;
  journeyId: string;
  accessToken?: string;
}) {
  const [localByField, setLocalByField] = useState<Map<string, LocalCorrectionState>>(new Map());
  const setLocal = (key: string, state: LocalCorrectionState) => {
    setLocalByField((current) => {
      const next = new Map(current);
      next.set(key, state);
      return next;
    });
  };

  return (
    <div className="uc03-jd-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="uc03-jd-modal"
        role="dialog"
        aria-modal="true"
        aria-label={document.originalFilename}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="uc03-jd-modal__header">
          <div>
            <span className="uc03-c1-eyebrow">{document.documentTypeKey || 'Document'}</span>
            <h3>{document.originalFilename}</h3>
          </div>
          <button type="button" className="uc03-jd-modal__close" onClick={onClose} aria-label="Close">×</button>
        </header>
        <div className="uc03-jd-modal__statusCard">
          <ReviewDocumentStatusCard document={document} />
        </div>
        <div className="uc03-jd-modal__body">
          <DocumentFieldsPanel
            stage={stage}
            document={document}
            localByField={localByField}
            onLocalChange={setLocal}
            onEvidence={onEvidence}
            tenantId={tenantId}
            journeyId={journeyId}
            accessToken={accessToken}
          />
        </div>
      </div>
    </div>
  );
}

interface ChecklistEntry extends CaptureV2Requirement {
  stage: Stage;
}

interface ExtraDocument {
  stage: Stage;
  document: ReviewV2Document;
}

/** The one list of every document on this Journey -- required/conditional/
 * optional checklist items (received or not, and if received, its live
 * Uploaded → Classified → Extracted status), plus any uploaded document
 * that isn't tied to a specific requirement (e.g. a second payment
 * receipt). Clicking a received document opens it in the boxed review
 * modal; nothing here duplicates what the modal shows.
 *
 * Renders each received document as the exact same status card the
 * Booking/Delivery capture screens show while uploading -- per explicit
 * instruction that this view shouldn't look different from the upload
 * screen it's showing the same documents from. `locked` disables opening
 * a document (but not uploading more) while classification is still
 * settling -- see EDIT_BLOCK_TIMEOUT_MS above. */
const _LEVEL_ORDER = ['REQUIRED', 'CONDITIONAL', 'OPTIONAL'] as const;

function ChecklistCard({
  item,
  index,
  onOpenDocument,
  locked,
}: {
  item: ChecklistEntry;
  index: number;
  onOpenDocument: (stage: Stage, documentId: string) => void;
  locked: boolean;
}) {
  const documentId = item.document?.documentId;
  return (
    <div className="uc03-jd-card-slot">
      {/* Direct user correction (2026-09-24): the stage badge repeated on
          every single card what the section heading right above the grid
          already says -- removed. The level badge stays: it's real
          per-card information (this specific item is Optional/Conditional)
          that the shared "Booking"/"Delivery" heading can't carry once
          Mandatory and Optional items sit in the same row. */}
      {item.requirementLevel !== 'REQUIRED' ? (
        <div className="uc03-jd-card-slot__badges">
          <span className="uc03-jd-checklist-level">{item.requirementLevel.toLowerCase()}</span>
        </div>
      ) : null}
      {item.document && documentId ? (
        <button
          type="button"
          className="uc03-doc-card-trigger"
          disabled={locked}
          onClick={() => onOpenDocument(item.stage, documentId)}
        >
          <DocumentCard document={item.document} index={index} />
        </button>
      ) : (
        <div className="uc03-doc-card is-missing">
          <strong className="uc03-doc-card__name">{item.label}</strong>
          <div className="uc03-doc-card__status">
            <span className="uc03-doc-card__dot" aria-hidden="true" />
            Missing
          </div>
        </div>
      )}
    </div>
  );
}

/** One Stage bucket ("Booking" / "Delivery"), rendered only when it has at
 * least one applicable requirement. Direct user correction (2026-09-24):
 * previously split further into a separate Mandatory/Optional/Conditional
 * row per stage, each repeating "Booking"/"Delivery" in its own heading --
 * too many small headings for what is, visually, one list of documents.
 * Mandatory items sort first within the single row; each item still
 * carries its own level badge (ChecklistCard) when it isn't Mandatory, so
 * that distinction isn't lost, just no longer its own heading. */
function ChecklistSection({
  stage,
  items,
  onOpenDocument,
  locked,
}: {
  stage: Stage;
  items: ChecklistEntry[];
  onOpenDocument: (stage: Stage, documentId: string) => void;
  locked: boolean;
}) {
  if (items.length === 0) return null;
  const received = items.filter((item) => item.document).length;
  const ordered = [...items].sort(
    (a, b) => _LEVEL_ORDER.indexOf(a.requirementLevel as typeof _LEVEL_ORDER[number])
      - _LEVEL_ORDER.indexOf(b.requirementLevel as typeof _LEVEL_ORDER[number]),
  );
  return (
    <div className={`uc03-jd-section uc03-jd-section--${stage.toLowerCase()}`}>
      <div className="uc03-jd-section__head">
        <h3>{stage === 'BOOKING' ? 'Booking' : 'Delivery'}</h3>
        <span>{received} of {items.length}</span>
      </div>
      <div className="uc03-doc-card-grid">
        {ordered.map((item, index) => (
          <ChecklistCard
            key={`${item.stage}:${item.requirementKey}`}
            item={item}
            index={index}
            onOpenDocument={onOpenDocument}
            locked={locked}
          />
        ))}
      </div>
    </div>
  );
}

function DocumentList({
  items,
  extraDocuments,
  onOpenDocument,
  locked,
  syncing,
}: {
  items: ChecklistEntry[];
  extraDocuments: ExtraDocument[];
  onOpenDocument: (stage: Stage, documentId: string) => void;
  locked: boolean;
  syncing?: boolean;
}) {
  const applicable = items.filter((item) => item.applicabilityState !== 'NOT_APPLICABLE');
  if (!applicable.length && !extraDocuments.length) return null;
  const received = applicable.filter((item) => item.document).length;

  return (
    <section className="uc03-jd-checklist">
      <header>
        <h2>Documents</h2>
        {/* Direct user observation (2026-09-24): right after an upload, the
            list can briefly show stale/pre-upload data while the checklist
            re-fetches (React Query's invalidate is async) -- a blank beat
            with no feedback before the new documents' real status appears.
            This keeps the header saying SOMETHING the whole time. */}
        <span>{syncing ? 'Syncing latest uploads…' : `${received} of ${applicable.length} received`}</span>
      </header>
      {(['BOOKING', 'DELIVERY'] as const).map((stage) => (
        <ChecklistSection
          key={stage}
          stage={stage}
          items={applicable.filter((item) => item.stage === stage)}
          onOpenDocument={onOpenDocument}
          locked={locked}
        />
      ))}
      {extraDocuments.length > 0 ? (
        <div className="uc03-jd-section uc03-jd-section--extra">
          <div className="uc03-jd-section__head">
            <h3>Duplicates &amp; Unclassified</h3>
            <span>not tied to a checklist requirement</span>
          </div>
          <div className="uc03-doc-card-grid">
            {extraDocuments.map(({ stage, document }) => (
              <div key={`extra:${document.documentId}`} className="uc03-jd-card-slot">
                <div className="uc03-jd-card-slot__badges">
                  <span className={`uc03-jd-checklist-stage ${stage.toLowerCase()}`}>{stage === 'BOOKING' ? 'Booking' : 'Delivery'}</span>
                </div>
                <button
                  type="button"
                  className="uc03-doc-card-trigger"
                  disabled={locked}
                  onClick={() => onOpenDocument(stage, document.documentId)}
                >
                  <ReviewDocumentStatusCard document={document} />
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

/** Extra copies of a single-document requirement that's already filled --
 * classified (DI still identifies what they are) but never sent for
 * extraction, so there is nothing on them to open or review. One line per
 * document type, not a card per copy -- unlike a real repeatable document
 * (payment receipts, bank statements), which still gets its own full card
 * in the list above. */
function DuplicateDocumentsSummary({ counts }: { counts: Map<string, number> }) {
  if (counts.size === 0) return null;
  return (
    <section className="uc03-jd-duplicates" aria-label="Extra copies not sent for extraction">
      <header>
        <h2>Extra copies</h2>
        <span>not sent for extraction</span>
      </header>
      <ul>
        {[...counts.entries()].map(([documentTypeKey, count]) => (
          <li key={documentTypeKey}>
            <span className="uc03-jd-duplicates__type">{displayName(documentTypeKey)}</span>
            <span className="uc03-jd-duplicates__count">{count}</span>
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
 * the scanned Booking Form.
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
          Open the matching document below to check the scanned Booking Form, then choose the matching SKU here.
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
  const [searchParams] = useSearchParams();
  const project = useProjectContextStore((state) => state.selectedProject);
  const accessToken = useSessionStore((state) => state.accessToken);
  const queryClient = useQueryClient();
  const [selectedSource, setSelectedSource] = useState<ReviewV2SourceValue>();
  const [openDocument, setOpenDocument] = useState<{ stage: Stage; document: ReviewV2Document }>();
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<string>();
  const [uploadError, setUploadError] = useState<string>();
  const [modifyModelOpen, setModifyModelOpen] = useState(false);
  const [loanDisbursementOpen, setLoanDisbursementOpen] = useState(false);

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
    // Keeps polling only while a just-uploaded document is still being
    // classified/extracted, so its status chip in the list below actually
    // advances (Uploaded → Classified → Extracted) without a manual reload.
    refetchInterval: (query) => (captureV2HasPendingClassification(query.state.data) ? POLL_MS : false),
  });
  const deliveryCaptureQuery = useQuery({
    queryKey: ['uc03-journey-documents-delivery-checklist', project?.tenantId, journeyId],
    queryFn: () => getDeliveryCaptureV2(project!.tenantId, journeyId!, accessToken),
    enabled,
    retry: false,
    refetchOnWindowFocus: false,
    refetchInterval: (query) => (deliveryCaptureV2IsProcessing(query.state.data) ? POLL_MS : false),
  });

  // Same "still settling" signal the polling above already uses, reused
  // here to gate editing rather than just refetch cadence -- see
  // EDIT_BLOCK_TIMEOUT_MS's own comment for why this needs a fallback.
  const pendingClassification =
    captureV2HasPendingClassification(bookingCaptureQuery.data)
    || deliveryCaptureV2IsProcessing(deliveryCaptureQuery.data);
  const blockStartRef = useRef<number | null>(null);
  const [editBlockTimedOut, setEditBlockTimedOut] = useState(false);
  useEffect(() => {
    if (!pendingClassification) {
      blockStartRef.current = null;
      setEditBlockTimedOut(false);
      return undefined;
    }
    blockStartRef.current ??= Date.now();
    const remaining = EDIT_BLOCK_TIMEOUT_MS - (Date.now() - blockStartRef.current);
    if (remaining <= 0) {
      setEditBlockTimedOut(true);
      return undefined;
    }
    setEditBlockTimedOut(false);
    const timer = setTimeout(() => setEditBlockTimedOut(true), remaining);
    return () => clearTimeout(timer);
  }, [pendingClassification]);
  const editsBlocked = pendingClassification && !editBlockTimedOut;

  const bookingAvailable = Boolean(bookingQuery.data);
  const deliveryAvailable = Boolean(deliveryQuery.data);
  // A journey that has progressed to Delivery has a CLOSED Booking by
  // design (uc03_document_capture_v2.py::_require_active_booking correctly
  // 409s GET .../booking/capture for a closed Booking) -- that is not "no
  // documents exist", it's "look at Delivery's capture data instead". Real
  // bug this fixes: the gate below checked only the *review* endpoints
  // (bookingQuery/deliveryQuery, populated only once PC has reviewed/
  // confirmed a document), so a journey with real, uploaded Delivery
  // documents still awaiting review was wrongly told to "Start Booking"
  // first, even though the checklist below already reads capture data too.
  const bookingCaptureAvailable = Boolean(bookingCaptureQuery.data);
  const deliveryCaptureAvailable = Boolean(deliveryCaptureQuery.data);

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
      if (result.failed) {
        setUploadMessage(
          result.uploaded ? `${result.uploaded} of ${result.uploaded + result.failed} file(s) uploaded.` : undefined,
        );
        setUploadError(result.failureReasons.join(' '));
      } else {
        setUploadMessage(`${result.uploaded} file${result.uploaded === 1 ? '' : 's'} uploaded — see its status in the list below.`);
      }
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

  const openDocumentById = (stage: Stage, documentId: string) => {
    const review = stage === 'BOOKING' ? bookingQuery.data : deliveryQuery.data;
    const document = review?.documents.find((candidate) => candidate.documentId === documentId);
    if (document) setOpenDocument({ stage, document });
  };

  // The Review Queue's "Manual Verification" CTA links here with
  // ?openDocument=<diDocumentId>&stage=<BOOKING|DELIVERY> so a PC lands
  // straight in that document's Edit Document modal instead of the plain
  // document list -- jump the moment the relevant stage's review data
  // (and so openDocumentById's own lookup) actually exists.
  useEffect(() => {
    const documentId = searchParams.get('openDocument');
    if (!documentId) return;
    const stage: Stage = searchParams.get('stage') === 'DELIVERY' ? 'DELIVERY' : 'BOOKING';
    const review = stage === 'BOOKING' ? bookingQuery.data : deliveryQuery.data;
    if (review) openDocumentById(stage, documentId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, bookingQuery.data, deliveryQuery.data]);

  if (!project || !journeyId) return null;

  const loading =
    bookingQuery.isPending || deliveryQuery.isPending
    || bookingCaptureQuery.isPending || deliveryCaptureQuery.isPending;
  if (loading) return <div className="uc03-c1-loading" role="status">Loading Journey Documents…</div>;
  if (!bookingAvailable && !deliveryAvailable && !bookingCaptureAvailable && !deliveryCaptureAvailable) {
    // A journey can have an open MODEL_NOT_IDENTIFIED gap (and so a real
    // reason to be here) without its Booking/Delivery V2 review data being
    // available -- an older Booking captured before the V2 review flow
    // existed, for one. The picker needs only the open Finding, not this
    // page's own document-review data, so it must render here too instead
    // of this early return hiding it entirely.
    return (
      <div className="screen-stack uc03-journey-documents-page">
        <div className="uc03-c1-topbar">
          <button type="button" className="uc03-c1-back" onClick={() => navigate(`/journeys/${journeyId}/overview`)}>← Journey Details</button>
        </div>
        <ErrorBoundary fallback={null}>
          <ModelResolutionSkuPicker
            tenantId={project.tenantId}
            journeyId={journeyId}
            accessToken={accessToken}
            onResolved={() => {
              void queryClient.invalidateQueries({ queryKey: ['uc03-journey-documents-booking', project.tenantId, journeyId] });
              void queryClient.invalidateQueries({ queryKey: ['uc03-journey-documents-booking-checklist', project.tenantId, journeyId] });
            }}
          />
        </ErrorBoundary>
        <section className="dashboard-load-state" role="alert">
          <div className="dashboard-load-state__mark">!</div>
          <div className="dashboard-load-state__copy">
            <strong>Documents are not available yet.</strong>
            <p>Start Booking on this Journey before opening its documents here.</p>
          </div>
          <button type="button" className="user-menu-button" onClick={() => navigate(`/journeys/${journeyId}/overview`)}>Back to Journey Details</button>
        </section>
      </div>
    );
  }

  const checklist: ChecklistEntry[] = [
    ...(bookingCaptureQuery.data?.requirements ?? []).map((item) => ({ ...item, stage: 'BOOKING' as const })),
    ...(deliveryCaptureQuery.data?.requirements ?? []).map((item) => ({ ...item, stage: 'DELIVERY' as const })),
  ];
  const coveredDocumentIds = new Set(
    checklist.map((item) => item.document?.documentId).filter((id): id is string => Boolean(id)),
  );
  // Extra copies of a single-document requirement that's already filled --
  // DI still classifies them (so their type is known), but per the backend
  // fix they're never sent for extraction at all. Distinguished from a
  // legitimate repeatable document (e.g. a 2nd/3rd payment receipt, which
  // DOES get extracted and shows as its own full card below) by checking
  // whether it ever reached the documents-with-fields data at all -- a
  // duplicate never will, a repeatable one already has. Counted and
  // labelled, not shown as individual cards: there is nothing on them to
  // open or review.
  const reviewedDocumentIds = new Set([
    ...(bookingQuery.data?.documents ?? []).map((document) => document.documentId),
    ...(deliveryQuery.data?.documents ?? []).map((document) => document.documentId),
  ]);
  const duplicateCounts = new Map<string, number>();
  for (const upload of [
    ...(bookingCaptureQuery.data?.uploads ?? []),
    ...(deliveryCaptureQuery.data?.uploads ?? []),
  ]) {
    if (!upload.classifiedDocumentTypeKey) continue;
    if (coveredDocumentIds.has(upload.documentId) || reviewedDocumentIds.has(upload.documentId)) continue;
    const key = upload.classifiedDocumentTypeKey;
    duplicateCounts.set(key, (duplicateCounts.get(key) ?? 0) + 1);
  }
  const extraDocuments: ExtraDocument[] = [
    ...(bookingQuery.data?.documents ?? [])
      .filter((document) => !coveredDocumentIds.has(document.documentId))
      .map((document) => ({ stage: 'BOOKING' as const, document })),
    ...(deliveryQuery.data?.documents ?? [])
      .filter((document) => !coveredDocumentIds.has(document.documentId))
      .map((document) => ({ stage: 'DELIVERY' as const, document })),
  ];

  return (
    <div className="screen-stack uc03-journey-documents-page">
      <div className="uc03-c1-topbar">
        <button type="button" className="uc03-c1-back" onClick={() => navigate(`/journeys/${journeyId}/overview`)}>← Journey Details</button>
      </div>

      <PageHeader
        eyebrow="Documents"
        title="Upload, review & correct documents"
        description="One place for every Booking and Delivery document. Upload here any time — click any document below to open and edit it. Fields below 90% confidence can be corrected directly and take effect immediately; fields at or above 90% go through a Team Lead-reviewed correction instead."
        actions={
          // Wrong vehicle resolved for this Booking? Same popup Journey
          // 360's Deal tab offers -- reachable from here too, since that's
          // where a PC is already looking at this Booking's documents.
          // The other SKU flow on this page (ModelResolutionSkuPicker,
          // below) only ever appears when nothing has been resolved yet,
          // so the two never compete for the same moment.
          <>
            <button type="button" className="uc03-jd-modify-model" disabled={editsBlocked} onClick={() => setModifyModelOpen(true)}>
              Modify Model
            </button>
            <button type="button" className="uc03-jd-modify-model" disabled={editsBlocked} onClick={() => setLoanDisbursementOpen(true)}>
              Update Loan Amount
            </button>
          </>
        }
      />

      {editsBlocked ? (
        <div className="uc03-jd-block-banner" role="status">
          Finishing document classification — editing and corrections unlock automatically once every
          document is classified (usually a few minutes). You can still upload more documents.
        </div>
      ) : null}

      {/* Direct user correction (2026-09-24): each half of the checklist
          used to fail silently (retry: false, no banner) -- a real backend
          error on just the Delivery side left every card looking like a
          normal, fully-BOOKING journey with no sign anything was wrong.
          Surface it instead of hiding it. */}
      {bookingCaptureQuery.isError || deliveryCaptureQuery.isError ? (
        <div className="uc03-jd-block-banner uc03-jd-block-banner--error" role="alert">
          {bookingCaptureQuery.isError && deliveryCaptureQuery.isError
            ? 'Could not load the Booking or Delivery document checklist.'
            : bookingCaptureQuery.isError
              ? 'Could not load the Booking document checklist.'
              : 'Could not load the Delivery document checklist.'}
          {' '}Documents may be missing below until this is fixed.{' '}
          <button
            type="button"
            className="uc03-jd-modify-model"
            onClick={() => {
              void bookingCaptureQuery.refetch();
              void deliveryCaptureQuery.refetch();
            }}
          >
            Retry
          </button>
        </div>
      ) : null}

      {modifyModelOpen && journeyId ? (
        <ModifyModelModal
          tenantId={project.tenantId}
          journeyId={journeyId}
          accessToken={accessToken}
          onClose={() => setModifyModelOpen(false)}
          onProposed={() => { /* the Task Queue is the source of truth from here */ }}
        />
      ) : null}

      {loanDisbursementOpen && journeyId ? (
        <LoanDisbursementModal
          tenantId={project.tenantId}
          journeyId={journeyId}
          accessToken={accessToken}
          onClose={() => setLoanDisbursementOpen(false)}
          onUpdated={() => { /* Journey 360's Finance tab re-reads on its own next open */ }}
        />
      ) : null}

      <section className="uc03-jd-section" aria-labelledby="jd-upload-heading">
        <h2 id="jd-upload-heading" className="uc03-jd-section-heading">1. Upload documents</h2>
        <UploadDropzone onFilesSelected={(files) => void handleUpload(files)} busy={uploading} message={uploadMessage} error={uploadError} />
      </section>

      <section className="uc03-jd-section" aria-labelledby="jd-existing-heading">
        <h2 id="jd-existing-heading" className="uc03-jd-section-heading">2. Documents</h2>

        {/* Scoped boundary: this section talks to a newer endpoint --
            if it hits a bug, the rest of Journey Documents (uploads, the
            document list itself) must stay usable, not take the whole
            page down with it. */}
        <ErrorBoundary fallback={null}>
          <ModelResolutionSkuPicker
            tenantId={project.tenantId}
            journeyId={journeyId}
            accessToken={accessToken}
            onResolved={() => {
              void queryClient.invalidateQueries({ queryKey: ['uc03-journey-documents-booking', project.tenantId, journeyId] });
              void queryClient.invalidateQueries({ queryKey: ['uc03-journey-documents-booking-checklist', project.tenantId, journeyId] });
            }}
          />
        </ErrorBoundary>

        <DocumentList
          items={checklist}
          extraDocuments={extraDocuments}
          onOpenDocument={openDocumentById}
          locked={editsBlocked}
          syncing={uploading || bookingCaptureQuery.isFetching || deliveryCaptureQuery.isFetching}
        />
        <DuplicateDocumentsSummary counts={duplicateCounts} />
        {!checklist.length && !extraDocuments.length ? (
          <p className="uc03-jd-empty">No documents have been uploaded for this Journey yet.</p>
        ) : null}
      </section>

      {openDocument ? (
        <DocumentReviewModal
          stage={openDocument.stage}
          document={openDocument.document}
          onClose={() => setOpenDocument(undefined)}
          onEvidence={setSelectedSource}
          tenantId={project.tenantId}
          journeyId={journeyId}
          accessToken={accessToken}
        />
      ) : null}

      {selectedSource ? (
        <AttributeEvidenceViewer tenantId={project.tenantId} journeyId={journeyId} accessToken={accessToken} source={selectedSource} onClose={() => setSelectedSource(undefined)} />
      ) : null}
    </div>
  );
}
