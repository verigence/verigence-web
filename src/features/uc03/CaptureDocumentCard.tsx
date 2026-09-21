import { displayName } from '../../utils/displayNames';
import type { CaptureV2Document, CaptureV2Requirement } from '../../services/audit-core/uc03DocumentCaptureV2';
import type { ReviewV2Document } from '../../services/audit-core/uc03DocumentReviewV2';
import '../../styles/uc03-capture-document-card.css';

export type CardStatus = 'uploaded' | 'classified' | 'extracted' | 'unrecognized' | 'failed';

export const CARD_STATUS_LABEL: Record<CardStatus, string> = {
  uploaded: 'Uploaded',
  classified: 'Classified',
  extracted: 'Extracted',
  unrecognized: 'Unrecognized — needs review',
  failed: 'Needs attention',
};

export function cardStatus(document: CaptureV2Document): CardStatus {
  const state = document.state.trim().toUpperCase();
  const processing = document.processingStatus?.trim().toUpperCase();
  if (state === 'FAILED' || processing === 'FAILED') return 'failed';
  // DI genuinely couldn't identify this document (best-guess confidence
  // never cleared the acceptance threshold) -- distinct from "still being
  // classified", which is what every other non-CLASSIFIED state means here.
  // Previously indistinguishable from plain "Uploaded", so a document DI had
  // already given up on looked identical to one nobody had looked at yet.
  if (state === 'UNKNOWN') return 'unrecognized';
  if (state !== 'CLASSIFIED' || !document.classifiedDocumentTypeKey) return 'uploaded';
  if (processing === 'PROCESSED') return 'extracted';
  return 'classified';
}

/** Same status model as cardStatus() above, adapted for the Review V2 shape
 * (uc03DocumentReviewV2.ts's own 3-state extractionState, not capture's
 * richer 5-state one) -- the Edit Document modal reads a document this way,
 * not the way the capture screens do, but a PC reviewing an already-
 * uploaded document deserves the exact same Uploaded/Classified/Extracted/
 * Unrecognized/Failed card the capture screen showed them minutes earlier,
 * not a bare "Extraction in progress" text line with no way to tell whether
 * DI even recognized the document at all. */
export function reviewCardStatus(document: ReviewV2Document): CardStatus {
  if (document.extractionState === 'FAILED') return 'failed';
  if (!document.documentTypeKey) return document.extractionState === 'READY' ? 'unrecognized' : 'uploaded';
  return document.extractionState === 'READY' ? 'extracted' : 'classified';
}

/**
 * One uploaded document's live progress through Uploaded -> Classified ->
 * Extracted (or Failed), shared between the Booking and Delivery capture
 * screens so both surface the same status model instead of drifting apart.
 */
export function DocumentCard({
  document,
  index,
  busy,
  readOnly,
  onDelete,
}: {
  document: CaptureV2Document;
  index: number;
  busy?: boolean;
  readOnly?: boolean;
  onDelete?: (documentId: string) => Promise<void>;
}) {
  const status = cardStatus(document);
  // Once DI has classified it, the document's identity in the audit pack is
  // what it IS ("Gate Pass"), not the filename it happened to arrive as --
  // the filename becomes provenance, kept small underneath.
  const classifiedLabel = document.classifiedDocumentTypeKey ? displayName(document.classifiedDocumentTypeKey) : null;
  return (
    <article className={`uc03-doc-card is-${status}`}>
      <header>
        <span className="uc03-doc-card__index">Doc {index + 1}</span>
        {!readOnly && onDelete ? (
          <button
            type="button"
            className="uc03-doc-card__delete"
            disabled={busy}
            onClick={() => void onDelete(document.documentId)}
            aria-label={`Remove ${document.originalFilename}`}
          >
            {busy ? '…' : '×'}
          </button>
        ) : null}
      </header>
      <strong className="uc03-doc-card__name" title={classifiedLabel ? document.originalFilename : undefined}>
        {classifiedLabel || document.originalFilename}
      </strong>
      {classifiedLabel ? (
        <span className="uc03-doc-card__filename" title={document.originalFilename}>{document.originalFilename}</span>
      ) : null}
      <div className="uc03-doc-card__status">
        <span className="uc03-doc-card__dot" aria-hidden="true" />
        {CARD_STATUS_LABEL[status]}
      </div>
      {document.contentUrl ? <a className="uc03-doc-card__view" href={document.contentUrl} target="_blank" rel="noreferrer">View original</a> : null}
    </article>
  );
}

/** Same card, same CSS, for a document already opened in the Edit Document
 * (Review V2) modal -- no index/delete affordance (this document is already
 * received; deleting belongs to the checklist, not here), but otherwise
 * the identical Uploaded/Classified/Extracted/Unrecognized/Failed status
 * card the capture screen shows, per explicit instruction that a PC editing
 * a document should see the same classification/status information they
 * saw while uploading it, not a plainer view. */
export function ReviewDocumentStatusCard({ document }: { document: ReviewV2Document }) {
  const status = reviewCardStatus(document);
  const classifiedLabel = document.documentTypeKey ? displayName(document.documentTypeKey) : null;
  return (
    <article className={`uc03-doc-card is-${status}`}>
      <strong className="uc03-doc-card__name" title={classifiedLabel ? document.originalFilename : undefined}>
        {classifiedLabel || document.originalFilename}
      </strong>
      {classifiedLabel ? (
        <span className="uc03-doc-card__filename" title={document.originalFilename}>{document.originalFilename}</span>
      ) : null}
      <div className="uc03-doc-card__status">
        <span className="uc03-doc-card__dot" aria-hidden="true" />
        {CARD_STATUS_LABEL[status]}
      </div>
      {document.contentUrl ? <a className="uc03-doc-card__view" href={document.contentUrl} target="_blank" rel="noreferrer">View original</a> : null}
    </article>
  );
}

/** One row in a collapsed document-checklist panel: received or not, mandatory or optional. */
export function RequirementChecklistRow({ requirement }: { requirement: CaptureV2Requirement }) {
  const received = Boolean(requirement.document);
  return (
    <div className={`uc03-checklist-row ${received ? 'is-received' : ''}`}>
      <span className="uc03-checklist-row__dot" aria-hidden="true" />
      <div>
        <strong>{requirement.label}</strong>
        <span>{requirement.requirementLevel === 'REQUIRED' ? 'Mandatory' : 'Optional / if applicable'}</span>
      </div>
      <em>{received ? 'Received' : 'Not received'}</em>
    </div>
  );
}
