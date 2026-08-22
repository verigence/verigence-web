import { useEffect, useState, type PropsWithChildren } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';

import { verigenceLockup } from '../assets/verigenceLockup';
import type { UserRole } from '../domain/models';
import { ANDROID_BACK_EVENT } from '../native/AndroidNativeBridge';
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
    { to: '/tasks', label: 'My Work', mark: 'WK', roles: operational },
  ] },
  { label: 'Assurance', items: [
    { to: '/reviews', label: 'Review Queue', mark: 'RV', roles: assurance },
    { to: '/evidence', label: 'Evidence', mark: 'EV', roles: ['PC', 'TL', 'PM', ...admin] },
    { to: '/payments', label: 'Payment Tracker', mark: 'PY', roles: ['PC', 'TL', 'PM', ...admin] },
    { to: '/findings', label: 'Findings', mark: 'FN', roles: assurance },
  ] },
  { label: 'Operations', items: [
    { to: '/daily-ops', label: 'Daily Operations', mark: 'DO', roles: ['PC', 'TL', 'PM', ...admin] },
    { to: '/activity', label: 'Activity Tracker', mark: 'AT', roles: ['PC', 'TL', 'PM', ...admin] },
    { to: '/crm', label: 'CRM Follow-up', mark: 'CR', roles: ['CRM', 'PM', ...admin] },
    { to: '/escalations', label: 'Escalations', mark: 'ES', roles: ['TL', 'PM', 'CRM', ...admin] },
  ] },
  { label: 'Insights', items: [{ to: '/analytics', label: 'Analytics', mark: 'AN', roles: ['TL', 'PM', ...admin] }] },
  { label: 'Administration', items: [
    { to: '/approvals', label: 'Pending Approval', mark: 'PA', roles: ['SUPER_ADMIN'] },
    { to: '/admin/project', label: 'Project Administration', mark: 'PR', roles: ['SUPER_ADMIN'] },
  ] },
];

const routeLabels: Record<string, string> = {
  '/dashboard': 'Overview',
  '/customers': 'Customers',
  '/journeys': 'Journeys',
  '/tasks': 'My Work',
  '/reviews': 'Review Queue',
  '/evidence': 'Evidence',
  '/payments': 'Payment Tracker',
  '/findings': 'Findings',
  '/daily-ops': 'Daily Operations',
  '/activity': 'Activity Tracker',
  '/crm': 'CRM Follow-up',
  '/escalations': 'Escalations',
  '/analytics': 'Analytics',
  '/approvals': 'Pending Approval',
  '/admin/project': 'Project Administration',
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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!mobileMenuOpen) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileMenuOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [mobileMenuOpen]);

  useEffect(() => {
    const onAndroidBack = (event: Event) => {
      if (!mobileMenuOpen) return;
      event.preventDefault();
      setMobileMenuOpen(false);
    };
    window.addEventListener(ANDROID_BACK_EVENT, onAndroidBack);
    return () => window.removeEventListener(ANDROID_BACK_EVENT, onAndroidBack);
  }, [mobileMenuOpen]);

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
    <div className={`enterprise-shell${mobileMenuOpen ? ' enterprise-shell--menu-open' : ''}`}>
      <button
        type="button"
        className="enterprise-mobile-backdrop"
        aria-label="Close navigation"
        onClick={() => setMobileMenuOpen(false)}
      />

      <aside className={`enterprise-sidebar${mobileMenuOpen ? ' enterprise-sidebar--open' : ''}`} aria-label="Application navigation">
        <div className="enterprise-sidebar__mobile-head">
          <NavLink className="enterprise-brand" to="/dashboard" aria-label="Verigence home">
            <img src={verigenceLockup} alt="Verigence" />
          </NavLink>
          <button
            type="button"
            className="enterprise-sidebar__close"
            aria-label="Close navigation"
            onClick={() => setMobileMenuOpen(false)}
          >
            ×
          </button>
        </div>
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
      </aside>

      <div className="enterprise-main">
        <header className="enterprise-topbar">
          <div className="enterprise-topbar__mobile-start">
            <button
              type="button"
              className="enterprise-menu-button"
              aria-label="Open navigation"
              aria-expanded={mobileMenuOpen}
              onClick={() => setMobileMenuOpen(true)}
            >
              <span aria-hidden="true">☰</span>
            </button>
            <NavLink className="enterprise-mobile-brand" to="/dashboard" aria-label="Verigence home">
              <img src={verigenceLockup} alt="Verigence" />
            </NavLink>
          </div>
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
