export interface PasswordResetAttemptResponse {
  passwordResetAttemptId: string;
  status: 'EMAIL_VERIFICATION_REQUIRED';
  expiresAt: string;
  message: string;
}

export interface PasswordResetCompleteResponse {
  status: 'PASSWORD_RESET_COMPLETED';
  message: string;
}

export class PasswordRecoveryError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'PasswordRecoveryError';
    this.status = status;
  }
}

const configuredSecurityBaseUrl = import.meta.env.VITE_SECURITY_BASE_URL?.trim();
const securityBaseUrl = configuredSecurityBaseUrl?.replace(/\/$/, '') ?? '';

function endpoint(path: string): string {
  return `${securityBaseUrl}${path}`;
}

async function readResponse<T>(response: Response): Promise<T> {
  const contentType = response.headers.get('content-type') ?? '';
  const payload: unknown = contentType.includes('json')
    ? await response.json().catch(() => undefined)
    : await response.text().catch(() => undefined);

  if (!response.ok) {
    const record = typeof payload === 'object' && payload !== null
      ? payload as Record<string, unknown>
      : undefined;
    const detail = typeof record?.detail === 'string' ? record.detail : undefined;
    const message = detail
      || (typeof record?.title === 'string' ? record.title : undefined)
      || (typeof payload === 'string' ? payload : undefined)
      || 'Password recovery could not be completed. Please try again.';
    throw new PasswordRecoveryError(message, response.status);
  }

  return payload as T;
}

export async function startPasswordReset(email: string): Promise<PasswordResetAttemptResponse> {
  const response = await fetch(endpoint('/security/v1/auth/password-reset'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
    cache: 'no-store',
  });
  return readResponse<PasswordResetAttemptResponse>(response);
}

export async function resendPasswordResetCode(
  attemptId: string,
): Promise<PasswordResetAttemptResponse> {
  const response = await fetch(
    endpoint(`/security/v1/auth/password-reset/${encodeURIComponent(attemptId)}/resend`),
    { method: 'POST', cache: 'no-store' },
  );
  return readResponse<PasswordResetAttemptResponse>(response);
}

export async function cancelPasswordReset(attemptId: string): Promise<void> {
  const response = await fetch(
    endpoint(`/security/v1/auth/password-reset/${encodeURIComponent(attemptId)}/cancel`),
    { method: 'POST', cache: 'no-store' },
  );
  await readResponse<unknown>(response);
}

export async function completePasswordReset(
  attemptId: string,
  code: string,
  newPassword: string,
): Promise<PasswordResetCompleteResponse> {
  const response = await fetch(
    endpoint(`/security/v1/auth/password-reset/${encodeURIComponent(attemptId)}/complete`),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, newPassword }),
      cache: 'no-store',
    },
  );
  return readResponse<PasswordResetCompleteResponse>(response);
}
