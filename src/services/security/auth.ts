export interface HumanLoginResponse {
  accessToken: string;
  expiresAtUtc: string;
  actorType: 'USER';
}

interface SecurityProblem {
  code?: string;
  title?: string;
  detail?: string | null;
  status?: number;
  correlationId?: string | null;
}

export class SecurityLoginError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly correlationId?: string;

  constructor(
    message: string,
    status: number,
    code?: string,
    correlationId?: string,
  ) {
    super(message);
    this.name = 'SecurityLoginError';
    this.status = status;
    this.code = code;
    this.correlationId = correlationId;
  }
}

const configuredSecurityBaseUrl = import.meta.env.VITE_SECURITY_BASE_URL?.trim();
const securityBaseUrl = configuredSecurityBaseUrl?.replace(/\/$/, '') ?? '';

function endpoint(path: string): string {
  return `${securityBaseUrl}${path}`;
}

async function readPayload(response: Response): Promise<unknown> {
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('json')) {
    return response.json().catch(() => undefined);
  }
  return response.text().catch(() => undefined);
}

function problemFrom(payload: unknown): SecurityProblem | undefined {
  return typeof payload === 'object' && payload !== null
    ? payload as SecurityProblem
    : undefined;
}

function errorFrom(response: Response, payload: unknown): SecurityLoginError {
  const problem = problemFrom(payload);
  const message =
    (typeof problem?.detail === 'string' && problem.detail) ||
    (typeof problem?.title === 'string' && problem.title) ||
    (typeof payload === 'string' && payload) ||
    'Sign in could not be completed.';

  return new SecurityLoginError(
    message,
    response.status,
    typeof problem?.code === 'string' ? problem.code : undefined,
    typeof problem?.correlationId === 'string' ? problem.correlationId : undefined,
  );
}

function connectivityError(): SecurityLoginError {
  return new SecurityLoginError(
    'Verigence Security could not be reached.',
    0,
    'SECURITY_UPSTREAM_UNAVAILABLE',
  );
}

async function securityFetch(input: RequestInfo | URL, init: RequestInit): Promise<Response> {
  try {
    return await fetch(input, init);
  } catch {
    throw connectivityError();
  }
}

export async function loginHuman(
  identifier: string,
  password: string,
): Promise<HumanLoginResponse> {
  const response = await securityFetch(endpoint('/security/v1/auth/login'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier, password }),
    cache: 'no-store',
  });
  const payload = await readPayload(response);

  if (!response.ok) throw errorFrom(response, payload);
  return payload as HumanLoginResponse;
}

/**
 * Security human JWTs intentionally carry no role/permission claims. Determine whether the
 * authenticated USER is Platform SuperAdmin by asking an existing SuperAdmin-only Security API.
 * A normal PERMISSION_DENIED response means the USER is authenticated but is not SuperAdmin.
 */
export async function isPlatformSuperAdmin(accessToken: string): Promise<boolean> {
  const query = new URLSearchParams({ limit: '1', offset: '0' });
  const response = await securityFetch(endpoint(`/security/v1/platform/users?${query.toString()}`), {
    method: 'GET',
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });

  if (response.ok) return true;

  const payload = await readPayload(response);
  const problem = problemFrom(payload);
  if (response.status === 403 && problem?.code === 'PERMISSION_DENIED') return false;

  throw errorFrom(response, payload);
}

export function loginErrorMessage(error: unknown): string {
  if (!(error instanceof SecurityLoginError)) {
    return 'Sign in could not be completed. Please try again.';
  }

  switch (error.code) {
    case 'AUTH_TOKEN_INVALID':
      return 'Email or password is incorrect.';
    case 'USER_NOT_ONBOARDED':
      return 'This account is not registered with Verigence.';
    case 'USER_NOT_ACTIVE':
    case 'PRINCIPAL_NOT_ACTIVE':
      return 'Your Verigence account is not active.';
    case 'IDENTITY_PROVIDER_UNAVAILABLE':
      return 'Clerk authentication is temporarily unavailable. Please try again.';
    case 'SECURITY_UPSTREAM_UNAVAILABLE':
      return 'Verigence Security is temporarily unavailable. Please try again.';
    default:
      break;
  }

  if (error.status === 404) {
    return 'Verigence Security login endpoint is unavailable (HTTP 404).';
  }
  if (error.status >= 500) {
    return `Verigence Security returned HTTP ${error.status}. Please try again.`;
  }
  if (error.status > 0) {
    const code = error.code ? `, ${error.code}` : '';
    return `${error.message || 'Sign in could not be completed.'} (HTTP ${error.status}${code})`;
  }

  return error.message || 'Sign in could not be completed. Please try again.';
}
