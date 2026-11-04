/** The oldest Verigence app version still allowed, kept by Security (product owner, 4 Nov 2026). */

export interface AppVersionStatus {
  /** null: no minimum, every version may be used. */
  minimumVersion: string | null;
  /** null: the minimum applies at once. */
  effectiveFrom: string | null;
  /** True when a minimum is set and its time has come. */
  inForce: boolean;
  downloadUrl: string;
}

export interface DevicesBelow {
  /** null: an app too old to report its version. */
  appVersion: string | null;
  devices: number;
  people: number;
}

export interface AppVersionPolicy extends AppVersionStatus {
  devicesBelow: DevicesBelow[];
}

export interface AppVersionPolicyInput {
  minimumVersion: string | null;
  effectiveFrom: string | null;
}

const securityBaseUrl = (import.meta.env.VITE_SECURITY_BASE_URL?.trim() ?? '').replace(/\/$/, '');

async function call<T>(accessToken: string | undefined, method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch(`${securityBaseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store',
  });
  const payload: unknown = await response.json().catch(() => undefined);
  if (!response.ok) {
    const detail = (payload as { detail?: unknown } | undefined)?.detail;
    throw new Error(typeof detail === 'string' && detail ? detail : 'The change could not be saved. Please try again.');
  }
  return payload as T;
}

/** Public: no sign-in needed. Callers treat a failure as "no minimum" so the app is never locked by a network error. */
export const getAppVersionStatus = () => call<AppVersionStatus>(undefined, 'GET', '/security/v1/status/app-version');

export const getAppVersionPolicy = (token: string) => call<AppVersionPolicy>(token, 'GET', '/security/v1/admin/app-version-policy');

export const getAppVersionImpact = (token: string, minimumVersion: string) =>
  call<{ devicesBelow: DevicesBelow[] }>(
    token,
    'GET',
    `/security/v1/admin/app-version-policy/impact?minimumVersion=${encodeURIComponent(minimumVersion)}`,
  );

export const setAppVersionPolicy = (token: string, input: AppVersionPolicyInput) =>
  call<AppVersionPolicy>(token, 'PUT', '/security/v1/admin/app-version-policy', input);
