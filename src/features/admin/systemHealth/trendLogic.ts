import type { DailyHealthRow, ErrorRouteRow } from '../../../services/audit-core/systemHealth';

/** Pure helpers for the System Health "Failed requests" and "Daily trend" tabs (2026-10-30). */

const DAY = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });

/** "2026-10-30" -> "30 Oct". The server's days are already IST dates. */
export function dayLabel(iso: string): string {
  return DAY.format(new Date(`${iso}T00:00:00Z`));
}

/** "401 VAC-AUTH-001" -> { status: "401", code: "VAC-AUTH-001" }; a bare status has no code. */
export function splitCodeKey(key: string): { status: string; code: string | null } {
  const [status, ...rest] = key.split(' ');
  return { status, code: rest.join(' ') || null };
}

/** Plain-word name of a refused-request kind, for legends and tables. */
export const REFUSAL_KINDS = [
  { key: 'unauthenticated', label: 'Not signed in (401)' },
  { key: 'forbidden', label: 'Permission denied (403)' },
  { key: 'notFound', label: 'Not found / out of scope (404)' },
  { key: 'otherClientErrors', label: 'Other refusals' },
] as const;

export const DI_FAILURE_KINDS = [
  { key: 'badScan', label: 'Scan quality (PC side)' },
  { key: 'notReadInTime', label: 'Not read in 30 min' },
  { key: 'failedOther', label: 'Other DI failure' },
] as const;

export const SYSTEM_SERIES = [
  { key: 'serverErrors', label: 'Server errors (5xx)' },
  { key: 'restarts', label: 'Restarts' },
  { key: 'uncleanStops', label: 'Unclean stops' },
  { key: 'deploysFailed', label: 'Failed deployments' },
  { key: 'deadLetters', label: 'Gave up after retries' },
] as const;

type NumericKey = { [K in keyof DailyHealthRow]: DailyHealthRow[K] extends number ? K : never }[keyof DailyHealthRow];

export function total(days: DailyHealthRow[], key: NumericKey): number {
  return days.reduce((n, d) => n + (d[key] ?? 0), 0);
}

/**
 * Change between the first and second half of the range, for a headline like
 * "down 40%". Null when either half is empty (no base to compare against).
 */
export function halfOverHalf(days: DailyHealthRow[], key: NumericKey): number | null {
  if (days.length < 2) return null;
  const mid = Math.floor(days.length / 2);
  const before = total(days.slice(0, mid), key);
  const after = total(days.slice(days.length - mid), key);
  if (!before) return null;
  return Math.round((100 * (after - before)) / before);
}

/** The failure rate across the whole range, weighted by settled pages (not an average of daily rates). */
export function rangeFailedPct(days: DailyHealthRow[], systemOnly = false): number | null {
  const read = total(days, 'read');
  const scan = total(days, 'badScan');
  const late = total(days, 'notReadInTime');
  const other = total(days, 'failedOther');
  const settled = read + scan + late + other;
  if (!settled) return null;
  return Math.round((1000 * (systemOnly ? late + other : scan + late + other)) / settled) / 10;
}

/** Days before the error codes were recorded have no breakdown of refused requests. */
export function hasCodes(day: DailyHealthRow, codesFrom: string | null): boolean {
  return Boolean(codesFrom) && day.date >= (codesFrom as string);
}

/** Routes that failed with ``codeKey`` (all routes when null), most failures first. */
export function routesFor(routes: ErrorRouteRow[], codeKey: string | null, query: string): ErrorRouteRow[] {
  const q = query.trim().toLowerCase();
  return routes.filter((r) => (!codeKey || r.codes.some((c) => c.key === codeKey))
    && (!q || r.route.toLowerCase().includes(q) || r.service.toLowerCase().includes(q)));
}

export function pct(n: number | null): string {
  return n === null ? '—' : `${n}%`;
}

export function signedPct(n: number | null): string {
  if (n === null) return 'no earlier days to compare';
  if (n === 0) return 'flat against the first half';
  return `${n > 0 ? 'up' : 'down'} ${Math.abs(n)}% on the first half`;
}
