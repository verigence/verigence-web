/** SuperAdmin report from Security: who tried to sign in, who got in, who has the Android app. */

const securityBaseUrl = (import.meta.env.VITE_SECURITY_BASE_URL?.trim() ?? '').replace(/\/$/, '');

export type LoginState = 'APP_SIGNED_IN' | 'DOWNLOADED' | 'WEB_ONLY' | 'TRIED_FAILED' | 'NOT_TRIED';

export interface LoginPerson {
  userId: string;
  name: string;
  email: string;
  userStatus: string;
  isEmployee: boolean;
  state: LoginState;
  loginsOk: number;
  loginsFailed: number;
  appLogins: number;
  webLogins: number;
  firstLoginAt: string | null;
  lastLoginAt: string | null;
  lastAttemptAt: string | null;
  lastOutcome: 'SUCCESS' | 'FAILED' | null;
  lastReason: string | null;
  appVersion: string | null;
  downloads: number;
  firstDownloadAt: string | null;
  lastDownloadAt: string | null;
}

export interface UnknownAttempt {
  identifier: string;
  attempts: number;
  lastAt: string | null;
}

export interface LoginActivityReport {
  people: LoginPerson[];
  unknown: UnknownAttempt[];
}

export async function getLoginActivity(accessToken: string): Promise<LoginActivityReport> {
  const response = await fetch(`${securityBaseUrl}/security/v1/admin/login-activity`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  const payload: unknown = await response.json().catch(() => undefined);
  if (!response.ok) {
    const detail = (payload as { detail?: unknown } | undefined)?.detail;
    throw new Error(typeof detail === 'string' && detail ? detail : 'The report could not be loaded. Please try again.');
  }
  return payload as LoginActivityReport;
}
