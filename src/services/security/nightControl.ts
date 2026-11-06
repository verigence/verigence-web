/**
 * Night control, kept by Security (product owner, 6 Nov 2026): from 20:00 to 08:30 IST nobody may open
 * Journey 360 or download any Verigence file unless SuperAdmin gave them access. SuperAdmin and
 * Executive are never blocked. Kept feature by feature; Security decides, the services enforce, the app
 * only shows "Night Mode On".
 */

/** Today JOURNEY_360 and FILE_DOWNLOAD; Security may add more later, so any string is accepted. */
export type NightFeatureKey = 'JOURNEY_360' | 'FILE_DOWNLOAD' | (string & {});
export type NightAllowedBy = 'SUPER_ADMIN' | 'EXECUTIVE' | 'GRANT';

export interface MyNightFeature {
  featureKey: NightFeatureKey;
  label: string;
  enabled: boolean;
  /** India time, HH:MM. */
  startsAt: string;
  endsAt: string;
  /** The feature is on and it is inside its hours now. */
  active: boolean;
  /** Active and the person has no exemption or access. */
  blocked: boolean;
  allowedBy: NightAllowedBy | null;
}

export interface MyNightControl {
  nightModeOn: boolean;
  message: string;
  exempt: 'SUPER_ADMIN' | 'EXECUTIVE' | null;
  checkedAt: string;
  features: MyNightFeature[];
}

export interface NightFeatureSetting {
  featureKey: NightFeatureKey;
  label: string;
  enabled: boolean;
  startsAt: string;
  endsAt: string;
  active: boolean;
}

export interface NightGrant {
  grantId: string;
  userId: string;
  /** null: every night-controlled feature. */
  featureKey: NightFeatureKey | null;
  note: string;
  grantedAt: string;
  displayName: string | null;
  email: string | null;
  grantedBy: string | null;
}

export interface NightControlOverview {
  message: string;
  exemptRoles: string[];
  features: NightFeatureSetting[];
  grants: NightGrant[];
}

export interface NightFeatureInput {
  enabled: boolean;
  startsAt: string;
  endsAt: string;
}

export interface NightGrantInput {
  userId: string;
  featureKey: NightFeatureKey | null;
  note: string;
}

/** A refused Security call, with its HTTP status so a screen can tell 409 from the rest. */
export class NightControlRequestError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'NightControlRequestError';
    this.status = status;
  }
}

const securityBaseUrl = (import.meta.env.VITE_SECURITY_BASE_URL?.trim() ?? '').replace(/\/$/, '');

function detailText(payload: unknown): string | undefined {
  const detail = (payload as { detail?: unknown } | undefined)?.detail;
  if (typeof detail === 'string' && detail.trim()) return detail.trim();
  // FastAPI field problems: [{loc, msg}]
  if (Array.isArray(detail)) {
    const messages = detail.map((d) => (d as { msg?: unknown })?.msg).filter((m): m is string => typeof m === 'string' && Boolean(m));
    if (messages.length) return messages.join('; ');
  }
  return undefined;
}

async function call<T>(accessToken: string, method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { Authorization: `Bearer ${accessToken}` };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch(`${securityBaseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store',
  });
  const payload: unknown = await response.json().catch(() => undefined);
  if (!response.ok) {
    throw new NightControlRequestError(response.status, detailText(payload) ?? 'The change could not be saved. Please try again.');
  }
  return payload as T;
}

/** The signed-in person's own night state. */
export const getMyNightControl = (accessToken: string) => call<MyNightControl>(accessToken, 'GET', '/security/v1/me/night-control');

/** SuperAdmin only. */
export const getNightControlOverview = (accessToken: string) => call<NightControlOverview>(accessToken, 'GET', '/security/v1/admin/night-control');

export const setNightFeature = (accessToken: string, featureKey: NightFeatureKey, input: NightFeatureInput) =>
  call<unknown>(accessToken, 'PUT', `/security/v1/admin/night-control/features/${encodeURIComponent(featureKey)}`, input);

export const grantNightAccess = (accessToken: string, input: NightGrantInput) =>
  call<unknown>(accessToken, 'POST', '/security/v1/admin/night-control/grants', input);

export const revokeNightAccess = (accessToken: string, grantId: string, note: string) =>
  call<{ revoked: boolean }>(accessToken, 'POST', `/security/v1/admin/night-control/grants/${encodeURIComponent(grantId)}/revoke`, { note });
