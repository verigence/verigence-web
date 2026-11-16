import { auditCoreRequest } from './client';

/**
 * Tracking keys for the phone's background location (product owner, 2026-11-16).
 *
 *   POST /p2/v1/location-tracking:start   at check-in: a key for today (everyone who marks attendance)
 *   POST /p2/v1/location-tracking:stop    at check-out
 *
 * The phone's service then sends its readings to the returned ``path`` with the
 * key (it runs while the app is closed, when the sign-in token cannot be renewed).
 */
export type TrackingStart = {
  tracking: boolean;
  /** Why not: NO_PROJECT or WINDOW_OVER (after 19:30 IST). */
  reason?: string | null;
  tenantId?: string | null;
  projectName?: string | null;
  key?: string | null;
  trackingUntilUtc?: string | null;
  sendUntilUtc?: string | null;
  intervalMinutes: number;
  window: { from: string; to: string };
  path?: string | null;
};

export function startLocationTracking(accessToken: string, tenantId?: string) {
  return auditCoreRequest<TrackingStart>('/p2/v1/location-tracking:start', {
    method: 'POST', accessToken, body: JSON.stringify({ tenantId: tenantId ?? null, deviceType: 'ANDROID' }),
  });
}

export function stopLocationTracking(accessToken: string) {
  return auditCoreRequest<{ stopped: number }>('/p2/v1/location-tracking:stop', {
    method: 'POST', accessToken, body: JSON.stringify({}),
  });
}

/** "10:00" -> 600 */
export function minuteOfDay(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}
