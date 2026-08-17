import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import VerigenceButton from '../components/VerigenceButton';
import type { UserRole } from '../domain/models';
import { runtimeConfig } from '../services/runtime';
import { useSessionStore } from '../store/sessionStore';

export default function LoginPage() {
  const navigate = useNavigate();
  const signInPreview = useSessionStore((state) => state.signInPreview);
  const [email, setEmail] = useState('pc@verigence.example');
  const [role, setRole] = useState<UserRole>('PC');

  return (
    <main className="auth-page">
      <section className="auth-page__brand">
        <img src="/brand/svg/verigence-hero-lockup.svg" alt="Verigence" />
        <div>
          <span className="auth-page__kicker">Audit • Governance • Intelligence</span>
          <h1>Evidence-led control for every customer journey.</h1>
          <p>Verigence keeps source evidence, extracted facts, review decisions and findings connected without making the audit team re-key what already exists.</p>
        </div>
      </section>

      <section className="auth-page__form-wrap">
        <div className="auth-card">
          <img className="auth-card__logo" src="/brand/svg/verigence-logo.svg" alt="Verigence" />
          <span className="eyebrow">Approved users</span>
          <h2>Sign in</h2>
          <p>{runtimeConfig.mode === 'demo' ? 'Use Web Preview to walk every role while the UI is being completed.' : 'Production authentication will be activated after Web sign-off without changing these screens.'}</p>

          <label className="plain-field">
            <span>Work email</span>
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" />
          </label>

          {runtimeConfig.mode === 'demo' && (
            <label className="plain-field">
              <span>Preview role</span>
              <select value={role} onChange={(event) => setRole(event.target.value as UserRole)}>
                <option value="PC">Process Consultant</option>
                <option value="TL">Team Lead</option>
                <option value="PM">Project Manager</option>
                <option value="CRM">CRM Operator</option>
                <option value="TENANT_ADMIN">Tenant Admin</option>
                <option value="SUPER_ADMIN">Super Admin</option>
              </select>
            </label>
          )}

          <VerigenceButton
            expand="block"
            disabled={!email.includes('@')}
            onClick={() => {
              signInPreview(email, role);
              navigate('/dashboard');
            }}
          >
            {runtimeConfig.mode === 'demo' ? 'Enter Web Preview' : 'Continue with Verigence'}
          </VerigenceButton>

          <div className="auth-card__divider"><span>New to Verigence?</span></div>
          <Link className="secondary-link-button" to="/signup">Request access</Link>

          <div className="auth-card__security">
            <strong>Approval is mandatory.</strong>
            <span>Signing up never grants a role. Access becomes usable only after administrative approval and Security activation.</span>
          </div>
        </div>
      </section>
    </main>
  );
}
