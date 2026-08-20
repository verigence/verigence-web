import { Link } from 'react-router-dom';

import verigenceLockup from '../assets/verigence-lockup.png';

export default function PrivacyPage() {
  return (
    <main className="legal-screen">
      <article className="legal-card" aria-labelledby="privacy-title">
        <Link className="legal-brand" to="/login" aria-label="Back to Verigence sign in">
          <img src={verigenceLockup} alt="Verigence — Audit, Governance, Intelligence" />
        </Link>

        <header className="legal-heading">
          <p className="legal-kicker">Interim legal notice</p>
          <h1 id="privacy-title">Privacy Policy</h1>
          <p>Last updated: 20 August 2026</p>
        </header>

        <div className="legal-disclaimer" role="note">
          <strong>General disclaimer:</strong> This is a temporary, general privacy notice while
          Verigence prepares a formally reviewed policy. It describes the intended handling of
          information at a high level and does not replace jurisdiction-specific disclosures,
          contractual commitments, or final legal documentation.
        </div>

        <section>
          <h2>1. Information we may process</h2>
          <p>
            Verigence may process account and profile information, authentication and security
            events, organization and role information, audit-work data submitted by authorized
            users, device or technical information, and service-usage records needed to operate and
            protect the platform.
          </p>
        </section>

        <section>
          <h2>2. How information may be used</h2>
          <p>
            Information may be used to provide the service, authenticate users, administer access,
            support audit and governance workflows, maintain security, investigate operational
            issues, improve the platform, and meet applicable business or legal requirements.
          </p>
        </section>

        <section>
          <h2>3. Service providers and sharing</h2>
          <p>
            Verigence may use service providers that support hosting, authentication, messaging,
            monitoring, storage, and other platform operations. Information should be shared only
            as needed for authorized operations, legal requirements, or protection of the service.
          </p>
        </section>

        <section>
          <h2>4. Security</h2>
          <p>
            Verigence is designed to use access controls and security safeguards appropriate to the
            service. No online system can guarantee absolute security, and users should also protect
            their credentials, devices, and authorized access.
          </p>
        </section>

        <section>
          <h2>5. Retention</h2>
          <p>
            Information may be retained for as long as reasonably needed for service operation,
            security, auditability, contractual obligations, or applicable legal requirements. More
            specific retention periods will be addressed in the finalized privacy documentation.
          </p>
        </section>

        <section>
          <h2>6. Your organization and privacy requests</h2>
          <p>
            Depending on how Verigence is provided, your employer or organization may determine how
            certain business data is used. Requests concerning access, correction, deletion, or
            other privacy rights should be directed through the applicable Verigence or organization
            support channel once formally published.
          </p>
        </section>

        <section>
          <h2>7. Changes</h2>
          <p>
            This interim notice may be replaced or updated as Verigence completes its legal and
            privacy review. The effective date above will be updated when material changes are
            published.
          </p>
        </section>

        <footer className="legal-footer">
          <Link to="/terms">Terms of Use</Link>
          <span aria-hidden="true">•</span>
          <Link to="/signup">Create account</Link>
          <span aria-hidden="true">•</span>
          <Link to="/login">Sign in</Link>
        </footer>
      </article>
    </main>
  );
}
