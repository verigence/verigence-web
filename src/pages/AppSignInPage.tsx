import { useEffect, useMemo, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';

import { verigenceLockup } from '../assets/verigenceLockup';
import {
  appSignInCode,
  keepPendingAppSignIn,
  pendingAppSignIn,
  readAppSignInRequest,
  returnUrl,
  SIGN_IN_APPS,
} from '../services/security/appSignIn';
import { useSessionStore } from '../store/sessionStore';

/**
 * "Sign in to SevaSutra as …?" — opened by the SevaSutra app on the same phone (verigence://sso). The person
 * confirms once; SevaSutra opens signed in. Not signed in here yet: they sign in first and come back.
 */
export default function AppSignInPage() {
  const location = useLocation();
  const signedIn = useSessionStore((state) => state.signedIn);
  const accessToken = useSessionStore((state) => state.accessToken);
  const displayName = useSessionStore((state) => state.displayName);
  const email = useSessionStore((state) => state.email);
  const request = useMemo(() => readAppSignInRequest(new URLSearchParams(location.search)) ?? pendingAppSignIn(), [location.search]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (request) keepPendingAppSignIn(request);
  }, [request]);

  if (!request) {
    return (
      <main className="frozen-auth-screen">
        <article className="frozen-auth-card frozen-auth-card--login">
          <img className="frozen-auth-logo" src={verigenceLockup} alt="Verigence — Audit, Governance, Intelligence" />
          <header className="frozen-auth-heading">
            <h1>Nothing to sign in to</h1>
            <p>Open the other app again and choose "Sign in with the Verigence app".</p>
          </header>
        </article>
      </main>
    );
  }
  if (!signedIn || !accessToken) return <Navigate to="/login?returnTo=%2Fapp-sign-in" replace />;

  const app = SIGN_IN_APPS[request.client];
  const leave = (url: string) => {
    keepPendingAppSignIn(null);
    window.location.href = url;
  };
  const allow = async () => {
    setBusy(true);
    setError(undefined);
    try {
      const code = await appSignInCode(accessToken, request);
      leave(returnUrl(request, { code }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not sign you in just now. Try again.');
      setBusy(false);
    }
  };

  return (
    <main className="frozen-auth-screen">
      <article className="frozen-auth-card frozen-auth-card--login" aria-labelledby="app-sign-in-title">
        <img className="frozen-auth-logo" src={verigenceLockup} alt="Verigence — Audit, Governance, Intelligence" />
        <header className="frozen-auth-heading">
          <h1 id="app-sign-in-title">Sign in to {app.name}</h1>
          <p>
            As <b>{displayName || email}</b>{email && displayName && displayName !== email ? ` (${email})` : ''}. {app.name} opens signed in with your Verigence account; your password is not shared.
          </p>
        </header>
        {error ? <div className="frozen-auth-alert" role="alert">{error}</div> : null}
        <div className="frozen-auth-form">
          <button className="frozen-auth-primary" type="button" disabled={busy} onClick={() => void allow()}>
            {busy ? 'Signing in…' : `Continue to ${app.name}`}
          </button>
          <button className="frozen-auth-text-link" type="button" disabled={busy} onClick={() => leave(returnUrl(request, { error: 'cancelled' }))}>
            Cancel
          </button>
        </div>
      </article>
    </main>
  );
}
