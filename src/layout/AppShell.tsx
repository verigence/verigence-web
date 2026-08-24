import { useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';

import { verigenceLockup } from '../assets/verigenceLockup';
import type { OperatingRole, UserRole } from '../domain/models';
import { clearOperationalProject, resetOperationalContext } from '../features/uc03/projectContext';
import { ANDROID_BACK_EVENT } from '../native/AndroidNativeBridge';
import { isDiTestConsoleAvailable } from '../services/di/testConsole';
import { useProjectContextStore } from '../store/projectContextStore';
import { useSessionStore } from '../store/sessionStore';

type ShellRole = UserRole | OperatingRole;
type NavItem = { to: string; label: string; mark: string; roles?: ShellRole[]; devOnly?: boolean };
type NavGroup = { key: string; label: string; items: NavItem[] };

const c0OperatingRoles: OperatingRole[] = ['PC', 'TL', 'PM', 'CRM', 'EXECUTIVE'];
const operational: ShellRole[] = [...c0OperatingRoles, 'TENANT_ADMIN', 'SUPER_ADMIN'];
const assurance: ShellRole[] = ['TL', 'PM', 'EXECUTIVE', 'TENANT_ADMIN', 'SUPER_ADMIN'];
const admin: ShellRole[] = ['TENANT_ADMIN', 'SUPER_ADMIN'];

const groups: NavGroup[] = [
  { key: 'workspace', label: 'Workspace', items: [
    { to: '/dashboard', label: 'Overview', mark: 'OV', roles: operational },
    { to: '/customers', label: 'Customers', mark: 'CU', roles: ['PC', 'TL', 'PM', 'EXECUTIVE', ...admin] },
    { to: '/journeys', label: 'Journeys', mark: 'JR', roles: ['PC', 'TL', 'PM', 'EXECUTIVE', ...admin] },
    { to: '/tasks', label: 'My Work', mark: 'WK', roles: operational },
  ] },
  { key: 'operations', label: 'Operations & Assurance', items: [
    { to: '/reviews', label: 'Review Queue', mark: 'RV', roles: assurance },
    { to: '/evidence', label: 'Evidence', mark: 'EV', roles: ['PC', 'TL', 'PM', 'EXECUTIVE', ...admin] },
    { to: '/payments', label: 'Payment Tracker', mark: 'PY', roles: ['PC', 'TL', 'PM', 'EXECUTIVE', ...admin] },
    { to: '/findings', label: 'Findings', mark: 'FN', roles: assurance },
    { to: '/daily-ops', label: 'Daily Operations', mark: 'DO', roles: ['PC', 'TL', 'PM', ...admin] },
    { to: '/activity', label: 'Activity Tracker', mark: 'AT', roles: ['PC', 'TL', 'PM', ...admin] },
    { to: '/crm', label: 'CRM Follow-up', mark: 'CR', roles: ['CRM', 'PM', ...admin] },
    { to: '/escalations', label: 'Escalations', mark: 'ES', roles: ['TL', 'PM', 'CRM', 'EXECUTIVE', ...admin] },
  ] },
  { key: 'insights', label: 'Insights', items: [
    { to: '/analytics', label: 'Analytics', mark: 'AN', roles: ['TL', 'PM', 'EXECUTIVE', ...admin] },
  ] },
  { key: 'administration', label: 'Administration', items: [
    { to: '/admin/engagements', label: 'Engagements', mark: 'EN', roles: ['SUPER_ADMIN'] },
    { to: '/admin/document-intelligence', label: 'Document Intelligence', mark: 'DC', roles: ['SUPER_ADMIN'] },
    { to: '/admin/di-test', label: 'DI Test Console', mark: 'DI', roles: ['SUPER_ADMIN'], devOnly: true },
    { to: '/admin/users', label: 'Users', mark: 'US', roles: ['SUPER_ADMIN'] },
    { to: '/admin/activity-log', label: 'User Activity Log', mark: 'UA', roles: ['SUPER_ADMIN'] },
    { to: '/admin/roles-permissions', label: 'Roles & Permissions', mark: 'RP', roles: ['SUPER_ADMIN'] },
    { to: '/admin/audit-rules', label: 'Audit Rule Config', mark: 'AR', roles: ['SUPER_ADMIN'] },
    { to: '/admin/approval-workflow', label: 'Approval Workflow Config', mark: 'AW', roles: ['SUPER_ADMIN'] },
    { to: '/admin/notifications', label: 'Notification Settings', mark: 'NS', roles: ['SUPER_ADMIN'] },
    { to: '/admin/project', label: 'Project Provisioning', mark: 'PP', roles: ['SUPER_ADMIN'] },
  ] },
];

const routeLabels: Record<string, string> = {
  '/dashboard': 'Overview', '/customers': 'Customers', '/journeys': 'Journeys', '/tasks': 'My Work',
  '/reviews': 'Review Queue', '/evidence': 'Evidence', '/payments': 'Payment Tracker', '/findings': 'Findings',
  '/daily-ops': 'Daily Operations', '/activity': 'Activity Tracker', '/crm': 'CRM Follow-up', '/escalations': 'Escalations',
  '/analytics': 'Analytics', '/admin/engagements': 'Engagements', '/admin/document-intelligence': 'Document Intelligence Configuration',
  '/admin/di-test': 'DI Test Console', '/admin/users': 'Users',
  '/admin/users/pending': 'Pending Approvals', '/admin/activity-log': 'User Activity Log',
  '/admin/roles-permissions': 'Roles & Permissions', '/admin/audit-rules': 'Audit Rule Config',
  '/admin/approval-workflow': 'Approval Workflow Config', '/admin/notifications': 'Notification Settings',
  '/admin/project': 'Project Provisioning', '/profile': 'Profile',
};

const roleLabels: Record<ShellRole, string> = {
  PC: 'Process Coordinator', TL: 'Team Lead', PM: 'Project Manager', CRM: 'CRM', EXECUTIVE: 'Executive',
  TENANT_ADMIN: 'Tenant Admin', SUPER_ADMIN: 'SuperAdmin',
};

function initials(name: string): string {
  const tokens = name.trim().split(/\s+/).filter(Boolean);
  if (tokens.length >= 2) return `${tokens[0][0]}${tokens[1][0]}`.toUpperCase();
  return (tokens[0] || 'U').slice(0, 2).toUpperCase();
}

export default function AppShell({ children }: PropsWithChildren) {
  const sessionRole = useSessionStore((state) => state.role);
  const displayName = useSessionStore((state) => state.displayName);
  const signOut = useSessionStore((state) => state.signOut);
  const selectedProject = useProjectContextStore((state) => state.selectedProject);
  const projects = useProjectContextStore((state) => state.projects);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const role: ShellRole = selectedProject?.operatingRole ?? sessionRole;
  const c0OperationalShell = Boolean(selectedProject);
  const diTestAvailable = isDiTestConsoleAvailable();
  const visibleGroups = useMemo<NavGroup[]>(() => c0OperationalShell
    ? [{ key: 'workspace', label: 'Workspace', items: [{ to: '/dashboard', label: 'Overview', mark: 'OV', roles: c0OperatingRoles }] }]
    : groups, [c0OperationalShell]);

  const activeGroupKey = useMemo(() => {
    return visibleGroups.find((group) => group.items.some((item) => location.pathname === item.to || location.pathname.startsWith(`${item.to}/`)))?.key
      ?? visibleGroups[0]?.key
      ?? 'workspace';
  }, [location.pathname, visibleGroups]);
  const [openGroup, setOpenGroup] = useState(activeGroupKey);

  useEffect(() => {
    setMobileMenuOpen(false);
    setOpenGroup(activeGroupKey);
  }, [activeGroupKey, location.pathname]);

  useEffect(() => {
    if (!mobileMenuOpen) return undefined;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') setMobileMenuOpen(false); };
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

  const handleSignOut = () => { resetOperationalContext(queryClient); signOut(); navigate('/login'); };
  const handleSwitchProject = () => {
    clearOperationalProject(queryClient);
    setMobileMenuOpen(false);
    navigate('/dashboard', { replace: true });
  };

  const currentLabel = routeLabels[location.pathname]
    ?? location.pathname.split('/').filter(Boolean).at(-1)?.replaceAll('-', ' ')
    ?? 'Overview';
  const visibleName = displayName || 'User';
  const roleLabel = roleLabels[role];
  const avatarText = initials(visibleName);

  return (
    <div className={`enterprise-shell${mobileMenuOpen ? ' enterprise-shell--menu-open' : ''}`}>
      <button type="button" className="enterprise-mobile-backdrop" aria-label="Close navigation" onClick={() => setMobileMenuOpen(false)} />

      <aside className={`enterprise-sidebar${mobileMenuOpen ? ' enterprise-sidebar--open' : ''}`} aria-label="Application navigation">
        <div className="enterprise-sidebar__mobile-head">
          <NavLink className="enterprise-brand" to="/dashboard" aria-label="Verigence home"><img src={verigenceLockup} alt="Verigence" /></NavLink>
          <button type="button" className="enterprise-sidebar__close" aria-label="Close navigation" onClick={() => setMobileMenuOpen(false)}>×</button>
        </div>
        {selectedProject && (
          <div className="uc03-shell-project">
            <span>Current Project</span><strong>{selectedProject.projectName}</strong><small>{roleLabel}</small>
            {projects.length > 1 && <button type="button" onClick={handleSwitchProject}>Switch Project</button>}
          </div>
        )}
        <nav className="enterprise-nav enterprise-nav--accordion" aria-label="Primary navigation">
          {visibleGroups.map((group) => {
            const items = group.items.filter((item) => (!item.roles || item.roles.includes(role)) && (!item.devOnly || diTestAvailable));
            if (items.length === 0) return null;
            const expanded = openGroup === group.key;
            return (
              <div className={`enterprise-nav__group enterprise-nav__group--accordion${expanded ? ' is-open' : ''}`} key={group.key}>
                <button
                  type="button"
                  className="enterprise-nav__group-toggle"
                  aria-expanded={expanded}
                  onClick={() => setOpenGroup((current) => current === group.key ? '' : group.key)}
                >
                  <span>{group.label}</span><span className="enterprise-nav__chevron" aria-hidden="true">⌄</span>
                </button>
                <div className="enterprise-nav__group-items" hidden={!expanded}>
                  {items.map((item) => (
                    <NavLink key={item.to} to={item.to} className={({ isActive }) => `enterprise-nav__item${isActive ? ' enterprise-nav__item--active' : ''}`}>
                      <span className="enterprise-nav__mark">{item.mark}</span><span>{item.label}</span>
                    </NavLink>
                  ))}
                </div>
              </div>
            );
          })}
        </nav>
      </aside>

      <div className="enterprise-main">
        <header className="enterprise-topbar">
          <div className="enterprise-topbar__mobile-start">
            <button type="button" className="enterprise-menu-button" aria-label="Open navigation" aria-expanded={mobileMenuOpen} onClick={() => setMobileMenuOpen(true)}><span aria-hidden="true">☰</span></button>
            <NavLink className="enterprise-mobile-brand" to="/dashboard" aria-label="Verigence home"><img src={verigenceLockup} alt="Verigence" /></NavLink>
          </div>
          <div className="enterprise-topbar__trail"><span>{selectedProject?.projectName || 'Verigence'}</span><span>/</span><strong>{currentLabel}</strong></div>
          <div className="enterprise-topbar__actions">
            {selectedProject && projects.length > 1 && <button type="button" className="uc03-switch-project-topbar" onClick={handleSwitchProject}>Switch Project</button>}
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
