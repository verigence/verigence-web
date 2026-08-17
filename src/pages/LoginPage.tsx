import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import VerigenceButton from '../components/VerigenceButton';
import { assetUrl } from '../services/assets';
import { useSessionStore } from '../store/sessionStore';

export default function LoginPage() {
  const navigate = useNavigate();
  const signInPreview = useSessionStore((state) => state.signInPreview);
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!identifier.trim() || !password) return;

    // Authentication will be connected to the approved backend flow later.
    // This Web-only bridge exists only so the completed screens remain navigable during Web review.
    signInPreview(identifier.trim());
    navigate('/dashboard');
  };

  return (
    <main className="auth-page">
      <section className="auth-page__brand">
        <img
          src={assetUrl('brand/approved/verigence-lockup.svg')}
          alt="Verigence — evidence, verify, everywhere."
        />
        <div>
          <span className="auth-page__kicker">Evidence first</span>
          <h1>Capture. Verify. Act with confidence.</h1>
          <p>
            Verigence connects source evidence, extracted facts, reviews and findings without asking
            teams to re-enter information that already exists.
          </p>
        </div>
      </section>

      <section className="auth-page__form-wrap">
        <form className="auth-card auth-form" onSubmit={submit}>
          <img
            className="auth-card__logo"
            src={assetUrl('brand/approved/verigence-lockup.svg')}
            alt="Verigence"
          />
          <div className="auth-form__heading">
            <h2>Welcome back</h2>
            <p>Sign in to continue to Verigence.</p>
          </div>

          <label className="plain-field">
            <span>Email or mobile number</span>
            <input
              value={identifier}
              onChange={(event) => setIdentifier(event.target.value)}
              autoComplete="username"
              placeholder="Enter email or mobile"
            />
          </label>

          <label className="plain-field">
            <span>Password</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              placeholder="Enter password"
            />
          </label>

          <div className="auth-form__utility">
            <button type="button" className="auth-text-link">Forgot password?</button>
          </div>

          <VerigenceButton
            type="submit"
            expand="block"
            disabled={!identifier.trim() || !password}
          >
            Sign in
          </VerigenceButton>

          <div className="auth-card__divider"><span>New to Verigence?</span></div>
          <Link className="secondary-link-button" to="/signup">Create account</Link>
        </form>
      </section>
    </main>
  );
}
