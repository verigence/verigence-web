/** Optional device diagnostics kept by Security: off by default; SuperAdmin switches it on and reads what phones send. */

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

export interface DiagnosticEntry {
  time: string;
  step: string;
  detail: Record<string, unknown>;
}

export interface DiagnosticLog {
  logId: string;
  deviceId: string;
  platform: string | null;
  appVersion: string | null;
  entryCount: number;
  entries: DiagnosticEntry[];
  receivedAt: string;
  person: string | null;
}

/** Any signed-in person: should this app keep and send its on-device log. */
export const getMyDiagnostics = (token: string) => call<{ enabled: boolean }>(token, 'GET', '/security/v1/me/client-diagnostics');

export const sendDiagnostics = (token: string, body: { deviceId: string; platform?: string; appVersion?: string; entries: DiagnosticEntry[] }) =>
  call<{ accepted: boolean }>(token, 'POST', '/security/v1/me/client-diagnostics/logs', body);

/** SuperAdmin only. */
export const getAdminDiagnostics = (token: string) =>
  call<{ enabled: boolean; logs: DiagnosticLog[] }>(token, 'GET', '/security/v1/admin/client-diagnostics');

export const setDiagnosticsSwitch = (token: string, enabled: boolean) =>
  call<{ enabled: boolean }>(token, 'PUT', '/security/v1/admin/client-diagnostics', { enabled });

export const clearDiagnosticLogs = (token: string) =>
  call<{ removed: number }>(token, 'DELETE', '/security/v1/admin/client-diagnostics/logs');
