import { auditCoreRequest } from './client';
import type { TaskManagerMode } from './taskManager';

/**
 * DealGuard location checks (product owner, 2026-11-05).
 *
 * While a PC uses DealGuard the app reads the device's location at random
 * moments (1-3 times each clock hour, 10:00-19:30 IST) and sends it here.
 * Audit Core works out the distance to the nearest outlet the PC is assigned
 * to and says what it means; the app never sends or trusts a distance of its own.
 *
 *   POST /p2/v1/tenants/{t}/location-checks      a PC's check
 *   GET  /p2/v1/tenants/{t}/location-checks      the day's log (TL, PM, Executive)
 *   GET  /v1/admin/tenants/{t}/location-checks   the same, for SuperAdmin
 */

export type LocationCheckStatus = 'AT_OUTLET' | 'AWAY' | 'UNCLEAR' | 'NO_OUTLET_LOCATION' | 'DENIED' | 'UNAVAILABLE';
export type LocationDeviceType = 'WEB' | 'MOBILE_WEB' | 'ANDROID' | 'IOS';

export type LocationCheckCommand = {
  outcome: 'LOCATED' | 'DENIED' | 'UNAVAILABLE';
  latitude?: number;
  longitude?: number;
  accuracyM?: number | null;
  capturedAt?: string;
  source: 'NATIVE' | 'BROWSER';
  deviceType?: LocationDeviceType;
  detail?: string;
};

export type LocationCheckResult = {
  recorded: boolean;
  /** Why nothing was recorded: OUTSIDE_HOURS or HOURLY_LIMIT. */
  reason?: string | null;
  checkId?: string | null;
  status?: LocationCheckStatus | null;
  distanceM?: number | null;
  outletId?: string | null;
  /** "Utkal Mahindra – CDA": the dealership and outlet. */
  outletName?: string | null;
  accuracyM?: number | null;
  radiusM: number;
  accuracyLimitM: number;
  checkedAtUtc?: string | null;
};

export type LocationCheckItem = {
  checkId: string;
  checkedAtUtc: string;
  capturedAtUtc?: string | null;
  status: LocationCheckStatus;
  distanceM?: number | null;
  accuracyM?: number | null;
  outletId?: string | null;
  outletName?: string | null;
  source: 'NATIVE' | 'BROWSER';
  deviceType?: LocationDeviceType | null;
};

export type LocationCheckPerson = {
  actorId: string;
  name?: string | null;
  checks: number;
  away: number;
  counts: Record<LocationCheckStatus, number>;
  last: LocationCheckItem;
  items: LocationCheckItem[];
};

export type LocationCheckLog = {
  day: string;
  timezone: string;
  awayOnly: boolean;
  radiusM: number;
  accuracyLimitM: number;
  window: { from: string; to: string };
  totals: { pcs: number; checks: number } & Record<LocationCheckStatus, number>;
  people: LocationCheckPerson[];
};

export function postLocationCheck(tenantId: string, command: LocationCheckCommand, accessToken?: string) {
  return auditCoreRequest<LocationCheckResult>(`/p2/v1/tenants/${encodeURIComponent(tenantId)}/location-checks`, {
    method: 'POST', accessToken, body: JSON.stringify(command),
  });
}

export function locationChecksPath(mode: TaskManagerMode, tenantId: string): string {
  const t = encodeURIComponent(tenantId);
  return mode === 'admin' ? `/v1/admin/tenants/${t}/location-checks` : `/p2/v1/tenants/${t}/location-checks`;
}

export function getLocationChecks(
  mode: TaskManagerMode, tenantId: string, day: string | undefined, awayOnly: boolean, accessToken?: string,
) {
  const params = new URLSearchParams();
  if (day) params.set('day', day);
  if (awayOnly) params.set('awayOnly', 'true');
  const query = params.toString();
  return auditCoreRequest<LocationCheckLog>(`${locationChecksPath(mode, tenantId)}${query ? `?${query}` : ''}`, {
    accessToken, cache: 'no-store',
  });
}

/** "350 m" under a kilometre, else "3.2 km". */
export function formatDistance(metres: number | null | undefined): string {
  if (metres === null || metres === undefined || !Number.isFinite(metres)) return '—';
  if (metres < 1000) return `${Math.round(metres)} m`;
  return `${(metres / 1000).toFixed(1)} km`;
}

export const STATUS_LABELS: Record<LocationCheckStatus, string> = {
  AT_OUTLET: 'At outlet',
  AWAY: 'Away',
  UNCLEAR: 'Unclear (low accuracy)',
  NO_OUTLET_LOCATION: 'Outlet has no location',
  DENIED: 'Location not allowed',
  UNAVAILABLE: 'Location not available',
};
