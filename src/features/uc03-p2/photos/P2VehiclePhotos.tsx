import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { formatDateTime } from '../workspace/p2Format';
import {
  getP2VehiclePhotos,
  p2PhotoTransport,
  type P2VehiclePhoto,
} from '../../../services/audit-core/uc03P2';
import {
  newPhotoItem,
  photoPreflight,
  runPhotoUploads,
  VIEW_LABELS,
  type PhotoItem,
  type PhotoTransport,
} from './p2PhotoUploader';

type Props = {
  tenantId: string;
  journeyId?: string;
  accessToken?: string;
  /** Creates the booking first when the screen is still "New booking". */
  ensureJourney: () => Promise<string>;
};

const PHASE_LABEL: Record<PhotoItem['phase'], string> = {
  PREPARING: 'Preparing…', UPLOADING: 'Uploading', SAVING: 'Saving…', DONE: 'Saved', FAILED: 'Failed',
};

/**
 * Vehicle photos: a plain capture path, separate from documents. Photos are
 * stored as they are -- no classification, no reading of values, no checks
 * -- so they appear immediately.
 */
export default function P2VehiclePhotos({ tenantId, journeyId, accessToken, ensureJourney }: Props) {
  const queryClient = useQueryClient();
  const [view, setView] = useState<string>('');
  const [items, setItems] = useState<PhotoItem[]>([]);
  const [error, setError] = useState<string>();
  const [open, setOpen] = useState<P2VehiclePhoto>();
  const [confirmRemove, setConfirmRemove] = useState<P2VehiclePhoto>();
  const cameraInput = useRef<HTMLInputElement>(null);
  const galleryInput = useRef<HTMLInputElement>(null);

  const photos = useQuery({
    queryKey: ['p2-vehicle-photos', tenantId, journeyId],
    queryFn: () => getP2VehiclePhotos(tenantId, journeyId!, accessToken),
    enabled: Boolean(journeyId && accessToken),
    // Signed image links last 30 minutes; refresh well before that.
    staleTime: 60_000,
    refetchInterval: 20 * 60_000,
  });
  const list = photos.data?.photos ?? [];
  const limit = photos.data?.limit ?? 24;

  useEffect(() => () => items.forEach((item) => item.previewUrl && URL.revokeObjectURL(item.previewUrl)), []);  // eslint-disable-line react-hooks/exhaustive-deps

  const invalidate = useCallback((target: string) => {
    void queryClient.invalidateQueries({ queryKey: ['p2-vehicle-photos', tenantId, target] });
    void queryClient.invalidateQueries({ queryKey: ['p2-stage', tenantId, target] });
    void queryClient.invalidateQueries({ queryKey: ['p2-360', tenantId, target] });
  }, [queryClient, tenantId]);

  const upload = useCallback(async (batch: PhotoItem[], target: string) => {
    const transport: PhotoTransport = p2PhotoTransport(tenantId, target, accessToken);
    await runPhotoUploads(batch, transport, (changed) =>
      setItems((current) => current.map((item) => (item.id === changed.id ? changed : item))));
    invalidate(target);
  }, [accessToken, invalidate, tenantId]);

  const addFiles = async (files: FileList | null) => {
    setError(undefined);
    const chosen = Array.from(files ?? []);
    if (!chosen.length) return;
    const rejected = chosen.map(photoPreflight).find(Boolean);
    const accepted = chosen.filter((file) => !photoPreflight(file));
    if (rejected) setError(rejected);
    if (!accepted.length) return;
    if (list.length + accepted.length > limit) {
      setError(`At most ${limit} photos are kept per booking (${list.length} already added).`);
      return;
    }
    let target = journeyId;
    try {
      target = target || await ensureJourney();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The booking could not be started.');
      return;
    }
    const batch = accepted.map((file, index) => newPhotoItem(target!, file, view || undefined, index));
    setItems((current) => [...batch, ...current]);
    await upload(batch, target!);
  };

  const retry = async (item: PhotoItem) => {
    if (!journeyId) return;
    const again = { ...item, phase: 'PREPARING' as const, progress: 0, error: undefined };
    setItems((current) => current.map((entry) => (entry.id === item.id ? again : entry)));
    await upload([again], journeyId);
  };

  const remove = useMutation({
    mutationFn: (photo: P2VehiclePhoto) => p2PhotoTransport(tenantId, journeyId!, accessToken).remove(photo.photoId),
    onSuccess: () => { setConfirmRemove(undefined); setOpen(undefined); if (journeyId) invalidate(journeyId); },
    onError: (cause) => setError(cause instanceof Error ? cause.message : 'The photo could not be removed.'),
  });

  const pending = items.filter((item) => item.phase !== 'DONE');
  const counts = list.reduce<Record<string, number>>((acc, photo) => {
    const key = photo.viewCode || 'OTHER';
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
  const suggested = ['FRONT', 'REAR', 'LEFT', 'RIGHT', 'ODOMETER'].filter((code) => !counts[code]);

  return (
    <section className="p2w-photos" data-p2-photo aria-label="Vehicle photos">
      <header className="p2w-photos__head">
        <div>
          <h2>Vehicle photos</h2>
          <p>Stored exactly as taken. Photos are not read or checked, so they are saved in seconds.</p>
        </div>
        <span className="p2w-muted">{list.length} of {limit}</span>
      </header>

      <div className="p2w-photos__views" role="radiogroup" aria-label="What does the next photo show?">
        <button type="button" role="radio" aria-checked={view === ''} className={view === '' ? 'is-active' : ''}
          onClick={() => setView('')}>Any</button>
        {Object.entries(VIEW_LABELS).map(([code, label]) => (
          <button key={code} type="button" role="radio" aria-checked={view === code}
            className={view === code ? 'is-active' : ''} onClick={() => setView(code)}>
            {label}{counts[code] ? <b aria-label={`${counts[code]} taken`}>✓</b> : null}
          </button>
        ))}
      </div>

      <div className="p2w-photos__actions">
        <button type="button" className="p2w-button p2w-button--primary p2w-button--lg"
          onClick={() => cameraInput.current?.click()}>Take photo</button>
        <button type="button" className="p2w-button p2w-button--secondary p2w-button--lg"
          onClick={() => galleryInput.current?.click()}>Choose photos</button>
        <input ref={cameraInput} className="p2w-hidden-input" type="file" accept="image/*" capture="environment"
          onChange={(event) => { void addFiles(event.target.files); event.currentTarget.value = ''; }} />
        <input ref={galleryInput} className="p2w-hidden-input" type="file" multiple
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
          onChange={(event) => { void addFiles(event.target.files); event.currentTarget.value = ''; }} />
      </div>
      {suggested.length && list.length < limit ? (
        <p className="p2w-muted p2w-photos__hint">Still to take: {suggested.map((code) => VIEW_LABELS[code]).join(', ')}.</p>
      ) : null}

      {error ? <div className="p2w-alert p2w-alert--error" role="alert">{error}</div> : null}
      {photos.isError ? (
        <div className="p2w-alert p2w-alert--error" role="alert">
          Photos could not be loaded.
          <button type="button" className="p2w-link" onClick={() => void photos.refetch()}>Try again</button>
        </div>
      ) : null}

      {pending.length ? (
        <ul className="p2w-photos__progress" aria-live="polite">
          {pending.map((item) => (
            <li key={item.id} className={item.phase === 'FAILED' ? 'is-failed' : ''}>
              {item.previewUrl ? <img src={item.previewUrl} alt="" /> : <span className="p2w-photos__blank" />}
              <span className="p2w-photos__name">
                <strong>{item.viewCode ? VIEW_LABELS[item.viewCode] : item.original.name}</strong>
                <span>{item.error || PHASE_LABEL[item.phase]}</span>
                {item.phase === 'UPLOADING' ? <progress max={1} value={item.progress} /> : null}
              </span>
              {item.phase === 'FAILED' ? (
                <button type="button" className="p2w-button p2w-button--secondary" onClick={() => void retry(item)}>Retry</button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {list.length ? (
        <ul className="p2w-photos__grid">
          {list.map((photo) => (
            <li key={photo.photoId}>
              <button type="button" className="p2w-photos__thumb" onClick={() => setOpen(photo)}
                aria-label={`Open ${photo.viewCode ? VIEW_LABELS[photo.viewCode] : 'photo'}`}>
                {photo.url ? <img src={photo.url} alt="" loading="lazy" /> : <span className="p2w-photos__blank" />}
              </button>
              <span className="p2w-photos__caption">
                <strong>{photo.viewCode ? VIEW_LABELS[photo.viewCode] : 'Photo'}</strong>
                <span className="p2w-muted">{photo.uploadedAtUtc ? formatDateTime(photo.uploadedAtUtc) : ''}</span>
              </span>
            </li>
          ))}
        </ul>
      ) : !photos.isLoading && !pending.length ? (
        <div className="p2w-empty">No vehicle photos yet. Take front, rear, both sides and the odometer.</div>
      ) : null}

      {open ? (
        <div className="p2w-dialog-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setOpen(undefined);
        }}>
          <div className="p2w-dialog p2w-photo-viewer" role="dialog" aria-modal="true" aria-label="Vehicle photo">
            {open.url ? <img src={open.url} alt={open.viewCode ? VIEW_LABELS[open.viewCode] : 'Vehicle photo'} /> : null}
            <div className="p2w-dialog__actions">
              <span className="p2w-muted">{open.viewCode ? VIEW_LABELS[open.viewCode] : 'Photo'} · {open.filename}</span>
              <button type="button" className="p2w-button p2w-button--danger" onClick={() => setConfirmRemove(open)}>Remove</button>
              <button type="button" className="p2w-button p2w-button--ghost" autoFocus onClick={() => setOpen(undefined)}>Close</button>
            </div>
          </div>
        </div>
      ) : null}

      {confirmRemove ? (
        <div className="p2w-dialog-backdrop" role="presentation">
          <div className="p2w-dialog" role="alertdialog" aria-modal="true" aria-labelledby="p2w-photo-remove">
            <h3 id="p2w-photo-remove">Remove this photo?</h3>
            <p>It will no longer count for this booking.</p>
            <div className="p2w-dialog__actions">
              <button type="button" className="p2w-button p2w-button--ghost" autoFocus onClick={() => setConfirmRemove(undefined)}>Keep</button>
              <button type="button" className="p2w-button p2w-button--danger" disabled={remove.isPending}
                onClick={() => remove.mutate(confirmRemove)}>{remove.isPending ? 'Removing…' : 'Remove'}</button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
