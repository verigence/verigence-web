export interface StartOnboardingInput {
  firstName: string;
  lastName: string;
  email: string;
  mobile: string;
  password: string;
  verigenceIdentifier: string;
}

export interface SignupAttemptResponse {
  signupAttemptId: string;
  status: 'EMAIL_VERIFICATION_REQUIRED';
  expiresAt: string;
}

export interface VerificationResponse {
  onboardingRequestId: string;
  status: 'PENDING_ADMIN_APPROVAL';
  message: string;
}

export interface ResendEmailCodeResponse {
  signupAttemptId: string;
  status: 'EMAIL_VERIFICATION_REQUIRED';
  expiresAt: string;
}

export class SecurityApiError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'SecurityApiError';
    this.status = status;
    this.code = code;
  }
}

const configuredSecurityBaseUrl = import.meta.env.VITE_SECURITY_BASE_URL?.trim();
const securityBaseUrl = configuredSecurityBaseUrl?.replace(/\/$/, '') ?? '';

function endpoint(path: string): string {
  return `${securityBaseUrl}${path}`;
}

function validationDetailMessage(detail: unknown): string | undefined {
  if (!Array.isArray(detail)) return undefined;
  const messages = detail
    .map((item) => {
      if (typeof item !== 'object' || item === null) return undefined;
      const record = item as Record<string, unknown>;
      const msg = typeof record.msg === 'string' ? record.msg : undefined;
      const loc = Array.isArray(record.loc)
        ? record.loc.filter((part) => typeof part === 'string' || typeof part === 'number').join('.')
        : undefined;
      if (!msg) return undefined;
      return loc ? `${loc}: ${msg}` : msg;
    })
    .filter((value): value is string => Boolean(value));
  return messages.length ? messages.join(' ') : undefined;
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
      validationDetailMessage(detail) ||
      (typeof record?.message === 'string' && record.message) ||
      (typeof record?.title === 'string' && record.title) ||
      (typeof payload === 'string' && payload) ||
      `Security request failed (${response.status}). Please try again.`;
    const code = typeof record?.code === 'string' ? record.code : undefined;

    throw new SecurityApiError(message, response.status, code);
  }

  return payload as T;
}

export async function startOnboarding(input: StartOnboardingInput): Promise<SignupAttemptResponse> {
  const onboardingKey = input.verigenceIdentifier.trim().toUpperCase();
  const response = await fetch(endpoint('/security/v1/onboarding/users'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Onboarding-Key': onboardingKey,
    },
    body: JSON.stringify({
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email,
      mobile: `+91${input.mobile}`,
      password: input.password,
    }),
  });

  return readResponse<SignupAttemptResponse>(response);
}

export async function verifyOnboardingEmail(
  signupAttemptId: string,
  code: string,
): Promise<VerificationResponse> {
  const response = await fetch(
    endpoint(`/security/v1/onboarding/users/${encodeURIComponent(signupAttemptId)}/verify-email`),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    },
  );

  return readResponse<VerificationResponse>(response);
}

export async function resendOnboardingEmailCode(
  signupAttemptId: string,
): Promise<ResendEmailCodeResponse> {
  const response = await fetch(
    endpoint(`/security/v1/onboarding/users/${encodeURIComponent(signupAttemptId)}/resend-email-code`),
    { method: 'POST' },
  );

  return readResponse<ResendEmailCodeResponse>(response);
}
