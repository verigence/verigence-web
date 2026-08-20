import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';

import verigenceLockup from '../assets/verigence-lockup.png';
import {
  cancelPasswordReset,
  completePasswordReset,
  resendPasswordResetCode,
  startPasswordReset,
  type PasswordResetAttemptResponse,
} from '../services/security/passwordRecovery';

type Screen = 'request' | 'verify' | 'complete';

export default function ForgotPasswordPage() {
  const [screen, setScreen] = useState<Screen>('request');
  const [email, setEmail] = useState('');
  const [attempt, setAttempt] = useState<PasswordResetAttemptResponse | null>(null);
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [busy, setBusy] = useState(false);

  const clearVerificationState = () => {
    setAttempt(null);
    setCode('');
    setNewPassword('');
    setConfirmPassword('');
    setShowPassword(false);
    setError(undefined);
    setNotice(undefined);
    setScreen('request');
  };

  const requestReset = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalized = email.trim().toLowerCase();
    if (!normalized) return;

    setError(undefined);
    setNotice(undefined);
    setBusy(true);
    try {
      const result = await startPasswordReset(normalized);
      setEmail(normalized);
      setAttempt(result);
      setScreen('verify');
      setNotice(result.message);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setBusy(false);
    }
  };

  const completeReset = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!attempt || busy) return;

    setError(undefined);
    setNotice(undefined);
    if (!/^\d{6}$/.test(code)) {
      setError('Enter the 6-digit verification code sent to your email.');
      return;
    }
    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters long.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('New password and confirmation do not match.');
      return;
    }

    setBusy(true);
    try {
      await completePasswordReset(attempt.passwordResetAttemptId, code, newPassword);
      setCode('');
      setNewPassword('');
      setConfirmPassword('');
      setShowPassword(false);
      setScreen('complete');
    } catch (resetError) {
      setError(errorMessage(resetError));
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    if (!attempt || busy) return;
    setError(undefined);
    setNotice(undefined);
    setBusy(true);
    try {
      const result = await resendPasswordResetCode(attempt.passwordResetAttemptId);
      setAttempt(result);
      setCode('');
      setNotice('A new verification code was sent to your registered email address.');
    } catch (resendError) {
      setError(errorMessage(resendError));
    } finally {
      setBusy(false);
    }
  };

  const cancelAndBack = async () => {
    if (!attempt || busy) return;
    setBusy(true);
    setError(undefined);
    try {
      await cancelPasswordReset(attempt.passwordResetAttemptId);
      clearVerificationState();
    } catch (cancelError) {
      setError(errorMessage(cancelError));
    } finally {
      setBusy(false);
    }
  };

  if (screen === 'complete') {
    return (
      <main className="frozen-auth-screen">
        <article className="frozen-auth-card frozen-auth-card--complete" aria-labelledby="reset-complete-title">
          <img className="frozen-auth-logo" src={verigenceLockup} alt="Verigence — Audit, Governance, Intelligence" />
          <div className="frozen-auth-success" aria-hidden="true"><span>✓</span></div>
          <header className="frozen-auth-heading frozen-auth-heading--complete">
            <h1 id="reset-complete-title">Password reset complete</h1>
            <p>Your password has been updated successfully.</p>
            <p>For your security, existing sessions have been signed out.</p>
          </header>
          <Link className="frozen-auth-primary frozen-auth-primary--link" to="/login">Back to sign in</Link>
        </article>
      </main>
    );
  }

  if (screen === 'verify' && attempt) {
    return (
      <main className="frozen-auth-screen">
        <article className="frozen-auth-card frozen-auth-card--verify" aria-labelledby="reset-title">
          <img className="frozen-auth-logo" src={verigenceLockup} alt="Verigence — Audit, Governance, Intelligence" />
          <button
            className="frozen-auth-back"
            type="button"
            onClick={cancelAndBack}
            disabled={busy}
          >
            ‹ Back
          </button>

          <header className="frozen-auth-heading frozen-auth-heading--compact">
            <h1 id="reset-title">Reset your password</h1>
            <p>Enter the verification code sent to your registered email.</p>
            <strong>{email}</strong>
          </header>

          <form className="frozen-auth-form" onSubmit={completeReset} noValidate>
            <label className="frozen-auth-field">
              <span>Verification code</span>
              <span className="frozen-auth-input-wrap">
                <KeyIcon />
                <input
                  value={code}
                  onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="6-digit code"
                  maxLength={6}
                  disabled={busy}
                />
              </span>
            </label>

            <label className="frozen-auth-field">
              <span>New password</span>
              <span className="frozen-auth-input-wrap">
                <LockIcon />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  autoComplete="new-password"
                  placeholder="Enter new password"
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

            <label className="frozen-auth-field">
              <span>Confirm new password</span>
              <span className="frozen-auth-input-wrap">
                <LockIcon />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  autoComplete="new-password"
                  placeholder="Re-enter new password"
                  disabled={busy}
                />
              </span>
            </label>

            <ExpiryCountdown expiresAt={attempt.expiresAt} />
            {notice && <p className="frozen-auth-notice" role="status">{notice}</p>}
            {error && <div className="frozen-auth-alert" role="alert">{error}</div>}

            <button
              className="frozen-auth-primary"
              type="submit"
              disabled={busy || code.length !== 6 || newPassword.length < 8 || !confirmPassword}
            >
              {busy ? 'Updating…' : 'Reset password'}
            </button>
            <button className="frozen-auth-resend" type="button" onClick={resend} disabled={busy}>
              Resend code
            </button>
          </form>
        </article>
      </main>
    );
  }

  return (
    <main className="frozen-auth-screen">
      <article className="frozen-auth-card frozen-auth-card--login" aria-labelledby="forgot-password-title">
        <img className="frozen-auth-logo" src={verigenceLockup} alt="Verigence — Audit, Governance, Intelligence" />

        <header className="frozen-auth-heading">
          <h1 id="forgot-password-title">Forgot password?</h1>
          <p>Enter your registered work email to receive a verification code.</p>
        </header>

        <form className="frozen-auth-form" onSubmit={requestReset}>
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

          {error && <div className="frozen-auth-alert" role="alert">{error}</div>}
          <button className="frozen-auth-primary" type="submit" disabled={busy || !email.trim()}>
            {busy ? 'Sending…' : 'Send verification code'}
          </button>
        </form>

        <p className="frozen-auth-footer"><Link to="/login">Back to sign in</Link></p>
      </article>
    </main>
  );
}

function ExpiryCountdown({ expiresAt }: { expiresAt: string }) {
  const countdown = useExpiryCountdown(expiresAt);
  return <p className="frozen-auth-expiry">Code expires in <strong>{countdown}</strong></p>;
}

function useExpiryCountdown(expiresAt: string): string {
  const calculate = () => Math.max(0, new Date(expiresAt).getTime() - Date.now());
  const [remaining, setRemaining] = useState(calculate);

  useEffect(() => {
    setRemaining(calculate());
    const timer = window.setInterval(() => setRemaining(calculate()), 1000);
    return () => window.clearInterval(timer);
  }, [expiresAt]);

  const seconds = Math.floor(remaining / 1000);
  const minutesPart = Math.floor(seconds / 60).toString().padStart(2, '0');
  const secondsPart = (seconds % 60).toString().padStart(2, '0');
  return `${minutesPart}:${secondsPart}`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Password recovery could not be completed. Please try again.';
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

function KeyIcon() {
  return <Icon><circle cx="8" cy="15" r="4" /><path d="m11 12 8-8" /><path d="m15 8 2 2" /><path d="m17 6 2 2" /></Icon>;
}

function EyeIcon() {
  return <Icon><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" /><circle cx="12" cy="12" r="2.5" /></Icon>;
}
