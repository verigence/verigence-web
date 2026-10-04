import { useEffect } from 'react';

import { useBlobUrl } from './useBlobUrl';

interface Props {
  title: string;
  blob: Blob;
  onClose: () => void;
}

/** A photo or receipt (image or PDF) in a dialog. The file is held in memory only. */
export default function BlobViewerDialog({ title, blob, onClose }: Props) {
  const url = useBlobUrl(blob);
  const isPdf = blob.type === 'application/pdf';

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="uc01-admin-dialog-backdrop" role="presentation" onClick={onClose}>
      <section
        className="uc01-admin-dialog uc01-admin-dialog--wide hr-appr-viewer"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="hr-appr-viewer__head">
          <h2>{title}</h2>
          <button type="button" className="uc01-admin-button" onClick={onClose} autoFocus>Close</button>
        </div>
        {url && (isPdf ? (
          <>
            <iframe className="hr-appr-viewer__pdf" src={url} title={title} />
            <a className="uc01-admin-button" href={url} target="_blank" rel="noopener noreferrer">Open in a new tab</a>
          </>
        ) : (
          <img className="hr-appr-viewer__img" src={url} alt={title} />
        ))}
      </section>
    </div>
  );
}
