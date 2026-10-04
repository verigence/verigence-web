import type { ClaimStage, ClaimStatus } from '../../../services/hr/claims';

/**
 * Display helpers for claims. Money is shown, never calculated: the value is turned into text with
 * integer digit handling, so it always has two decimals and Indian grouping (12,34,567.50).
 */

export function groupIndian(digits: string): string {
  if (digits.length <= 3) return digits;
  const last3 = digits.slice(-3);
  const rest = digits.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return `${rest},${last3}`;
}

/** "1234.5" or 1234.5 -> "₹1,234.50". Anything that is not a number shows an em dash. */
export function formatRupees(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—';
  const n = typeof value === 'number' ? value : Number(String(value).trim());
  if (!Number.isFinite(n)) return '—';
  const fixed = Math.abs(n).toFixed(2);
  const [whole, fraction] = fixed.split('.');
  const sign = n < 0 && Number(fixed) !== 0 ? '-' : '';
  return `${sign}₹${groupIndian(whole)}.${fraction}`;
}

/** Whole paise (an integer) as rupees, without any division: 123456 -> "₹1,234.56". */
export function formatPaise(paise: number): string {
  const whole = Math.floor(paise / 100);
  return formatRupees(`${whole}.${String(paise % 100).padStart(2, '0')}`);
}

/** The same without decimals, for limits such as the ₹5,000 monthly cap. Whole rupees stay whole. */
export function formatRupeesShort(value: number | string | null | undefined): string {
  const text = formatRupees(value);
  return text.endsWith('.00') ? text.slice(0, -3) : text;
}

export function formatKm(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return `${Number.isInteger(value) ? value.toFixed(1) : String(value)} km`;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** "2026-10" -> "October 2026". */
export function formatMonth(value: string | null | undefined): string {
  const match = /^(\d{4})-(\d{2})/.exec(value ?? '');
  if (!match) return value || '—';
  const month = Number(match[2]);
  if (month < 1 || month > 12) return value as string;
  return `${MONTH_NAMES[month - 1]} ${match[1]}`;
}

/** The calendar date of an instant in India, YYYY-MM-DD. Claim dates are IST dates. */
export function istDate(at: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(at);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function monthOf(date: string): string {
  return date.slice(0, 7);
}

export const STATUS_LABEL: Record<ClaimStatus, string> = {
  SUBMITTED: 'In review',
  CORRECTION_REQUESTED: 'Sent back',
  APPROVED: 'Approved',
  HANDED_TO_PAYROLL: 'With payroll',
  PAID: 'Paid',
  REJECTED: 'Rejected',
  CANCELLED: 'Cancelled',
};

export type StatusTone = 'pending' | 'action' | 'ok' | 'info' | 'bad' | 'muted';

export const STATUS_TONE: Record<ClaimStatus, StatusTone> = {
  SUBMITTED: 'pending',
  CORRECTION_REQUESTED: 'action',
  APPROVED: 'ok',
  HANDED_TO_PAYROLL: 'info',
  PAID: 'ok',
  REJECTED: 'bad',
  CANCELLED: 'muted',
};

export function statusLabel(status: string): string {
  return STATUS_LABEL[status as ClaimStatus] ?? status;
}

export function statusTone(status: string): StatusTone {
  return STATUS_TONE[status as ClaimStatus] ?? 'muted';
}

export const STAGE_LABEL: Record<ClaimStage, string> = {
  TL_PM: 'Team Lead or Project Manager',
  HR: 'HR',
  FINANCE: 'Finance',
};

export function stageLabel(stage: string | null | undefined): string {
  if (!stage) return '';
  return STAGE_LABEL[stage as ClaimStage] ?? stage;
}

/** One plain sentence about where a claim stands (the "waiting for ..." text). */
export function progressText(claim: {
  status: ClaimStatus;
  waitingFor: string | null;
  payrollMonth: string;
}): string {
  switch (claim.status) {
    case 'SUBMITTED':
      return claim.waitingFor ? `Waiting for ${claim.waitingFor}` : 'Waiting for review';
    case 'CORRECTION_REQUESTED':
      return 'Waiting for you: correct it and send it again';
    case 'APPROVED':
      return `Approved. It goes into the ${formatMonth(claim.payrollMonth)} payroll`;
    case 'HANDED_TO_PAYROLL':
      return `With payroll for ${formatMonth(claim.payrollMonth)}. Paid with the salary`;
    case 'PAID':
      return 'Paid with the salary';
    case 'REJECTED':
      return 'Not approved';
    case 'CANCELLED':
      return 'Cancelled by the employee';
    default:
      return '';
  }
}

const EVENT_LABEL: Record<string, string> = {
  SUBMITTED: 'Submitted',
  RESUBMITTED: 'Corrected and sent again',
  STAGE_APPROVED: 'Approved',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  CORRECTION_REQUESTED: 'Sent back for correction',
  CANCELLED: 'Cancelled',
  HANDED_TO_PAYROLL: 'Handed to payroll',
  PAID: 'Paid',
};

export function eventLabel(event: string, stage: string | null): string {
  const base = EVENT_LABEL[event] ?? event.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
  if (!stage) return base;
  const who = stageLabel(stage);
  if (event === 'SUBMITTED' || event === 'RESUBMITTED') return `${base}, to ${who}`;
  return `${base} by ${who}`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
