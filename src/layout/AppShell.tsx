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

const projectAdministrationItem: NavItem = {
  to: '/admin/project',
  label: 'Project Administration',
  mark: 'PA',
  roles: admin,
};

const createBookingItem: NavItem = {
  to: '/dashboard?action=create-booking',
  label: 'Capture New Booking',
  mark: 'CB',
  roles: ['PC'],
};

const journeySearchItem: NavItem = {
  to: '/search',
  label: 'Journey Search',
  mark: 'JS',
  roles: ['PC', 'TL', 'PM'],
};

const attendanceItem: NavItem = {
  to: '/attendance',
  label: 'Attendance',
  mark: 'AD',
  roles: c0OperatingRoles,
};

const feedbackItem: NavItem = {
  to: '/feedback',
  label: 'Feedback',
  mark: 'FB',
  roles: ['PC', 'TL', 'PM'],
};

const groups: NavGroup[] = [
  { key: 'workspace', label: 'Workspace', items: [
    { to: '/dashboard', label: 'Overview', mark: 'OV', roles: operational },
    journeySearchItem,
    attendanceItem,
    { to: '/customers', label: 'Customers', mark: 'CU', roles: ['PC', 'TL', 'PM', 'EXECUTIVE', ...admin] },
    { to: '/journeys', label: 'Journeys', mark: 'JR', roles: ['PC', 'TL', 'PM', 'EXECUTIVE', ...admin] },
    { to: '/tasks', label: 'My Work', mark: 'WK', roles: operational },
    feedbackItem,
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
    { to: '/admin/housekeeping', label: 'Housekeeping', mark: 'HK', roles: ['SUPER_ADMIN'] },
    { to: '/admin/feedback', label: 'User Feedback', mark: 'FB', roles: ['SUPER_ADMIN'] },
    { to: '/admin/di-test', label: 'DI Test Console', mark: 'DI', roles: ['SUPER_ADMIN'], devOnly: true },
    { to: '/admin/users', label: 'Users', mark: 'US', roles: ['SUPER_ADMIN'] },
    { to: '/admin/activity-log', label: 'User Activity Log', mark: 'UA', roles: ['SUPER_ADMIN'] },
    { to: '/admin/roles-permissions', label: 'Roles & Permissions', mark: 'RP', roles: ['SUPER_ADMIN'] },
    { to: '/admin/audit-rules', label: 'Audit Rule Config', mark: 'AR', roles: ['SUPER_ADMIN'] },
    { to: '/admin/approval-workflow', label: 'Approval Workflow Config', mark: 'AW', roles: ['SUPER_ADMIN'] },
    { to: '/admin/notifications', label: 'Notification Settings', mark: 'NS', roles: ['SUPER_ADMIN'] },
    projectAdministrationItem,
  ] },
];

const routeLabels: Record<string, string> = {
  '/dashboard': 'Overview', '/search': 'Journey Search', '/attendance': 'Attendance', '/customers': 'Customers', '/journeys': 'Journeys', '/tasks': 'My Work',
  '/feedback': 'Feedback',
  '/reviews': 'Review Queue', '/evidence': 'Evidence', '/payments': 'Payment Tracker', '/findings': 'Findings',
  '/daily-ops': 'Daily Operations', '/activity': 'Activity Tracker', '/crm': 'CRM Follow-up', '/escalations': 'Escalations',
  '/analytics': 'Analytics', '/admin/engagements': 'Engagements', '/admin/document-intelligence': 'Document Intelligence Configuration',
  '/admin/housekeeping': 'Housekeeping', '/admin/feedback': 'User Feedback', '/admin/di-test': 'DI Test Console', '/admin/users': 'Users',
  '/admin/users/pending': 'Pending Approvals', '/admin/activity-log': 'User Activity Log',
  '/admin/roles-permissions': 'Roles & Permissions', '/admin/audit-rules': 'Audit Rule Config',
  '/admin/approval-workflow': 'Approval Workflow Config', '/admin/notifications': 'Notification Settings',
  '/admin/project': 'Project Administration', '/profile': 'Profile',
};

const dynamicRouteLabels: Array<[string, string]> = [
  ['/bookings/', 'Booking'],
  ['/deliveries/', 'Delivery'],
  ['/audit/', 'Audit Review'],
  ['/customers/', 'Customer'],
  ['/journeys/', 'Journey'],
  ['/evidence/', 'Evidence'],
  ['/payments/', 'Payment'],
  ['/findings/', 'Finding'],
  ['/reviews/', 'Review'],
  ['/tasks/', 'Work Item'],
];

const roleLabels: Record<ShellRole, string> = {
  PC: 'Process Coordinator', TL: 'Team Lead', PM: 'Project Manager', CRM: 'CRM', EXECUTIVE: 'Executive',
  TENANT_ADMIN: 'Tenant Admin', SUPER_ADMIN: 'SuperAdmin',
};

function initials(name: string): string {
  const tokens = name.trim().split(/\s+/).filter(Boolean);
  if (tokens.length >= 2) return `${tokens[0][0]}${tokens[1][0]}`.toUpperCase();
  return (tokens[0] || 'U').slice(0, 2).toUpperCase();
}

function NavIcon({ mark }: { mark: string }) {
  let glyph;
  switch (mark) {
    case 'OV': glyph = <><rect x="4" y="4" width="6" height="6" rx="1" /><rect x="14" y="4" width="6" height="6" rx="1" /><rect x="4" y="14" width="6" height="6" rx="1" /><rect x="14" y="14" width="6" height="6" rx="1" /></>; break;
    case 'JS': glyph = <><circle cx="10.5" cy="10.5" r="6" /><path d="m15 15 5 5" /></>; break;
    case 'AD': glyph = <><circle cx="12" cy="12" r="8" /><path d="M12 8v4l3 2M8 3v3m8-3v3" /></>; break;
    case 'CU': glyph = <><circle cx="9" cy="8" r="3" /><path d="M3.5 19c.6-3.2 2.5-5 5.5-5s4.9 1.8 5.5 5" /><circle cx="17" cy="9" r="2" /><path d="M15.5 14.5c2.7-.4 4.5 1 5 3.5" /></>; break;
    case 'JR': glyph = <><circle cx="6" cy="7" r="2" /><circle cx="18" cy="17" r="2" /><path d="M8 7h3c4 0 4 4 4 5s0 5 3 5" /></>; break;
    case 'WK': glyph = <><rect x="5" y="4" width="14" height="16" rx="2" /><path d="M9 4.5h6M8 10l2 2 4-4M8 16h6" /></>; break;
    case 'FB': glyph = <><path d="M4 5h16v11H9l-5 4z" /><path d="M8 9h8M8 12h5" /></>; break;
    case 'RV': glyph = <><path d="M3 12s3.5-5 9-5 9 5 9 5-3.5 5-9 5-9-5-9-5Z" /><circle cx="12" cy="12" r="2.5" /></>; break;
    case 'EV': glyph = <><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v5h5M9 14l2 2 4-4" /></>; break;
    case 'PY': glyph = <><rect x="3" y="6" width="18" height="12" rx="2" /><path d="M3 10h18M7 15h3" /></>; break;
    case 'FN': glyph = <><path d="M5 21V4m0 1h10l-1 4 1 4H5" /></>; break;
    case 'DO': glyph = <><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M8 3v4m8-4v4M4 10h16M8 14h3m2 0h3m-8 3h3" /></>; break;
    case 'AT': glyph = <><circle cx="12" cy="12" r="8" /><path d="M12 8v5l3 2" /></>; break;
    case 'CR': glyph = <><path d="M5 5h14v10H9l-4 4z" /><path d="M8 9h8m-8 3h5" /></>; break;
    case 'ES': glyph = <><path d="M12 3 22 20H2Z" /><path d="M12 9v5m0 3h.01" /></>; break;
    case 'AN': glyph = <><path d="M4 20V10h4v10m4 0V5h4v15m4 0V13h-4" /></>; break;
    case 'EN': glyph = <><rect x="3" y="7" width="18" height="12" rx="2" /><path d="M9 7V5h6v2m-12 5h18M10 12v2h4v-2" /></>; break;
    case 'DC': glyph = <><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v5h5M9 12h6m-6 4h6" /></>; break;
    case 'HK': glyph = <><path d="M14.5 6.5a4 4 0 0 0-5 5L4 17l3 3 5.5-5.5a4 4 0 0 0 5-5l-3 3-3-3z" /></>; break;
    case 'DI': glyph = <><path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" /><path d="M8 12h8M12 8v8" /></>; break;
    case 'US': glyph = <><circle cx="9" cy="8" r="3" /><circle cx="17" cy="9" r="2" /><path d="M3 19c.7-3.2 2.7-5 6-5s5.3 1.8 6 5M15 14c2.9 0 4.7 1.3 5.5 4" /></>; break;
    case 'UA': glyph = <><path d="M3 12h4l2-4 4 8 2-4h6" /></>; break;
    case 'RP': glyph = <><path d="M12 3 19 6v5c0 4.4-2.6 7.5-7 10-4.4-2.5-7-5.6-7-10V6z" /><path d="m9 12 2 2 4-4" /></>; break;
    case 'AR': glyph = <><path d="M4 7h10M18 7h2M4 12h2m4 0h10M4 17h7m4 0h5" /><circle cx="16" cy="7" r="2" /><circle cx="8" cy="12" r="2" /><circle cx="13" cy="17" r="2" /></>; break;
    case 'AW': glyph = <><circle cx="5" cy="6" r="2" /><circle cx="19" cy="6" r="2" /><circle cx="12" cy="18" r="2" /><path d="M7 6h10M6.5 7.5 11 16m6.5-8.5L13 16" /></>; break;
    case 'NS': glyph = <><path d="M6 16h12l-1.5-2v-4a4.5 4.5 0 0 0-9 0v4z" /><path d="M10 19h4" /></>; break;
    case 'PA': glyph = <><path d="M4 20h16M6 20V8l6-4 6 4v12M9 11h2m2 0h2M9 15h2m2 0h2" /></>; break;
    case 'CB': glyph = <><rect x="4" y="4" width="16" height="16" rx="3" /><path d="M12 8v8M8 12h8" /></>; break;
    default: glyph = <circle cx="12" cy="12" r="7" />;
  }
  return <svg className="enterprise-nav__icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{glyph}</svg>;
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
  const createBookingMode = location.pathname === '/dashboard'
    && new URLSearchParams(location.search).get('action') === 'create-booking';
  const visibleGroups = useMemo<NavGroup[]>(() => {
    if (!c0OperationalShell) return groups;
    const workspaceItems: NavItem[] = [
      { to: '/dashboard', label: 'Overview', mark: 'OV', roles: c0OperatingRoles },
    ];
    if (role === 'PC' || role === 'TL' || role === 'PM') {
      workspaceItems.push(journeySearchItem);
    }
    workspaceItems.push(attendanceItem);
    if (role === 'PC') {
      workspaceItems.push(createBookingItem);
      workspaceItems.push({ to: '/daily-ops', label: 'Daily Operations', mark: 'DO', roles: ['PC'] });
    }
    if (role === 'PC' || role === 'TL' || role === 'PM') {
      workspaceItems.push(feedbackItem);
    }
    const workspaceGroup: NavGroup = {
      key: 'workspace',
      label: 'Workspace',
      items: workspaceItems,
    };
    if (sessionRole !== 'TENANT_ADMIN') return [workspaceGroup];
    return [
      workspaceGroup,
      { key: 'administration', label: 'Administration', items: [projectAdministrationItem] },
    ];
  }, [c0OperationalShell, role, sessionRole]);

  const activeGroupKey = useMemo(() => {
    return visibleGroups.find((group) => group.items.some((item) => {
      const itemPath = item.to.split('?')[0];
      return location.pathname === itemPath || location.pathname.startsWith(`${itemPath}/`);
    }))?.key
      ?? visibleGroups[0]?.key
      ?? 'workspace';
  }, [location.pathname, visibleGroups]);
  const [openGroup, setOpenGroup] = useState(activeGroupKey);

  useEffect(() => {
    setMobileMenuOpen(false);
    setOpenGroup(activeGroupKey);
  }, [activeGroupKey, location.pathname, location.search]);

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

  const dynamicLabel = dynamicRouteLabels.find(([prefix]) => location.pathname.startsWith(prefix))?.[1];
  const currentLabel = createBookingMode
    ? 'Capture New Booking'
    : routeLabels[location.pathname]
      ?? dynamicLabel
      ?? 'Workspace';
  const visibleName = displayName || 'User';
  const roleLabel = roleLabels[role];
  const avatarText = initials(visibleName);

  const canSeeItem = (item: NavItem) => {
    if (item.devOnly && !diTestAvailable) return false;
    if (!item.roles) return true;
    if (item.to === '/admin/project' && sessionRole === 'TENANT_ADMIN') return true;
    return item.roles.includes(role);
  };

  const isNavItemActive = (item: NavItem, isActive: boolean) => {
    if (item.to === createBookingItem.to) return createBookingMode;
    if (item.to === '/dashboard') return isActive && !createBookingMode;
    return isActive;
  };

  return (
    <div className={`enterprise-shell enterprise-shell--approved-nav${mobileMenuOpen ? ' enterprise-shell--menu-open' : ''}`}>
      <button type="button" className="enterprise-mobile-backdrop" aria-label="Close navigation" onClick={() => setMobileMenuOpen(false)} />

      <header className="enterprise-topbar enterprise-topbar--global">
        <div className="enterprise-topbar__start">
          <button type="button" className="enterprise-menu-button" aria-label="Open navigation" aria-expanded={mobileMenuOpen} onClick={() => setMobileMenuOpen(true)}><span aria-hidden="true">☰</span></button>
          <NavLink className="enterprise-global-brand" to="/dashboard" aria-label="Verigence home" onClick={() => setMobileMenuOpen(false)}><img src={verigenceLockup} alt="Verigence" /></NavLink>
          <div className="enterprise-topbar__trail"><strong>{currentLabel}</strong></div>
        </div>
        <div className="enterprise-topbar__actions">
          {selectedProject && projects.length > 1 && <button type="button" className="uc03-switch-project-topbar" onClick={handleSwitchProject}>Switch Workspace</button>}
          <NavLink to="/profile" className="enterprise-topbar__identity" aria-label="Open profile">
            <span className="enterprise-topbar__avatar">{avatarText}</span>
            <span className="enterprise-topbar__identity-copy"><strong>{visibleName}</strong><small>{roleLabel}</small></span>
          </NavLink>
          <button type="button" className="user-menu-button" onClick={handleSignOut}>Sign Out</button>
        </div>
      </header>

      <aside className={`enterprise-sidebar${mobileMenuOpen ? ' enterprise-sidebar--open' : ''}`} aria-label="Application navigation">
        <div className="enterprise-sidebar__mobile-head">
          <strong>Navigation</strong>
          <button type="button" className="enterprise-sidebar__close" aria-label="Close navigation" onClick={() => setMobileMenuOpen(false)}>×</button>
        </div>
        {selectedProject && (
          <div className="uc03-shell-project">
            <span>Current Workspace</span><strong>{roleLabel}</strong>
            {projects.length > 1 && <button type="button" onClick={handleSwitchProject}>Switch Workspace</button>}
          </div>
        )}
        <nav className="enterprise-nav enterprise-nav--accordion" aria-label="Primary navigation">
          {visibleGroups.map((group) => {
            const items = group.items.filter(canSeeItem);
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
                    <NavLink
                      key={item.to}
                      to={item.to}
                      state={item.to === '/feedback' ? { from: `${location.pathname}${location.search}` } : undefined}
                      onClick={() => setMobileMenuOpen(false)}
                      className={({ isActive }) => `enterprise-nav__item${isNavItemActive(item, isActive) ? ' enterprise-nav__item--active' : ''}`}
                    >
                      <span className="enterprise-nav__mark"><NavIcon mark={item.mark} /></span><span>{item.label}</span>
                    </NavLink>
                  ))}
                </div>
              </div>
            );
          })}
        </nav>
      </aside>

      <div className="enterprise-main">
        <main className="enterprise-content">{children}</main>
      </div>
    </div>
  );
}