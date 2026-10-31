import type { JourneyReviewRow } from '../../../services/audit-core/adminReports';
import { cell } from './reviewCsv';

/** The Journey review, made readable (product owner 2026-10-31: the raw
 * table "is next level of shit"). Pure helpers, tested on their own. */

type Cell = string | number | null;

export function text(row: JourneyReviewRow, key: string): string {
  const value = row[key];
  return Array.isArray(value) ? '' : cell(value as Cell);
}

const STAGE_LABELS: Record<string, string> = {
  BOOKING_DOCUMENT_UPLOAD: 'Booking documents',
  BOOKING_COMPLETE: 'Booking complete',
  DELIVERY_DOCUMENT_UPLOAD: 'Delivery documents',
  DELIVERY_COMPLETE: 'Delivered',
  BOOKING_CANCELLED: 'Cancelled',
  DUPLICATE_BOOKING: 'Duplicate',
};

/** DELIVERY_DOCUMENT_UPLOAD -> "Delivery documents"; unknown codes in sentence case. */
export function stageLabel(stage: string): string {
  if (!stage) return '—';
  if (STAGE_LABELS[stage]) return STAGE_LABELS[stage];
  const words = stage.toLowerCase().replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function stageTone(stage: string): 'ok' | 'info' | 'warn' | 'muted' {
  if (stage === 'DELIVERY_COMPLETE') return 'ok';
  if (stage === 'BOOKING_CANCELLED' || stage === 'DUPLICATE_BOOKING') return 'muted';
  if (stage.startsWith('DELIVERY')) return 'info';
  return 'warn';
}

const SOURCE_LABELS: Record<string, string> = {
  booking_form: 'booking form', booking_docket: 'booking docket', cost_sheet: 'cost sheet',
  customer_ledger: 'NDC / ledger', customer_invoice_dms: 'DMS invoice', tax_invoice_tally: 'Tally invoice',
  insurance_cover: 'insurance cover', rto_challan: 'RTO challan',
};

export function sourceLabel(source: string): string {
  return SOURCE_LABELS[source] ?? source.replace(/_/g, ' ');
}

/** "999000.00 @booking_form" -> amount 999000 from "booking form". */
export function amountAt(value: string): { amount: number | null; source: string | null } {
  if (!value) return { amount: null, source: null };
  const [raw, at] = value.split('@').map((s) => s.trim());
  const amount = Number.parseFloat(raw);
  return { amount: Number.isFinite(amount) ? amount : null, source: at ? sourceLabel(at) : null };
}

export function money(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—';
  const n = typeof value === 'number' ? value : Number.parseFloat(String(value).replace(/,/g, ''));
  return Number.isFinite(n) ? `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : String(value);
}

/** "a | b | c" lists the report packs into one cell, as separate lines. */
export function parts(value: string): string[] {
  return value ? value.split(/\s+\|\s+/).map((s) => s.trim()).filter(Boolean) : [];
}

/** "customer_invoice_dmsx2, rto_challanx1" -> [["customer invoice dms", 2], ...] */
export function docCounts(value: string): Array<[string, number]> {
  return value ? value.split(/,\s*/).map((pair) => {
    const m = pair.match(/^(.*)x(\d+)$/);
    return m ? [m[1].replace(/_/g, ' '), Number(m[2])] as [string, number] : [pair, 1] as [string, number];
  }) : [];
}

export interface Signals {
  noSku: boolean;
  /** Deal ex-showroom minus price-list ex-showroom, when both are known. */
  exShowroomGap: number | null;
  noInvoiceAtDelivery: boolean;
}

/** What is worth a look on a Journey, from the facts the report holds. */
export function signals(row: JourneyReviewRow): Signals {
  const stage = text(row, 'stage');
  const std = Number.parseFloat(text(row, 'std_ex_showroom'));
  const deal = amountAt(text(row, 'deal_ex_showroom')).amount;
  return {
    noSku: !text(row, 'sku_code'),
    exShowroomGap: Number.isFinite(std) && deal !== null ? Math.round((deal - std) * 100) / 100 : null,
    noInvoiceAtDelivery: stage.startsWith('DELIVERY') && row.invoices.length === 0,
  };
}

export function needsLook(row: JourneyReviewRow, tolerance = 100): boolean {
  const s = signals(row);
  return s.noSku || s.noInvoiceAtDelivery || (s.exShowroomGap !== null && Math.abs(s.exShowroomGap) > tolerance);
}

export function searchRows(rows: readonly JourneyReviewRow[], needle: string): JourneyReviewRow[] {
  const q = needle.trim().toLowerCase();
  if (!q) return rows.slice();
  return rows.filter((r) => ['ref', 'customer', 'outlet', 'pc', 'sku_code', 'booked_model', 'booked_variant']
    .some((k) => text(r, k).toLowerCase().includes(q)));
}

/** Count of Journeys per stage, most first. */
export function stageCounts(rows: readonly JourneyReviewRow[]): Array<[string, number]> {
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(text(r, 'stage'), (counts.get(text(r, 'stage')) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

/** "CASH_DISCOUNT elig=25000,a=30000,ELIGIBLE" -> "Cash discount: given ₹30,000 · entitled ₹25,000 · eligible". */
export function discountLine(entry: string): string {
  const m = entry.match(/^(\S+)\s+elig=([^,]*),a=([^,]*),(.*)$/);
  if (!m) return entry;
  const [, key, elig, given, result] = m;
  const name = key.toLowerCase().replace(/_/g, ' ');
  const bits = [given !== '-' ? `given ${money(given)}` : '', elig !== '-' ? `entitled ${money(elig)}` : 'no entitlement on record',
    result && result !== '-' ? result.toLowerCase().replace(/_/g, ' ') : ''];
  return `${name.charAt(0).toUpperCase()}${name.slice(1)}: ${bits.filter(Boolean).join(' · ')}`;
}
