import { auditCoreRequest } from './client';

/**
 * Bulk upload of journey files (product owner 2026-11-03). The PC drops many files for the
 * selected outlet; each goes straight to storage under dealership / outlet / day, with the name
 * the PC gave it, and nothing is processed until Submit. Then every file becomes a new booking,
 * an update to an existing booking, or is set aside as an exact duplicate -- nothing is asked of
 * the PC. Audit Core /p2/v1/tenants/{t}/bulk-uploads.
 */

export type BulkFileOutcome =
  | 'PENDING' | 'EXACT_DUPLICATE' | 'READING' | 'NEW_BOOKING' | 'ADDED_TO_BOOKING' | 'KEPT_FOR_REVIEW' | 'FAILED';

export type BulkFile = {
  fileId: string;
  filename: string;
  sizeBytes: number;
  uploaded: boolean;
  outcome: BulkFileOutcome;
  journeyId: string | null;
  journeyReference: string | null;
  detail: string | null;
};

export type BulkUpload = {
  bulkId: string;
  outletId: string;
  dealerId: string;
  status: 'OPEN' | 'SUBMITTED' | 'PROCESSING' | 'DONE' | 'FAILED';
  folder: string;
  fileCount: number;
  summary: Partial<Record<BulkFileOutcome, number>>;
  createdAtUtc: string | null;
  submittedAtUtc: string | null;
  finishedAtUtc: string | null;
  files: BulkFile[];
};

export type BulkUploadList = { items: BulkUpload[]; inProgress: number; multiOutlet: boolean };

export type PreparedBulkFile = { fileId: string; filename: string; objectKey: string; contentType: string; uploadUrl: string };

const base = (tenantId: string) => `/p2/v1/tenants/${encodeURIComponent(tenantId)}/bulk-uploads`;

export function listBulkUploads(tenantId: string, accessToken?: string, limit = 10) {
  return auditCoreRequest<BulkUploadList>(`${base(tenantId)}?limit=${limit}`, { accessToken, cache: 'no-store' });
}

export function openBulkUpload(tenantId: string, outletId: string, createdByName: string | null, accessToken?: string) {
  return auditCoreRequest<BulkUpload>(base(tenantId), {
    method: 'POST', accessToken, body: JSON.stringify({ outletId, createdByName }),
  });
}

export function prepareBulkFiles(tenantId: string, bulkId: string, files: File[], accessToken?: string) {
  return auditCoreRequest<{ bulkId: string; files: PreparedBulkFile[] }>(
    `${base(tenantId)}/${encodeURIComponent(bulkId)}/files`,
    {
      method: 'POST', accessToken,
      body: JSON.stringify({ files: files.map((f) => ({ filename: f.name, contentType: bulkContentType(f), sizeBytes: f.size })) }),
    },
  );
}

export function completeBulkFile(tenantId: string, bulkId: string, fileId: string, accessToken?: string) {
  return auditCoreRequest<BulkFile>(
    `${base(tenantId)}/${encodeURIComponent(bulkId)}/files/${encodeURIComponent(fileId)}/complete`,
    { method: 'POST', accessToken },
  );
}

export function submitBulkUpload(tenantId: string, bulkId: string, accessToken?: string) {
  return auditCoreRequest<BulkUpload>(`${base(tenantId)}/${encodeURIComponent(bulkId)}/submit`, { method: 'POST', accessToken });
}

/** The file straight into storage, with its progress (0..1). */
export function putToStorage(url: string, file: File, contentType: string, onProgress?: (share: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Type', contentType);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) onProgress(event.loaded / event.total);
    };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload failed (HTTP ${xhr.status}).`)));
    xhr.onerror = () => reject(new Error('Upload failed: the connection dropped.'));
    xhr.send(file);
  });
}

export const BULK_ACCEPT = '.pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png';

export function bulkContentType(file: File): string {
  const type = (file.type || '').toLowerCase();
  if (type === 'application/pdf' || type === 'image/jpeg' || type === 'image/png') return type;
  const name = file.name.toLowerCase();
  if (name.endsWith('.pdf')) return 'application/pdf';
  if (name.endsWith('.png')) return 'image/png';
  if (name.endsWith('.jpg') || name.endsWith('.jpeg')) return 'image/jpeg';
  return type || 'application/octet-stream';
}

export function acceptedForBulk(file: File): boolean {
  return ['application/pdf', 'image/jpeg', 'image/png'].includes(bulkContentType(file)) && file.size <= 50 * 1024 * 1024;
}

export const OUTCOME_LABELS: Record<BulkFileOutcome, { label: string; tone: 'ok' | 'warn' | 'bad' | 'open' }> = {
  PENDING: { label: 'Waiting', tone: 'open' },
  READING: { label: 'Being read', tone: 'open' },
  EXACT_DUPLICATE: { label: 'Exact duplicate — not read', tone: 'warn' },
  NEW_BOOKING: { label: 'New booking', tone: 'ok' },
  ADDED_TO_BOOKING: { label: 'Added to booking', tone: 'ok' },
  KEPT_FOR_REVIEW: { label: 'Kept for review', tone: 'warn' },
  FAILED: { label: 'Failed', tone: 'bad' },
};

export function bulkInProgress(list: BulkUploadList | undefined): boolean {
  return Boolean(list && list.inProgress > 0);
}
