import type { P2UploadCounts } from '../../../services/audit-core/uc03P2';
import { pageStatus } from './p2Format';

export type ProcessingItem = { key: string; name: string; status: string };

/**
 * The five numbers a PC or TL watches while documents are processed
 * (uploaded, classified, extracted, duplicates, not classified), and under
 * them what is being worked on right now, updated live as each page moves
 * from upload to classification to extraction. There is no submit step:
 * Booking and Delivery complete from the documents and the rules.
 */
export default function P2UploadStatus({ counts, live, processing = [] }: {
  counts?: P2UploadCounts; live?: boolean; processing?: ProcessingItem[];
}) {
  if (!counts) return null;
  const shown = processing.slice(0, 4);
  return (
    <section className="p2w-statusbar" aria-label="Upload status" aria-live="polite">
      <div><span>Uploaded</span><strong>{counts.documents + counts.uploading}</strong></div>
      <div><span>Classified</span><strong>{counts.classified}</strong></div>
      <div className={counts.extracted ? 'is-good' : ''}><span>Extracted</span><strong>{counts.extracted}</strong></div>
      <div className={counts.duplicates ? 'is-warn' : ''}><span>Duplicates</span><strong>{counts.duplicates}</strong></div>
      <div className={counts.notClassified ? 'is-warn' : ''}><span>Not classified</span><strong>{counts.notClassified}</strong></div>
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
          </span>
        ) : <span className="p2w-muted">Nothing being processed. Add a document and its progress shows here.</span>}
      </p>
    </section>
  );
}
