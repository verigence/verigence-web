import type { DiscountVarianceItem } from '../../../services/audit-core/uc03DiscountVariance';

/**
 * Excess discount screen (product owner 2026-11-06): filters by date,
 * dealership, outlet, discount type, PC and source document; totals and
 * breakdowns follow the filters; the table sorts and pages. Pure functions,
 * so the screen and its tests read the same rules.
 */

export type DateBasis = 'booking' | 'delivery';
export type SortKey = 'date' | 'customer' | 'dealer' | 'pc' | 'model' | 'discount' | 'entitled' | 'given' | 'excess';

export interface ExcessFilters {
  basis: DateBasis;
  from: string;
  to: string;
  dealer: string;
  outlet: string;
  discount: string;
  pc: string;
  source: string;
  q: string;
}

export const EMPTY_FILTERS: ExcessFilters = {
  basis: 'booking', from: '', to: '', dealer: '', outlet: '', discount: '', pc: '', source: '', q: '',
};

const NOT_RECORDED = {
  dealer: 'Dealership not recorded', outlet: 'Outlet not recorded', pc: 'PC not recorded', source: 'Source not recorded',
};

export const discountOf = (i: DiscountVarianceItem) => i.discount ?? i.discountKey;
export const dealerOf = (i: DiscountVarianceItem) => i.dealer ?? NOT_RECORDED.dealer;
export const outletOf = (i: DiscountVarianceItem) => i.outlet ?? NOT_RECORDED.outlet;
export const pcOf = (i: DiscountVarianceItem) => i.pc ?? NOT_RECORDED.pc;
export const sourceOf = (i: DiscountVarianceItem) => i.givenDocument ?? NOT_RECORDED.source;
export const dateOf = (i: DiscountVarianceItem, basis: DateBasis) =>
  (basis === 'delivery' ? i.deliveryDate : i.bookingDate) ?? null;
export const excessOf = (i: DiscountVarianceItem) => Number(i.variance ?? 0);

/** Only discounts given above their entitlement, from a billing document. */
export function excessOnly(items: DiscountVarianceItem[]): DiscountVarianceItem[] {
  return items.filter((i) => i.status === 'OVER_ENTITLEMENT' && i.variance !== null && i.givenFrom !== 'booking');
}

export function applyFilters(items: DiscountVarianceItem[], f: ExcessFilters): DiscountVarianceItem[] {
  const q = f.q.trim().toLowerCase();
  return items.filter((i) => {
    const day = dateOf(i, f.basis);
    if ((f.from || f.to) && !day) return false;
    if (f.from && day! < f.from) return false;
    if (f.to && day! > f.to) return false;
    if (f.dealer && dealerOf(i) !== f.dealer) return false;
    if (f.outlet && outletOf(i) !== f.outlet) return false;
    if (f.discount && discountOf(i) !== f.discount) return false;
    if (f.pc && pcOf(i) !== f.pc) return false;
    if (f.source && sourceOf(i) !== f.source) return false;
    if (q) {
      const hay = [i.customer, i.journeyReference, i.model, i.variant, i.pc, i.outlet, i.dealer]
        .filter(Boolean).join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

/** The values a filter can take, given the other filters (an outlet list follows the dealership). */
export function options(items: DiscountVarianceItem[], of: (i: DiscountVarianceItem) => string): string[] {
  return [...new Set(items.map(of))].sort((a, b) => a.localeCompare(b));
}

export interface Bucket { name: string; excess: number; discounts: number; bookings: number }

export function breakdown(items: DiscountVarianceItem[], of: (i: DiscountVarianceItem) => string): Bucket[] {
  const map = new Map<string, { excess: number; discounts: number; journeys: Set<string> }>();
  for (const i of items) {
    const key = of(i);
    const entry = map.get(key) ?? { excess: 0, discounts: 0, journeys: new Set<string>() };
    entry.excess += excessOf(i);
    entry.discounts += 1;
    entry.journeys.add(i.journeyId);
    map.set(key, entry);
  }
  return [...map.entries()]
    .map(([name, v]) => ({ name, excess: v.excess, discounts: v.discounts, bookings: v.journeys.size }))
    .sort((a, b) => b.excess - a.excess);
}

export function totals(items: DiscountVarianceItem[]) {
  const excess = items.reduce((sum, i) => sum + excessOf(i), 0);
  const bookings = new Set(items.map((i) => i.journeyId)).size;
  const largest = items.reduce<DiscountVarianceItem | null>((top, i) => (!top || excessOf(i) > excessOf(top) ? i : top), null);
  return { excess, bookings, discounts: items.length, largest };
}

export function sortItems(items: DiscountVarianceItem[], key: SortKey, dir: 'asc' | 'desc', basis: DateBasis) {
  const value = (i: DiscountVarianceItem): string | number => {
    switch (key) {
      case 'date': return dateOf(i, basis) ?? '';
      case 'customer': return (i.customer ?? '').toLowerCase();
      case 'dealer': return `${dealerOf(i)} ${outletOf(i)}`.toLowerCase();
      case 'pc': return pcOf(i).toLowerCase();
      case 'model': return `${i.model ?? ''} ${i.variant ?? ''}`.toLowerCase();
      case 'discount': return discountOf(i).toLowerCase();
      case 'entitled': return Number(i.entitled ?? 0);
      case 'given': return Number(i.invoice ?? 0);
      default: return excessOf(i);
    }
  };
  const sign = dir === 'asc' ? 1 : -1;
  return [...items].sort((a, b) => {
    const x = value(a);
    const y = value(b);
    if (x === y) return excessOf(b) - excessOf(a);
    return (x < y ? -1 : 1) * sign;
  });
}

/** Quick date ranges, as YYYY-MM-DD in India time. */
export function quickRange(kind: 'this-month' | 'last-month' | 'last-30', today = new Date()): { from: string; to: string } {
  const ist = new Date(today.getTime() + (330 + today.getTimezoneOffset()) * 60_000);
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  if (kind === 'this-month') return { from: iso(new Date(ist.getFullYear(), ist.getMonth(), 1)), to: iso(ist) };
  if (kind === 'last-month') {
    return { from: iso(new Date(ist.getFullYear(), ist.getMonth() - 1, 1)), to: iso(new Date(ist.getFullYear(), ist.getMonth(), 0)) };
  }
  return { from: iso(new Date(ist.getFullYear(), ist.getMonth(), ist.getDate() - 29)), to: iso(ist) };
}

/** The filtered rows as CSV, for Export. */
export function toCsv(items: DiscountVarianceItem[], basis: DateBasis): string {
  const head = [basis === 'delivery' ? 'Delivery date' : 'Booking date', 'Journey', 'Customer', 'Dealership', 'Outlet', 'PC',
    'Model', 'Variant', 'Discount type', 'Entitled', 'Given', 'Excess', 'Given per'];
  const cell = (v: unknown) => {
    const text = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };
  const rows = items.map((i) => [dateOf(i, basis), i.journeyReference, i.customer, i.dealer, i.outlet, i.pc, i.model,
    i.variant, discountOf(i), i.entitled, i.invoice, i.variance, i.givenDocument].map(cell).join(','));
  return [head.join(','), ...rows].join('\n');
}

export function filtersFromParams(params: URLSearchParams): ExcessFilters {
  const basis = params.get('basis') === 'delivery' ? 'delivery' : 'booking';
  const get = (k: keyof ExcessFilters) => params.get(k) ?? '';
  return { basis, from: get('from'), to: get('to'), dealer: get('dealer'), outlet: get('outlet'), discount: get('discount'),
    pc: get('pc'), source: get('source'), q: get('q') };
}

export function paramsFromFilters(f: ExcessFilters, base = new URLSearchParams()): URLSearchParams {
  const next = new URLSearchParams(base);
  (Object.keys(EMPTY_FILTERS) as (keyof ExcessFilters)[]).forEach((k) => {
    const v = f[k];
    if (v && v !== EMPTY_FILTERS[k]) next.set(k, v);
    else next.delete(k);
  });
  next.delete('page');
  return next;
}
