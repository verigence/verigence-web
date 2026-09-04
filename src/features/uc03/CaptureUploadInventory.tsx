import type { CaptureV2Document } from '../../services/audit-core/uc03DocumentCaptureV2';
import '../../styles/uc03-capture-upload-inventory.css';

function uploadStatus(document: CaptureV2Document): string {
  const state = document.state.trim().toUpperCase();
  if (state === 'CLASSIFIED' && document.classifiedDocumentTypeKey) {
    return document.processingStatus
      ? `${document.classifiedDocumentTypeKey} · ${document.processingStatus}`
      : document.classifiedDocumentTypeKey;
  }
  if (state === 'CLASSIFIED') return 'Classification recorded';
  if (state === 'FAILED') return 'Processing requires follow-up';
  return 'Classification in progress';
}

export default function CaptureUploadInventory({
  uploads,
  title = 'Received documents',
  description = 'Every uploaded document remains separate, including multiple documents of the same type.',
  readOnly = false,
  busyDocumentId,
  onDelete,
}: {
  uploads: CaptureV2Document[];
  title?: string;
  description?: string;
  readOnly?: boolean;
  busyDocumentId?: string;
  onDelete?: (documentId: string) => Promise<void> | void;
}) {
  if (!uploads.length) return null;

  return (
    <section className="uc03-upload-inventory" aria-label={title}>
      <header>
        <div>
          <span className="uc03-c1-eyebrow">Document inventory</span>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
        <strong>{uploads.length}</strong>
      </header>
      <div className="uc03-upload-inventory__list">
        {uploads.map((document, index) => {
          const deleting = busyDocumentId === document.documentId;
          return (
            <article key={document.documentId} className="uc03-upload-inventory__row">
              <div className="uc03-upload-inventory__identity">
                <span>Document {index + 1}</span>
                <strong title={document.originalFilename}>{document.originalFilename}</strong>
              </div>
              <div className="uc03-upload-inventory__status">
                <strong>{uploadStatus(document)}</strong>
                <span>{document.state}</span>
              </div>
              <div className="uc03-upload-inventory__actions">
                {document.contentUrl ? <a href={document.contentUrl} target="_blank" rel="noreferrer">View</a> : null}
                {!readOnly && onDelete ? (
                  <button type="button" disabled={deleting} onClick={() => void onDelete(document.documentId)}>
                    {deleting ? 'Deleting…' : 'Delete'}
                  </button>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
