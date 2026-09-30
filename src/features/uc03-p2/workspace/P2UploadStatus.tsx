import type { P2UploadCounts } from '../../../services/audit-core/uc03P2';
import type { DocumentRow } from './P2DocumentList';
import { PAGE_IN_FLIGHT, pageStatus } from './p2Format';

const BEFORE_CLASSIFICATION = new Set(['QUEUED', 'PREPARING_PAGE', 'DI_UPLOAD_PREPARING', 'DI_UPLOADING', 'DI_FINALIZING', 'CLASSIFYING', 'RETRY_WAIT']);

export type ProcessingItem = { key: string; name: string; status: string };

/**
 * The five numbers a PC or TL watches while documents are processed
 * (uploaded, classified, extracted, duplicates, not classified), and under
 * them what is being worked on right now, updated live as each page moves
 * from upload to classification to extraction. There is no submit step:
 * Booking and Delivery complete from the documents and the rules.
 */
export default function P2UploadStatus({ counts, rows, live, processing = [] }: {
  counts?: P2UploadCounts; rows?: DocumentRow[]; live?: boolean; processing?: ProcessingItem[];
}) {
  if (!counts) return null;
  const shown = processing.slice(0, 4);
  // Count what the screen lists. The server's counts cover the Phase 2
  // upload queue only, so documents linked earlier (an existing journey,
  // a re-linked evidence) showed a row of zeros above a full grid.
  const listed = rows ?? [];
  const uploaded = listed.length + counts.uploading;
  const classified = listed.filter((row) => !BEFORE_CLASSIFICATION.has(row.status) && row.status !== 'FAILED' && row.status !== 'DEAD_LETTER').length;
  // Extracted means Audit Core holds the page's values; a page read empty is not extracted.
  const extracted = listed.filter((row) => row.status === 'READY').length;
  const notClassified = listed.filter((row) => PAGE_IN_FLIGHT.has(row.status) && BEFORE_CLASSIFICATION.has(row.status)).length + counts.uploading;
  return (
    <section className="p2w-statusbar" aria-label="Upload status" aria-live="polite">
      <div><span>Uploaded</span><strong>{uploaded}</strong></div>
      <div><span>Classified</span><strong>{classified}</strong></div>
      <div className={extracted ? 'is-good' : ''}><span>Extracted</span><strong>{extracted}</strong></div>
      <div className={counts.duplicates ? 'is-warn' : ''}><span>Duplicates</span><strong>{counts.duplicates}</strong></div>
      <div className={notClassified ? 'is-warn' : ''}><span>Not classified</span><strong>{notClassified}</strong></div>
      <p className="p2w-statusbar__note" role="status">
        <span className={`p2w-live${live ? ' is-on' : ''}`} title={live ? 'Updates arrive the moment a document changes' : 'Refreshing every few seconds'}>
          ● {live ? 'Live' : 'Auto-refresh'}
        </span>
        {processing.length ? (
          <span className="p2w-statusbar__working">
            {shown.map((item) => (
              <span key={item.key} className="p2w-statusbar__item">
                <i className="p2w-spinner" aria-hidden="true" />{item.name} · {pageStatus(item.status).label.toLowerCase()}…
              </span>
            ))}
            {processing.length > shown.length ? <span className="p2w-muted">+{processing.length - shown.length} more</span> : null}
            {processing.length > 1 ? (
              <span className="p2w-muted">
                A file with many pages takes a few minutes. You can leave this page: if it is still not done after an hour, a task tells you.
              </span>
            ) : null}
          </span>
        ) : <span className="p2w-muted">Nothing being processed. Add a document and its progress shows here.</span>}
      </p>
    </section>
  );
}
