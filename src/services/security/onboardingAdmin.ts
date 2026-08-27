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

export interface UserHardDeleteResponse {
  userId: string;
  deletionRequestId: string;
  tombstoneId: string;
  deletedAtUtc: string;
  retainUntilUtc: string;
}

export type OnboardingDecision = 'ACTIVE' | 'REJECTED';
export type GlobalUserLifecycleStatus = 'ACTIVE' | 'SUSPENDED';
type GlobalUserStatusTarget = OnboardingDecision | 'SUSPENDED' | 'DISABLED';

type StatusTransitionOptions = {
  reasonCode?: string;
  reason?: string;
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

/** Read the authoritative Security v2 global USER directory. */
export async function listGlobalUsers(
  accessToken: string,
  status?: string,
  search?: string,
): Promise<GlobalUserDirectoryItem[]> {
  const query = new URLSearchParams({
    limit: '200',
    offset: '0',
  });
  if (status) query.set('userStatus', status.toUpperCase());
  if (search?.trim()) query.set('search', search.trim());

  const response = await fetch(endpoint(`/security/v1/platform/users?${query.toString()}`), {
    method: 'GET',
    headers: authHeaders(accessToken),
    cache: 'no-store',
  });
  return readResponse<GlobalUserDirectoryItem[]>(response);
}

export async function listPendingGlobalUsers(
  accessToken: string,
): Promise<GlobalUserDirectoryItem[]> {
  return listGlobalUsers(accessToken, 'PENDING');
}

export async function getGlobalUser(
  accessToken: string,
  userId: string,
): Promise<GlobalUserDirectoryItem> {
  const response = await fetch(
    endpoint(`/security/v1/platform/users/${encodeURIComponent(userId)}`),
    {
      method: 'GET',
      headers: authHeaders(accessToken),
      cache: 'no-store',
    },
  );
  return readResponse<GlobalUserDirectoryItem>(response);
}

async function transitionGlobalUserStatus(
  accessToken: string,
  userId: string,
  status: GlobalUserStatusTarget,
  options: StatusTransitionOptions = {},
): Promise<UserStatusTransitionResponse> {
  const reason = options.reason?.trim();
  const response = await fetch(
    endpoint(`/security/v1/users/${encodeURIComponent(userId)}/status`),
    {
      method: 'PATCH',
      headers: authHeaders(accessToken, true),
      body: JSON.stringify({
        status,
        reasonCode: options.reasonCode,
        reason: reason || undefined,
      }),
    },
  );
  return readResponse<UserStatusTransitionResponse>(response);
}

export async function decidePendingGlobalUser(
  accessToken: string,
  userId: string,
  status: OnboardingDecision,
): Promise<UserStatusTransitionResponse> {
  return transitionGlobalUserStatus(accessToken, userId, status);
}

export async function changeGlobalUserLifecycleStatus(
  accessToken: string,
  userId: string,
  status: GlobalUserLifecycleStatus,
  reason?: string,
): Promise<UserStatusTransitionResponse> {
  return transitionGlobalUserStatus(accessToken, userId, status, { reason });
}

/**
 * Start the Security v2 hard-delete workflow. DISABLED is not a terminal display state;
 * it records the deletion request and immediately removes the user's access.
 */
export async function requestGlobalUserDeletion(
  accessToken: string,
  userId: string,
  reason?: string,
): Promise<UserStatusTransitionResponse> {
  return transitionGlobalUserStatus(accessToken, userId, 'DISABLED', {
    reasonCode: 'DELETE_REQUEST',
    reason,
  });
}

/** Complete a recorded deletion request. Security removes the live USER and Clerk identity. */
export async function hardDeleteGlobalUser(
  accessToken: string,
  userId: string,
): Promise<UserHardDeleteResponse> {
  const response = await fetch(
    endpoint(`/security/v1/platform/users/${encodeURIComponent(userId)}`),
    {
      method: 'DELETE',
      headers: authHeaders(accessToken),
    },
  );
  return readResponse<UserHardDeleteResponse>(response);
}
