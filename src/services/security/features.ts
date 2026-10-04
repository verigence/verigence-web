/** Feature switches kept by Security: what each signed-in person sees (Audit, Analytics) and the SuperAdmin controls. */

export type FeatureKey = 'AUDIT' | 'ANALYTICS';
export const FEATURE_KEYS: FeatureKey[] = ['AUDIT', 'ANALYTICS'];

export interface MyFeatures {
  features: Record<FeatureKey, boolean>;
}

export interface FeaturePerson {
  userId: string;
  displayName: string;
  email: string | null;
  enabled: boolean;
}

export interface FeatureSetting {
  featureKey: FeatureKey;
  everyone: boolean;
  /** People with their own setting. It wins over `everyone`. */
  people: FeaturePerson[];
}

const securityBaseUrl = (import.meta.env.VITE_SECURITY_BASE_URL?.trim() ?? '').replace(/\/$/, '');

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
    const detail = (payload as { detail?: unknown } | undefined)?.detail;
    throw new Error(typeof detail === 'string' && detail ? detail : 'The change could not be saved. Please try again.');
  }
  return payload as T;
}

/** Any signed-in person: which switchable parts of the app are on for them. */
export const getMyFeatures = (accessToken: string) => call<MyFeatures>(accessToken, 'GET', '/security/v1/me/features');

/** SuperAdmin only. */
export async function getFeatureSettings(accessToken: string): Promise<FeatureSetting[]> {
  const data = await call<{ features: FeatureSetting[] }>(accessToken, 'GET', '/security/v1/admin/features');
  return data.features;
}

export const setFeatureEveryone = (accessToken: string, key: FeatureKey, enabled: boolean) =>
  call<unknown>(accessToken, 'PUT', `/security/v1/admin/features/${key}/everyone`, { enabled });

/** `enabled: null` removes the person's own setting, so the setting for everyone applies again. */
export const setFeatureForUser = (accessToken: string, key: FeatureKey, userId: string, enabled: boolean | null) =>
  call<unknown>(accessToken, 'PUT', `/security/v1/admin/features/${key}/users/${encodeURIComponent(userId)}`, { enabled });
