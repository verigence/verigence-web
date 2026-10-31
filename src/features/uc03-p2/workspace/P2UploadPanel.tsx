import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type Ref } from 'react';

import {
  answerDifferentCustomer,
  bookingNameForQuestion,
  splitDroppedFiles,
  type DifferentCustomerAnswer,
  type KnownBookingNames,
} from './customerNameGuard';
import P2DifferentCustomerPrompt from './P2DifferentCustomerPrompt';
import { isUploadPausedError, uploadErrorText } from '../uploadPause/uploadPause';
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

/** Lets a document card that is still missing open the same pickers, and a
 * new booking take the files "Start new booking with this file" brought. */
export type P2UploadPanelHandle = { openFiles: () => void; openCamera: () => void; addFiles: (files: File[]) => void };

/** Files still being sent from this screen, and files whose upload failed. */
export type P2UploadActivity = { sending: boolean; failed: number };

const SENDING = new Set<UploadItem['phase']>(['WAITING', 'PREPARING', 'UPLOADING', 'FINALIZING']);

export function uploadActivity(items: readonly Pick<UploadItem, 'phase'>[], combining = false): P2UploadActivity {
  return {
    sending: combining || items.some((item) => SENDING.has(item.phase)),
    failed: items.filter((item) => item.phase === 'FAILED').length,
  };
}

export default function P2UploadPanel({
  journeyId,
  getTransport,
  onAccepted,
  knownNames,
  onStartNewWith,
  onActivity,
  pausedNotice,
  onPaused,
  ref,
}: {
  journeyId?: string;
  /** Resolves the Journey to upload into (a new booking creates it here). */
  getTransport: () => Promise<{ journeyId: string; transport: UploadTransport }>;
  onAccepted: () => void;
  /** Whose the booking is, as far as it knows: a dropped file named after
   * someone else is asked about before it is uploaded (2026-10-31). */
  knownNames?: KnownBookingNames;
  /** "Start new booking with this file"; absent for someone who does not start bookings. */
  onStartNewWith?: (files: File[]) => void;
  /** Told whenever files start or stop being sent. */
  onActivity?: (activity: P2UploadActivity) => void;
  /** Uploads are paused for maintenance (2026-10-31): this notice shows above
   * the drop area, and the drop area, pickers and Retry are off. */
  pausedNotice?: string;
  /** Audit Core refused an upload because uploads are paused (read the status again). */
  onPaused?: () => void;
  ref?: Ref<P2UploadPanelHandle>;
}) {
  const paused = Boolean(pausedNotice);
  const fileInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<UploadItem[]>([]);
  const [dragging, setDragging] = useState(false);
  const [photoChoice, setPhotoChoice] = useState<File[]>();
  const [combining, setCombining] = useState(false);
  const [problem, setProblem] = useState<string>();
  // Files named after a different customer, waiting for the PC's answer.
  const [held, setHeld] = useState<File[]>();
  // Every file sent from this screen (the list above drops received ones).
  const [sentNames, setSentNames] = useState<string[]>([]);
  // Drops waiting for their booking (a new booking is being created).
  const [starting, setStarting] = useState(0);

  const start = useCallback(async (next: UploadItem[], target: { journeyId: string; transport: UploadTransport }) => {
    setItems((current) => [...current.filter((item) => item.phase !== 'ACCEPTED'), ...next]);
    const results = await runUploads(next, target.transport, (changed) =>
      setItems((current) => current.map((item) => (item.id === changed.id ? changed : item))));
    if (results.some((item) => item.phase === 'ACCEPTED')) onAccepted();
    if (results.some((item) => item.paused)) onPaused?.();
  }, [onAccepted, onPaused]);

  const queueFiles = useCallback(async (files: File[]) => {
    // Nothing is sent while uploads are paused: the notice above says why.
    if (!files.length || paused) return;
    setProblem(undefined);
    // Known from now on, even while a new booking is still being created.
    setSentNames((current) => [...current, ...files.map((file) => file.name)]);
    let target: { journeyId: string; transport: UploadTransport };
    setStarting((count) => count + 1);
    try {
      target = await getTransport();
    } catch (cause) {
      if (isUploadPausedError(cause)) onPaused?.();
      setProblem(uploadErrorText(cause, 'The booking could not be started.'));
      return;
    } finally {
      setStarting((count) => count - 1);
    }
    void start(files.map((file) => ({
      id: nextId(),
      file,
      clientUploadId: stableClientUploadId(target.journeyId, file),
      phase: 'WAITING' as const,
      progress: 0,
    })), target);
  }, [getTransport, onPaused, paused, start]);

  const proceed = useCallback((files: File[]) => {
    if (!files.length) return;
    const images = files.filter((file) => contentTypeForFile(file).startsWith('image/'));
    // Several photos may be one document (Aadhaar front + back, a 2-page
    // invoice). Ask once instead of guessing.
    if (images.length >= 2 && images.length === files.length) {
      setPhotoChoice(images);
      return;
    }
    void queueFiles(files);
  }, [queueFiles]);

  // The booking's names, with the files sent from this screen that the
  // documents read does not list yet.
  const known = useMemo<KnownBookingNames>(() => ({
    ...knownNames,
    fileNames: [...(knownNames?.fileNames ?? []), ...sentNames],
  }), [knownNames, sentNames]);

  const accept = useCallback((files: File[]) => {
    // Only a booking that already has files is compared; a file that names
    // no one (IMG_20261019_120541.jpg, scan001.pdf) always goes straight in.
    const { pass, held: different } = splitDroppedFiles(files, known);
    if (different.length) setHeld((current) => [...(current ?? []), ...different]);
    proceed(pass);
  }, [known, proceed]);

  useImperativeHandle(ref, () => ({
    openFiles: () => fileInput.current?.click(),
    openCamera: () => cameraInput.current?.click(),
    // Already decided on (they come from the different-customer question).
    addFiles: proceed,
  }), [proceed]);

  const uploadPhotos = async (asOne: boolean) => {
    const photos = photoChoice ?? [];
    setPhotoChoice(undefined);
    if (!asOne) {
      void queueFiles(photos);
      return;
    }
    setCombining(true);
    try {
      const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
      await queueFiles([await combineImagesToPdf(photos, `photos-${stamp}.pdf`)]);
    } finally {
      setCombining(false);
    }
  };

  const retry = async (item: UploadItem) => {
    if (paused) return;
    setItems((current) => current.filter((existing) => existing.id !== item.id));
    // Same clientUploadId: a retried file can never be accepted twice.
    try {
      void start([{ ...item, id: nextId(), phase: 'WAITING', progress: 0, error: undefined, paused: undefined }], await getTransport());
    } catch (cause) {
      if (isUploadPausedError(cause)) onPaused?.();
      setProblem(uploadErrorText(cause, 'The upload could not be retried.'));
    }
  };

  const answerHeld = (answer: DifferentCustomerAnswer) => {
    const { startNewWith, upload } = answerDifferentCustomer(answer, held ?? [], Boolean(onStartNewWith));
    setHeld(undefined);
    if (startNewWith.length) onStartNewWith?.(startNewWith);
    proceed(upload);
  };

  const active = items.filter((item) => item.phase !== 'ACCEPTED');
  const received = items.length - active.length;
  const { sending, failed } = uploadActivity(items, combining || starting > 0);
  useEffect(() => { onActivity?.({ sending, failed }); }, [failed, onActivity, sending]);

  return (
    <section
      className={`p2w-upload${dragging ? ' is-dragging' : ''}${paused ? ' is-paused' : ''}`}
      aria-label="Upload documents"
      // While paused a dropped file is still caught here (the browser would
      // otherwise open it in place of the app) and then ignored.
      onDragOver={(event) => { event.preventDefault(); if (!paused) setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        if (!paused) accept(Array.from(event.dataTransfer.files));
      }}
    >
      {pausedNotice ? <div className="p2w-alert p2w-alert--paused" role="status">{pausedNotice}</div> : null}
      <div className="p2w-upload__drop p2-capture" data-p2-journey={journeyId || 'new'} aria-disabled={paused || undefined}>
        <div className="p2w-upload__copy">
          <strong>Add documents</strong>
          <span>Drop files here, or photograph them. A PDF with many documents is sorted automatically.</span>
        </div>
        <div className="p2w-upload__buttons">
          <button type="button" className="p2w-button p2w-button--primary p2w-button--lg" disabled={paused}
            onClick={() => cameraInput.current?.click()}>
            Take photo
          </button>
          <button type="button" className="p2w-button p2w-button--secondary p2w-button--lg" disabled={paused}
            onClick={() => fileInput.current?.click()}>
            Choose files
          </button>
        </div>
        <input
          ref={fileInput}
          className="p2w-hidden-input"
          type="file"
          multiple
          accept="application/pdf,image/jpeg,image/png"
          disabled={paused}
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
          disabled={paused}
          onChange={(event) => {
            accept(Array.from(event.target.files ?? []));
            event.currentTarget.value = '';
          }}
        />
      </div>

      {held?.length ? (
        <P2DifferentCustomerPrompt
          fileNames={held.map((file) => file.name)}
          bookingName={bookingNameForQuestion(known)}
          onStartNew={onStartNewWith ? () => answerHeld('start-new') : undefined}
          onAddHere={() => answerHeld('add-here')}
          onCancel={() => answerHeld('cancel')}
        />
      ) : null}
      {photoChoice ? (
        <div className="p2w-choice" role="group" aria-label="How should these photos be uploaded?">
          <span>{photoChoice.length} photos selected. Are they pages of one document?</span>
          <div>
            <button type="button" className="p2w-button p2w-button--primary" disabled={paused} onClick={() => void uploadPhotos(true)}>One document</button>
            <button type="button" className="p2w-button p2w-button--secondary" disabled={paused} onClick={() => void uploadPhotos(false)}>Separate documents</button>
          </div>
        </div>
      ) : null}
      {combining ? <div className="p2w-alert" role="status">Combining photos…</div> : null}
      {problem ? <div className="p2w-alert p2w-alert--error" role="alert">{problem}</div> : null}

      {items.length ? (
        <ul className="p2w-upload__list" aria-live="polite">
          {active.map((item) => (
            <li key={item.id} className={`p2w-upload__item is-${item.phase.toLowerCase()}`}>
              <div className="p2w-upload__name">
                <strong>{item.file.name}</strong>
                <span>{item.phase === 'FAILED' ? item.error : PHASE_LABEL[item.phase]}</span>
              </div>
              {item.phase === 'FAILED' ? (
                <button type="button" className="p2w-button p2w-button--secondary" disabled={paused} onClick={() => void retry(item)}>Retry</button>
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
