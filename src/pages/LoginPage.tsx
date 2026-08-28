import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';

import { verigenceLockup } from '../assets/verigenceLockup';
import {
  resetOperationalContext,
  restoreOperationalContextHint,
} from '../features/uc03/projectContext';
import { supportReference } from '../observability/correlation';
import { getVerigenceDeviceContext } from '../services/device/identity';
import { getCurrentLocation } from '../services/device/location';
import {
  SecurityLoginError,
  loginErrorMessage,
  loginHuman,
} from '../services/security/auth';
import { useSessionStore } from '../store/sessionStore';

interface LoginErrorState {
  message: string;
  reference?: string;
}

function locationRequiredMessage(error: unknown): string {
  const code = typeof error === 'object' && error !== null && 'code' in error
    ? (error as { code?: unknown }).code
    : undefined;
  if (code === 1 || code === 'PERMISSION_DENIED') {
    return 'Location access is required to use Verigence. Please allow location access in your browser and try again.';
  }
  return 'Verigence could not determine your location. Please enable location services and try again.';
}

export default function LoginPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const signInAuthenticated = useSessionStore((state) => state.signInAuthenticated);
  const locationRequest = useRef<ReturnType<typeof getCurrentLocation> | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [keepSignedIn, setKeepSignedIn] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<LoginErrorState>();

  const requireLocation = async () => {
    if (!locationRequest.current) {
      locationRequest.current = getCurrentLocation();
    }
    try {
      return await locationRequest.current;
    } catch (locationError) {
      locationRequest.current = null;
      throw locationError;
    }
  };

  useEffect(() => {
    // Wake Railway-backed runtime services while the USER is typing credentials.
    // This is deliberately best-effort and carries no authentication or USER data.
    void fetch('/runtime-warmup', {
      method: 'GET',
      cache: 'no-store',
      keepalive: true,
    }).catch(() => undefined);
    // Generate/read the Verigence installation UUID locally while the login page is idle. This
    // performs no network request and therefore does not extend the credential-login critical path.
    getVerigenceDeviceContext();
    // Start the mandatory location request while the USER is entering credentials so the normal
    // case does not add perceived login time. Login still refuses to proceed unless this resolves.
    void requireLocation().catch(() => undefined);
  }, []);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!email.trim() || !password || busy) return;

    setError(undefined);
    setBusy(true);
    try {
      try {
        await requireLocation();
      } catch (locationError) {
        setError({ message: locationRequiredMessage(locationError) });
        return;
      }

      const identifier = email.trim();
      const device = getVerigenceDeviceContext();
      const login = await loginHuman(identifier, password, device);
      const superAdmin = login.isSuperAdmin;

      resetOperationalContext(queryClient);
      signInAuthenticated(
        identifier,
        login.accessToken,
        superAdmin ? 'SUPER_ADMIN' : 'PC',
        login.expiresAtUtc,
        login.sessionId,
        login.deviceId,
      );
      if (!superAdmin) {
        restoreOperationalContextHint(login.accessToken, queryClient);
      }
      setPassword('');
      navigate(superAdmin ? '/approvals' : '/dashboard', { replace: true });
    } catch (loginError) {
      setError({
        message: loginErrorMessage(loginError),
        reference: loginError instanceof SecurityLoginError
          ? supportReference(loginError.correlationId)
          : undefined,
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="frozen-auth-screen">
      <article className="frozen-auth-card frozen-auth-card--login" aria-labelledby="sign-in-title">
        <img className="frozen-auth-logo" src={verigenceLockup} alt="Verigence — Audit, Governance, Intelligence" />

        <header className="frozen-auth-heading">
          <h1 id="sign-in-title">Sign in</h1>
          <p>Use your work email.</p>
        </header>

        <form className="frozen-auth-form" onSubmit={submit}>
          <label className="frozen-auth-field">
            <span>Email</span>
            <span className="frozen-auth-input-wrap">
              <MailIcon />
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                placeholder="Enter your work email"
                disabled={busy}
              />
            </span>
          </label>

          <label className="frozen-auth-field">
            <span>Password</span>
            <span className="frozen-auth-input-wrap">
              <LockIcon />
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                placeholder="Enter your password"
                disabled={busy}
              />
              <button
                className="frozen-auth-input-action"
                type="button"
                onClick={() => setShowPassword((current) => !current)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                disabled={busy}
              >
                <EyeIcon />
              </button>
            </span>
          </label>

          <div className="frozen-auth-utility">
            <label className="frozen-auth-remember">
              <input
                type="checkbox"
                checked={keepSignedIn}
                onChange={(event) => setKeepSignedIn(event.target.checked)}
                disabled={busy}
              />
              <span>Keep me signed in</span>
            </label>
            <Link className="frozen-auth-text-link" to="/forgot-password">Forgot password?</Link>
          </div>

          {error && (
            <div className="frozen-auth-alert" role="alert">
              <div>{error.message}</div>
              {error.reference && <div>Reference: {error.reference}</div>}
            </div>
          )}

          <button className="frozen-auth-primary" type="submit" disabled={busy || !email.trim() || !password}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <div className="frozen-auth-divider"><span>or</span></div>
        <p className="frozen-auth-footer frozen-auth-footer--login">
          New to Verigence? <Link to="/signup">Register Now</Link>
        </p>
        <p className="frozen-auth-footer frozen-auth-footer--legal">
          For security and audit controls, Verigence records the device and location from which the application is accessed. Location access is required to use the application.
        </p>
        <p className="frozen-auth-footer frozen-auth-footer--legal">
          <Link to="/terms">Terms of Use</Link> · <Link to="/privacy">Privacy Policy</Link>
        </p>
      </article>
    </main>
  );
}

function Icon({ children }: { children: ReactNode }) {
  return <svg className="frozen-auth-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{children}</svg>;
}

function MailIcon() {
  return <Icon><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></Icon>;
}

function LockIcon() {
  return <Icon><rect x="5" y="10" width="14" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></Icon>;
}

function EyeIcon() {
  return <Icon><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" /><circle cx="12" cy="12" r="2.5" /></Icon>;
}
