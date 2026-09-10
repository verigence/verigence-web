import { displayName } from '../../utils/displayNames';
import type { CaptureV2Document, CaptureV2Requirement } from '../../services/audit-core/uc03DocumentCaptureV2';
import '../../styles/uc03-capture-document-card.css';

export type CardStatus = 'uploaded' | 'classified' | 'extracted' | 'failed';

const CARD_STATUS_LABEL: Record<CardStatus, string> = {
  uploaded: 'Uploaded',
  classified: 'Classified',
  extracted: 'Extracted',
  failed: 'Needs attention',
};

export function cardStatus(document: CaptureV2Document): CardStatus {
  const state = document.state.trim().toUpperCase();
  const processing = document.processingStatus?.trim().toUpperCase();
  if (state === 'FAILED' || processing === 'FAILED') return 'failed';
  if (state !== 'CLASSIFIED' || !document.classifiedDocumentTypeKey) return 'uploaded';
  if (processing === 'PROCESSED') return 'extracted';
  return 'classified';
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
