import type { PropsWithChildren } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';

import RolePreview from '../components/RolePreview';
import type { UserRole } from '../domain/models';
import { assetUrl } from '../services/assets';
import { runtimeConfig } from '../services/runtime';
import { useSessionStore } from '../store/sessionStore';

type NavItem = { to: string; label: string; mark: string; roles?: UserRole[] };
type NavGroup = { label: string; items: NavItem[] };

const operational: UserRole[] = ['PC', 'TL', 'PM', 'CRM', 'TENANT_ADMIN', 'SUPER_ADMIN'];
const assurance: UserRole[] = ['TL', 'PM', 'TENANT_ADMIN', 'SUPER_ADMIN'];
const admin: UserRole[] = ['TENANT_ADMIN', 'SUPER_ADMIN'];

const groups: NavGroup[] = [
  {
    label: 'Work',
    items: [
      { to: '/dashboard', label: 'Overview', mark: 'OV', roles: operational },
      { to: '/customers', label: 'Customers', mark: 'CU', roles: ['PC', 'TL', 'PM', ...admin] },
      { to: '/journeys', label: 'Journeys', mark: 'JR', roles: ['PC', 'TL', 'PM', ...admin] },
      { to: '/tasks', label: 'My work', mark: 'WK', roles: operational },
    ],
  },
  {
    label: 'Assurance',
    items: [
      { to: '/reviews', label: 'Review queue', mark: 'RV', roles: assurance },
      { to: '/evidence', label: 'Evidence', mark: 'EV', roles: ['PC', 'TL', 'PM', ...admin] },
      { to: '/payments', label: 'Payment tracker', mark: 'PY', roles: ['PC', 'TL', 'PM', ...admin] },
      { to: '/findings', label: 'Findings', mark: 'FN', roles: assurance },
    ],
  },
  {
    label: 'Operations',
    items: [
      { to: '/daily-ops', label: 'Daily operations', mark: 'DO', roles: ['PC', 'TL', 'PM', ...admin] },
      { to: '/activity', label: 'Activity tracker', mark: 'AT', roles: ['PC', 'TL', 'PM', ...admin] },
      { to: '/crm', label: 'CRM follow-up', mark: 'CR', roles: ['CRM', 'PM', ...admin] },
      { to: '/escalations', label: 'Escalations', mark: 'ES', roles: ['TL', 'PM', 'CRM', ...admin] },
    ],
  },
  {
    label: 'Insights',
    items: [{ to: '/analytics', label: 'Analytics', mark: 'AN', roles: ['TL', 'PM', ...admin] }],
  },
  {
    label: 'Administration',
    items: [
      { to: '/approvals', label: 'Access approvals', mark: 'AC', roles: admin },
      { to: '/admin/organization', label: 'Organization', mark: 'OR', roles: admin },
      { to: '/admin/team', label: 'Team & assignments', mark: 'TM', roles: admin },
      { to: '/admin/masters', label: 'Masters & controls', mark: 'MS', roles: admin },
    ],
  },
];

function roleLabel(role: UserRole): string {
  return {
    PC: 'Process Consultant', TL: 'Team Lead', PM: 'Project Manager', CRM: 'CRM Operator',
    TENANT_ADMIN: 'Tenant Admin', SUPER_ADMIN: 'Super Admin',
  }[role];
}

export default function AppShell({ children }: PropsWithChildren) {
  const role = useSessionStore((state) => state.role);
  const displayName = useSessionStore((state) => state.displayName);
  const email = useSessionStore((state) => state.email);
  const signOut = useSessionStore((state) => state.signOut);
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <div className="enterprise-shell">
      <aside className="enterprise-sidebar">
        <NavLink className="enterprise-brand" to="/dashboard" aria-label="Verigence home"><img src={assetUrl('brand/svg/verigence-logo.svg')} alt="Verigence" /></NavLink>
        <div className="enterprise-sidebar__context"><span>Workspace</span><strong>{runtimeConfig.tenantId}</strong></div>
        <nav className="enterprise-nav" aria-label="Primary navigation">
          {groups.map((group) => {
            const items = group.items.filter((item) => !item.roles || item.roles.includes(role));
            if (items.length === 0) return null;
            return <div className="enterprise-nav__group" key={group.label}><span className="enterprise-nav__group-label">{group.label}</span>{items.map((item) => <NavLink key={item.to} to={item.to} className={({ isActive }) => `enterprise-nav__item${isActive ? ' enterprise-nav__item--active' : ''}`}><span className="enterprise-nav__mark">{item.mark}</span><span>{item.label}</span></NavLink>)}</div>;
          })}
        </nav>
        <NavLink to="/profile" className="enterprise-profile-link"><span className="enterprise-profile-link__avatar">{displayName.slice(0, 2).toUpperCase()}</span><span><strong>{displayName}</strong><small>{roleLabel(role)}</small></span></NavLink>
      </aside>
      <div className="enterprise-main">
        <header className="enterprise-topbar">
          <div className="enterprise-topbar__trail"><span>Verigence</span><span>/</span><strong>{location.pathname.split('/').filter(Boolean).at(-1)?.replaceAll('-', ' ') || 'overview'}</strong></div>
          <div className="enterprise-topbar__actions"><span className="runtime-chip runtime-chip--core">{runtimeConfig.auditCoreConfigured ? 'Development · Audit Core' : 'Audit Core URL missing'}</span><RolePreview /><button type="button" className="user-menu-button" title={email} onClick={() => { signOut(); navigate('/login'); }}>Sign out</button></div>
        </header>
        <main className="enterprise-content">{children}</main>
      </div>
    </div>
  );
}
