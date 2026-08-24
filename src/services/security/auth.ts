import {
  ensureCorrelationHeader,
  responseCorrelationId,
} from '../../observability/correlation';

export interface HumanLoginResponse {
  accessToken: string;
  expiresAtUtc: string;
  actorType: 'USER';
  isSuperAdmin: boolean;
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

function errorFrom(
  response: Response,
  payload: unknown,
  fallbackCorrelationId?: string,
): SecurityLoginError {
  const problem = problemFrom(payload);
  const message =
    (typeof problem?.detail === 'string' && problem.detail) ||
    (typeof problem?.title === 'string' && problem.title) ||
    (typeof payload === 'string' && payload) ||
    'Sign in could not be completed.';
  const correlationId = typeof problem?.correlationId === 'string'
    ? problem.correlationId
    : responseCorrelationId(response, fallbackCorrelationId);

  return new SecurityLoginError(
    message,
    response.status,
    typeof problem?.code === 'string' ? problem.code : undefined,
    correlationId,
  );
}

function connectivityError(correlationId: string): SecurityLoginError {
  return new SecurityLoginError(
    'Sign in service could not be reached.',
    0,
    'SECURITY_UPSTREAM_UNAVAILABLE',
    correlationId,
  );
}

async function securityFetch(
  input: RequestInfo | URL,
  init: RequestInit,
): Promise<{ response: Response; correlationId: string }> {
  const headers = new Headers(init.headers);
  const correlationId = ensureCorrelationHeader(headers);
  try {
    return {
      response: await fetch(input, { ...init, headers }),
      correlationId,
    };
  } catch {
    throw connectivityError(correlationId);
  }
}

export async function loginHuman(
  identifier: string,
  password: string,
): Promise<HumanLoginResponse> {
  const { response, correlationId } = await securityFetch(endpoint('/security/v1/auth/login'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier, password }),
    cache: 'no-store',
  });
  const payload = await readPayload(response);

  if (!response.ok) throw errorFrom(response, payload, correlationId);
  return payload as HumanLoginResponse;
}

export async function refreshHuman(accessToken: string): Promise<HumanLoginResponse> {
  const { response, correlationId } = await securityFetch(endpoint('/security/v1/auth/refresh'), {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  const payload = await readPayload(response);

  if (!response.ok) throw errorFrom(response, payload, correlationId);
  return payload as HumanLoginResponse;
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
    case 'USER_PENDING_APPROVAL':
      return 'Your Verigence activation is pending administrator approval.';
    case 'USER_NOT_ACTIVE':
    case 'PRINCIPAL_NOT_ACTIVE':
      return 'Your Verigence account is not active.';
    case 'IDENTITY_PROVIDER_UNAVAILABLE':
    case 'SECURITY_UPSTREAM_UNAVAILABLE':
      return 'Sign in is temporarily unavailable. Please try again.';
    default:
      return error.status >= 500
        ? 'Sign in is temporarily unavailable. Please try again.'
        : 'Sign in could not be completed. Please check your details and try again.';
  }
}