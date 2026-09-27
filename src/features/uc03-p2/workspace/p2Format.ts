/** Shared P2 display helpers. Values are shown exactly as stored (IDs, VINs,
 * registration and policy numbers keep their case); only keys are humanized. */

export function humanizeKey(key: string | null | undefined): string {
  if (!key) return '';
  const spaced = key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
    .toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function editableValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}

const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });

export function formatInr(value: string | number | null | undefined): string {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? inr.format(amount) : '—';
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  }).format(date);
}

export function relativeDue(value: string | null | undefined, now = Date.now()): { label: string; overdue: boolean } {
  if (!value) return { label: 'No SLA', overdue: false };
  const due = new Date(value).getTime();
  if (Number.isNaN(due)) return { label: value, overdue: false };
  const minutes = Math.round((due - now) / 60_000);
  const abs = Math.abs(minutes);
  const span = abs < 60 ? `${abs}m` : abs < 48 * 60 ? `${Math.round(abs / 60)}h` : `${Math.round(abs / 1440)}d`;
  return minutes < 0 ? { label: `${span} overdue`, overdue: true } : { label: `due in ${span}`, overdue: false };
}

export type Tone = 'neutral' | 'progress' | 'success' | 'warning' | 'danger' | 'info';

const PAGE_STATUS: Record<string, { label: string; tone: Tone }> = {
  QUEUED: { label: 'Queued', tone: 'progress' },
  PREPARING_PAGE: { label: 'Preparing', tone: 'progress' },
  DI_UPLOAD_PREPARING: { label: 'Sending', tone: 'progress' },
  DI_UPLOADING: { label: 'Sending', tone: 'progress' },
  DI_FINALIZING: { label: 'Sending', tone: 'progress' },
  CLASSIFYING: { label: 'Identifying', tone: 'progress' },
  EXTRACTING: { label: 'Reading', tone: 'progress' },
  SYNCING_TO_AUDIT_CORE: { label: 'Saving', tone: 'progress' },
  RETRY_WAIT: { label: 'Retrying', tone: 'warning' },
  READY: { label: 'Ready', tone: 'success' },
  SUPPORTING: { label: 'Supporting', tone: 'info' },
  NEEDS_REVIEW: { label: 'Needs review', tone: 'warning' },
  FAILED: { label: 'Failed', tone: 'danger' },
  DEAD_LETTER: { label: 'Failed', tone: 'danger' },
  CANCELLED: { label: 'Removed', tone: 'neutral' },
  MERGED: { label: 'Combined', tone: 'neutral' },
};

export function pageStatus(status: string | null | undefined): { label: string; tone: Tone } {
  return PAGE_STATUS[String(status || '')] ?? { label: humanizeKey(status || 'Processing'), tone: 'neutral' };
}

export const PAGE_IN_FLIGHT = new Set([
  'QUEUED', 'PREPARING_PAGE', 'DI_UPLOAD_PREPARING', 'DI_UPLOADING', 'DI_FINALIZING',
  'CLASSIFYING', 'EXTRACTING', 'SYNCING_TO_AUDIT_CORE', 'RETRY_WAIT',
]);

export const BATCH_IN_FLIGHT = new Set(['AWAITING_UPLOAD', 'UPLOADED', 'SPLITTING', 'PROCESSING']);

const TASK_STATUS: Record<string, { label: string; tone: Tone }> = {
  READY: { label: 'To do', tone: 'warning' },
  IN_PROGRESS: { label: 'In progress', tone: 'progress' },
  RETURNED: { label: 'Returned', tone: 'danger' },
  VERIFYING: { label: 'Verifying', tone: 'progress' },
  ACTION_COMPLETED: { label: 'Verifying', tone: 'progress' },
  AWAITING_REQUESTER_REVIEW: { label: 'Awaiting review', tone: 'info' },
  VERIFIED_COMPLETE: { label: 'Done', tone: 'success' },
  CANCELLED: { label: 'Cancelled', tone: 'neutral' },
  FAILED: { label: 'Failed', tone: 'danger' },
  DEAD_LETTER: { label: 'Failed', tone: 'danger' },
};

export function taskStatus(status: string | null | undefined): { label: string; tone: Tone } {
  return TASK_STATUS[String(status || '')] ?? { label: humanizeKey(status || ''), tone: 'neutral' };
}

export function confidenceTone(confidence: number | null, threshold: number): Tone {
  if (confidence === null || confidence === undefined) return 'danger';
  if (confidence < threshold) return confidence < threshold - 20 ? 'danger' : 'warning';
  return 'success';
}
