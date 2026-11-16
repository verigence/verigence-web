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
 *   POST /p2/v1/tenants/{t}/location-checks            a PC's check
 *   GET  /p2/v1/tenants/{t}/location-checks            the day's log (Executive)
 *   GET  /v1/admin/tenants/{t}/location-checks         the same, for SuperAdmin
 *   GET  …/location-checks:away?from&to&minKm          every check away more than minKm km, date-wise
 *                                                      (product owner, 2026-11-09; Executive / SuperAdmin)
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
  /** The device's own id for the reading: a resend is logged once (2026-11-16). */
  clientCheckId?: string;
  /** Kept on the device with no network and sent later: judged at capturedAt. */
  queued?: boolean;
};

export type LocationCheckResult = {
  recorded: boolean;
  /** Why nothing was recorded: OUTSIDE_HOURS, HOURLY_LIMIT or TOO_OLD. */
  reason?: string | null;
  /** The same reading was logged before. */
  duplicate?: boolean;
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
  /** BACKGROUND: the phone's recording between check-in and check-out (2026-11-16). Absent from older services. */
  trigger?: 'FOREGROUND' | 'BACKGROUND';
  /** Kept on the device with no network and sent later. */
  queued?: boolean;
  receivedAtUtc?: string | null;
};

/** Why a person has no usable check on the day (2026-11-16). */
export type LocationIssue = 'NOT_ON_DEALGUARD' | 'NO_CHECK_RECEIVED' | 'DESKTOP_NO_GPS' | 'LOCATION_OFF' | 'TRACKING_GAP';

export type LocationCheckPerson = {
  actorId: string;
  name?: string | null;
  checks: number;
  away: number;
  counts: Record<LocationCheckStatus, number>;
  /** Null for a PC with no check on the day. */
  last: LocationCheckItem | null;
  items: LocationCheckItem[];
  isPc?: boolean;
  /** Clock hours with a check, and hours (10:00–19:30) the person used DealGuard. */
  hoursChecked?: number;
  hoursOnDealGuard?: number;
  hoursMissed?: number;
  /** The phone recorded the location in the background. */
  background?: boolean;
  lastBackgroundAtUtc?: string | null;
  longestGapMinutes?: number | null;
  issue?: LocationIssue | null;
};

export type LocationCheckLog = {
  day: string;
  timezone: string;
  awayOnly: boolean;
  radiusM: number;
  accuracyLimitM: number;
  window: { from: string; to: string };
  totals: { pcs: number; checks: number } & Record<LocationCheckStatus, number> & {
    pcsInProject?: number;
    pcsChecked?: number;
    notChecked?: number;
    withIssue?: number;
    background?: number;
    queued?: number;
  };
  trackingIntervalMinutes?: number;
  people: LocationCheckPerson[];
};

/** Why a person shows no usable check, in words (2026-11-16). */
export const ISSUE_LABELS: Record<LocationIssue, string> = {
  NOT_ON_DEALGUARD: 'Not on DealGuard 10:00–19:30, and no phone recording',
  NO_CHECK_RECEIVED: 'On DealGuard, but no check came in (an older app, or the screen was hidden at every check)',
  DESKTOP_NO_GPS: 'Most readings could not place them: a computer without GPS',
  LOCATION_OFF: 'Most checks came back with no location: location permission off or switched off',
  TRACKING_GAP: 'The phone recording went quiet for an hour or more',
};

/** Someone whose checks mostly could not place them over the range: never shown as away. */
export type UnplacedPerson = {
  actorId: string;
  name?: string | null;
  checks: number;
  issue: 'DESKTOP_NO_GPS' | 'LOCATION_OFF';
  unclear: number;
  noLocation: number;
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

/** One check away from the nearest outlet by more than the threshold. Date and time are IST. */
export type AwayInstance = {
  checkId: string;
  actorId: string;
  name?: string | null;
  /** YYYY-MM-DD, India. */
  date: string;
  /** HH:MM, India. */
  time: string;
  checkedAtUtc: string;
  distanceM: number;
  /** Rounded to 0.1 km. */
  distanceKm: number;
  outletId?: string | null;
  outletName?: string | null;
  accuracyM?: number | null;
  source: 'NATIVE' | 'BROWSER';
  deviceType?: LocationDeviceType | null;
};

export type AwayDateSummary = { date: string; instances: number; pcs: number; furthestKm: number };

export type AwayPcSummary = {
  actorId: string;
  name?: string | null;
  instances: number;
  days: number;
  furthestKm: number;
  last: { date: string; time: string; checkedAtUtc: string; distanceKm: number; outletName?: string | null };
};

export type AwayReport = {
  from: string;
  to: string;
  timezone: string;
  minKm: number;
  radiusM: number;
  accuracyLimitM: number;
  maxRangeDays: number;
  totals: { instances: number; pcs: number; days: number; furthestKm: number | null };
  byDate: AwayDateSummary[];
  byPc: AwayPcSummary[];
  /** Oldest first. */
  instances: AwayInstance[];
  /** More instances than the list carries (the summaries still count them all). */
  truncated: boolean;
  /** Absent from services before 16 Nov 2026. */
  unplaced?: UnplacedPerson[];
};

export function locationAwayPath(
  mode: TaskManagerMode, tenantId: string, range: { from: string; to: string; minKm: number },
): string {
  const params = new URLSearchParams({ from: range.from, to: range.to, minKm: String(range.minKm) });
  return `${locationChecksPath(mode, tenantId)}:away?${params.toString()}`;
}

export function getLocationAway(
  mode: TaskManagerMode, tenantId: string, range: { from: string; to: string; minKm: number }, accessToken?: string,
) {
  return auditCoreRequest<AwayReport>(locationAwayPath(mode, tenantId, range), {
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
