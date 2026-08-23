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

type SecurityUserPayload = Partial<GlobalUserDirectoryItem> & {
  user_id?: string;
  display_name?: string;
  primary_email?: string | null;
  primary_mobile?: string | null;
  clerk_user_id?: string | null;
  clerk_subject?: string | null;
  onboarding_status?: string | null;
  created_at_utc?: string;
  updated_at_utc?: string;
};

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

function normalizeUser(payload: SecurityUserPayload): GlobalUserDirectoryItem {
  const userId = payload.userId ?? payload.user_id;
  const displayName = payload.displayName ?? payload.display_name;
  const createdAtUtc = payload.createdAtUtc ?? payload.created_at_utc;
  const updatedAtUtc = payload.updatedAtUtc ?? payload.updated_at_utc;

  if (!userId || !displayName || !payload.status || !createdAtUtc || !updatedAtUtc) {
    throw new SecurityAdminApiError('Security returned an incomplete user record.', 502);
  }

  return {
    userId,
    displayName,
    primaryEmail: payload.primaryEmail ?? payload.primary_email ?? null,
    primaryMobile: payload.primaryMobile ?? payload.primary_mobile ?? null,
    status: payload.status,
    clerkSubject: payload.clerkSubject ?? payload.clerk_subject ?? payload.clerk_user_id ?? null,
    onboardingStatus: payload.onboardingStatus ?? payload.onboarding_status ?? null,
    createdAtUtc,
    updatedAtUtc,
  };
}

/**
 * Read the authoritative global USER directory from Security.
 * `status_filter` is the currently implemented Security DEV query parameter.
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
  const payload = await readResponse<SecurityUserPayload[]>(response);
  return payload.map(normalizeUser);
}

export async function listPendingGlobalUsers(
  accessToken: string,
): Promise<GlobalUserDirectoryItem[]> {
  const users = await listGlobalUsers(accessToken, 'PENDING');
  return users.filter((user) => user.status.toUpperCase() === 'PENDING');
}

export async function getGlobalUser(
  accessToken: string,
  userId: string,
): Promise<GlobalUserDirectoryItem> {
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
  if (status === 'REJECTED') {
    throw new SecurityAdminApiError(
      'Registration rejection is not exposed by the current Security DEV lifecycle contract. Activation remains available; rejection requires an explicit Security backend capability.',
      501,
    );
  }

  const response = await fetch(
    endpoint(`/security/v1/platform/users/${encodeURIComponent(userId)}/status`),
    {
      method: 'PATCH',
      headers: authHeaders(accessToken, true),
      body: JSON.stringify({ status: 'ACTIVE' }),
    },
  );
  const result = normalizeUser(await readResponse<SecurityUserPayload>(response));
  return {
    userId: result.userId,
    status: result.status,
    previousStatus: 'PENDING',
    changed: result.status === 'ACTIVE',
    deletionRequestId: null,
  };
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
  return normalizeUser(await readResponse<SecurityUserPayload>(response));
}
