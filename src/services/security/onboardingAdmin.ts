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

export async function listPendingGlobalUsers(
  accessToken: string,
): Promise<GlobalUserDirectoryItem[]> {
  const query = new URLSearchParams({
    userStatus: 'PENDING',
    limit: '200',
    offset: '0',
  });
  const response = await fetch(endpoint(`/security/v1/platform/users?${query.toString()}`), {
    method: 'GET',
    headers: authHeaders(accessToken),
    cache: 'no-store',
  });
  return readResponse<GlobalUserDirectoryItem[]>(response);
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
