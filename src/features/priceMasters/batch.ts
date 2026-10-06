import type { OemMasterUploadPreview } from '../../services/audit-core/oemMasters';

/** One file in a price master upload of many files. */
export type BatchStatus =
  | 'WAITING'
  | 'CHECKING'
  | 'READY'
  | 'NO_DATE'
  | 'HAS_ERRORS'
  | 'CHECK_FAILED'
  | 'PUBLISHING'
  | 'PUBLISHED'
  | 'PUBLISH_FAILED';

export interface BatchItem {
  id: string;
  file: File;
  /** The WEF date to publish with; filled from the file once it has been checked, and typed over by the person. */
  date: string;
  status: BatchStatus;
  preview?: OemMasterUploadPreview;
  message?: string;
}

export function itemId(file: File): string {
  return `${file.name}::${file.size}::${file.lastModified}`;
}

/** Adds files to a batch; a file already in it (same name, size and time) is not added twice. */
export function addFiles(items: BatchItem[], files: File[]): BatchItem[] {
  const known = new Set(items.map((i) => i.id));
  const added: BatchItem[] = [];
  for (const file of files) {
    const id = itemId(file);
    if (known.has(id)) continue;
    known.add(id);
    added.push({ id, file, date: '', status: 'WAITING' });
  }
  return [...items, ...added];
}

/** What a checked file may do next: it needs a date and no errors. A file with a date but errors is never published. */
export function statusAfterCheck(preview: OemMasterUploadPreview, date: string): BatchStatus {
  if (preview.errors.length > 0) return 'HAS_ERRORS';
  return date ? 'READY' : 'NO_DATE';
}

/** A date typed over a checked file moves it between "needs a date" and "ready" without another check. */
export function withDate(item: BatchItem, date: string): BatchItem {
  if (item.status !== 'READY' && item.status !== 'NO_DATE') return { ...item, date };
  return { ...item, date, status: date ? 'READY' : 'NO_DATE' };
}

export function isPublishable(item: BatchItem): boolean {
  return item.status === 'READY' && Boolean(item.date) && (item.preview?.errors.length ?? 1) === 0;
}

/** Oldest WEF date first, so each later list builds on the earlier one; same date by file name. */
export function publishOrder(items: BatchItem[]): BatchItem[] {
  return items
    .filter(isPublishable)
    .sort((a, b) => a.date.localeCompare(b.date) || a.file.name.localeCompare(b.file.name));
}

export function applyDateToAll(items: BatchItem[], date: string): BatchItem[] {
  return items.map((item) => withDate(item, date));
}

export function batchSummary(items: BatchItem[]) {
  const count = (...states: BatchStatus[]) => items.filter((i) => states.includes(i.status)).length;
  return {
    total: items.length,
    ready: count('READY'),
    needDate: count('NO_DATE'),
    withErrors: count('HAS_ERRORS', 'CHECK_FAILED'),
    published: count('PUBLISHED'),
    failed: count('PUBLISH_FAILED'),
    waiting: count('WAITING'),
  };
}

export const STATUS_LABEL: Record<BatchStatus, string> = {
  WAITING: 'Not checked yet',
  CHECKING: 'Checking…',
  READY: 'Ready to publish',
  NO_DATE: 'Type the WEF date',
  HAS_ERRORS: 'Problems in the file: not loaded',
  CHECK_FAILED: 'Could not be read',
  PUBLISHING: 'Publishing…',
  PUBLISHED: 'Published',
  PUBLISH_FAILED: 'Not published',
};
