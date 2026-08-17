import type { PropsWithChildren } from 'react';
import { NavLink } from 'react-router-dom';

const navItems = [
  { to: '/workspace', label: 'Workspace' },
  { to: '/approvals', label: 'Approvals' },
  { to: '/evidence', label: 'Evidence' },
];

export default function AppShell({ children }: PropsWithChildren) {
  return (
    <div className="app-shell">
      <aside className="app-shell__sidebar">
        <div className="app-shell__brand">
          <img src="/brand/svg/verigence-logo.svg" alt="Verigence" />
        </div>

        <nav className="app-shell__nav" aria-label="Primary navigation">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `app-shell__nav-link${isActive ? ' app-shell__nav-link--active' : ''}`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="app-shell__principle">
          <strong>Evidence first</strong>
          <span>Capture source evidence. Do not re-key audit facts.</span>
        </div>
      </aside>

      <div className="app-shell__main">
        <header className="app-shell__topbar">
          <div>
            <span className="eyebrow">Audit • Governance • Intelligence</span>
          </div>
          <div className="environment-chip">V1 · DEV</div>
        </header>
        <main className="app-shell__content">{children}</main>
      </div>
    </div>
  );
}
