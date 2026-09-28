import { formatInr, humanizeKey } from '../workspace/p2Format';

/** Money for a comparison table: a missing value is "—", never ₹0. */
export function money(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—';
  return formatInr(value);
}

/** Signed variance, e.g. "+₹5,000" / "−₹2,000"; zero is "—". */
export function signedMoney(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—';
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount === 0) return '—';
  return `${amount > 0 ? '+' : '−'}${formatInr(Math.abs(amount))}`;
}

export function varianceTone(value: string | number | null | undefined, kind: 'charge' | 'discount' = 'charge'): string {
  const amount = Number(value ?? 0);
  if (!Number.isFinite(amount) || amount === 0) return '';
  // A charge below standard or a discount above entitlement costs the dealer.
  const adverse = kind === 'charge' ? amount < 0 : amount > 0;
  return adverse ? 'is-adverse' : 'is-favourable';
}

export const FLAG_LABELS: Record<string, string> = {
  BOOKING_VS_BILLED: 'Booking ≠ billed',
  BILLED_VS_LEDGER: 'Billed ≠ ledger',
  ABOVE_STANDARD: 'Above standard',
  BELOW_STANDARD: 'Below standard',
  OVER_ENTITLEMENT: 'More than entitled',
  UNDER_ENTITLEMENT: 'Less than entitled',
};

export const CONTROL_STATUS: Record<string, { label: string; tone: string }> = {
  FAIL: { label: 'Issue', tone: 'danger' },
  ERROR_TERMINAL: { label: 'Could not run', tone: 'danger' },
  RETRY_PENDING: { label: 'Retrying', tone: 'progress' },
  WAITING_FOR_FACTS: { label: 'Waiting', tone: 'neutral' },
  PASS: { label: 'Passed', tone: 'success' },
  NOT_APPLICABLE: { label: 'Not applicable', tone: 'neutral' },
};

const EVENT_LABELS: Record<string, string> = {
  DOCUMENT_READY: 'Document read',
  DOCUMENT_SETTLED: 'Document settled',
  STAGE_CHANGED: 'Stage changed',
  CONTROL_CHANGED: 'Check result changed',
  FIELD_CORRECTED: 'Value corrected',
  FIELD_CONFIRMED: 'Value confirmed',
  UPLOAD_ACCEPTED: 'Upload received',
  UPLOAD_DUPLICATE: 'Upload ignored: same file as an earlier upload',
  VEHICLE_PHOTO_ADDED: 'Vehicle photo added',
  VEHICLE_PHOTO_REMOVED: 'Vehicle photo removed',
  DOCUMENT_REMOVED: 'Document removed',
  TASK_RAISED: 'Task raised',
  TASK_VERIFIED: 'Task verified',
};

export function eventLabel(type: string): string {
  return EVENT_LABELS[type] ?? humanizeKey(type);
}

export function recordValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) return value.length ? value.map(recordValue).join(', ') : '—';
  if (typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== null && v !== undefined && v !== '' && v !== false)
      .map(([k, v]) => (v === true ? humanizeKey(k) : `${humanizeKey(k)}: ${recordValue(v)}`))
      .join(', ') || '—';
  }
  return String(value);
}

const DATE_KEYS = /(_at|_at_utc|_date)$/;

export function recordField(key: string, value: unknown): string {
  if (value && typeof value === 'string' && DATE_KEYS.test(key)) {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) {
      return new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
    }
  }
  if (/amount|premium|_value$|^value$|variance|_gap$/.test(key) && value !== null && value !== undefined && value !== '' && !Number.isNaN(Number(value))) {
    return money(value as string);
  }
  return recordValue(value);
}
