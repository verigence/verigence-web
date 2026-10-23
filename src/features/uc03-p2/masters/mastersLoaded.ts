import type { P2MasterDocumentRef, P2MastersLoaded } from '../../../services/audit-core/uc03P2';

export type MasterKind = 'PRICE_LIST' | 'CONSUMER_SCHEME' | 'EXCHANGE_SCHEME' | 'CORPORATE_POLICY' | 'DISCOUNT_GRID';

export const KIND_ORDER: MasterKind[] = [
  'PRICE_LIST', 'CONSUMER_SCHEME', 'EXCHANGE_SCHEME', 'CORPORATE_POLICY', 'DISCOUNT_GRID',
];

export const KIND_LABEL: Record<MasterKind, string> = {
  PRICE_LIST: 'Price list',
  CONSUMER_SCHEME: 'Consumer offers',
  EXCHANGE_SCHEME: 'Exchange / scrappage',
  CORPORATE_POLICY: 'Corporate privilege',
  DISCOUNT_GRID: 'Dealer discount grid',
};

/** One letter per kind for the calendar's day markers. */
export const KIND_MARK: Record<MasterKind, string> = {
  PRICE_LIST: 'P',
  CONSUMER_SCHEME: 'C',
  EXCHANGE_SCHEME: 'X',
  CORPORATE_POLICY: 'K',
  DISCOUNT_GRID: 'G',
};

/** A published master version, whatever its kind, as one row. */
export type LoadedMaster = {
  key: string;
  kind: MasterKind;
  effectiveFrom: string;
  /** Last day it answers; null while nothing replaces it. */
  effectiveTo: string | null;
  /** False when a later upload on the same date replaced it. */
  answers: boolean;
  detail: string;
  document: P2MasterDocumentRef;
};

export function flattenLoaded(data: P2MastersLoaded | undefined): LoadedMaster[] {
  if (!data) return [];
  const rows: LoadedMaster[] = [];
  for (const p of data.priceLists) {
    rows.push({
      key: `p-${p.priceListVersionId}`,
      kind: 'PRICE_LIST',
      effectiveFrom: p.effectiveFrom,
      effectiveTo: p.inForceTo,
      answers: p.answers,
      detail: `v${p.version} · ${p.skus} variants`,
      document: p.document,
    });
  }
  for (const s of data.schemes) {
    rows.push({
      key: `s-${s.kind}-${s.effectiveFrom}-${s.effectiveTo ?? ''}`,
      kind: s.kind,
      effectiveFrom: s.effectiveFrom,
      effectiveTo: s.effectiveTo,
      answers: true,
      detail: `${s.schemes} ${s.schemes === 1 ? 'scheme' : 'schemes'}${s.withdrawn ? `, ${s.withdrawn} withdrawn` : ''}`,
      document: s.document,
    });
  }
  // A grid stands until the next grid starts (its own effectiveTo is usually open).
  const gridStarts = [...new Set(data.grids.map((g) => g.effectiveFrom))].sort();
  for (const g of data.grids) {
    const next = gridStarts.find((d) => d > g.effectiveFrom);
    const until = g.effectiveTo ?? (next ? dayBefore(next) : null);
    rows.push({
      key: `g-${g.gridVersionId}`,
      kind: 'DISCOUNT_GRID',
      effectiveFrom: g.effectiveFrom,
      effectiveTo: until,
      answers: g.answers,
      detail: `v${g.version} · ${g.lines} lines`,
      document: g.document,
    });
  }
  return rows.sort((a, b) => (a.effectiveFrom === b.effectiveFrom
    ? KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind)
    : a.effectiveFrom.localeCompare(b.effectiveFrom)));
}

export function dayBefore(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export function stands(row: LoadedMaster, on: string): boolean {
  return row.answers && row.effectiveFrom <= on && (row.effectiveTo === null || row.effectiveTo >= on);
}

/** What answers on a date, per kind. Price list and grid: the newest one
 * standing. Schemes: every bulletin window standing (a month's consumer
 * bulletin and a mid-month addendum can both apply). */
export function inForceOn(rows: LoadedMaster[], on: string): Record<MasterKind, LoadedMaster[]> {
  const out = Object.fromEntries(KIND_ORDER.map((k) => [k, [] as LoadedMaster[]])) as Record<MasterKind, LoadedMaster[]>;
  for (const row of rows) if (stands(row, on)) out[row.kind].push(row);
  for (const kind of ['PRICE_LIST', 'DISCOUNT_GRID'] as MasterKind[]) {
    const newest = out[kind].sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0];
    out[kind] = newest ? [newest] : [];
  }
  return out;
}

export function shortDate(iso: string | null | undefined): string {
  if (!iso) return 'open';
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}
