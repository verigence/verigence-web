import { Link } from 'react-router-dom';

import verigenceLockup from '../assets/verigence-lockup.png';

export default function TermsPage() {
  return (
    <main className="legal-screen">
      <article className="legal-card" aria-labelledby="terms-title">
        <Link className="legal-brand" to="/login" aria-label="Back to Verigence sign in">
          <img src={verigenceLockup} alt="Verigence — Audit, Governance, Intelligence" />
        </Link>

        <header className="legal-heading">
          <p className="legal-kicker">Interim legal notice</p>
          <h1 id="terms-title">Terms of Use</h1>
          <p>Last updated: 20 August 2026</p>
        </header>

        <div className="legal-disclaimer" role="note">
          <strong>General disclaimer:</strong> These are temporary, general terms provided while
          Verigence prepares its formally reviewed legal terms. They are intended to communicate
          basic expectations for use of the service and should not be treated as a substitute for
          final contractual terms approved by legal counsel.
        </div>

        <section>
          <h2>1. Use of Verigence</h2>
          <p>
            Verigence is provided for authorized business use. You should use the service only for
            lawful purposes, within the permissions granted to your account and organization.
          </p>
        </section>

        <section>
          <h2>2. Account responsibility</h2>
          <p>
            Keep your login credentials confidential and do not share access with unauthorized
            persons. You are responsible for activity performed through your account to the extent
            permitted by applicable law and your organization&apos;s policies.
          </p>
        </section>

        <section>
          <h2>3. Information and content</h2>
          <p>
            Users should upload or enter only information they are authorized to use. Do not submit
            unlawful, misleading, malicious, infringing, or confidential information that you are
            not permitted to provide to Verigence.
          </p>
        </section>

        <section>
          <h2>4. Service availability</h2>
          <p>
            Verigence may change, maintain, suspend, or improve features as the platform develops.
            Development and preview environments may be changed or interrupted without notice.
          </p>
        </section>

        <section>
          <h2>5. Security and misuse</h2>
          <p>
            You must not attempt to bypass access controls, probe the service for unauthorized
            access, introduce harmful code, or interfere with the operation of Verigence or its
            connected services.
          </p>
        </section>

        <section>
          <h2>6. Limitation of this interim notice</h2>
          <p>
            Specific warranties, liability provisions, intellectual-property terms, dispute terms,
            service levels, and jurisdiction-specific requirements will be addressed in the final
            legally reviewed terms. Until then, this page is a general operational notice only.
          </p>
        </section>

        <section>
          <h2>7. Changes</h2>
          <p>
            Verigence may replace this interim notice with updated or formally approved terms. The
            effective date shown on this page will be updated when material changes are published.
          </p>
        </section>

        <footer className="legal-footer">
          <Link to="/privacy">Privacy Policy</Link>
          <span aria-hidden="true">•</span>
          <Link to="/signup">Create account</Link>
          <span aria-hidden="true">•</span>
          <Link to="/login">Sign in</Link>
        </footer>
      </article>
    </main>
  );
}
