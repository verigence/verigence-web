import { useEffect, useRef, useState, type ClipboardEvent, type FormEvent, type KeyboardEvent } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';

import { signupSchema, type SignupFormValues } from '../features/onboarding/signupSchema';
import {
  resendOnboardingEmailCode,
  startOnboarding,
  verifyOnboardingEmail,
  type SignupAttemptResponse,
} from '../services/security/onboarding';

const verigenceLockup = `${import.meta.env.BASE_URL}brand/approved/verigence-lockup.svg`;

const emptyValues: SignupFormValues = {
  firstName: '',
  lastName: '',
  email: '',
  mobile: '',
  password: '',
  verigenceIdentifier: '',
};

type SignupScreen = 'register' | 'verify' | 'complete';

export default function SignupPage() {
  const [screen, setScreen] = useState<SignupScreen>('register');
  const [attempt, setAttempt] = useState<SignupAttemptResponse | null>(null);
  const [verificationEmail, setVerificationEmail] = useState('');
  const [formError, setFormError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors },
  } = useForm<SignupFormValues>({ defaultValues: emptyValues });

  const submitRegistration = handleSubmit(async (values) => {
    setFormError(undefined);
    const parsed = signupSchema.safeParse(values);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (typeof field === 'string' && field in values) {
          setError(field as keyof SignupFormValues, { message: issue.message });
        }
      }
      return;
    }

    setBusy(true);
    try {
      const result = await startOnboarding(parsed.data);
      setAttempt(result);
      setVerificationEmail(parsed.data.email);
      reset(emptyValues);
      setShowPassword(false);
      setScreen('verify');
    } catch (error) {
      setFormError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  });

  if (screen === 'verify' && attempt) {
    return (
      <VerifyEmailScreen
        attempt={attempt}
        email={verificationEmail}
        onAttemptUpdated={setAttempt}
        onBack={() => {
          setAttempt(null);
          setScreen('register');
        }}
        onComplete={() => setScreen('complete')}
      />
    );
  }

  if (screen === 'complete') return <RegistrationReceivedScreen />;

  return (
    <main className="frozen-auth-screen">
      <article className="frozen-auth-card frozen-auth-card--register" aria-labelledby="register-title">
        <img className="frozen-auth-logo frozen-auth-logo--register" src={verigenceLockup} alt="Verigence — Audit, Governance, Intelligence" />

        <header className="frozen-auth-heading frozen-auth-heading--compact">
          <h1 id="register-title">Create your Verigence account</h1>
          <p>Fill in your details to get started.</p>
        </header>

        <form className="frozen-auth-form" onSubmit={submitRegistration} noValidate>
          <div className="frozen-auth-two-column">
            <Field label="First Name" error={errors.firstName?.message}>
              <span className="frozen-auth-input-wrap">
                <UserIcon />
                <input autoComplete="given-name" placeholder="Enter first name" {...register('firstName')} />
              </span>
            </Field>

            <Field label="Last Name" error={errors.lastName?.message}>
              <span className="frozen-auth-input-wrap">
                <UserIcon />
                <input autoComplete="family-name" placeholder="Enter last name" {...register('lastName')} />
              </span>
            </Field>
          </div>

          <Field label="Work email" error={errors.email?.message}>
            <span className="frozen-auth-input-wrap">
              <MailIcon />
              <input type="email" autoComplete="email" placeholder="name@verigence.com" {...register('email')} />
            </span>
          </Field>

          <Field label="Mobile Number" error={errors.mobile?.message}>
            <span className="frozen-auth-mobile-row">
              <span className="frozen-auth-country-code" aria-label="India country code">
                <PhoneIcon />
                <strong>+91</strong>
                <span aria-hidden="true">⌄</span>
              </span>
              <span className="frozen-auth-input-wrap">
                <PhoneIcon />
                <input
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel-national"
                  maxLength={10}
                  placeholder="98765 43210"
                  {...register('mobile')}
                />
              </span>
            </span>
          </Field>

          <Field label="Password" error={errors.password?.message}>
            <span className="frozen-auth-input-wrap">
              <LockIcon />
              <input
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                placeholder="Create a strong password"
                {...register('password')}
              />
              <button
                className="frozen-auth-input-action"
                type="button"
                onClick={() => setShowPassword((current) => !current)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                <EyeIcon />
              </button>
            </span>
          </Field>

          <Field label="Verigence Onboarding Key" error={errors.verigenceIdentifier?.message}>
            <span className="frozen-auth-input-wrap">
              <KeyIcon />
              <input autoComplete="off" placeholder="Enter onboarding key" {...register('verigenceIdentifier')} />
            </span>
          </Field>

          <label className="frozen-auth-consent">
            <input type="checkbox" defaultChecked />
            <span>
              I agree to the Verigence <strong>Terms of Use</strong> and <strong>Privacy Policy</strong>
            </span>
          </label>

          {formError && <div className="frozen-auth-alert" role="alert">{formError}</div>}

          <button className="frozen-auth-primary" type="submit" disabled={busy}>
            {busy ? 'Registering…' : 'Register'}
          </button>
        </form>

        <p className="frozen-auth-footer">
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </article>
    </main>
  );
}

function VerifyEmailScreen({
  attempt,
  email,
  onAttemptUpdated,
  onBack,
  onComplete,
}: {
  attempt: SignupAttemptResponse;
  email: string;
  onAttemptUpdated: (attempt: SignupAttemptResponse) => void;
  onBack: () => void;
  onComplete: () => void;
}) {
  const [digits, setDigits] = useState<string[]>(() => Array(6).fill(''));
  const [error, setError] = useState<string>();
  const [resendNotice, setResendNotice] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);
  const inputs = useRef<Array<HTMLInputElement | null>>([]);
  const countdown = useExpiryCountdown(attempt.expiresAt);

  const setDigit = (index: number, raw: string) => {
    const digit = raw.replace(/\D/g, '').slice(-1);
    setResendNotice(undefined);
    setDigits((current) => {
      const next = [...current];
      next[index] = digit;
      return next;
    });
    if (digit && index < 5) inputs.current[index + 1]?.focus();
  };

  const onKeyDown = (index: number, event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Backspace' && !digits[index] && index > 0) {
      inputs.current[index - 1]?.focus();
    }
  };

  const onPaste = (event: ClipboardEvent<HTMLInputElement>) => {
    const pasted = event.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!pasted) return;
    event.preventDefault();
    setResendNotice(undefined);
    setDigits(Array.from({ length: 6 }, (_, index) => pasted[index] ?? ''));
    inputs.current[Math.min(pasted.length, 6) - 1]?.focus();
  };

  const verify = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(undefined);
    setResendNotice(undefined);
    const code = digits.join('');
    if (code.length !== 6) {
      setError('Enter the 6-digit verification code.');
      inputs.current[0]?.focus();
      return;
    }

    setBusy(true);
    try {
      await verifyOnboardingEmail(attempt.signupAttemptId, code);
      setDigits(Array(6).fill(''));
      onComplete();
    } catch (verificationError) {
      setError(errorMessage(verificationError));
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    setError(undefined);
    setResendNotice(undefined);
    setResending(true);
    try {
      const next = await resendOnboardingEmailCode(attempt.signupAttemptId);
      onAttemptUpdated(next);
      setDigits(Array(6).fill(''));
      setResendNotice('A new verification code was sent.');
      inputs.current[0]?.focus();
    } catch (resendError) {
      setError(errorMessage(resendError));
    } finally {
      setResending(false);
    }
  };

  return (
    <main className="frozen-auth-screen">
      <article className="frozen-auth-card frozen-auth-card--verify" aria-labelledby="verify-title">
        <img className="frozen-auth-logo" src={verigenceLockup} alt="Verigence — Audit, Governance, Intelligence" />

        <button className="frozen-auth-back" type="button" onClick={onBack}>‹ Back</button>

        <header className="frozen-auth-heading">
          <h1 id="verify-title">Verify your email</h1>
          <p>Enter the 6-digit code sent to</p>
          <strong>{email}</strong>
        </header>

        <form className="frozen-auth-otp-form" onSubmit={verify}>
          <div className="frozen-auth-otp" onPaste={onPaste}>
            {digits.map((digit, index) => (
              <input
                key={index}
                ref={(element) => { inputs.current[index] = element; }}
                value={digit}
                onChange={(event) => setDigit(index, event.target.value)}
                onKeyDown={(event) => onKeyDown(index, event)}
                inputMode="numeric"
                autoComplete={index === 0 ? 'one-time-code' : 'off'}
                maxLength={1}
                aria-label={`Verification digit ${index + 1}`}
              />
            ))}
          </div>

          <p className="frozen-auth-expiry">Code expires in <strong>{countdown}</strong></p>
          {resendNotice && <p className="frozen-auth-expiry" role="status">{resendNotice}</p>}
          {error && <div className="frozen-auth-alert" role="alert">{error}</div>}

          <button className="frozen-auth-primary" type="submit" disabled={busy || resending}>
            {busy ? 'Verifying…' : 'Verify code'}
          </button>
          <button className="frozen-auth-resend" type="button" onClick={resend} disabled={busy || resending}>
            {resending ? 'Sending…' : 'Resend code'}
          </button>
        </form>
      </article>
    </main>
  );
}

function RegistrationReceivedScreen() {
  return (
    <main className="frozen-auth-screen">
      <article className="frozen-auth-card frozen-auth-card--complete" aria-labelledby="complete-title">
        <img className="frozen-auth-logo" src={verigenceLockup} alt="Verigence — Audit, Governance, Intelligence" />

        <div className="frozen-auth-success" aria-hidden="true">
          <span>✓</span>
        </div>

        <header className="frozen-auth-heading frozen-auth-heading--complete">
          <h1 id="complete-title">Registration received</h1>
          <p>Thank you. Your registration has been received.</p>
          <p>Your registration is pending approval with Verigence Admin.</p>
        </header>

        <Link className="frozen-auth-primary frozen-auth-primary--link" to="/login">Back to sign in</Link>
      </article>
    </main>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="frozen-auth-field">
      <span>{label}</span>
      {children}
      {error && <small role="alert">{error}</small>}
    </label>
  );
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
  return error instanceof Error ? error.message : 'We could not complete the request. Please try again.';
}

function Icon({ children }: { children: React.ReactNode }) {
  return <svg className="frozen-auth-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{children}</svg>;
}

function UserIcon() {
  return <Icon><path d="M20 21a8 8 0 0 0-16 0" /><circle cx="12" cy="7" r="4" /></Icon>;
}

function MailIcon() {
  return <Icon><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></Icon>;
}

function PhoneIcon() {
  return <Icon><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.12.9.33 1.78.62 2.63a2 2 0 0 1-.45 2.11L8 9.73a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.85.29 1.73.5 2.63.62A2 2 0 0 1 22 16.92Z" /></Icon>;
}

function LockIcon() {
  return <Icon><rect x="5" y="10" width="14" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></Icon>;
}

function EyeIcon() {
  return <Icon><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" /><circle cx="12" cy="12" r="2.5" /></Icon>;
}

function KeyIcon() {
  return <Icon><circle cx="8" cy="15" r="4" /><path d="m11 12 9-9m-4 4 3 3m-6 0 3 3" /></Icon>;
}
