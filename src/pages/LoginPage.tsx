import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import VerigenceButton from '../components/VerigenceButton';
import type { UserRole } from '../domain/models';
import { assetUrl } from '../services/assets';
import { useSessionStore } from '../store/sessionStore';

export default function LoginPage() {
  const navigate = useNavigate();
  const signInPreview = useSessionStore((state) => state.signInPreview);
  const setAccessToken = useSessionStore((state) => state.setAccessToken);
  const [email, setEmail] = useState('pc@verigence.example');
  const [role, setRole] = useState<UserRole>('PC');
  const [accessToken, setDevelopmentToken] = useState('');

  return (
    <main className="auth-page">
      <section className="auth-page__brand">
        <img src={assetUrl('brand/svg/verigence-hero-lockup.svg')} alt="Verigence" />
        <div>
          <span className="auth-page__kicker">Audit • Governance • Intelligence</span>
          <h1>Evidence-led control for every customer journey.</h1>
          <p>Verigence keeps source evidence, extracted facts, review decisions and findings connected without making the audit team re-key what already exists.</p>
        </div>
      </section>

      <section className="auth-page__form-wrap">
        <div className="auth-card">
          <img className="auth-card__logo" src={assetUrl('brand/svg/verigence-logo.svg')} alt="Verigence" />
          <span className="eyebrow">Development access</span>
          <h2>Sign in</h2>
          <p>Use the current development identity bridge while Web is being completed. Supported business screens call Audit Core directly.</p>

          <label className="plain-field">
            <span>Work email</span>
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" />
          </label>

          <label className="plain-field">
            <span>Development role</span>
            <select value={role} onChange={(event) => setRole(event.target.value as UserRole)}>
              <option value="PC">Process Consultant</option>
              <option value="TL">Team Lead</option>
              <option value="PM">Project Manager</option>
              <option value="CRM">CRM Operator</option>
              <option value="TENANT_ADMIN">Tenant Admin</option>
              <option value="SUPER_ADMIN">Super Admin</option>
            </select>
          </label>

          <label className="plain-field">
            <span>Development Security token</span>
            <input
              type="password"
              value={accessToken}
              onChange={(event) => setDevelopmentToken(event.target.value)}
              autoComplete="off"
              placeholder="Paste current Bearer JWT for end-to-end testing"
            />
            <small>The token is kept only in the current Web session and is sent to Audit Core as a Bearer token.</small>
          </label>

          <VerigenceButton
            expand="block"
            disabled={!email.includes('@')}
            onClick={() => {
              signInPreview(email, role);
              setAccessToken(accessToken.trim() || undefined);
              navigate('/dashboard');
            }}
          >
            Continue to Verigence
          </VerigenceButton>

          <div className="auth-card__divider"><span>New to Verigence?</span></div>
          <Link className="secondary-link-button" to="/signup">Request access</Link>

          <div className="auth-card__security">
            <strong>Development only.</strong>
            <span>The temporary email/role/token bridge will be removed when the production authentication flow is connected. It does not change Audit Core authorization.</span>
          </div>
        </div>
      </section>
    </main>
  );
}
