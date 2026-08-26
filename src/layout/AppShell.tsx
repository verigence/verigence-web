import { useEffect, useState, type PropsWithChildren } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';

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
    { to: '/admin/organization', label: 'Organization', mark: 'OR', roles: admin },
    { to: '/admin/team', label: 'Team & assignments', mark: 'TM', roles: admin },
    { to: '/admin/masters', label: 'Masters & controls', mark: 'MS', roles: admin },
  ] },
];

function NavIcon({ name }: { name: string }) {
  const common = { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true };

  switch (name) {
    case 'OV': return <svg {...common}><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>;
    case 'CU': return <svg {...common}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>;
    case 'JR': return <svg {...common}><circle cx="6" cy="6" r="2"/><circle cx="18" cy="18" r="2"/><path d="M8 6h5a3 3 0 0 1 3 3v2"/><path d="M16 13v3"/><path d="M13 13h6"/></svg>;
    case 'WK': return <svg {...common}><rect x="4" y="5" width="16" height="16" rx="2"/><path d="M8 3v4M16 3v4M4 10h16"/><path d="m8 15 2 2 5-5"/></svg>;
    case 'RV': return <svg {...common}><path d="M9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>;
    case 'EV': return <svg {...common}><path d="M4 4h16v16H4z"/><path d="M8 8h8M8 12h8M8 16h5"/></svg>;
    case 'PY': return <svg {...common}><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M7 15h4"/></svg>;
    case 'FN': return <svg {...common}><path d="M10.3 2.7 2.7 10.3a2.4 2.4 0 0 0 0 3.4l7.6 7.6a2.4 2.4 0 0 0 3.4 0l7.6-7.6a2.4 2.4 0 0 0 0-3.4l-7.6-7.6a2.4 2.4 0 0 0-3.4 0Z"/><path d="M12 7v5M12 16h.01"/></svg>;
    case 'DO': return <svg {...common}><path d="M3 12h4l3-8 4 16 3-8h4"/></svg>;
    case 'AT': return <svg {...common}><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>;
    case 'CR': return <svg {...common}><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4Z"/><path d="M8 9h8M8 13h5"/></svg>;
    case 'ES': return <svg {...common}><path d="M12 3 2 21h20L12 3Z"/><path d="M12 9v5M12 18h.01"/></svg>;
    case 'AN': return <svg {...common}><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>;
    case 'PA': return <svg {...common}><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/><path d="M19 5l2-2"/></svg>;
    case 'OR': return <svg {...common}><path d="M3 21h18M6 21V7l6-4 6 4v14"/><path d="M9 10h.01M15 10h.01M9 14h.01M15 14h.01"/></svg>;
    case 'TM': return <svg {...common}><circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2"/><path d="M3 20v-2a5 5 0 0 1 5-5h2a5 5 0 0 1 5 5v2"/><path d="M15 14h1a4 4 0 0 1 4 4v2"/></svg>;
    case 'MS': return <svg {...common}><path d="M4 6h10M18 6h2M4 12h2M10 12h10M4 18h7M15 18h5"/><circle cx="16" cy="6" r="2"/><circle cx="8" cy="12" r="2"/><circle cx="13" cy="18" r="2"/></svg>;
    default: return <svg {...common}><circle cx="12" cy="12" r="8"/></svg>;
  }
}

export default function AppShell({ children }: PropsWithChildren) {
  const role = useSessionStore((state) => state.role);
  const displayName = useSessionStore((state) => state.displayName);
  const email = useSessionStore((state) => state.email);
  const signOut = useSessionStore((state) => state.signOut);
  const navigate = useNavigate();
  const location = useLocation();
  const pendingApprovalRoute = location.pathname === '/approvals';
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileNavOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, []);

  const handleSignOut = () => {
    signOut();
    navigate('/login');
  };

  if (pendingApprovalRoute) {
    return (
      <div className="pending-approval-outer">
        <section className="pending-approval-app" aria-label="Pending Approval application">
          <header className="pending-approval-topbar">
            <NavLink className="pending-approval-brand" to="/dashboard" aria-label="Verigence home">
              <img src="/brand/approved/verigence-lockup.svg" alt="Verigence — Audit, Governance, Intelligence" />
            </NavLink>
            <div className="pending-approval-crumb" aria-label="Current section">
              <span>Pending Approval</span>
              <span aria-hidden="true">›</span>
              <strong>Pending Approval</strong>
            </div>
            <div className="pending-approval-profile">
              <span className="pending-approval-profile__avatar" aria-hidden="true">SA</span>
              <span className="pending-approval-profile__identity">
                <strong>SuperAdmin</strong>
                <small>{email || displayName}</small>
              </span>
              <button type="button" className="pending-approval-signout" onClick={handleSignOut}>Sign out</button>
            </div>
          </header>
          <main className="pending-approval-content">{children}</main>
        </section>
      </div>
    );
  }

  const initials = (displayName || 'User').slice(0, 2).toUpperCase();
  const currentSection = location.pathname.split('/').filter(Boolean).at(-1)?.replaceAll('-', ' ') || 'overview';

  return (
    <div className={`enterprise-shell${mobileNavOpen ? ' enterprise-shell--nav-open' : ''}`}>
      <header className="enterprise-global-header">
        <div className="enterprise-global-header__brand-zone">
          <button
            type="button"
            className="enterprise-menu-toggle"
            aria-label="Open navigation"
            aria-expanded={mobileNavOpen}
            aria-controls="enterprise-primary-navigation"
            onClick={() => setMobileNavOpen(true)}
          >
            <span/><span/><span/>
          </button>
          <NavLink className="enterprise-header-brand" to="/dashboard" aria-label="Verigence home">
            <img src="/brand/approved/verigence-lockup.svg" alt="Verigence — Audit, Governance, Intelligence" />
          </NavLink>
        </div>

        <div className="enterprise-global-header__trail" aria-label="Current section">
          <span>Verigence</span><span>/</span><strong>{currentSection}</strong>
        </div>

        <div className="enterprise-global-header__actions">
          <NavLink to="/profile" className="enterprise-header-profile" title={email || displayName}>
            <span className="enterprise-header-profile__avatar" aria-hidden="true">{initials}</span>
            <span className="enterprise-header-profile__identity">
              <strong>{displayName || 'User'}</strong>
              <small>{email}</small>
            </span>
          </NavLink>
          <button type="button" className="user-menu-button" title={email} onClick={handleSignOut}>Sign out</button>
        </div>
      </header>

      <aside className="enterprise-sidebar" id="enterprise-primary-navigation" aria-label="Application navigation">
        <div className="enterprise-sidebar__mobile-head">
          <strong>Navigation</strong>
          <button type="button" onClick={() => setMobileNavOpen(false)} aria-label="Close navigation">×</button>
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
                    <span className="enterprise-nav__mark"><NavIcon name={item.mark} /></span>
                    <span>{item.label}</span>
                  </NavLink>
                ))}
              </div>
            );
          })}
        </nav>
        <NavLink to="/profile" className="enterprise-profile-link">
          <span className="enterprise-profile-link__avatar">{initials}</span>
          <span><strong>{displayName || 'User'}</strong><small>{email}</small></span>
        </NavLink>
      </aside>

      <button
        type="button"
        className="enterprise-nav-backdrop"
        aria-label="Close navigation"
        onClick={() => setMobileNavOpen(false)}
      />

      <div className="enterprise-main">
        <main className="enterprise-content">{children}</main>
      </div>
    </div>
  );
}
