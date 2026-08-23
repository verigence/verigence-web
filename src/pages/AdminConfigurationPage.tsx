import { Link, useSearchParams } from 'react-router-dom';

import PageHeader from '../components/PageHeader';

type AdminSection = 'engagements' | 'activity' | 'roles' | 'audit-rules' | 'approval-workflow' | 'notifications';

type SectionDefinition = {
  title: string;
  description: string;
  owner: string;
  capability: string;
  bullets: string[];
};

const definitions: Record<AdminSection, SectionDefinition> = {
  engagements: {
    title: 'Engagements',
    description: 'Administrative entry point for the overall client/business engagement above individual Projects.',
    owner: 'Verigence Administration',
    capability: 'Detailed design to be revisited',
    bullets: [
      'Engagement is the parent business context above one or more Projects.',
      'Project Provisioning remains responsible for creating/configuring individual Projects under an Engagement.',
      'The Engagement data model, lifecycle and backend contract will be defined in a later design pass.',
      'The current UI intentionally provides navigation only and does not fabricate engagement records or persistence.',
    ],
  },
  activity: {
    title: 'User Activity Log',
    description: 'Administrative view of authoritative user and security lifecycle activity.',
    owner: 'Security',
    capability: 'Backend read contract required',
    bullets: [
      'User activation, suspension, reinstatement and offboarding events.',
      'Administrative role assignment and removal events.',
      'Actor, timestamp, correlation ID and affected resource must remain authoritative.',
      'The Web application will not synthesize or maintain a parallel audit log.',
    ],
  },
  roles: {
    title: 'Roles & Permissions',
    description: 'Administrative roles are separate from UC02 operational Project/Dealer/Outlet role mapping.',
    owner: 'Security',
    capability: 'Role assignment contract required',
    bullets: [
      'Project Admin — administration authority for an assigned project and its configuration surface.',
      'Module Admin — administration authority for selected Verigence modules and their configuration.',
      'PC, TL, PM, CRM and Executive remain operational roles and are not managed here.',
      'SuperAdmin remains the platform-level administrative authority.',
    ],
  },
  'audit-rules': {
    title: 'Audit Rule Config',
    description: 'Central administration entry point for controlled audit-rule configuration.',
    owner: 'Audit Core',
    capability: 'Configuration write contract required',
    bullets: [
      'Configuration must be versioned and auditable.',
      'Changes must not overwrite historical rule versions used by completed audits.',
      'Module/Admin authorization must be enforced by backend policy, not navigation visibility.',
      'No browser-local rule store or mock save behavior will be introduced.',
    ],
  },
  'approval-workflow': {
    title: 'Approval Workflow Config',
    description: 'Administrative definition of approval stages, participants and escalation policy.',
    owner: 'Workflow / Audit Core',
    capability: 'Workflow configuration contract required',
    bullets: [
      'Workflow changes require explicit versioning and effective dates.',
      'Operational PC/TL/PM assignments remain project-scoped and are not created here.',
      'Configuration must preserve the audit trail of the workflow version used for each decision.',
      'No simulated workflow persistence is exposed until the backend contract exists.',
    ],
  },
  notifications: {
    title: 'Notification Settings',
    description: 'Administrative controls for system notification policy and delivery preferences.',
    owner: 'Notification module',
    capability: 'Notification configuration contract required',
    bullets: [
      'Settings are module/project policy, not applicant onboarding fields.',
      'Delivery-channel configuration must avoid exposing credentials or provider secrets in Web.',
      'Changes must be attributable to the administrator who made them.',
      'No local-only setting is presented as authoritative configuration.',
    ],
  },
};

export default function AdminConfigurationPage({ section }: { section: AdminSection }) {
  const definition = definitions[section];
  const [searchParams] = useSearchParams();
  const userId = searchParams.get('userId');

  return (
    <section className="uc01-admin-page" aria-label={definition.title}>
      <PageHeader eyebrow="Administration" title={definition.title} description={definition.description} />

      {section === 'roles' && userId && (
        <div className="uc01-admin-message uc01-admin-message--info">
          Role administration opened for user <code>{userId}</code>. Assignment controls remain disabled until Security exposes the approved Project Admin / Module Admin mutation contract.
        </div>
      )}

      <div className="uc01-admin-config-grid">
        <article className="uc01-admin-config-card">
          <span className="eyebrow">Approved administration scope</span>
          <h2>{definition.title}</h2>
          <ul>{definition.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}</ul>
        </article>

        <aside className="uc01-admin-capability-card">
          <span>Authoritative owner</span><strong>{definition.owner}</strong>
          <span>Current implementation state</span><strong>{definition.capability}</strong>
          <p>The navigation and administration surface are implemented now. Mutable controls are deliberately withheld where the current backend source of truth does not expose the required capability; Verigence will not fake successful administrative changes in the browser.</p>
          {section === 'roles' && <Link className="uc01-admin-button" to="/admin/users">Back to Users</Link>}
          {section === 'engagements' && <Link className="uc01-admin-button" to="/admin/project">Go to Project Provisioning</Link>}
        </aside>
      </div>

      {section === 'roles' && (
        <div className="uc01-admin-role-grid">
          <article><span className="uc01-admin-role-mark">PA</span><div><h3>Project Admin</h3><p>Administrative authority for one or more assigned projects: project setup, dealers/outlets, project employee administration, project configuration, masters and readiness/activation operations as permitted.</p></div></article>
          <article><span className="uc01-admin-role-mark">MA</span><div><h3>Module Admin</h3><p>Administrative authority for selected Verigence modules such as Audit, Workflow or Notifications. Module Admin does not automatically receive platform-wide or project-operational authority.</p></div></article>
        </div>
      )}
    </section>
  );
}
