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

function safePasswordMessage(detail?: string): string | undefined {
  if (!detail) return undefined;

  const normalized = detail.toLowerCase();
  if (!normalized.includes('password')) return undefined;

  // Never display provider-controlled text directly. Clerk currently reports compromised-password
  // rejection with form_password_pwned and breach-oriented wording; Security intentionally keeps
  // that provider detail behind its API boundary. Match only the category and return our own copy.
  if (
    normalized.includes('breach')
    || normalized.includes('pwned')
    || normalized.includes('compromis')
  ) {
    return 'This password has appeared in a known data breach. Please choose a new password that you have not used elsewhere.';
  }

  // Other Clerk password-policy failures remain actionable without exposing raw provider messages.
  if (
    normalized.includes('security requirement')
    || normalized.includes('validation')
    || normalized.includes('requirement')
    || normalized.includes('too short')
  ) {
    return 'Password does not meet the security requirements. Please choose a stronger password.';
  }

  return undefined;
}

function safeErrorMessage(status: number, detail?: string): string {
  if (status === 401 || status === 403) {
    return 'Registration could not be completed with the information provided. Please review it and try again.';
  }
  if (status === 409) {
    return 'A registration with these details already exists.';
  }
  if (status === 422) {
    return safePasswordMessage(detail)
      ?? 'We could not validate the registration details. Please review them and try again.';
  }
  if (status === 429) {
    return 'Too many attempts. Please wait a moment and try again.';
  }
  if (status >= 500) {
    return 'Registration is temporarily unavailable. Please try again.';
  }
  return 'We could not complete the request. Please review your information and try again.';
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
    const code = typeof record?.code === 'string' ? record.code : undefined;
    const detail = typeof record?.detail === 'string' ? record.detail : undefined;
    throw new SecurityApiError(safeErrorMessage(response.status, detail), response.status, code);
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
