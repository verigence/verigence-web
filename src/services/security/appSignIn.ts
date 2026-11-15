// Signing in to another Verigence app (SevaSutra) from this app (product owner, 15 Nov 2026). The other app
// opens this one with verigence://sso?client=…&challenge=…&state=…&host=…; the person confirms; Security gives a
// one-time code for that app (bound to its PKCE challenge); this app hands the code back to the other app, whose
// server exchanges it for the person's sign-in. No password or token of this app leaves it.

const securityBaseUrl = (import.meta.env.VITE_SECURITY_BASE_URL?.trim() ?? '').replace(/\/$/, '');

/** Apps that can be signed in to from here, and where their code is handed back. */
export const SIGN_IN_APPS: Record<string, { name: string; redirectUri: string; hostSuffix: string }> = {
  sevasutra: { name: 'SevaSutra', redirectUri: 'sevasutra://sso', hostSuffix: 'sevasutra.jbrconsulting.in' },
};

export interface AppSignInRequest {
  client: string;
  challenge: string;
  state: string;
  host: string;
}

const PENDING_KEY = 'verigence.app-sign-in.pending.v1';

/** The request in an incoming link or the page's query; null when it is not one this app accepts. */
export function readAppSignInRequest(params: URLSearchParams): AppSignInRequest | null {
  const client = params.get('client') ?? '';
  const challenge = params.get('challenge') ?? '';
  const state = params.get('state') ?? '';
  const host = (params.get('host') ?? '').toLowerCase();
  const app = SIGN_IN_APPS[client];
  if (!app) return null;
  if (!/^[A-Za-z0-9_-]{43,128}$/.test(challenge) || !/^[A-Za-z0-9_-]{16,128}$/.test(state)) return null;
  // The code goes back only to the app's own addresses.
  if (!(host === app.hostSuffix || host.endsWith(`.${app.hostSuffix}`)) || !/^[a-z0-9.-]+$/.test(host)) return null;
  return { client, challenge, state, host };
}

/** Kept while the person signs in to this app first. */
export function keepPendingAppSignIn(request: AppSignInRequest | null): void {
  try {
    if (request) window.sessionStorage.setItem(PENDING_KEY, JSON.stringify(request));
    else window.sessionStorage.removeItem(PENDING_KEY);
  } catch {
    // Without storage the person opens the other app again after signing in.
  }
}

export function pendingAppSignIn(): AppSignInRequest | null {
  try {
    const raw = window.sessionStorage.getItem(PENDING_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Record<string, string>;
    return readAppSignInRequest(new URLSearchParams(value));
  } catch {
    return null;
  }
}

/** Asks Security for the one-time code, with the person's own sign-in. */
export async function appSignInCode(accessToken: string, request: AppSignInRequest): Promise<string> {
  const response = await fetch(`${securityBaseUrl}/security/v1/auth/app-sign-in/code`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ client: request.client, redirectUri: SIGN_IN_APPS[request.client].redirectUri, codeChallenge: request.challenge, codeChallengeMethod: 'S256' }),
    cache: 'no-store',
  });
  const payload = (await response.json().catch(() => undefined)) as { code?: string; detail?: string } | undefined;
  if (!response.ok || !payload?.code) {
    throw new Error(response.status === 401 ? 'Your Verigence sign-in has ended. Sign in again, then try once more.' : 'Could not sign you in just now. Try again.');
  }
  return payload.code;
}

/** Where this app sends the person back to the other app with the code. */
export function returnUrl(request: AppSignInRequest, result: { code?: string; error?: string }): string {
  const q = new URLSearchParams({ state: request.state, host: request.host, ...(result.code ? { code: result.code } : { error: result.error ?? 'cancelled' }) });
  return `${SIGN_IN_APPS[request.client].redirectUri}?${q.toString()}`;
}
