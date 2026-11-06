import { auditCoreRequest } from './client';
import type { TaskManagerMode } from './taskManager';

/**
 * Where each PC, TL and PM opens Verigence from (Audit Core, product owner 2026-11-06):
 *   POST /p2/v1/tenants/{t}/access-locations      the app, once per sign-in or resume
 *   GET  /p2/v1/tenants/{t}/access-locations      per-person summary (Executive)
 *   GET  /v1/admin/tenants/{t}/access-locations   the same, for SuperAdmin
 */

export interface AccessLocationCommand {
  kind: 'SIGN_IN' | 'RESUME';
  outcome: 'LOCATED' | 'DENIED' | 'UNAVAILABLE';
  latitude?: number;
  longitude?: number;
  accuracyM?: number | null;
  capturedAt?: string;
  source?: 'NATIVE' | 'BROWSER';
  deviceType?: 'WEB' | 'MOBILE_WEB' | 'ANDROID' | 'IOS';
}

export interface AccessPlace {
  latitude: number;
  longitude: number;
  count: number;
  lastAtUtc: string | null;
  /** Google's readable address; null while not looked up yet. */
  address: string | null;
}

export interface AccessPerson {
  actorId: string;
  name: string | null;
  role: 'PC' | 'TL' | 'PM';
  accesses: number;
  atTaggedOutlet: number;
  taggedOutlets: string[];
  elsewhere: number;
  places: number;
  topPlaces: AccessPlace[];
  otherPlacesAccesses: number;
  unclear: number;
  noLocation: number;
  lastAccessAtUtc: string;
}

export interface AccessLocationSummary {
  from: string;
  to: string;
  watchFrom: string;
  watchUntil: string;
  radiusM: number;
  accuracyLimitM: number;
  totals: { people: number; accesses: number; atTaggedOutlet: number; elsewhere: number; noLocation: number };
  people: AccessPerson[];
}

export function postAccessLocation(tenantId: string, command: AccessLocationCommand, accessToken?: string) {
  return auditCoreRequest<{ recorded: boolean; reason: string | null }>(
    `/p2/v1/tenants/${encodeURIComponent(tenantId)}/access-locations`,
    { method: 'POST', accessToken, body: JSON.stringify(command) },
  );
}

export function accessLocationsPath(mode: TaskManagerMode, tenantId: string): string {
  const t = encodeURIComponent(tenantId);
  return mode === 'admin' ? `/v1/admin/tenants/${t}/access-locations` : `/p2/v1/tenants/${t}/access-locations`;
}

export function getAccessLocations(
  mode: TaskManagerMode, tenantId: string, filters: { from?: string; to?: string; role?: string }, accessToken?: string,
) {
  const params = new URLSearchParams();
  if (filters.from) params.set('from', filters.from);
  if (filters.to) params.set('to', filters.to);
  if (filters.role) params.set('role', filters.role);
  const query = params.toString();
  return auditCoreRequest<AccessLocationSummary>(`${accessLocationsPath(mode, tenantId)}${query ? `?${query}` : ''}`, {
    accessToken, cache: 'no-store',
  });
}

/** A Google Maps link to look at a place. */
export function mapLink(latitude: number, longitude: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${latitude.toFixed(5)},${longitude.toFixed(5)}`;
}
