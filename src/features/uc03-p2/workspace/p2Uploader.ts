/**
 * Phase 2 upload engine.
 *
 * - one `uploads:init` call reserves every file (idempotent per clientUploadId)
 * - each file is PUT straight to object storage with progress, at most
 *   `concurrency` at a time, then finalized; Audit Core never carries bytes
 * - a failed file never stops the others and can be retried on its own
 * - retries reuse the same clientUploadId, so a retried file can never be
 *   accepted twice
 */

export type UploadPhase = 'WAITING' | 'PREPARING' | 'UPLOADING' | 'FINALIZING' | 'ACCEPTED' | 'FAILED';

export interface UploadItem {
  id: string;
  file: File;
  clientUploadId: string;
  phase: UploadPhase;
  progress: number;
  error?: string;
  batchId?: string;
}

export interface PreparedUpload {
  batchId: string;
  clientUploadId?: string | null;
  filename: string;
  status: string;
  alreadyAccepted: boolean;
  uploadUrl: string | null;
  uploadHeaders: Record<string, string>;
}

export interface UploadTransport {
  init(files: Array<{ filename: string; contentType: string; sizeBytes: number; clientUploadId: string }>):
    Promise<PreparedUpload[]>;
  put(url: string, headers: Record<string, string>, file: File, onProgress: (fraction: number) => void): Promise<void>;
  finalize(batchId: string): Promise<void>;
}

export function contentTypeForFile(file: File): string {
  if (file.type) return file.type;
  const name = file.name.toLowerCase();
  if (name.endsWith('.pdf')) return 'application/pdf';
  if (name.endsWith('.jpg') || name.endsWith('.jpeg')) return 'image/jpeg';
  if (name.endsWith('.png')) return 'image/png';
  return 'application/octet-stream';
}

export function stableClientUploadId(journeyId: string, file: File, salt = ''): string {
  const seed = [journeyId, file.name, file.size, file.lastModified, salt].join('|');
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `web-p2-${(hash >>> 0).toString(36)}-${file.size.toString(36)}`;
}

export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
const ACCEPTED_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png']);

/** Reasons a file can be rejected before any network call. */
export function preflightError(file: File): string | undefined {
  if (!ACCEPTED_TYPES.has(contentTypeForFile(file))) return 'Only PDF, JPG or PNG files can be uploaded.';
  if (file.size === 0) return 'This file is empty.';
  if (file.size > MAX_UPLOAD_BYTES) return 'This file is larger than 50 MB.';
  return undefined;
}

function message(cause: unknown, fallback: string): string {
  return cause instanceof Error && cause.message ? cause.message : fallback;
}

export async function runUploads(
  items: UploadItem[],
  transport: UploadTransport,
  onChange: (item: UploadItem) => void,
  concurrency = 3,
): Promise<UploadItem[]> {
  const state = new Map(items.map((item) => [item.id, { ...item }]));
  const update = (id: string, patch: Partial<UploadItem>) => {
    const next = { ...state.get(id)!, ...patch };
    state.set(id, next);
    onChange(next);
  };

  const pending = items.filter((item) => {
    const problem = preflightError(item.file);
    if (problem) update(item.id, { phase: 'FAILED', error: problem });
    return !problem;
  });
  if (!pending.length) return [...state.values()];

  pending.forEach((item) => update(item.id, { phase: 'PREPARING', progress: 0, error: undefined }));
  let prepared: PreparedUpload[];
  try {
    prepared = await transport.init(pending.map((item) => ({
      filename: item.file.name,
      contentType: contentTypeForFile(item.file),
      sizeBytes: item.file.size,
      clientUploadId: item.clientUploadId,
    })));
  } catch (cause) {
    const error = message(cause, 'The upload could not be prepared. Try again.');
    pending.forEach((item) => update(item.id, { phase: 'FAILED', error }));
    return [...state.values()];
  }
  const byClientId = new Map(prepared.map((upload) => [upload.clientUploadId, upload]));

  const queue = [...pending];
  const worker = async () => {
    for (let item = queue.shift(); item; item = queue.shift()) {
      const upload = byClientId.get(item.clientUploadId);
      if (!upload) {
        update(item.id, { phase: 'FAILED', error: 'The server did not accept this file.' });
        continue;
      }
      if (upload.alreadyAccepted) {
        update(item.id, { phase: 'ACCEPTED', progress: 1, batchId: upload.batchId });
        continue;
      }
      try {
        if (!upload.uploadUrl) throw new Error('The upload link is missing. Try again.');
        update(item.id, { phase: 'UPLOADING', batchId: upload.batchId });
        await transport.put(upload.uploadUrl, upload.uploadHeaders, item.file,
          (fraction) => update(item.id, { progress: Math.min(0.99, fraction) }));
        update(item.id, { phase: 'FINALIZING', progress: 1 });
        await transport.finalize(upload.batchId);
        update(item.id, { phase: 'ACCEPTED' });
      } catch (cause) {
        update(item.id, { phase: 'FAILED', error: message(cause, 'Upload failed. Check the connection and retry.') });
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, pending.length)) }, worker));
  return [...state.values()];
}

/** Browser PUT with upload progress (fetch has no upload progress events). */
export function xhrPut(
  url: string,
  headers: Record<string, string>,
  file: File,
  onProgress: (fraction: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('PUT', url);
    Object.entries(headers).forEach(([key, value]) => request.setRequestHeader(key, value));
    request.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) onProgress(event.loaded / event.total);
    };
    request.onload = () => (request.status >= 200 && request.status < 300
      ? resolve()
      : reject(new Error(`Upload was rejected by storage (HTTP ${request.status}).`)));
    request.onerror = () => reject(new Error('Upload failed. Check the connection and retry.'));
    request.ontimeout = () => reject(new Error('Upload timed out. Retry on a stronger connection.'));
    request.timeout = 10 * 60 * 1000;
    request.send(file);
  });
}

/** Combine photos (camera shots) into one PDF: one document, several pages. */
export async function combineImagesToPdf(images: File[], name: string): Promise<File> {
  const { PDFDocument } = await import('pdf-lib');
  const pdf = await PDFDocument.create();
  for (const image of images) {
    const bytes = new Uint8Array(await image.arrayBuffer());
    const type = contentTypeForFile(image);
    const embedded = type === 'image/png' ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
    // A4-ish page sized to the image aspect, capped so huge photos stay light.
    const scale = Math.min(1, 1654 / Math.max(embedded.width, embedded.height));
    const page = pdf.addPage([embedded.width * scale, embedded.height * scale]);
    page.drawImage(embedded, { x: 0, y: 0, width: embedded.width * scale, height: embedded.height * scale });
  }
  const bytes = await pdf.save();
  return new File([bytes.slice().buffer as ArrayBuffer], name.endsWith('.pdf') ? name : `${name}.pdf`, { type: 'application/pdf' });
}
