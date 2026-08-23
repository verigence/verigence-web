import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

import PageHeader from '../components/PageHeader';
import { selectOperationalProject } from '../features/uc03/projectContext';
import { listProjects, listRoleMappings, type OperatingRole as Uc02OperatingRole } from '../services/audit-core/uc02Admin';
import { listMyOperationalProjects } from '../services/audit-core/uc03';
import { useProjectContextStore } from '../store/projectContextStore';
import { useSessionStore } from '../store/sessionStore';

type Summary = {
  totalEmployees: number;
  totalProjects: number;
  activeProjects: number;
  roles: Record<'PC' | 'TL' | 'PM' | 'CRM' | 'EXECUTIVE', number>;
};

function normalizeRole(role: Uc02OperatingRole): keyof Summary['roles'] | null {
  switch (role.toUpperCase()) {
    case 'PC': return 'PC';
    case 'TL': return 'TL';
    case 'PM': return 'PM';
    case 'CRM': return 'CRM';
    case 'EXECUTIVE': return 'EXECUTIVE';
    default: return null;
  }
}

async function loadSummary(accessToken: string): Promise<Summary> {
  const projects = await listProjects(accessToken);
  const roleMappings = await Promise.all(
    projects.map((project) => listRoleMappings(project.tenantId, accessToken)),
  );

  const allEmployees = new Set<string>();
  const byRole: Record<keyof Summary['roles'], Set<string>> = {
    PC: new Set<string>(),
    TL: new Set<string>(),
    PM: new Set<string>(),
    CRM: new Set<string>(),
    EXECUTIVE: new Set<string>(),
  };

  roleMappings.flat().forEach((mapping) => {
    allEmployees.add(mapping.userId);
    const role = normalizeRole(mapping.operatingRole);
    if (role) byRole[role].add(mapping.userId);
  });

  return {
    totalEmployees: allEmployees.size,
    totalProjects: projects.length,
    activeProjects: projects.filter((project) => project.projectStatus.toUpperCase() === 'ACTIVE').length,
    roles: {
      PC: byRole.PC.size,
      TL: byRole.TL.size,
      PM: byRole.PM.size,
      CRM: byRole.CRM.size,
      EXECUTIVE: byRole.EXECUTIVE.size,
    },
  };
}

export default function AdminLandingPage() {
  const accessToken = useSessionStore((state) => state.accessToken);
  const setProjects = useProjectContextStore((state) => state.setProjects);
  const queryClient = useQueryClient();

  const summaryQuery = useQuery({
    queryKey: ['admin-landing-summary'],
    queryFn: () => loadSummary(accessToken!),
    enabled: Boolean(accessToken),
    staleTime: 30_000,
    retry: 1,
  });

  const operationalProjectsQuery = useQuery({
    queryKey: ['uc03-projects'],
    queryFn: () => listMyOperationalProjects(accessToken),
    enabled: Boolean(accessToken),
    staleTime: 15_000,
    retry: 1,
  });

  const operationalProjects = operationalProjectsQuery.data ?? [];
  if (operationalProjectsQuery.data) setProjects(operationalProjectsQuery.data);

  const summary = summaryQuery.data;
  const metrics = [
    ['Total Employees', summary?.totalEmployees, 'Unique employees with an operational role across Projects'],
    ['Process Consultants', summary?.roles.PC, 'Unique PC assignments across Projects'],
    ['Team Leads', summary?.roles.TL, 'Unique TL assignments across Projects'],
    ['Project Managers', summary?.roles.PM, 'Unique PM assignments across Projects'],
    ['CRM', summary?.roles.CRM, 'Unique CRM assignments across Projects'],
    ['Executives', summary?.roles.EXECUTIVE, 'Unique Executive assignments across Projects'],
    ['Total Projects', summary?.totalProjects, summary ? `${summary.activeProjects} active Project${summary.activeProjects === 1 ? '' : 's'}` : 'All provisioned Projects'],
  ] as const;

  return (
    <section className="admin-landing screen-stack">
      <PageHeader
        eyebrow="Verigence Administration"
        title="Overview"
        description="A high-level view of Project staffing and the Verigence Project estate."
        actions={<Link to="/admin/project" className="uc01-admin-button uc01-admin-button--primary">Project Provisioning</Link>}
      />

      {summaryQuery.isError ? (
        <div className="admin-landing__error" role="alert">
          <div>
            <strong>Administration summary could not be loaded.</strong>
            <p>The dashboard never estimates staffing numbers. Retry to load the authoritative Project and role-mapping data.</p>
          </div>
          <button type="button" className="uc01-admin-button" onClick={() => summaryQuery.refetch()}>Try Again</button>
        </div>
      ) : (
        <div className="admin-landing__metrics" aria-label="Administration metrics">
          {metrics.map(([label, value, detail]) => (
            <article className="admin-landing__metric" key={label}>
              <span>{label}</span>
              <strong>{summaryQuery.isPending ? '—' : String(value ?? 0)}</strong>
              <small>{detail}</small>
            </article>
          ))}
        </div>
      )}

      <section className="admin-landing__projects" aria-labelledby="admin-projects-title">
        <header>
          <div>
            <span className="eyebrow">Operational access</span>
            <h2 id="admin-projects-title">Open a Project</h2>
            <p>Select a Project where you currently hold an operating role. Project provisioning and configuration remain available under Administration.</p>
          </div>
          <Link to="/admin/project" className="uc01-admin-button">Manage Projects</Link>
        </header>

        {operationalProjectsQuery.isPending && <div className="admin-landing__project-state">Loading your Projects…</div>}
        {operationalProjectsQuery.isError && (
          <div className="admin-landing__project-state admin-landing__project-state--error">
            We couldn't load your operational Project assignments.
          </div>
        )}
        {operationalProjectsQuery.data && operationalProjects.length === 0 && (
          <div className="admin-landing__project-state">
            You do not currently have an operating role in an active Project. Administration remains available from the navigation.
          </div>
        )}
        {operationalProjects.length > 0 && (
          <div className="admin-landing__project-grid">
            {operationalProjects.map((project) => (
              <button
                type="button"
                className="admin-landing__project-card"
                key={project.tenantId}
                onClick={() => selectOperationalProject(project, queryClient)}
              >
                <span>
                  <strong>{project.projectName}</strong>
                  <small>{project.projectCode}</small>
                </span>
                <span>
                  <strong>{project.operatingRole}</strong>
                  <small>{project.scope.allDealers ? 'All Dealers' : `${project.scope.dealerCount} dealer scope`}</small>
                </span>
                <b aria-hidden="true">→</b>
              </button>
            ))}
          </div>
        )}
      </section>

      <p className="admin-landing__note">
        Employee role counts are unique within each role. Because one employee may hold different operating roles in different Projects, role totals can overlap and do not have to equal Total Employees.
      </p>
    </section>
  );
}
