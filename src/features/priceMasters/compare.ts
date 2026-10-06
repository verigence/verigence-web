import type { PriceMasterStandard, PriceMasterVehicle, PriceVersion } from '../../services/audit-core/priceMasters';
import { formatRupees } from '../../services/audit-core/priceMasters';

/** The WEF dates a project has, newest first, one entry per date (the latest version on a date wins). */
export function wefDates(versions: PriceVersion[]): PriceVersion[] {
  const byDate = new Map<string, PriceVersion>();
  for (const version of versions) {
    const kept = byDate.get(version.effectiveFrom);
    if (!kept || (version.version ?? 0) > (kept.version ?? 0)) byDate.set(version.effectiveFrom, version);
  }
  return [...byDate.values()].sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? 1 : a.effectiveFrom > b.effectiveFrom ? -1 : 0));
}

/** The date to open on: the newest WEF date that is not in the future, else the newest there is. */
export function defaultWef(dates: PriceVersion[], today: string): string {
  const current = dates.find((d) => d.effectiveFrom <= today);
  return (current ?? dates[0])?.effectiveFrom ?? '';
}

/** The two dates to compare with by default: the dates just before the one being looked at. */
export function defaultCompareDates(dates: PriceVersion[], selected: string): [string, string] {
  const older = dates.filter((d) => d.effectiveFrom < selected).map((d) => d.effectiveFrom);
  const others = dates.filter((d) => d.effectiveFrom !== selected).map((d) => d.effectiveFrom);
  const pool = [...older, ...others.filter((d) => !older.includes(d))];
  return [pool[0] ?? '', pool[1] ?? ''];
}

/** The same vehicle on another price list: matched by its SKU code, never by position. */
export function findVehicle(vehicles: PriceMasterVehicle[], skuCode: string): PriceMasterVehicle | null {
  return vehicles.find((v) => v.sku.skuCode === skuCode) ?? null;
}

export interface CompareLine {
  key: string;
  label: string;
  emphasis?: boolean;
  /** One value per column; null when the vehicle is not on that price list or the sheet has no such amount. */
  values: (string | null)[];
}

type Pick = (standard: PriceMasterStandard) => string | null | undefined;

const MAIN_LINES: { key: string; label: string; emphasis?: boolean; pick: Pick }[] = [
  { key: 'exShowroom', label: 'Ex-showroom', pick: (s) => s.exShowroom },
  { key: 'tcs', label: 'TCS', pick: (s) => s.tcs },
  { key: 'insurance', label: 'Insurance (in house)', pick: (s) => s.insurance.inHouse },
  { key: 'ew4', label: 'EW 4th year', pick: (s) => s.ewFourthYear },
  { key: 'ew45', label: 'EW 4th + 5th year', pick: (s) => s.ewFourthAndFifthYear },
  { key: 'kit', label: 'Accessories kit', pick: (s) => s.accessoriesKit },
  { key: 'essential', label: 'Essential accessories', pick: (s) => s.essentialAccessories },
  { key: 'rsa', label: 'RSA', pick: (s) => s.rsa },
  { key: 'fastag', label: 'FASTag', pick: (s) => s.fastag },
  { key: 'regNoHypo', label: 'Registration (without hypothecation)', pick: (s) => s.registrationWithoutHypo },
  { key: 'onRoadNoHypo', label: 'On-road (without hypothecation)', emphasis: true, pick: (s) => s.onRoadWithoutHypo },
  { key: 'regHypo', label: 'Registration (with hypothecation)', pick: (s) => s.registrationWithHypo },
  { key: 'onRoadHypo', label: 'On-road (with hypothecation)', emphasis: true, pick: (s) => s.onRoadWithHypo },
  { key: 'hypo', label: 'Hypothecation charge', pick: (s) => s.hypothecationCharge },
  { key: 'minBooking', label: 'Minimum booking amount', pick: (s) => s.minimumBookingAmount },
];

const EW_LINES: { key: 'NONE' | '4TH' | '4TH_5TH'; label: string }[] = [
  { key: 'NONE', label: 'no extended warranty' },
  { key: '4TH', label: 'with EW 4th year' },
  { key: '4TH_5TH', label: 'with EW 4th + 5th year' },
];

/** Every price line for a vehicle on up to three price lists, side by side. A null standard is a list the vehicle is not on. */
export function buildCompareLines(standards: (PriceMasterStandard | null)[]): CompareLine[] {
  const value = (standard: PriceMasterStandard | null, pick: Pick): string | null =>
    standard ? (pick(standard) ?? null) : null;
  const lines: CompareLine[] = MAIN_LINES.map(({ key, label, emphasis, pick }) => ({
    key,
    label,
    emphasis,
    values: standards.map((s) => value(s, pick)),
  }));
  for (const { key, label } of EW_LINES) {
    lines.push({
      key: `ew-${key}-no`,
      label: `On-road ${label} (without hypothecation)`,
      values: standards.map((s) => value(s, (x) => x.onRoadByEw[key]?.withoutHypo)),
    });
    lines.push({
      key: `ew-${key}-yes`,
      label: `On-road ${label} (with hypothecation)`,
      values: standards.map((s) => value(s, (x) => x.onRoadByEw[key]?.withHypo)),
    });
  }
  const extras = new Map<string, string>();
  for (const standard of standards) for (const charge of standard?.extraCharges ?? []) extras.set(charge.key, charge.label);
  for (const [key, label] of extras) {
    lines.push({
      key: `extra-${key}`,
      label,
      values: standards.map((s) => value(s, (x) => x.extraCharges.find((c) => c.key === key)?.amount)),
    });
  }
  return lines;
}

export interface AmountChange {
  kind: 'same' | 'up' | 'down' | 'unknown';
  text: string;
}

/** How another price list's amount differs from the one being looked at. A missing amount on either side is unknown, never a zero. */
export function amountChange(base: string | null, other: string | null): AmountChange {
  if (base === null || other === null) return { kind: 'unknown', text: '' };
  const a = Number(base);
  const b = Number(other);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return { kind: 'unknown', text: '' };
  const difference = Math.round((b - a) * 100) / 100;
  if (difference === 0) return { kind: 'same', text: 'same' };
  return difference > 0
    ? { kind: 'up', text: `${formatRupees(String(difference))} more` }
    : { kind: 'down', text: `${formatRupees(String(-difference))} less` };
}
