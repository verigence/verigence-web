import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';

import { ErrorBoundary } from '../components/ErrorBoundary';
import PageHeader from '../components/PageHeader';
import AttributeEvidenceViewer, { hasBoxedEvidence } from '../features/uc03/AttributeEvidenceViewer';
import { DocumentCard, ReviewDocumentStatusCard, cardStatus, CARD_STATUS_LABEL } from '../features/uc03/CaptureDocumentCard';
import ModifyModelModal from '../features/uc03/ModifyModelModal';
import { LoanDisbursementModal } from '../features/uc03/LoanDisbursementPicker';
import { categoryFor, categoryTitle, FIELD_CATEGORY_ORDER, type FieldCategory } from '../features/uc03/fieldCategoryGroups';
import { buildRawReviewGroups } from '../features/uc03/reviewFieldGroups';
import ReviewEffectiveValueEditor, { reviewSourceKey } from '../features/uc03/ReviewEffectiveValueEditor';
import { displayName } from '../utils/displayNames';
import { AuditCoreHttpError } from '../services/audit-core/client';
import { getBookingWorkspace, startBooking } from '../services/audit-core/uc03Booking';
import { submitSimplifiedBookingV2 } from '../services/audit-core/uc03BookingV2';
import {
  confirmBookingReviewV2,
  getBookingReviewDecisionsV2,
  getBookingReviewV2,
  getDeliveryReviewV2,
  setBookingReviewDecisionV2,
  submitFieldCorrection,
  type ReviewDecisionValue,
  type ReviewFieldCorrection,
  type ReviewV2Attribute,
  type ReviewV2Document,
  type ReviewV2Field,
  type ReviewV2SourceValue,
  type ReviewV2UnmappedField,
} from '../services/audit-core/uc03DocumentReviewV2';
import {
  deleteVehiclePhoto,
  listVehiclePhotos,
  uploadVehiclePhotos,
  type VehiclePhoto,
} from '../services/audit-core/uc03DeliveryVehiclePhotos';
import {
  confirmModelResolutionSku,
  getModelResolutionCandidates,
} from '../services/audit-core/uc03ModelResolution';
import type { CaptureV2Document } from '../services/audit-core/uc03DocumentCaptureV2';
import {
  deleteUnifiedCaptureV2Document,
  getUnifiedCaptureV2,
  reconcileUnifiedDocuments,
  resyncUnifiedCaptureV2,
  unifiedCaptureV2IsProcessing,
  uploadUnifiedCaptureFiles,
  type UnifiedCaptureV2Requirement,
} from '../services/audit-core/uc03UnifiedDocumentCapture';
import { useProjectContextStore } from '../store/projectContextStore';
import { useSessionStore } from '../store/sessionStore';
import '../styles/uc03-journey-documents.css';
import '../styles/uc03-attribute-audit-review.css';

type Stage = 'BOOKING' | 'DELIVERY';
const REVIEW_THRESHOLD = 90;
// Matches DeliveryCaptureV2WorkspacePage's CAPTURE_POLL_MS -- direct user
// correction (2026-09-24): this screen shares the exact same status card
// and the exact same getUnifiedCaptureV2 read function as Delivery's own
// workspace, so status transitions (Uploaded -> Classified -> Extracted)
// should visibly advance at the same pace, not lag behind it for no reason.
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

// Accept/Reject + Confirm-reviewed-values flow for booking review
const RECEIPT_DOCUMENT_TYPE = 'dealer_receipt';

function hasExtractedValue(attribute: ReviewV2Attribute): boolean {
  return attribute.resolvedValue !== null && attribute.resolvedValue !== undefined && attribute.resolvedValue !== '';
}

function needsAttributeDecision(attribute: ReviewV2Attribute): boolean {
  return hasExtractedValue(attribute) && attribute.reviewState === 'NEEDS_REVIEW';
}

function rawSource(field: ReviewV2UnmappedField): ReviewV2SourceValue {
  return {
    canonicalFieldId: field.canonicalFieldId,
    fieldKey: field.fieldKey,
    value: field.value,
    confidenceScore: field.confidenceScore,
    sourceFactVersion: field.sourceFactVersion,
    reviewState: field.confidenceScore !== null && field.confidenceScore >= REVIEW_THRESHOLD ? 'READY' : 'NEEDS_REVIEW',
    documentId: field.documentId,
    evidenceId: null,
    documentTypeKey: field.documentTypeKey,
    documentLabel: field.documentLabel,
    originalFilename: field.originalFilename,
    contentUrl: null,
    pageNo: field.pageNo,
    evidenceRegion: field.evidenceRegion,
  };
}

function DecisionButtons({
  reviewKey,
  decision,
  busy,
  onDecision,
}: {
  reviewKey: string;
  decision?: ReviewDecisionValue;
  busy: boolean;
  onDecision: (reviewKey: string, decision: ReviewDecisionValue) => void;
}) {
  return (
    <div className="uc03-review-decision-buttons" aria-label="Review decision">
      <button type="button" className={decision === 'ACCEPTED' ? 'is-selected accept' : 'accept'} disabled={busy} onClick={() => onDecision(reviewKey, 'ACCEPTED')}>✓ Accept</button>
      <button type="button" className={decision === 'REJECTED' ? 'is-selected reject' : 'reject'} disabled={busy} onClick={() => onDecision(reviewKey, 'REJECTED')}>✕ Reject</button>
    </div>
  );
}

/** Builds a ReviewV2Document-shaped stand-in for a checklist document that
 * has no entry yet in either stage's review dataset (see openDocumentById's
 * own comment) -- reuses cardStatus, the exact same status classification
 * the checklist card itself already applied, so the modal that opens shows
 * the identical status the card showed, just with no fields yet. */
function fallbackReviewDocument(document: CaptureV2Document, requirementKey: string | null): ReviewV2Document {
  const status = cardStatus(document);
  const extractionState: ReviewV2Document['extractionState'] =
    status === 'failed' ? 'FAILED' : status === 'extracted' || status === 'unrecognized' ? 'READY' : 'PENDING';
  const documentTypeKey = status === 'uploaded' || status === 'unrecognized' ? null : document.classifiedDocumentTypeKey;
  return {
    documentId: document.documentId,
    evidenceId: null,
    requirementKey,
    label: documentTypeKey ? displayName(documentTypeKey) : document.originalFilename,
    documentTypeKey,
    originalFilename: document.originalFilename,
    contentUrl: document.contentUrl,
    processingStatus: document.processingStatus ?? document.state,
    extractionState,
    fields: [],
  };
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

interface ChecklistEntry extends Omit<UnifiedCaptureV2Requirement, 'stageCode'> {
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
  onOpenDocument,
  onDelete,
  deleteBusyId,
  locked,
}: {
  item: ChecklistEntry;
  onOpenDocument: (stage: Stage, documentId: string) => void;
  onDelete: (stage: Stage, documentId: string) => void;
  deleteBusyId?: string;
  locked: boolean;
}) {
  const documentId = item.document?.documentId;
  return (
    <div className="uc03-jd-card-slot">
      {item.document && documentId ? (
        <div className="uc03-jd-card-with-delete">
          <button
            type="button"
            className="uc03-doc-card-trigger"
            disabled={locked}
            onClick={() => onOpenDocument(item.stage, documentId)}
          >
            <article className={`uc03-doc-card is-${cardStatus(item.document)} is-${item.requirementLevel.toLowerCase()}`}>
              <header>
                <span className="uc03-doc-card__label">{item.label}</span>
                {item.requirementLevel !== 'REQUIRED' ? (
                  <span className="uc03-doc-card__level">{item.requirementLevel.toLowerCase()}</span>
                ) : null}
              </header>
              <strong className="uc03-doc-card__name">
                {item.document.classifiedDocumentTypeKey ? displayName(item.document.classifiedDocumentTypeKey) : 'Classifying…'}
              </strong>
              <div className="uc03-doc-card__status">
                <span className="uc03-doc-card__dot" aria-hidden="true" />
                {CARD_STATUS_LABEL[cardStatus(item.document)]}
              </div>
            </article>
          </button>
          <button
            type="button"
            className="uc03-jd-card-delete"
            disabled={deleteBusyId === documentId}
            aria-label={`Remove ${item.label}`}
            onClick={() => onDelete(item.stage, documentId)}
          >
            {deleteBusyId === documentId ? '…' : '×'}
          </button>
        </div>
      ) : (
        <div className={`uc03-doc-card is-missing is-${item.requirementLevel.toLowerCase()}`}>
          <strong className="uc03-doc-card__name">{item.label}</strong>
          {item.requirementLevel !== 'REQUIRED' ? (
            <span className="uc03-doc-card__level">{item.requirementLevel.toLowerCase()}</span>
          ) : null}
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
  onDelete,
  deleteBusyId,
  locked,
}: {
  stage: Stage;
  items: ChecklistEntry[];
  onOpenDocument: (stage: Stage, documentId: string) => void;
  onDelete: (stage: Stage, documentId: string) => void;
  deleteBusyId?: string;
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
        {ordered.map((item) => (
          <ChecklistCard
            key={`${item.stage}:${item.requirementKey}`}
            item={item}
            onOpenDocument={onOpenDocument}
            onDelete={onDelete}
            deleteBusyId={deleteBusyId}
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
  onDelete,
  deleteBusyId,
  locked,
  syncing,
}: {
  items: ChecklistEntry[];
  extraDocuments: ExtraDocument[];
  onOpenDocument: (stage: Stage, documentId: string) => void;
  onDelete: (stage: Stage, documentId: string) => void;
  deleteBusyId?: string;
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
          onDelete={onDelete}
          deleteBusyId={deleteBusyId}
          locked={locked}
        />
      ))}
      {extraDocuments.length > 0 ? (
        <div className="uc03-jd-section uc03-jd-section--extra">
          <div className="uc03-jd-section__head">
            <h3>Duplicates &amp; Unclassified</h3>
            {/* Direct business rule: when a duplicate copy of a non-repeatable
                document type is uploaded, the FIRST one wins the checklist
                slot above -- this bucket holds the extra copy(ies). Deleting
                whichever one the PC doesn't want (first or the later one)
                promotes the remaining copy to the checklist slot automatically
                on the very next read; the server dispatches its sync too. */}
            <span>not tied to a checklist requirement — delete to promote a different copy</span>
          </div>
          <div className="uc03-doc-card-grid">
            {extraDocuments.map(({ stage, document }) => (
              <div key={`extra:${document.documentId}`} className="uc03-jd-card-slot">
                <div className="uc03-jd-card-slot__badges">
                  <span className={`uc03-jd-checklist-stage ${stage.toLowerCase()}`}>{stage === 'BOOKING' ? 'Booking' : 'Delivery'}</span>
                </div>
                <div className="uc03-jd-card-with-delete">
                  <button
                    type="button"
                    className="uc03-doc-card-trigger"
                    disabled={locked}
                    onClick={() => onOpenDocument(stage, document.documentId)}
                  >
                    <ReviewDocumentStatusCard document={document} />
                  </button>
                  <button
                    type="button"
                    className="uc03-jd-card-delete"
                    disabled={deleteBusyId === document.documentId}
                    aria-label={`Remove ${document.originalFilename}`}
                    onClick={() => onDelete(stage, document.documentId)}
                  >
                    {deleteBusyId === document.documentId ? '…' : '×'}
                  </button>
                </div>
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

function CarPhotosSection({
  photos,
  onUpload,
  onDelete,
  uploading,
  deletingPhotoId,
}: {
  photos: VehiclePhoto[];
  onUpload: (files: File[]) => void;
  onDelete: (photoId: string) => void;
  uploading: boolean;
  deletingPhotoId?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  return (
    <>
      <div
        className={`uc03-jd-upload ${dragOver ? 'is-dragover' : ''}`}
        onDragOver={(event) => { event.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragOver(false);
          const files = Array.from(event.dataTransfer.files || []);
          if (files.length) onUpload(files);
        }}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="image/*"
          hidden
          onChange={(event) => {
            const files = Array.from(event.currentTarget.files || []);
            if (files.length) onUpload(files);
            event.currentTarget.value = '';
          }}
        />
        <button
          type="button"
          className="uc03-jd-upload-button"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
        >
          {uploading ? 'Uploading…' : '+ Add photos'}
        </button>
      </div>

      {photos.length > 0 ? (
        <div className="uc03-jd-photos-gallery">
          {photos.map((photo) => (
            <div key={photo.photoId} className="uc03-jd-photo-card">
              <img src={photo.contentUrl} alt={photo.originalFilename} />
              <button
                type="button"
                className="uc03-jd-photo-delete"
                onClick={() => onDelete(photo.photoId)}
                disabled={deletingPhotoId === photo.photoId}
                title="Delete photo"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      ) : null}

      {photos.length === 0 ? (
        <p className="uc03-jd-empty">No vehicle photos yet.</p>
      ) : null}
    </>
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

/**
 * Accept/Reject extracted values, then Submit or Confirm reviewed values.
 * Reuses the already-fetched booking review query rather than a second
 * network round trip.
 */
function BookingReviewSection({
  review,
  tenantId,
  journeyId,
  accessToken,
  onEvidence,
  onChanged,
}: {
  review: import('../services/audit-core/uc03DocumentReviewV2').BookingReviewV2;
  tenantId: string;
  journeyId: string;
  accessToken?: string;
  onEvidence: (source: ReviewV2SourceValue) => void;
  onChanged: () => void;
}) {
  const decisionsQuery = useQuery({
    queryKey: ['uc03-journey-documents-booking-decisions', tenantId, journeyId],
    queryFn: () => getBookingReviewDecisionsV2(tenantId, journeyId, accessToken),
    refetchOnWindowFocus: false,
  });
  const [decisionBusyKey, setDecisionBusyKey] = useState<string>();
  const [decisionError, setDecisionError] = useState<string>();
  const [corrections, setCorrections] = useState<Map<string, ReviewFieldCorrection>>(new Map());
  const [confirming, setConfirming] = useState(false);
  const [confirmationError, setConfirmationError] = useState<string>();

  const decisionByKey = new Map(
    (decisionsQuery.data?.decisions ?? []).map((item) => [item.reviewKey, item.decision] as const),
  );
  const rawGroups = buildRawReviewGroups(review.unmappedFields, REVIEW_THRESHOLD);
  const receiptGroups = rawGroups.filter((group) => group.selected.documentTypeKey?.trim().toLowerCase() === RECEIPT_DOCUMENT_TYPE);
  const additionalRawGroups = rawGroups.filter((group) => group.selected.documentTypeKey?.trim().toLowerCase() !== RECEIPT_DOCUMENT_TYPE);
  const populatedAttributes = review.attributes.filter(hasExtractedValue);
  const requiredMappedKeys = populatedAttributes.filter(needsAttributeDecision).map((attribute) => `attribute:${attribute.attributeKey}`);
  const requiredRawKeys = rawGroups.filter((group) => group.needsDecision).map((group) => group.reviewKey);
  const requiredDecisionKeys = [...requiredMappedKeys, ...requiredRawKeys];
  const unresolvedDecisionKeys = requiredDecisionKeys.filter((key) => !decisionByKey.has(key));
  const failedDocuments = review.documents.filter((document) => document.extractionState === 'FAILED');
  // Document completeness is the sole criterion for Submit -- confidence
  // review is a separate, always-available concern, not a precondition.
  const canAct = !decisionsQuery.isPending && !decisionsQuery.isError;
  const isReadOnly = review.captureSubmitted && review.pcVerificationStatus === 'VERIFIED';

  const setCorrection = (source: ReviewV2SourceValue | ReviewV2UnmappedField, correction: ReviewFieldCorrection | undefined) => {
    const key = reviewSourceKey(source);
    setCorrections((current) => {
      const next = new Map(current);
      if (correction) next.set(key, correction);
      else next.delete(key);
      return next;
    });
  };

  const setDecision = async (reviewKey: string, decision: ReviewDecisionValue) => {
    setDecisionBusyKey(reviewKey);
    setDecisionError(undefined);
    setConfirmationError(undefined);
    try {
      await setBookingReviewDecisionV2(tenantId, journeyId, reviewKey, decision, accessToken);
      await decisionsQuery.refetch();
    } catch (error) {
      setDecisionError(error instanceof Error ? error.message : 'The review decision could not be saved.');
      await decisionsQuery.refetch();
    } finally {
      setDecisionBusyKey(undefined);
    }
  };

  const finishReviewOrSubmit = async () => {
    setConfirming(true);
    setConfirmationError(undefined);
    try {
      let aggregateVersion = review.aggregateVersion;
      if (!review.captureSubmitted) {
        const confirmed = await confirmBookingReviewV2(tenantId, journeyId, aggregateVersion, [...corrections.values()], accessToken);
        aggregateVersion = confirmed.aggregateVersion;
        setCorrections(new Map());
        await submitSimplifiedBookingV2(tenantId, journeyId, aggregateVersion, accessToken);
      } else if (review.pcVerificationStatus !== 'VERIFIED') {
        await confirmBookingReviewV2(tenantId, journeyId, aggregateVersion, [...corrections.values()], accessToken);
        setCorrections(new Map());
      }
      onChanged();
    } catch (error) {
      setConfirmationError(error instanceof Error ? error.message : 'Booking could not be submitted. Refresh and try again.');
    } finally {
      setConfirming(false);
    }
  };

  const renderRawGroups = (groups: typeof rawGroups) => (
    <div className="uc03-raw-review-grid">
      {groups.map((group) => {
        const decision = decisionByKey.get(group.reviewKey);
        const source = group.selected;
        const evidenceSource = rawSource(source);
        const selectedHasBox = hasBoxedEvidence(evidenceSource);
        const highConf = source.confidenceScore !== null && source.confidenceScore !== undefined && source.confidenceScore >= REVIEW_THRESHOLD;
        return (
          <article key={group.groupKey} className={`uc03-raw-review-card ${group.needsDecision && !decision ? 'needs-review' : ''}`}>
            <header>
              <div>
                <span className="uc03-attribute-evidence-kicker">DI extracted field</span>
                <h3>{displayFieldKey(group.fieldKey)}</h3>
                <small>{source.documentLabel}</small>
              </div>
              <span className={`uc03-attribute-status ${decision === 'REJECTED' ? 'rejected' : group.needsDecision && !decision ? 'needs-review' : 'ready'}`}>
                {decision === 'ACCEPTED' ? 'Accepted' : decision === 'REJECTED' ? 'Rejected' : group.mismatch ? 'Source Mismatch' : group.needsDecision ? 'Needs Review' : 'Ready'}
              </span>
            </header>
            {!highConf && !isReadOnly && decision !== 'REJECTED' ? (
              <ReviewEffectiveValueEditor
                source={source}
                correction={corrections.get(reviewSourceKey(source))}
                onChange={(correction) => setCorrection(source, correction)}
                disabled={false}
              />
            ) : (
              <div className="uc03-raw-review-selected">
                <span>Extracted value</span>
                <strong>{displayValue(source.value)}</strong>
              </div>
            )}
            <div className="uc03-raw-review-selected">
              <span>DI source</span>
              <strong>{source.documentLabel}</strong>
            </div>
            {group.sources.length > 1 ? (
              <div className="uc03-raw-review-sources">
                <span>Available source values</span>
                {group.sources.map((item) => {
                  const itemSource = rawSource(item);
                  const boxed = hasBoxedEvidence(itemSource);
                  return (
                    <button
                      type="button"
                      key={`${item.documentId}:${item.canonicalFieldId}:${item.sourceFactVersion}`}
                      disabled={!boxed}
                      onClick={() => boxed && onEvidence(itemSource)}
                    >
                      <strong>{displayValue(item.value)}</strong>
                      <small>{item.documentLabel}</small>
                    </button>
                  );
                })}
              </div>
            ) : null}
            <div className="uc03-raw-review-actions">
              {selectedHasBox ? <button type="button" className="uc03-attribute-evidence-link" onClick={() => onEvidence(evidenceSource)}>View boxed evidence</button> : <span>Source location unavailable</span>}
              {group.needsDecision ? <DecisionButtons reviewKey={group.reviewKey} decision={decision} busy={decisionBusyKey === group.reviewKey} onDecision={(key, value) => void setDecision(key, value)} /> : <span className="uc03-review-auto-cleared">No action needed</span>}
            </div>
          </article>
        );
      })}
    </div>
  );

  return (
    <section className="uc03-jd-section uc03-attribute-review-page" aria-labelledby="jd-review-heading">
      <h2 id="jd-review-heading" className="uc03-jd-section-heading">3. Review &amp; Submit Booking</h2>

      <section className="uc03-attribute-review-summary" aria-label="Booking review summary">
        <div><span>Mapped values</span><strong>{populatedAttributes.length}</strong></div>
        <div><span>Receipt values</span><strong>{receiptGroups.length}</strong></div>
        <div><span>PC corrections</span><strong>{corrections.size}</strong></div>
        <div><span>Exceptions pending</span><strong>{unresolvedDecisionKeys.length}</strong></div>
      </section>

      {review.processingPending ? (
        <div className="uc03-v2-review-pending" role="status">
          <div><strong>Document extraction is still in progress.</strong><span>Submit is available now — extraction continues in the background regardless.</span></div>
        </div>
      ) : null}
      {requiredDecisionKeys.length > 0 ? (
        <div className="uc03-v2-review-attention" role="status">
          <strong>{unresolvedDecisionKeys.length} of {requiredDecisionKeys.length} exception{requiredDecisionKeys.length === 1 ? '' : 's'} still need a decision.</strong>
          <span>Optional — Accept, Reject, or correct any time. This does not block Submit.</span>
        </div>
      ) : null}

      {review.missingDeclarations.length ? (
        <section className="uc03-v2-section">
          <header><div><span className="uc03-c1-eyebrow">Declarations</span><h2>Applicable documents not available</h2></div></header>
          <div className="uc03-v2-review-missing-list">
            {review.missingDeclarations.map((item) => (
              <div key={item.requirementKey} className="uc03-v2-review-missing-row">
                <div><strong>{item.label}</strong><span>Applicable · Document not available</span></div>
                <span>Recorded for audit follow-up</span>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="uc03-v2-section uc03-attribute-table-section">
        <header className="uc03-v2-section-header">
          <div>
            <span className="uc03-c1-eyebrow">Extracted Booking attributes</span>
            <h2>Business attribute review</h2>
            <p>Only values below 90% confidence can be edited. Original DI value and provenance are always retained.</p>
          </div>
        </header>
        <div className="uc03-attribute-table-wrap">
          <table className="uc03-attribute-table uc03-booking-review-table">
            <thead>
              <tr><th>Attribute</th><th>Value</th><th>Source evidence</th><th>Decision</th></tr>
            </thead>
            <tbody>
              {populatedAttributes.length ? populatedAttributes.map((attribute) => {
                const source = attribute.resolvedSource;
                const reviewKey = `attribute:${attribute.attributeKey}`;
                const decision = decisionByKey.get(reviewKey);
                const needsDecision = needsAttributeDecision(attribute);
                const highConf = isHighConfidence(attribute.confidenceScore);
                const locked = isReadOnly || decision === 'REJECTED';
                return (
                  <tr key={attribute.attributeKey} className={needsDecision && !decision ? 'needs-review' : ''}>
                    <td className="uc03-attribute-name-cell"><strong>{attribute.label}</strong></td>
                    <td>
                      {source && !highConf && !locked ? (
                        <ReviewEffectiveValueEditor
                          source={source}
                          correction={corrections.get(reviewSourceKey(source))}
                          onChange={(correction) => setCorrection(source, correction)}
                          requireValue
                          disabled={false}
                        />
                      ) : displayValue(attribute.resolvedValue)}
                    </td>
                    <td>
                      {source ? (
                        <div className="uc03-attribute-source-cell">
                          <strong>{source.documentLabel}</strong>
                          <span>{source.documentTypeKey || source.originalFilename}</span>
                          {hasBoxedEvidence(source) ? (
                            <button type="button" className="uc03-attribute-evidence-link" onClick={() => onEvidence(source)}>View boxed evidence</button>
                          ) : <span>Source location unavailable</span>}
                        </div>
                      ) : '—'}
                    </td>
                    <td>
                      {needsDecision ? (
                        <DecisionButtons reviewKey={reviewKey} decision={decision} busy={decisionBusyKey === reviewKey} onDecision={(key, value) => void setDecision(key, value)} />
                      ) : <span className="uc03-review-auto-cleared">No action needed</span>}
                    </td>
                  </tr>
                );
              }) : <tr><td colSpan={4} className="uc03-review-empty-table">No mapped Booking values have been extracted yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      {receiptGroups.length ? (
        <section className="uc03-v2-section uc03-raw-review-section">
          <header className="uc03-v2-section-header"><div><span className="uc03-c1-eyebrow">Payment receipts</span><h2>Dealer receipt evidence</h2></div><span>{receiptGroups.length} value{receiptGroups.length === 1 ? '' : 's'}</span></header>
          {renderRawGroups(receiptGroups)}
        </section>
      ) : null}
      {additionalRawGroups.length ? (
        <section className="uc03-v2-section uc03-raw-review-section">
          <header className="uc03-v2-section-header"><div><span className="uc03-c1-eyebrow">Additional extracted evidence</span><h2>Additional DI fields</h2></div><span>{additionalRawGroups.length} field{additionalRawGroups.length === 1 ? '' : 's'}</span></header>
          {renderRawGroups(additionalRawGroups)}
        </section>
      ) : null}

      {decisionError ? <div className="uc03-c3-error" role="alert">{decisionError}</div> : null}
      {decisionsQuery.isError ? <div className="uc03-c3-error" role="alert">Review decisions could not be loaded. Refresh before confirming.</div> : null}
      {confirmationError ? <div className="uc03-c3-error" role="alert">{confirmationError}</div> : null}

      <section className="uc03-attribute-confirm-panel">
        <div>
          <strong>{review.captureSubmitted ? (review.pcVerificationStatus === 'VERIFIED' ? 'Booking Review verified' : 'Complete Booking Review') : 'Submit Booking'}</strong>
          <span>
            {review.captureSubmitted && review.pcVerificationStatus === 'VERIFIED'
              ? 'Original DI values, effective values and provenance are retained.'
              : failedDocuments.length
                ? `${failedDocuments.length} document${failedDocuments.length === 1 ? '' : 's'} failed processing — this does not block Submit.`
                : unresolvedDecisionKeys.length
                  ? `${unresolvedDecisionKeys.length} exception${unresolvedDecisionKeys.length === 1 ? '' : 's'} still pending — optional, does not block Submit.`
                  : review.processingPending
                    ? 'Extraction is still running, but it does not block Booking submit.'
                    : 'All currently available confidence exceptions are resolved.'}
          </span>
        </div>
        {review.captureSubmitted && review.pcVerificationStatus === 'VERIFIED' ? null : (
          <button type="button" className="uc03-c3-primary" disabled={!canAct || confirming} onClick={() => void finishReviewOrSubmit()}>
            {confirming ? (review.captureSubmitted ? 'Confirming…' : 'Submitting…') : (review.captureSubmitted ? 'Confirm reviewed values' : 'Submit Booking')}
          </button>
        )}
      </section>

      {failedDocuments.length ? <div className="uc03-v2-review-failed-summary">{failedDocuments.length} document{failedDocuments.length === 1 ? '' : 's'} could not be processed and require follow-up.</div> : null}
    </section>
  );
}

export default function JourneyDocumentsPage() {
  const { journeyId: journeyIdParam } = useParams<{ journeyId?: string }>();
  const navigate = useNavigate();

  if (!journeyIdParam) return null;
  const journeyId = journeyIdParam;
  const [searchParams] = useSearchParams();
  const project = useProjectContextStore((state) => state.selectedProject);
  const accessToken = useSessionStore((state) => state.accessToken);
  const queryClient = useQueryClient();
  const [selectedSource, setSelectedSource] = useState<ReviewV2SourceValue>();
  const [openDocument, setOpenDocument] = useState<{ stage: Stage; document: ReviewV2Document }>();
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<string>();
  const [uploadError, setUploadError] = useState<string>();
  // Safety net independent of unifiedCaptureV2IsProcessing's own read of
  // the query snapshot: right after an upload, there can be a brief window
  // before the first refetch lands where the snapshot doesn't yet reflect
  // the new document at all (still RECEIVING at DI, or the reconcile pass
  // hasn't run yet) -- refetchOnWindowFocus is off, so polling would
  // otherwise not resume on its own until something else forces a refetch.
  // Keeping the query polling for a fixed window after ANY upload,
  // independent of what the snapshot currently shows, covers that gap.
  const lastUploadAtRef = useRef<number | null>(null);
  const UPLOAD_KEEP_POLLING_MS = 120_000;
  const recentlyUploaded = () =>
    lastUploadAtRef.current !== null && Date.now() - lastUploadAtRef.current < UPLOAD_KEEP_POLLING_MS;
  const [modifyModelOpen, setModifyModelOpen] = useState(false);
  const [loanDisbursementOpen, setLoanDisbursementOpen] = useState(false);
  const [startBusy, setStartBusy] = useState(false);
  const [startError, setStartError] = useState<string>();
  const [resyncing, setResyncing] = useState(false);
  const [deleteBusyId, setDeleteBusyId] = useState<string>();
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const [photoUploadError, setPhotoUploadError] = useState<string>();
  const [deletingPhotoId, setDeletingPhotoId] = useState<string>();
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string>();
  const uploadStartTimeRef = useRef<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const SUBMIT_UNLOCK_TIMER_MS = 3 * 60 * 1000;

  const enabled = Boolean(project?.tenantId && journeyId && accessToken);
  const bookingQuery = useQuery({
    queryKey: ['uc03-journey-documents-booking', project?.tenantId, journeyId],
    queryFn: () => getBookingReviewV2(project!.tenantId, journeyId!, accessToken),
    enabled,
    // Root-caused live (2026-09-26): retry:false everywhere on this page is
    // deliberate for a REAL backend response (Delivery's own review 404s
    // legitimately before Delivery has started -- retrying that would just
    // waste a round trip). But it also meant a purely transport-level
    // hiccup -- e.g. the browser cancelling this exact request
    // (NS_BINDING_ABORTED) because a duplicate fetch to the same URL fired
    // moments later and superseded it -- permanently left bookingQuery.data
    // undefined for the rest of this page load, since nothing else ever
    // re-triggers it. openDocumentById then has nothing to find in EITHER
    // stage no matter how it searches, so click-to-open silently failed
    // for the whole session, not just once. Retry up to twice, but only for
    // a transport-level failure (AuditCoreNetworkError/AuditCoreTimeoutError,
    // or a raw fetch abort) -- never for AuditCoreHttpError, which means
    // the backend actually answered.
    retry: (failureCount, error) => !(error instanceof AuditCoreHttpError) && failureCount < 2,
    refetchOnWindowFocus: false,
  });
  const deliveryQuery = useQuery({
    queryKey: ['uc03-journey-documents-delivery', project?.tenantId, journeyId],
    queryFn: () => getDeliveryReviewV2(project!.tenantId, journeyId!, accessToken),
    enabled,
    // See bookingQuery's own comment above -- same fix, same reason. A real
    // 404 (Delivery not started) still never retries.
    retry: (failureCount, error) => !(error instanceof AuditCoreHttpError) && failureCount < 2,
    refetchOnWindowFocus: false,
  });
  const captureQuery = useQuery({
    queryKey: ['uc03-journey-documents-checklist', project?.tenantId, journeyId],
    queryFn: () => getUnifiedCaptureV2(project!.tenantId, journeyId!, accessToken),
    enabled,
    retry: false,
    refetchOnWindowFocus: false,
    // Keeps polling only while a just-uploaded document is still being
    // classified/extracted, so its status chip in the list below actually
    // advances (Uploaded → Classified → Extracted) without a manual reload.
    // Also stays alive for a fixed window after ANY upload regardless of
    // this query's own snapshot -- see recentlyUploaded's comment above.
    refetchInterval: (query) => (
      unifiedCaptureV2IsProcessing(query.state.data) || recentlyUploaded() ? POLL_MS : false
    ),
  });
  const vehiclePhotosQuery = useQuery({
    queryKey: ['uc03-vehicle-photos', project?.tenantId, journeyId],
    queryFn: () => listVehiclePhotos(project!.tenantId, journeyId as string, accessToken || ''),
    enabled,
    retry: false,
    refetchOnWindowFocus: false,
  });

  // Same "still settling" signal the polling above already uses, reused
  // here to gate editing rather than just refetch cadence -- see
  // EDIT_BLOCK_TIMEOUT_MS's own comment for why this needs a fallback.
  const pendingClassification = unifiedCaptureV2IsProcessing(captureQuery.data);
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
  const captureAvailable = Boolean(captureQuery.data);

  // Rare edge case (a stale draft Booking resumed later, per
  // BookingCaptureV2WorkspacePage's own former comment) -- a Booking stage
  // row exists but was never started, so none of the three queries above
  // have data at all. Only fetched when nothing else is available, so the
  // common case (a Booking already started, which is true from the moment
  // it's created) never pays for this extra round trip.
  const noDataAtAll = !bookingAvailable && !deliveryAvailable && !captureAvailable;
  const workspaceQuery = useQuery({
    queryKey: ['uc03-journey-documents-workspace', project?.tenantId, journeyId],
    queryFn: () => getBookingWorkspace(project!.tenantId, journeyId!, accessToken),
    enabled: enabled && noDataAtAll,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const notStarted = Boolean(workspaceQuery.data) && !workspaceQuery.data!.bookingStage.businessStatus;

  const handleStart = async () => {
    const version = workspaceQuery.data?.aggregateVersion;
    if (!project || !journeyId || version === undefined) return;
    setStartBusy(true);
    setStartError(undefined);
    try {
      await startBooking(project.tenantId, journeyId, version, accessToken);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['uc03-journey-documents-checklist', project.tenantId, journeyId] }),
        queryClient.invalidateQueries({ queryKey: ['uc03-journey-documents-workspace', project.tenantId, journeyId] }),
      ]);
    } catch (error) {
      setStartError(error instanceof Error ? error.message : 'This Booking could not be started.');
    } finally {
      setStartBusy(false);
    }
  };

  const handleResync = async () => {
    if (!project || !journeyId) return;
    setResyncing(true);
    try {
      await resyncUnifiedCaptureV2(project.tenantId, journeyId, accessToken);
      await captureQuery.refetch();
    } finally {
      setResyncing(false);
    }
  };

  // One handler for both stages -- the backend resolves which stage a
  // document belongs to from its own row, not from anything passed here.
  // Both review-data query keys are invalidated since the frontend has no
  // reliable way to know which stage owned the deleted document without
  // re-deriving it from the checklist first.
  const handleDeleteDocument = async (documentId: string) => {
    if (!project || !journeyId || !accessToken) return;
    setDeleteBusyId(documentId);
    try {
      await deleteUnifiedCaptureV2Document(project.tenantId, journeyId, documentId, accessToken);
      await Promise.all([
        captureQuery.refetch(),
        queryClient.invalidateQueries({ queryKey: ['uc03-journey-documents-booking', project.tenantId, journeyId] }),
        queryClient.invalidateQueries({ queryKey: ['uc03-journey-documents-delivery', project.tenantId, journeyId] }),
      ]);
    } catch (error) {
      console.error('Failed to delete document:', error);
    } finally {
      setDeleteBusyId(undefined);
    }
  };

  const handleUploadPhotos = async (files: File[]) => {
    if (!project || !journeyId || !accessToken) return;
    setUploadingPhotos(true);
    setPhotoUploadError(undefined);
    try {
      await uploadVehiclePhotos(project.tenantId, journeyId as string, files, accessToken);
      await vehiclePhotosQuery.refetch();
    } catch (error) {
      setPhotoUploadError(error instanceof Error ? error.message : 'Failed to upload photos');
    } finally {
      setUploadingPhotos(false);
    }
  };

  const handleDeletePhoto = async (photoId: string) => {
    if (!project || !journeyId || !accessToken) return;
    setDeletingPhotoId(photoId);
    try {
      await deleteVehiclePhoto(project.tenantId, journeyId as string, photoId, accessToken);
      await vehiclePhotosQuery.refetch();
    } finally {
      setDeletingPhotoId(undefined);
    }
  };

  const handleSubmitBooking = async () => {
    if (!project || !journeyId || !accessToken) return;
    setSubmitting(true);
    setSubmitError(undefined);
    try {
      await captureQuery.refetch();
      uploadStartTimeRef.current = null;
      setElapsedSeconds(0);
      // Redirect to overview to show capture complete
      navigate(`/journeys/${journeyId}/overview`);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Failed to complete submission');
    } finally {
      setSubmitting(false);
    }
  };

  const timerSeconds = Math.max(0, SUBMIT_UNLOCK_TIMER_MS / 1000 - elapsedSeconds);
  const canSubmit = !pendingClassification || timerSeconds <= 0;

  // Timer to show upload elapsed time and 3-minute unlock
  useEffect(() => {
    if (!uploading && uploadStartTimeRef.current === null) return undefined;
    if (uploading && uploadStartTimeRef.current === null) {
      uploadStartTimeRef.current = Date.now();
    }
    const timer = setInterval(() => {
      if (uploadStartTimeRef.current) {
        const elapsed = Math.floor((Date.now() - uploadStartTimeRef.current) / 1000);
        setElapsedSeconds(elapsed);
      }
    }, 100);
    return () => clearInterval(timer);
  }, [uploading]);

  // Reset timer when upload completes or docs are classified
  useEffect(() => {
    if (!uploading && !pendingClassification) {
      uploadStartTimeRef.current = null;
      setElapsedSeconds(0);
    }
  }, [uploading, pendingClassification]);

  const handleUpload = async (files: File[]) => {
    if (!project || !journeyId) return;
    lastUploadAtRef.current = Date.now();
    uploadStartTimeRef.current = Date.now();
    setElapsedSeconds(0);
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
        queryClient.invalidateQueries({ queryKey: ['uc03-journey-documents-checklist', project.tenantId, journeyId] }),
      ]);
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : 'These files could not be uploaded. Try again.');
    } finally {
      setUploading(false);
    }
  };

  // Root-caused live (2026-09-26): the checklist's own stage label (from
  // the unified capture read, document_capture_v2_documents.stage_code --
  // corrected on every reconcile) can genuinely diverge from which stage
  // uc03_document_review_v2.py's own review data files a document under.
  // That backend derives stage two different ways -- a DI phase-scoped
  // list_documents(phase=stage) call (DI never updates a document's phase
  // after audit-core relocates it, the exact same gap already fixed in the
  // unified capture read) and, for documents that fall through to its
  // "legacy" fallback, evidence.journey_document_requirement_id (set once
  // at initial link time, never corrected when a document is later
  // reclassified to a different stage). A relocated document can end up
  // filed under review's stale, original stage while the checklist already
  // correctly shows its new one -- looking it up only in the checklist's
  // named stage then finds nothing and the click silently does nothing.
  // Checking both stages here fixes the visible symptom without touching
  // uc03_document_review_v2.py, which is shared by the whole PC review/
  // correction/confirm workflow far beyond this modal. Opening with
  // whichever stage's data actually had the document (not the checklist's
  // label) is also the correct choice for the modal's own subsequent save/
  // correct calls, since those are themselves review-endpoint-scoped.
  const openDocumentById = (stage: Stage, documentId: string) => {
    const preferred = stage === 'BOOKING' ? bookingQuery.data : deliveryQuery.data;
    const fallback = stage === 'BOOKING' ? deliveryQuery.data : bookingQuery.data;
    const fallbackStage: Stage = stage === 'BOOKING' ? 'DELIVERY' : 'BOOKING';
    const inPreferred = preferred?.documents.find((candidate) => candidate.documentId === documentId);
    if (inPreferred) {
      setOpenDocument({ stage, document: inPreferred });
      return;
    }
    const inFallback = fallback?.documents.find((candidate) => candidate.documentId === documentId);
    if (inFallback) {
      setOpenDocument({ stage: fallbackStage, document: inFallback });
      return;
    }
    // Root-caused live (2026-09-26): uc03_document_review_v2.py only ever
    // lists a document whose DI state is exactly CLASSIFIED (it skips
    // everything else outright) -- but the checklist above renders and
    // makes clickable every document regardless of status (Uploaded,
    // Classified, Extracted, Unrecognized, Failed; see cardStatus in
    // CaptureDocumentCard.tsx). Any document not yet classified, or one DI
    // never managed to classify at all, is real and visible in the
    // checklist but has no entry in EITHER review dataset above -- the
    // click previously found nothing in both stages and did nothing at
    // all, with no error shown. Falling back to the checklist's own
    // capture data keeps the click always working, opening the exact same
    // status card the checklist itself already shows (the modal already
    // renders an empty field list gracefully -- "No fields have been
    // extracted from this document yet.").
    const captureMatch = (captureQuery.data?.requirements ?? []).find(
      (item) => item.document?.documentId === documentId,
    );
    if (captureMatch?.document) {
      setOpenDocument({
        stage: captureMatch.stageCode,
        document: fallbackReviewDocument(captureMatch.document, captureMatch.requirementKey),
      });
    }
  };

  // The Review Queue's "Manual Verification" CTA links here with
  // ?openDocument=<diDocumentId>&stage=<BOOKING|DELIVERY> so a PC lands
  // straight in that document's Edit Document modal instead of the plain
  // document list -- jump once either stage's review data has loaded
  // (openDocumentById itself checks both, see its own comment above).
  useEffect(() => {
    const documentId = searchParams.get('openDocument');
    if (!documentId) return;
    const stage: Stage = searchParams.get('stage') === 'DELIVERY' ? 'DELIVERY' : 'BOOKING';
    if (bookingQuery.data || deliveryQuery.data) openDocumentById(stage, documentId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, bookingQuery.data, deliveryQuery.data]);

  if (!project || !journeyId) return null;

  const loading =
    bookingQuery.isPending || deliveryQuery.isPending || captureQuery.isPending;
  if (loading) return <div className="uc03-c1-loading" role="status">Loading Journey Documents…</div>;
  if (!bookingAvailable && !deliveryAvailable && !captureAvailable) {
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
              void queryClient.invalidateQueries({ queryKey: ['uc03-journey-documents-checklist', project.tenantId, journeyId] });
            }}
          />
        </ErrorBoundary>
        <section className="dashboard-load-state" role="alert">
          <div className="dashboard-load-state__mark">!</div>
          <div className="dashboard-load-state__copy">
            <strong>Documents are not available yet.</strong>
            <p>{notStarted ? 'This Booking exists but has not been started yet.' : 'Start Booking on this Journey before opening its documents here.'}</p>
            {startError ? <p className="uc03-jd-error" role="alert">{startError}</p> : null}
          </div>
          {notStarted ? (
            <button type="button" className="uc03-c1-primary" disabled={startBusy} onClick={() => void handleStart()}>
              {startBusy ? 'Starting…' : 'Start Booking'}
            </button>
          ) : null}
          <button type="button" className="user-menu-button" onClick={() => navigate(`/journeys/${journeyId}/overview`)}>Back to Journey Details</button>
        </section>
      </div>
    );
  }

  const checklist: ChecklistEntry[] = (captureQuery.data?.requirements ?? []).map((item) => {
    const { stageCode, ...rest } = item;
    return { ...rest, stage: stageCode };
  });
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
  // Only count as duplicates if literally the same document ID appears multiple times
  const uploadIdCounts = new Map<string, number>();
  const duplicateCounts = new Map<string, number>();
  for (const upload of captureQuery.data?.uploads ?? []) {
    if (!upload.classifiedDocumentTypeKey) continue;
    if (coveredDocumentIds.has(upload.documentId) || reviewedDocumentIds.has(upload.documentId)) continue;
    const uploadCount = (uploadIdCounts.get(upload.documentId) ?? 0) + 1;
    uploadIdCounts.set(upload.documentId, uploadCount);
    // Only count as duplicate if this same documentId appears more than once
    if (uploadCount > 1) {
      const key = upload.classifiedDocumentTypeKey;
      duplicateCounts.set(key, (duplicateCounts.get(key) ?? 0) + 1);
    }
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
        title="Upload & Review Documents"
        description="Upload documents and vehicle photos · click any document to edit its extracted values"
        actions={
          captureAvailable ? (
            <button
              type="button"
              className="uc03-jd-modify-model"
              disabled={resyncing}
              onClick={() => void handleResync()}
              title="A classified document sometimes finishes extracting after the page already stopped watching it. Recheck picks those up."
            >
              {resyncing ? 'Rechecking…' : 'Recheck documents'}
            </button>
          ) : null
        }
      />

      <div className="uc03-jd-submit-bar">
        <span className="uc03-jd-submit-bar-label">Ready to submit?</span>
        <div className="uc03-jd-submit-bar-actions">
          <button
            type="button"
            className="uc03-jd-submit-button-primary"
            disabled={!canSubmit || submitting}
            onClick={() => void handleSubmitBooking()}
            title={!canSubmit ? `Submit unlocks when documents are classified or timer expires (${Math.floor(timerSeconds / 60)}:${String(Math.floor(timerSeconds % 60)).padStart(2, '0')} remaining)` : ''}
          >
            {submitting ? 'Submitting…' : 'Submit Documents'}
          </button>
        </div>
      </div>

      {editsBlocked ? (
        <div className="uc03-jd-block-banner" role="status">
          Finishing document classification — editing and corrections unlock automatically once every
          document is classified (usually a few minutes). You can still upload more documents.
        </div>
      ) : null}

      {/* Direct user correction (2026-09-24): the checklist used to fail
          silently (retry: false, no banner) -- a real backend error left
          every card looking like a normal journey with no sign anything
          was wrong. Surface it instead of hiding it. */}
      {captureQuery.isError ? (
        <div className="uc03-jd-block-banner uc03-jd-block-banner--error" role="alert">
          Could not load the document checklist.
          {' '}Documents may be missing below until this is fixed.{' '}
          <button
            type="button"
            className="uc03-jd-modify-model"
            onClick={() => void captureQuery.refetch()}
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
        <h2 id="jd-upload-heading" className="uc03-jd-section-heading">1. Upload documents & photos</h2>
        <div className="uc03-jd-upload-container">
          <div className="uc03-jd-upload-column">
            <h3>Documents</h3>
            <UploadDropzone onFilesSelected={(files) => void handleUpload(files)} busy={uploading} message={uploadMessage} error={uploadError} />
          </div>
          <div className="uc03-jd-upload-column">
            <h3>Vehicle Photos</h3>
            <CarPhotosSection
              photos={vehiclePhotosQuery.data ?? []}
              onUpload={(files) => void handleUploadPhotos(files)}
              onDelete={(photoId) => void handleDeletePhoto(photoId)}
              uploading={uploadingPhotos}
              deletingPhotoId={deletingPhotoId}
            />
          </div>
        </div>
      </section>

      <section className="uc03-jd-section uc03-jd-status-section">
        <h3 className="uc03-jd-section-label">Processing</h3>
        <div className="uc03-jd-status-row">
          <div className="uc03-jd-stat">
            <div className="uc03-jd-stat-label">Uploaded</div>
            <div className={`uc03-jd-stat-value ${uploading ? 'busy' : 'done'}`}>
              {captureQuery.data?.uploads.length ?? 0}
            </div>
          </div>
          <div className="uc03-jd-stat">
            <div className="uc03-jd-stat-label">Classified</div>
            <div className={`uc03-jd-stat-value ${pendingClassification ? 'busy' : 'done'}`}>
              {captureQuery.data?.uploads.filter((u) => u.classifiedDocumentTypeKey).length ?? 0}/{captureQuery.data?.uploads.length ?? 0}
            </div>
          </div>
          <div className="uc03-jd-stat">
            <div className="uc03-jd-stat-label">Extracted</div>
            <div className="uc03-jd-stat-value done">
              {((bookingQuery.data?.documents.filter((d) => d.extractionState === 'READY').length ?? 0) + (deliveryQuery.data?.documents.filter((d) => d.extractionState === 'READY').length ?? 0))}
            </div>
          </div>
        </div>
        {(uploading || pendingClassification) && timerSeconds > 0 ? (
          <div className="uc03-jd-timer-bar">
            <span>Submit unlocks automatically</span>
            <span className="uc03-jd-timer-value">{Math.floor(timerSeconds / 60)}:{String(Math.floor(timerSeconds % 60)).padStart(2, '0')}</span>
          </div>
        ) : null}
        {submitError ? (
          <div className="uc03-jd-block-banner uc03-jd-block-banner--error" role="alert">
            {submitError}
          </div>
        ) : null}
      </section>

      <section className="uc03-jd-section" aria-labelledby="jd-existing-heading">
        <h2 id="jd-existing-heading" className="uc03-jd-section-heading">2. Review uploaded documents</h2>

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
              void queryClient.invalidateQueries({ queryKey: ['uc03-journey-documents-checklist', project.tenantId, journeyId] });
            }}
          />
        </ErrorBoundary>

        <DocumentList
          items={checklist}
          extraDocuments={extraDocuments}
          onOpenDocument={openDocumentById}
          onDelete={(_stage, documentId) => void handleDeleteDocument(documentId)}
          deleteBusyId={deleteBusyId}
          locked={false}
          syncing={uploading || captureQuery.isFetching}
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
