/**
 * Vehicle photo upload: separate from documents and never read by DI.
 *
 * Photos are resized on the device (longest side 2048 px, JPEG) before they
 * leave it, so a phone upload is ~0.5 MB instead of 5 MB. Each photo keeps a
 * clientUploadId derived from the original file, so a retry after a dropped
 * connection can never store the same photo twice.
 */
import { stableClientUploadId } from '../workspace/p2Uploader';

export type PhotoPhase = 'PREPARING' | 'UPLOADING' | 'SAVING' | 'DONE' | 'FAILED';

export interface PhotoItem {
  id: string;
  original: File;
  clientUploadId: string;
  viewCode?: string;
  phase: PhotoPhase;
  progress: number;
  previewUrl?: string;
  error?: string;
}

export interface PhotoTransport {
  intents(files: Array<{ clientUploadId: string; filename: string; contentType: string; sizeBytes: number; viewCode?: string | null }>):
    Promise<Array<{ clientUploadId: string; uploadUrl?: string; uploadHeaders?: Record<string, string>; alreadyStored: boolean }>>;
  put(url: string, headers: Record<string, string>, file: File, onProgress: (fraction: number) => void): Promise<void>;
  finalize(file: { clientUploadId: string; filename: string; contentType: string; viewCode?: string | null }): Promise<unknown>;
}

export const PHOTO_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);
export const MAX_PHOTO_BYTES = 15 * 1024 * 1024;
const MAX_SIDE = 2048;

export const VIEW_LABELS: Record<string, string> = {
  FRONT: 'Front', REAR: 'Rear', LEFT: 'Left side', RIGHT: 'Right side', INTERIOR: 'Interior',
  ODOMETER: 'Odometer', CHASSIS: 'Chassis / VIN plate', DELIVERY: 'Handover', OTHER: 'Other',
};

export function photoPreflight(file: File): string | undefined {
  const type = (file.type || '').toLowerCase();
  const heicByName = /\.(heic|heif)$/i.test(file.name);
  if (!PHOTO_TYPES.has(type) && !heicByName) return 'Only photos (JPG, PNG, WEBP or HEIC) can be added here.';
  if (file.size === 0) return 'This photo is empty.';
  if (file.size > 40 * 1024 * 1024) return 'This photo is too large.';
  return undefined;
}

/** Longest side at most 2048 px, JPEG. Falls back to the original when the
 * browser cannot decode it (e.g. HEIC outside Safari) and it is small enough. */
export async function preparePhoto(file: File): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions);
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('no canvas');
    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
    if (!blob) throw new Error('encode failed');
    const name = file.name.replace(/\.[^.]+$/, '') || 'vehicle-photo';
    return new File([blob], `${name}.jpg`, { type: 'image/jpeg', lastModified: file.lastModified });
  } catch {
    const type = (file.type || '').toLowerCase() || (/\.heif$/i.test(file.name) ? 'image/heif' : 'image/heic');
    if (file.size > MAX_PHOTO_BYTES) throw new Error('This photo could not be resized and is larger than 15 MB.');
    return file.type ? file : new File([file], file.name, { type, lastModified: file.lastModified });
  }
}

export function newPhotoItem(journeyId: string, file: File, viewCode?: string, index = 0): PhotoItem {
  return {
    id: `${Date.now().toString(36)}-${index}-${Math.random().toString(36).slice(2, 8)}`,
    original: file,
    clientUploadId: stableClientUploadId(journeyId, file, `photo-${index}`).replace('web-p2-', 'web-p2-photo-'),
    viewCode,
    phase: 'PREPARING',
    progress: 0,
    previewUrl: typeof URL !== 'undefined' && URL.createObjectURL ? URL.createObjectURL(file) : undefined,
  };
}

function message(cause: unknown, fallback: string): string {
  return cause instanceof Error && cause.message ? cause.message : fallback;
}

/** Upload photos, at most `concurrency` at a time. One failure never stops
 * the others; a failed item can be passed back in to retry it alone. */
export async function runPhotoUploads(
  items: PhotoItem[],
  transport: PhotoTransport,
  onChange: (item: PhotoItem) => void,
  concurrency = 3,
  prepare: (file: File) => Promise<File> = preparePhoto,
): Promise<PhotoItem[]> {
  const update = (item: PhotoItem, patch: Partial<PhotoItem>) => {
    Object.assign(item, patch);
    onChange({ ...item });
  };
  const prepared = new Map<string, File>();
  for (const item of items) {
    try {
      prepared.set(item.id, await prepare(item.original));
    } catch (cause) {
      update(item, { phase: 'FAILED', error: message(cause, 'This photo could not be prepared.') });
    }
  }
  const ready = items.filter((item) => prepared.has(item.id));
  if (!ready.length) return items;

  let intents: Awaited<ReturnType<PhotoTransport['intents']>>;
  try {
    intents = await transport.intents(ready.map((item) => {
      const file = prepared.get(item.id)!;
      return { clientUploadId: item.clientUploadId, filename: file.name, contentType: file.type,
        sizeBytes: file.size, viewCode: item.viewCode ?? null };
    }));
  } catch (cause) {
    for (const item of ready) update(item, { phase: 'FAILED', error: message(cause, 'Photos could not be started.') });
    return items;
  }
  const byClient = new Map(intents.map((intent) => [intent.clientUploadId, intent]));

  let cursor = 0;
  const worker = async () => {
    while (cursor < ready.length) {
      const item = ready[cursor];
      cursor += 1;
      const file = prepared.get(item.id)!;
      const intent = byClient.get(item.clientUploadId);
      try {
        if (!intent) throw new Error('The server did not prepare this photo.');
        if (!intent.alreadyStored) {
          update(item, { phase: 'UPLOADING', progress: 0 });
          await transport.put(intent.uploadUrl!, intent.uploadHeaders ?? { 'Content-Type': file.type }, file,
            (fraction) => update(item, { progress: fraction }));
          update(item, { phase: 'SAVING', progress: 1 });
          // Storage can take a moment to show a just-written object; the
          // finalize call is idempotent, so a short retry is always safe.
          for (let attempt = 0; ; attempt += 1) {
            try {
              await transport.finalize({ clientUploadId: item.clientUploadId, filename: file.name,
                contentType: file.type, viewCode: item.viewCode ?? null });
              break;
            } catch (cause) {
              if (attempt >= 2) throw cause;
              await new Promise((resolve) => setTimeout(resolve, 800 * (attempt + 1)));
            }
          }
        }
        update(item, { phase: 'DONE', progress: 1, error: undefined });
      } catch (cause) {
        update(item, { phase: 'FAILED', error: message(cause, 'This photo could not be uploaded. Try again.') });
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, ready.length) }, worker));
  return items;
}
