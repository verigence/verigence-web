export interface GlobalUserDirectoryItem {
  userId: string;
  displayName: string;
  primaryEmail: string | null;
  primaryMobile: string | null;
  status: string;
  clerkSubject: string | null;
  onboardingStatus: string | null;
  createdAtUtc: string;
  updatedAtUtc: string;
}

export interface UserStatusTransitionResponse {
  userId: string;
  status: string;
  previousStatus: string;
  changed: boolean;
  deletionRequestId: string | null;
}

export type OnboardingDecision = 'ACTIVE' | 'REJECTED';
export type GlobalUserLifecycleStatus = 'ACTIVE' | 'SUSPENDED' | 'DISABLED' | 'EXITED';

class SecurityAdminApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'SecurityAdminApiError';
    this.status = status;
  }
}

const configuredSecurityBaseUrl = import.meta.env.VITE_SECURITY_BASE_URL?.trim();
const securityBaseUrl = configuredSecurityBaseUrl?.replace(/\/$/, '') ?? '';

function endpoint(path: string): string {
  return `${securityBaseUrl}${path}`;
}

function authHeaders(accessToken: string, json = false): HeadersInit {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
  };
  if (json) headers['Content-Type'] = 'application/json';
  return headers;
}

async function readResponse<T>(response: Response): Promise<T> {
  const contentType = response.headers.get('content-type') ?? '';
  let payload: unknown;

  if (contentType.includes('application/json')) {
    payload = await response.json().catch(() => undefined);
  } else {
    payload = await response.text().catch(() => undefined);
  }

  if (!response.ok) {
    const record = typeof payload === 'object' && payload !== null
      ? payload as Record<string, unknown>
      : undefined;
    const detail = record?.detail;
    const message =
      (typeof detail === 'string' && detail) ||
      (typeof record?.message === 'string' && record.message) ||
      (typeof record?.title === 'string' && record.title) ||
      (typeof payload === 'string' && payload) ||
      'Security request failed. Please try again.';

    throw new SecurityAdminApiError(message, response.status);
  }

  return payload as T;
}

/**
 * Read the authoritative global USER directory from Security.
 * `status_filter` is the currently implemented Security query parameter.
 */
export async function listGlobalUsers(
  accessToken: string,
  status?: string,
): Promise<GlobalUserDirectoryItem[]> {
  const query = new URLSearchParams();
  if (status) query.set('status_filter', status.toUpperCase());
  const suffix = query.size ? `?${query.toString()}` : '';
  const response = await fetch(endpoint(`/security/v1/platform/users${suffix}`), {
    method: 'GET',
    headers: authHeaders(accessToken),
    cache: 'no-store',
  });
  return readResponse<GlobalUserDirectoryItem[]>(response);
}

export async function listPendingGlobalUsers(
  accessToken: string,
): Promise<GlobalUserDirectoryItem[]> {
  const users = await listGlobalUsers(accessToken, 'PENDING');
  // Keep a client-side guard so an older Security deployment that ignores the
  // filter can never leak non-pending users into the approval queue.
  return users.filter((user) => user.status.toUpperCase() === 'PENDING');
}

export async function getGlobalUser(
  accessToken: string,
  userId: string,
): Promise<GlobalUserDirectoryItem> {
  // The current Security source of truth exposes the global list plus lifecycle
  // mutation, not a dedicated detail read. Resolve detail from the authoritative
  // directory rather than inventing a browser-owned USER record.
  const users = await listGlobalUsers(accessToken);
  const user = users.find((candidate) => candidate.userId === userId);
  if (!user) throw new SecurityAdminApiError('User not found.', 404);
  return user;
}

export async function decidePendingGlobalUser(
  accessToken: string,
  userId: string,
  status: OnboardingDecision,
): Promise<UserStatusTransitionResponse> {
  const response = await fetch(
    endpoint(`/security/v1/users/${encodeURIComponent(userId)}/status`),
    {
      method: 'PATCH',
      headers: authHeaders(accessToken, true),
      body: JSON.stringify({ status }),
    },
  );
  return readResponse<UserStatusTransitionResponse>(response);
}

/**
 * Administrative USER lifecycle management supported by the current Security
 * implementation. "Delete User" in the UI maps to EXITED (logical offboarding),
 * never to physical deletion, so historical audit references remain intact.
 */
export async function changeGlobalUserLifecycleStatus(
  accessToken: string,
  userId: string,
  status: GlobalUserLifecycleStatus,
  reason?: string,
): Promise<GlobalUserDirectoryItem> {
  const response = await fetch(
    endpoint(`/security/v1/platform/users/${encodeURIComponent(userId)}/status`),
    {
      method: 'PATCH',
      headers: authHeaders(accessToken, true),
      body: JSON.stringify({
        status,
        reason: reason?.trim() || undefined,
      }),
    },
  );
  return readResponse<GlobalUserDirectoryItem>(response);
}
