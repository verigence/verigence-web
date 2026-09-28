import type { P2UploadCounts } from '../../../services/audit-core/uc03P2';

/**
 * What a PC or TL watches while documents are processed -- uploaded,
 * identified, read, not read, supporting, duplicates. There is no submit
 * step: Booking and Delivery complete from the documents and the rules.
 */
export default function P2UploadStatus({ counts, live }: { counts?: P2UploadCounts; live?: boolean }) {
  if (!counts) return null;
  const inFlight = counts.notClassified + counts.uploading;
  return (
    <section className="p2w-statusbar" aria-label="Upload status" aria-live="polite">
      <div><span>Uploaded</span><strong>{counts.documents + counts.uploading}</strong></div>
      <div><span>Identified</span><strong>{counts.classified}</strong></div>
      <div className={counts.extracted ? 'is-good' : ''}><span>Read</span><strong>{counts.extracted}</strong></div>
      <div className={counts.notExtracted ? 'is-warn' : ''}><span>Not read</span><strong>{counts.notExtracted}</strong></div>
      <div><span>Supporting</span><strong>{counts.supporting}</strong></div>
      <div className={counts.duplicates ? 'is-warn' : ''}><span>Duplicates</span><strong>{counts.duplicates}</strong></div>
      {inFlight || live !== undefined ? (
        <p className="p2w-statusbar__note" role="status">
          {live ? <span className="p2w-live" title="Updates arrive the moment a document changes">● Live</span> : null}
          {inFlight ? `${inFlight} still being identified. The checks run by themselves once the documents are read.` : null}
        </p>
      ) : null}
    </section>
  );
}
