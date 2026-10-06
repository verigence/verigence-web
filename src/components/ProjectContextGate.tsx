import { useEffect, type PropsWithChildren } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, Navigate, useNavigate } from 'react-router-dom';

import { verigenceLockup } from '../assets/verigenceLockup';
import type { OperatingRole } from '../domain/models';
import { useHrAccess } from '../features/hr/hrQueries';
import { hrHomePath } from '../features/rollout/landing';
import {
  resetOperationalContext,
  selectOperationalOutlet,
  selectOperationalProject,
} from '../features/uc03/projectContext';
import { AuditCoreHttpError } from '../services/audit-core/client';
import { listMyOperationalProjects } from '../services/audit-core/uc03';
import { useProjectContextStore } from '../store/projectContextStore';
import { useSessionStore } from '../store/sessionStore';

// The workspace list is the gate to every screen, so a failure here is a
// dead end ("We couldn't load your workspaces"). An HTTP answer from Audit
// Core (401, 403, 500...) is final and is shown at once. A request that
// never got an answer -- the connection dropped, the browser aborted it,
// Audit Core was restarting during a deploy (seen live 2026-09-28: a page
// opened while the DEV service was being replaced) -- is retried a few
// times with a short pause first, which rides through a restart window
// instead of asking the user to click Try Again.
const TRANSIENT_RETRIES = 3;
const TRANSIENT_RETRY_DELAYS_MS = [1_500, 3_000, 5_000];

function isTransient(error: unknown): boolean {
  return !(error instanceof AuditCoreHttpError);
}

const roleLabels: Record<OperatingRole, string> = {
  PC: 'Process Coordinator',
  TL: 'Team Lead',
  PM: 'Project Manager',
  CRM: 'CRM',
  EXECUTIVE: 'Executive',
};

/** A person with HR always has My HR, whatever the Audit side says. A button to it, shown only when the HR service says they have HR. */
function OpenMyHr() {
  const hr = useHrAccess();
  if (!hr.available) return null;
  return <Link className="frozen-auth-primary" to={hrHomePath(hr)}>Open My HR</Link>;
}

/** Audit has nothing for this person to work in. A person who has HR goes to My HR; only someone with nothing at all is told to contact the administrator. */
function DeadEnd({ title, text, onSignOut }: { title: string; text: string; onSignOut: () => void }) {
  const hr = useHrAccess();
  if (hr.loading) {
    return (
      <main className="uc03-project-gate" aria-busy="true">
        <section className="uc03-project-gate__panel">
          <img src={verigenceLockup} alt="Verigence" />
          <div className="uc03-project-gate__spinner" aria-hidden="true" />
          <h1>Opening your workspace</h1>
          <p>Loading your current work context…</p>
        </section>
      </main>
    );
  }
  if (hr.available) return <Navigate to={hrHomePath(hr)} replace />;
  return (
    <main className="uc03-project-gate">
      <section className="uc03-project-gate__panel" role="alert">
        <img src={verigenceLockup} alt="Verigence" />
        <h1>{title}</h1>
        <p>{text}</p>
        <button type="button" className="user-menu-button" onClick={onSignOut}>Sign out</button>
      </section>
    </main>
  );
}

export default function ProjectContextGate({ children }: PropsWithChildren) {
  const accessToken = useSessionStore((state) => state.accessToken);
  const outletId = useSessionStore((state) => state.outletId);
  const signOut = useSessionStore((state) => state.signOut);
  const projects = useProjectContextStore((state) => state.projects);
  const selectedProject = useProjectContextStore((state) => state.selectedProject);
  const setProjects = useProjectContextStore((state) => state.setProjects);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const projectQuery = useQuery({
    queryKey: ['uc03-projects'],
    queryFn: () => listMyOperationalProjects(accessToken),
    staleTime: Infinity,
    gcTime: Infinity,
    retry: (failureCount, error) => isTransient(error) && failureCount < TRANSIENT_RETRIES,
    retryDelay: (attempt) => TRANSIENT_RETRY_DELAYS_MS[Math.min(attempt, TRANSIENT_RETRY_DELAYS_MS.length - 1)],
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  useEffect(() => {
    if (!projectQuery.data) return;
    setProjects(projectQuery.data);
    if (projectQuery.data.length === 1 && !selectedProject) {
      selectOperationalProject(projectQuery.data[0], queryClient);
    }
  }, [projectQuery.data, queryClient, selectedProject, setProjects]);

  useEffect(() => {
    if (!selectedProject || selectedProject.operatingRole !== 'PC') return;
    const onlyOutlet = selectedProject.scope.outlets.length === 1
      ? selectedProject.scope.outlets[0]
      : undefined;
    if (onlyOutlet && outletId !== onlyOutlet.outletId) {
      selectOperationalOutlet(selectedProject, onlyOutlet, queryClient);
    }
  }, [outletId, queryClient, selectedProject]);

  const handleSignOut = () => {
    resetOperationalContext(queryClient);
    signOut();
    navigate('/login', { replace: true });
  };

  if (projectQuery.isPending || (projectQuery.data?.length === 1 && !selectedProject)) {
    return (
      <main className="uc03-project-gate" aria-busy="true">
        <section className="uc03-project-gate__panel">
          <img src={verigenceLockup} alt="Verigence" />
          <div className="uc03-project-gate__spinner" aria-hidden="true" />
          <h1>Opening your workspace</h1>
          <p>Loading your current work context…</p>
        </section>
      </main>
    );
  }

  if (projectQuery.isError) {
    return (
      <main className="uc03-project-gate">
        <section className="uc03-project-gate__panel" role="alert">
          <img src={verigenceLockup} alt="Verigence" />
          <h1>We couldn't load your workspaces.</h1>
          <p>Please try again. If the problem continues, contact your Verigence administrator.</p>
          <div className="uc03-project-gate__actions">
            <button type="button" className="frozen-auth-primary" onClick={() => projectQuery.refetch()}>
              Try Again
            </button>
            <OpenMyHr />
            <button type="button" className="user-menu-button" onClick={handleSignOut}>Sign out</button>
          </div>
        </section>
      </main>
    );
  }

  if (projects.length === 0) {
    return (
      <DeadEnd
        title="No active workspaces are currently assigned to you."
        text="Please contact your Verigence administrator."
        onSignOut={handleSignOut}
      />
    );
  }

  if (!selectedProject) {
    return (
      <main className="uc03-project-gate">
        <section className="uc03-project-gate__panel uc03-project-gate__panel--wide">
          <img src={verigenceLockup} alt="Verigence" />
          <header className="uc03-project-gate__heading">
            <span>Your Workspaces</span>
            <h1>Choose Workspace</h1>
            <p>Select the workspace you want to work in. Your operating role may differ by workspace.</p>
          </header>
          <div className="uc03-project-list">
            {projects.map((project, index) => (
              <button
                type="button"
                className="uc03-project-card"
                key={project.tenantId}
                onClick={() => selectOperationalProject(project, queryClient)}
              >
                <span>
                  <strong>Workspace {index + 1}</strong>
                  <small>{roleLabels[project.operatingRole]}</small>
                </span>
                <span className="uc03-project-card__meta">
                  <strong>Assigned</strong>
                  <small>{project.timezoneName}</small>
                </span>
                <span className="uc03-project-card__arrow" aria-hidden="true">→</span>
              </button>
            ))}
          </div>
          <OpenMyHr />
          <button type="button" className="user-menu-button" onClick={handleSignOut}>Sign out</button>
        </section>
      </main>
    );
  }

  if (selectedProject.operatingRole === 'PC' && selectedProject.scope.outlets.length === 0) {
    return (
      <DeadEnd
        title="No active work location is assigned to you."
        text="Your Process Coordinator role must be mapped to at least one active work location."
        onSignOut={handleSignOut}
      />
    );
  }

  const selectedOutletIsValid = selectedProject.operatingRole !== 'PC'
    || selectedProject.scope.outlets.some((outlet) => outlet.outletId === outletId);

  if (selectedProject.operatingRole === 'PC' && !selectedOutletIsValid) {
    return (
      <main className="uc03-project-gate">
        <section className="uc03-project-gate__panel uc03-project-gate__panel--wide">
          <img src={verigenceLockup} alt="Verigence" />
          <header className="uc03-project-gate__heading">
            <span>Assigned Locations</span>
            <h1>Choose Work Location</h1>
            <p>Select the assigned work location for this session. The landing page will show the Dealer and Outlet context after selection.</p>
          </header>
          <div className="uc03-project-list">
            {selectedProject.scope.outlets.map((outlet, index) => (
              <button
                type="button"
                className="uc03-project-card"
                key={outlet.outletId}
                onClick={() => selectOperationalOutlet(selectedProject, outlet, queryClient)}
              >
                <span>
                  <strong>Work Location {index + 1}</strong>
                  <small>{outlet.outletClassification}</small>
                </span>
                <span className="uc03-project-card__meta">
                  <strong>Process Coordinator</strong>
                  <small>Assigned location</small>
                </span>
                <span className="uc03-project-card__arrow" aria-hidden="true">→</span>
              </button>
            ))}
          </div>
          <OpenMyHr />
          <button type="button" className="user-menu-button" onClick={handleSignOut}>Sign out</button>
        </section>
      </main>
    );
  }

  return children;
}
