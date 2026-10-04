export type HrRoleKey = 'HRADMIN' | 'FINANCEADMIN' | 'CEO';

export const HR_ROLE_KEYS: HrRoleKey[] = ['HRADMIN', 'FINANCEADMIN', 'CEO'];

const securityBaseUrl = (import.meta.env.VITE_SECURITY_BASE_URL?.trim() ?? '').replace(/\/$/, '');

async function call<T>(accessToken: string, method: string, path: string): Promise<T> {
  const response = await fetch(`${securityBaseUrl}${path}`, {
    method,
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  const payload: unknown = await response.json().catch(() => undefined);
  if (!response.ok) {
    const detail = (payload as { detail?: unknown } | undefined)?.detail;
    throw new Error(
      typeof detail === 'string' && detail ? detail : 'The HR role could not be changed. Please try again.',
    );
  }
  return payload as T;
}

const rolesPath = (userId: string) => `/security/v1/users/${encodeURIComponent(userId)}/module-roles/hr`;

/** SuperAdmin only. The HR roles a person holds now. */
export async function getUserHrRoles(accessToken: string, userId: string): Promise<HrRoleKey[]> {
  const data = await call<{ roles: HrRoleKey[] }>(accessToken, 'GET', rolesPath(userId));
  return data.roles;
}

export const assignUserHrRole = (accessToken: string, userId: string, role: HrRoleKey) =>
  call<{ changed: boolean }>(accessToken, 'PUT', `${rolesPath(userId)}/${role}`);

export const removeUserHrRole = (accessToken: string, userId: string, role: HrRoleKey) =>
  call<{ changed: boolean }>(accessToken, 'DELETE', `${rolesPath(userId)}/${role}`);
