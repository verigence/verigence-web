import type { PropsWithChildren } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';

import { verigenceLockup } from '../assets/verigenceLockup';
import type { UserRole } from '../domain/models';
import { useSessionStore } from '../store/sessionStore';

type NavItem = { to: string; label: string; mark: string; roles?: UserRole[] };
type NavGroup = { label: string; items: NavItem[] };

const operational: UserRole[] = ['PC', 'TL', 'PM', 'CRM', 'TENANT_ADMIN', 'SUPER_ADMIN'];
const assurance: UserRole[] = ['TL', 'PM', 'TENANT_ADMIN', 'SUPER_ADMIN'];
const admin: UserRole[] = ['TENANT_ADMIN', 'SUPER_ADMIN'];

const groups: NavGroup[] = [
  { label: 'Work', items: [
    { to: '/dashboard', label: 'Overview', mark: 'OV', roles: operational },
    { to: '/customers', label: 'Customers', mark: 'CU', roles: ['PC', 'TL', 'PM', ...admin] },
    { to: '/journeys', label: 'Journeys', mark: 'JR', roles: ['PC', 'TL', 'PM', ...admin] },
    { to: '/tasks', label: 'My work', mark: 'WK', roles: operational },
  ] },
  { label: 'Assurance', items: [
    { to: '/reviews', label: 'Review queue', mark: 'RV', roles: assurance },
    { to: '/evidence', label: 'Evidence', mark: 'EV', roles: ['PC', 'TL', 'PM', ...admin] },
    { to: '/payments', label: 'Payment tracker', mark: 'PY', roles: ['PC', 'TL', 'PM', ...admin] },
    { to: '/findings', label: 'Findings', mark: 'FN', roles: assurance },
  ] },
  { label: 'Operations', items: [
    { to: '/daily-ops', label: 'Daily operations', mark: 'DO', roles: ['PC', 'TL', 'PM', ...admin] },
    { to: '/activity', label: 'Activity tracker', mark: 'AT', roles: ['PC', 'TL', 'PM', ...admin] },
    { to: '/crm', label: 'CRM follow-up', mark: 'CR', roles: ['CRM', 'PM', ...admin] },
    { to: '/escalations', label: 'Escalations', mark: 'ES', roles: ['TL', 'PM', 'CRM', ...admin] },
  ] },
  { label: 'Insights', items: [{ to: '/analytics', label: 'Analytics', mark: 'AN', roles: ['TL', 'PM', ...admin] }] },
  { label: 'Administration', items: [
    { to: '/approvals', label: 'Pending Approval', mark: 'PA', roles: ['SUPER_ADMIN'] },
    { to: '/admin/project', label: 'Project administration', mark: 'PR', roles: ['SUPER_ADMIN'] },
  ] },
];

const routeLabels: Record<string, string> = {
  '/dashboard': 'Overview',
  '/customers': 'Customers',
  '/journeys': 'Journeys',
  '/tasks': 'My work',
  '/reviews': 'Review queue',
  '/evidence': 'Evidence',
  '/payments': 'Payment tracker',
  '/findings': 'Findings',
  '/daily-ops': 'Daily operations',
  '/activity': 'Activity tracker',
  '/crm': 'CRM follow-up',
  '/escalations': 'Escalations',
  '/analytics': 'Analytics',
  '/approvals': 'Pending Approval',
  '/admin/project': 'Project administration',
  '/profile': 'Profile',
};

const roleLabels: Record<UserRole, string> = {
  PC: 'Process Coordinator',
  TL: 'Team Lead',
  PM: 'Project Manager',
  CRM: 'CRM',
  TENANT_ADMIN: 'Tenant Admin',
  SUPER_ADMIN: 'SuperAdmin',
};

function initials(name: string): string {
  const tokens = name.trim().split(/\s+/).filter(Boolean);
  if (tokens.length >= 2) return `${tokens[0][0]}${tokens[1][0]}`.toUpperCase();
  return (tokens[0] || 'U').slice(0, 2).toUpperCase();
}

export default function AppShell({ children }: PropsWithChildren) {
  const role = useSessionStore((state) => state.role);
  const displayName = useSessionStore((state) => state.displayName);
  const signOut = useSessionStore((state) => state.signOut);
  const navigate = useNavigate();
  const location = useLocation();

  const handleSignOut = () => {
    signOut();
    navigate('/login');
  };

  const currentLabel = routeLabels[location.pathname]
    ?? location.pathname.split('/').filter(Boolean).at(-1)?.replaceAll('-', ' ')
    ?? 'Overview';
  const visibleName = displayName || 'User';
  const roleLabel = roleLabels[role];
  const avatarText = initials(visibleName);

  return (
    <div className="enterprise-shell">
      <aside className="enterprise-sidebar">
        <NavLink className="enterprise-brand" to="/dashboard" aria-label="Verigence home">
          <img src={verigenceLockup} alt="Verigence" />
        </NavLink>
        <nav className="enterprise-nav" aria-label="Primary navigation">
          {groups.map((group) => {
            const items = group.items.filter((item) => !item.roles || item.roles.includes(role));
            if (items.length === 0) return null;
            return (
              <div className="enterprise-nav__group" key={group.label}>
                <span className="enterprise-nav__group-label">{group.label}</span>
                {items.map((item) => (
                  <NavLink key={item.to} to={item.to} className={({ isActive }) => `enterprise-nav__item${isActive ? ' enterprise-nav__item--active' : ''}`}>
                    <span className="enterprise-nav__mark">{item.mark}</span><span>{item.label}</span>
                  </NavLink>
                ))}
              </div>
            );
          })}
        </nav>
        <NavLink to="/profile" className="enterprise-profile-link" aria-label="Open profile">
          <span className="enterprise-profile-link__avatar">{avatarText}</span>
          <span><strong>{visibleName}</strong><small>{roleLabel}</small></span>
        </NavLink>
      </aside>
      <div className="enterprise-main">
        <header className="enterprise-topbar">
          <div className="enterprise-topbar__trail"><span>Verigence</span><span>/</span><strong>{currentLabel}</strong></div>
          <div className="enterprise-topbar__actions">
            <NavLink to="/profile" className="enterprise-topbar__identity" aria-label="Open profile">
              <span className="enterprise-topbar__avatar">{avatarText}</span>
              <span className="enterprise-topbar__identity-copy"><strong>{visibleName}</strong><small>{roleLabel}</small></span>
            </NavLink>
            <button type="button" className="user-menu-button" onClick={handleSignOut}>Sign out</button>
          </div>
        </header>
        <main className="enterprise-content">{children}</main>
      </div>
    </div>
  );
}
