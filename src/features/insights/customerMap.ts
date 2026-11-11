import type { MapCell } from '../../services/audit-core/uc03Insights';

/** What the customer map works out from its rows, apart from the drawing. */

export type MapView = 'PIN' | 'DISTRICT';
/** 'journeys' and 'delivered' count customers; anything else is a product key and shows its penetration. */
export type MapMeasure = string;
export const isCount = (measure: MapMeasure) => measure === 'journeys' || measure === 'delivered';

export interface MapArea {
  key: string;
  district: string | null;
  journeys: number;
  delivered: number;
  deals: number;
  taken: number;
  /** The measure's value: a count, or the share of the area's statement deals that took the product. */
  value: number | null;
  /** Seller -> its count of the measure (customers, or deals that took the product). */
  sellers: Map<string, number>;
  leader: string | null;
  shared: boolean;
}

export interface MapFilter { view: MapView; measure: MapMeasure; model: string; by: 'dealer' | 'outlet' }

const sellerOf = (cell: MapCell, by: MapFilter['by']) => (by === 'dealer' ? cell.dealer : cell.outlet) ?? 'Not named';

/** The areas the rows add up to. A PIN code view leaves out rows with no PIN code; a
 *  district view takes every row that has a district. */
export function mapAreas(cells: MapCell[], filter: MapFilter): MapArea[] {
  const areas = new Map<string, MapArea>();
  for (const cell of cells) {
    if (filter.model && (cell.model ?? '') !== filter.model) continue;
    const key = filter.view === 'PIN' ? cell.pin : cell.district;
    if (!key) continue;
    let area = areas.get(key);
    if (!area) {
      area = { key, district: cell.district, journeys: 0, delivered: 0, deals: 0, taken: 0, value: null,
        sellers: new Map(), leader: null, shared: false };
      areas.set(key, area);
    }
    area.journeys += cell.journeys;
    area.delivered += cell.delivered;
    area.deals += cell.deals;
    const amount = filter.measure === 'journeys' ? cell.journeys
      : filter.measure === 'delivered' ? cell.delivered : (cell.products[filter.measure] ?? 0);
    if (!isCount(filter.measure)) area.taken += amount;
    // Who sells there is counted on customers, whatever is being shaded.
    const presence = filter.measure === 'delivered' ? cell.delivered : cell.journeys;
    if (presence > 0) {
      const seller = sellerOf(cell, filter.by);
      area.sellers.set(seller, (area.sellers.get(seller) ?? 0) + presence);
    }
  }
  const out: MapArea[] = [];
  for (const area of areas.values()) {
    const ranked = [...area.sellers.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    area.leader = ranked[0]?.[0] ?? null;
    area.shared = ranked.length > 1;
    area.value = filter.measure === 'journeys' ? area.journeys
      : filter.measure === 'delivered' ? area.delivered
        : area.deals ? Math.round((area.taken / area.deals) * 1000) / 10 : null;
    if (isCount(filter.measure) && !area.value) continue;       // nothing to show for this measure
    out.push(area);
  }
  return out.sort((a, b) => (isCount(filter.measure) ? (b.value ?? 0) - (a.value ?? 0) : b.deals - a.deals) || a.key.localeCompare(b.key));
}

/** The sellers in the rows, most customers first: the order their colours are given in, so a
 *  seller keeps its colour whatever else is filtered. */
export function mapSellers(cells: MapCell[], by: MapFilter['by']): string[] {
  const totals = new Map<string, number>();
  for (const cell of cells) totals.set(sellerOf(cell, by), (totals.get(sellerOf(cell, by)) ?? 0) + cell.journeys);
  return [...totals.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([name]) => name);
}

export function mapModels(cells: MapCell[]): string[] {
  return [...new Set(cells.map((cell) => cell.model).filter((model): model is string => Boolean(model)))].sort();
}

type Feature = { properties?: Record<string, unknown>; geometry?: { coordinates?: unknown } };

/** The middle of an outline's bounding box: where an outlet is drawn for its PIN code. */
export function centreOf(feature: Feature): [number, number] | null {
  let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
  const walk = (value: unknown): void => {
    if (!Array.isArray(value)) return;
    if (value.length >= 2 && typeof value[0] === 'number' && typeof value[1] === 'number') {
      minX = Math.min(minX, value[0]); maxX = Math.max(maxX, value[0]);
      minY = Math.min(minY, value[1]); maxY = Math.max(maxY, value[1]);
      return;
    }
    value.forEach(walk);
  };
  walk(feature.geometry?.coordinates);
  return Number.isFinite(minX) ? [(minX + maxX) / 2, (minY + maxY) / 2] : null;
}

/** The district outlines name some districts differently from the postal directory the
 *  rows use; the outline takes the directory's name so the two meet. */
const DIRECTORY_NAME: Record<string, string> = {
  Angul: 'Anugul', Baleswar: 'Balasore', Baleshwar: 'Balasore', Bolangir: 'Balangir', Jajpur: 'Jajapur',
  Keonjhar: 'Keonjhar (Kendujhar)', Kendujhar: 'Keonjhar (Kendujhar)', Nawarangapur: 'Nabarangapur',
  Nabarangpur: 'Nabarangapur', Nuapada: 'Nuaparha', Rayagada: 'Rayagarha', Sonepur: 'Subarnapur',
  Khurda: 'Khordha', Khorda: 'Khordha', Debagarh: 'Deogarh', Baudh: 'Boudh', Jagatsinghapur: 'Jagatsinghpur',
  Sundergarh: 'Sundargarh',
};
export function directoryDistrict(feature: Feature): string {
  const name = String(feature.properties?.district ?? feature.properties?.name ?? '').trim();
  return DIRECTORY_NAME[name] ?? name;
}

export async function inflateGeoJson(base64: string): Promise<{ type?: string; features: Feature[] }> {
  const binary = Uint8Array.from(atob(base64.replace(/\s/g, '')), (character) => character.charCodeAt(0));
  const stream = new Blob([binary.buffer as ArrayBuffer]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).json();
}
