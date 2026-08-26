export interface SecurityHousekeepingCounts {
  accessContextEvaluations: number;
  accessSessions: number;
  securityEvents: number;
}

export interface SecurityRetentionPolicyReference {
  status: string | null;
  accessContextRetentionDays: number | null;
  accessSessionRetentionDays: number | null;
  securityEventRetentionDays: number | null;
}

export interface SecurityHousekeepingPreview {
  tenantId: string;
  cutoffDate: string;
  cutoffExclusiveUtc: string;
  total: SecurityHousekeepingCounts;
  eligible: SecurityHousekeepingCounts;
  retentionPolicy: SecurityRetentionPolicyReference;
}

export interface SecurityHousekeepingPurgeResult {
  tenantId: string;
  cutoffDate: string;
  deleted: SecurityHousekeepingCounts;
  completedAtUtc: string;
}

const configuredSecurityBaseUrl = import.meta.env.VITE_SECURITY_BASE_URL?.trim();
const securityBaseUrl = configuredSecurityBaseUrl?.replace(/\/$/, '') ?? '';

function endpoint(path: string): string {
  return `${securityBaseUrl}${path}`;
}

async function readResponse<T>(response: Response): Promise<T> {
  const contentType = response.headers.get('content-type') ?? '';
  const payload: unknown = contentType.includes('application/json')
    ? await response.json().catch(() => undefined)
    : await response.text().catch(() => undefined);

  if (!response.ok) {
    const record = typeof payload === 'object' && payload !== null
      ? payload as Record<string, unknown>
      : undefined;
    const detail = record?.detail;
    const message =
      (typeof detail === 'string' && detail) ||
      (typeof record?.title === 'string' && record.title) ||
      (typeof payload === 'string' && payload) ||
      'Security housekeeping request failed.';
    throw new Error(message);
  }
  return payload as T;
}

function authHeaders(accessToken: string, json = false): HeadersInit {
  const headers: Record<string, string> = { Authorization: `Bearer ${accessToken}` };
  if (json) headers['Content-Type'] = 'application/json';
  return headers;
}

export async function previewSecurityHousekeeping(
  tenantId: string,
  cutoffDate: string,
  accessToken: string,
): Promise<SecurityHousekeepingPreview> {
  const query = new URLSearchParams({ cutoffDate });
  const response = await fetch(
    endpoint(`/security/v1/platform/tenants/${encodeURIComponent(tenantId)}/housekeeping/security?${query.toString()}`),
    {
      method: 'GET',
      headers: authHeaders(accessToken),
      cache: 'no-store',
    },
  );
  return readResponse<SecurityHousekeepingPreview>(response);
}

export async function purgeSecurityHousekeeping(
  tenantId: string,
  cutoffDate: string,
  accessToken: string,
): Promise<SecurityHousekeepingPurgeResult> {
  const response = await fetch(
    endpoint(`/security/v1/platform/tenants/${encodeURIComponent(tenantId)}/housekeeping/security/purge`),
    {
      method: 'POST',
      headers: authHeaders(accessToken, true),
      body: JSON.stringify({
        cutoffDate,
        confirmationCutoffDate: cutoffDate,
      }),
    },
  );
  return readResponse<SecurityHousekeepingPurgeResult>(response);
}
