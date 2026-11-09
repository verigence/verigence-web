import type { AwayInstance } from '../../services/audit-core/locationChecks';
import { SOURCE_LABELS } from '../task-manager/activityTally';

/**
 * "Away more than 5 km", date-wise (product owner, 2026-11-09): "can we show just
 * consolidate view date wise and roughly how far they were during each instance..
 * you should report the one for which they were away more than 5 km".
 * Audit Core picks the checks; this groups and words them.
 */

export const AWAY_THRESHOLDS_KM = [1, 2, 5, 10, 25] as const;
export const DEFAULT_AWAY_KM = 5;

export type RangePreset = 'this-month' | 'last-7' | 'last-month';

export const RANGE_PRESETS: { key: RangePreset; label: string }[] = [
  { key: 'this-month', label: 'This month' },
  { key: 'last-7', label: 'Last 7 days' },
  { key: 'last-month', label: 'Last month' },
];

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function utcDay(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

/** The dates of a quick pick, given today's India date (YYYY-MM-DD). Both ends included. */
export function presetRange(preset: RangePreset, today: string): { from: string; to: string } {
  const day = utcDay(today);
  if (preset === 'last-7') {
    const from = new Date(day);
    from.setUTCDate(from.getUTCDate() - 6);
    return { from: isoDay(from), to: today };
  }
  if (preset === 'last-month') {
    const first = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth() - 1, 1));
    const last = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), 0));
    return { from: isoDay(first), to: isoDay(last) };
  }
  return { from: `${today.slice(0, 7)}-01`, to: today };
}

/** Which quick pick a range is, if any. */
export function presetOf(range: { from: string; to: string }, today: string): RangePreset | null {
  return RANGE_PRESETS.find(({ key }) => {
    const r = presetRange(key, today);
    return r.from === range.from && r.to === range.to;
  })?.key ?? null;
}

/** "~5.6 km": roughly how far, to a tenth of a kilometre. */
export function roughKm(km: number | null | undefined): string {
  if (km === null || km === undefined || !Number.isFinite(km)) return '—';
  return `~${km.toFixed(1)} km`;
}

/** "Thu, 5 Nov 2026" for an India date. */
export function dateLabel(iso: string): string {
  return utcDay(iso).toLocaleDateString('en-IN', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
  });
}

export function pcName(person: { name?: string | null; actorId: string }): string {
  return person.name?.trim() || person.actorId;
}

export type AwayDateGroup = { date: string; instances: AwayInstance[]; pcs: number; furthestKm: number };

/** One group per date (oldest first), each with its instances by time. */
export function groupByDate(instances: readonly AwayInstance[]): AwayDateGroup[] {
  const groups = new Map<string, AwayInstance[]>();
  for (const item of instances) {
    const list = groups.get(item.date);
    if (list) list.push(item);
    else groups.set(item.date, [item]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, items]) => {
      const sorted = [...items].sort((a, b) => a.time.localeCompare(b.time) || a.checkedAtUtc.localeCompare(b.checkedAtUtc));
      return {
        date,
        instances: sorted,
        pcs: new Set(sorted.map((i) => i.actorId)).size,
        furthestKm: Math.max(...sorted.map((i) => i.distanceKm)),
      };
    });
}

/** "13:23 · S Siba Rao · ~5.6 km from Utkal Mahindra - PALASUNI COMMERCIAL" */
export function instanceLine(item: AwayInstance): string {
  return `${item.time} · ${pcName(item)} · ${roughKm(item.distanceKm)} from ${item.outletName || 'the nearest outlet'}`;
}

export function deviceLabel(item: Pick<AwayInstance, 'deviceType' | 'source'>): string {
  if (item.deviceType) return SOURCE_LABELS[item.deviceType] ?? item.deviceType;
  return item.source === 'NATIVE' ? 'App' : 'Browser';
}

function cell(value: string | number | null | undefined): string {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** The instances as CSV, one row each, in the order shown. */
export function awayCsv(instances: readonly AwayInstance[]): string {
  const head = ['Date', 'Time (IST)', 'PC', 'Distance (km)', 'Nearest outlet', 'Device', 'Accuracy (m)'];
  const body = instances.map((i) => [
    i.date, i.time, pcName(i), i.distanceKm.toFixed(1), i.outletName ?? '', deviceLabel(i),
    i.accuracyM === null || i.accuracyM === undefined ? '' : Math.round(i.accuracyM),
  ].map(cell).join(','));
  return [head.join(','), ...body].join('\n');
}
