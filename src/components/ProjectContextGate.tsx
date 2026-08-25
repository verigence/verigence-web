import { useEffect, type PropsWithChildren } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';

import { verigenceLockup } from '../assets/verigenceLockup';
import type { OperatingRole } from '../domain/models';
import {
  resetOperationalContext,
  selectOperationalOutlet,
  selectOperationalProject,
} from '../features/uc03/projectContext';
import { listMyOperationalProjects } from '../services/audit-core/uc03';
import { useProjectContextStore } from '../store/projectContextStore';
import { useSessionStore } from '../store/sessionStore';

const roleLabels: Record<OperatingRole, string> = {
  PC: 'Process Coordinator',
  TL: 'Team Lead',
  PM: 'Project Manager',
  CRM: 'CRM',
  EXECUTIVE: 'Executive',
};

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
    retry: 1,
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
            <button type="button" className="user-menu-button" onClick={handleSignOut}>Sign out</button>
          </div>
        </section>
      </main>
    );
  }

  if (projects.length === 0) {
    return (
      <main className="uc03-project-gate">
        <section className="uc03-project-gate__panel">
          <img src={verigenceLockup} alt="Verigence" />
          <h1>No active workspaces are currently assigned to you.</h1>
          <p>Please contact your Verigence administrator.</p>
          <button type="button" className="user-menu-button" onClick={handleSignOut}>Sign out</button>
        </section>
      </main>
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
          <button type="button" className="user-menu-button" onClick={handleSignOut}>Sign out</button>
        </section>
      </main>
    );
  }

  if (selectedProject.operatingRole === 'PC' && selectedProject.scope.outlets.length === 0) {
    return (
      <main className="uc03-project-gate">
        <section className="uc03-project-gate__panel" role="alert">
          <img src={verigenceLockup} alt="Verigence" />
          <h1>No active work location is assigned to you.</h1>
          <p>Your Process Coordinator role must be mapped to at least one active work location.</p>
          <button type="button" className="user-menu-button" onClick={handleSignOut}>Sign out</button>
        </section>
      </main>
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
          <button type="button" className="user-menu-button" onClick={handleSignOut}>Sign out</button>
        </section>
      </main>
    );
  }

  return children;
}
