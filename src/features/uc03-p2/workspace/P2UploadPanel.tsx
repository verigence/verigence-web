import { useCallback, useRef, useState } from 'react';

import {
  combineImagesToPdf,
  contentTypeForFile,
  runUploads,
  stableClientUploadId,
  type UploadItem,
  type UploadTransport,
} from './p2Uploader';

let sequence = 0;
const nextId = () => `u${Date.now().toString(36)}${(sequence += 1).toString(36)}`;

const PHASE_LABEL: Record<UploadItem['phase'], string> = {
  WAITING: 'Waiting',
  PREPARING: 'Preparing',
  UPLOADING: 'Uploading',
  FINALIZING: 'Saving',
  ACCEPTED: 'Received',
  FAILED: 'Failed',
};

export default function P2UploadPanel({
  journeyId,
  stage,
  transport,
  onAccepted,
}: {
  journeyId: string;
  stage: 'BOOKING' | 'DELIVERY';
  transport: UploadTransport;
  onAccepted: () => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<UploadItem[]>([]);
  const [dragging, setDragging] = useState(false);
  const [photoChoice, setPhotoChoice] = useState<File[]>();
  const [combining, setCombining] = useState(false);

  const start = useCallback(async (next: UploadItem[]) => {
    setItems((current) => [...current.filter((item) => item.phase !== 'ACCEPTED'), ...next]);
    const results = await runUploads(next, transport, (changed) =>
      setItems((current) => current.map((item) => (item.id === changed.id ? changed : item))));
    if (results.some((item) => item.phase === 'ACCEPTED')) onAccepted();
  }, [onAccepted, transport]);

  const queueFiles = useCallback((files: File[]) => {
    if (!files.length) return;
    void start(files.map((file) => ({
      id: nextId(),
      file,
      clientUploadId: stableClientUploadId(journeyId, file),
      phase: 'WAITING' as const,
      progress: 0,
    })));
  }, [journeyId, start]);

  const accept = useCallback((files: File[]) => {
    const images = files.filter((file) => contentTypeForFile(file).startsWith('image/'));
    // Several photos may be one document (Aadhaar front + back, a 2-page
    // invoice). Ask once instead of guessing.
    if (images.length >= 2 && images.length === files.length) {
      setPhotoChoice(images);
      return;
    }
    queueFiles(files);
  }, [queueFiles]);

  const uploadPhotos = async (asOne: boolean) => {
    const photos = photoChoice ?? [];
    setPhotoChoice(undefined);
    if (!asOne) {
      queueFiles(photos);
      return;
    }
    setCombining(true);
    try {
      const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
      queueFiles([await combineImagesToPdf(photos, `photos-${stamp}.pdf`)]);
    } finally {
      setCombining(false);
    }
  };

  const retry = (item: UploadItem) => {
    setItems((current) => current.filter((existing) => existing.id !== item.id));
    // Same clientUploadId: a retried file can never be accepted twice.
    void start([{ ...item, id: nextId(), phase: 'WAITING', progress: 0, error: undefined }]);
  };

  const active = items.filter((item) => item.phase !== 'ACCEPTED');
  const received = items.length - active.length;

  return (
    <section
      className={`p2w-upload${dragging ? ' is-dragging' : ''}`}
      aria-label="Upload documents"
      onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        accept(Array.from(event.dataTransfer.files));
      }}
    >
      <div className="p2w-upload__drop p2-capture" data-p2-stage={stage} data-p2-journey={journeyId}>
        <div className="p2w-upload__copy">
          <strong>Add documents</strong>
          <span>Drop files here, or photograph them. A PDF with many documents is sorted automatically.</span>
        </div>
        <div className="p2w-upload__buttons">
          <button type="button" className="p2w-button p2w-button--primary p2w-button--lg" onClick={() => cameraInput.current?.click()}>
            Take photo
          </button>
          <button type="button" className="p2w-button p2w-button--secondary p2w-button--lg" onClick={() => fileInput.current?.click()}>
            Choose files
          </button>
        </div>
        <input
          ref={fileInput}
          className="p2w-hidden-input"
          type="file"
          multiple
          accept="application/pdf,image/jpeg,image/png"
          onChange={(event) => {
            accept(Array.from(event.target.files ?? []));
            event.currentTarget.value = '';
          }}
        />
        <input
          ref={cameraInput}
          className="p2w-hidden-input"
          type="file"
          multiple
          accept="image/jpeg,image/png,application/pdf"
          capture="environment"
          onChange={(event) => {
            accept(Array.from(event.target.files ?? []));
            event.currentTarget.value = '';
          }}
        />
      </div>

      {photoChoice ? (
        <div className="p2w-choice" role="group" aria-label="How should these photos be uploaded?">
          <span>{photoChoice.length} photos selected. Are they pages of one document?</span>
          <div>
            <button type="button" className="p2w-button p2w-button--primary" onClick={() => void uploadPhotos(true)}>One document</button>
            <button type="button" className="p2w-button p2w-button--secondary" onClick={() => void uploadPhotos(false)}>Separate documents</button>
          </div>
        </div>
      ) : null}
      {combining ? <div className="p2w-alert" role="status">Combining photos…</div> : null}

      {items.length ? (
        <ul className="p2w-upload__list" aria-live="polite">
          {active.map((item) => (
            <li key={item.id} className={`p2w-upload__item is-${item.phase.toLowerCase()}`}>
              <div className="p2w-upload__name">
                <strong>{item.file.name}</strong>
                <span>{item.phase === 'FAILED' ? item.error : PHASE_LABEL[item.phase]}</span>
              </div>
              {item.phase === 'FAILED' ? (
                <button type="button" className="p2w-button p2w-button--secondary" onClick={() => retry(item)}>Retry</button>
              ) : (
                <progress max={1} value={item.phase === 'UPLOADING' ? item.progress : item.phase === 'FINALIZING' ? 1 : undefined}
                  aria-label={`${item.file.name} upload progress`} />
              )}
            </li>
          ))}
          {received ? (
            <li className="p2w-upload__done">
              <span>{received} file{received === 1 ? '' : 's'} received — processing below</span>
              <button type="button" className="p2w-link" onClick={() => setItems(active)}>Clear</button>
            </li>
          ) : null}
        </ul>
      ) : null}
    </section>
  );
}
