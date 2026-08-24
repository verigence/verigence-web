import { useEffect, useRef, useState } from 'react';

import { auditCoreErrorMessage } from '../../services/audit-core/errorMessage';
import { listProjects, type ProjectSelection } from '../../services/audit-core/uc02Admin';
import { useProjectContextStore } from '../../store/projectContextStore';
import { useSessionStore } from '../../store/sessionStore';

type ProjectDirectoryCache = {
  accessToken: string;
  values: ProjectSelection[];
};

let projectDirectoryCache: ProjectDirectoryCache | null = null;
let projectDirectoryInFlight: { accessToken: string; promise: Promise<ProjectSelection[]> } | null = null;
const refreshedMissingProjects = new Set<string>();

function cachedProjectDirectory(accessToken: string): ProjectSelection[] | null {
  return projectDirectoryCache?.accessToken === accessToken ? projectDirectoryCache.values : null;
}

function missingProjectRefreshKey(accessToken: string, tenantId: string) {
  return `${accessToken}\u0000${tenantId}`;
}

function loadProjectDirectory(
  accessToken: string,
  { forceRefresh = false }: { forceRefresh?: boolean } = {},
): Promise<ProjectSelection[]> {
  const cached = cachedProjectDirectory(accessToken);
  if (!forceRefresh && cached) {
    return Promise.resolve(cached);
  }
  if (projectDirectoryInFlight?.accessToken === accessToken) {
    return projectDirectoryInFlight.promise;
  }

  const promise = listProjects(accessToken)
    .then((values) => {
      projectDirectoryCache = { accessToken, values };
      return values;
    })
    .finally(() => {
      if (projectDirectoryInFlight?.promise === promise) {
        projectDirectoryInFlight = null;
      }
    });
  projectDirectoryInFlight = { accessToken, promise };
  return promise;
}

export default function ProjectSelector({
  currentProjectName,
  onSelectionChange,
  onError,
}: {
  currentProjectName?: string;
  onSelectionChange: (tenantId: string) => void;
  onError: (message: string) => void;
}) {
  const accessToken = useSessionStore((state) => state.accessToken);
  const role = useSessionStore((state) => state.role);
  const tenantId = useSessionStore((state) => state.tenantId);
  const setBusinessContext = useSessionStore((state) => state.setBusinessContext);
  const selectedOperationalProject = useProjectContextStore((state) => state.selectedProject);
  const tenantAdmin = role === 'TENANT_ADMIN';
  const [projects, setProjects] = useState<ProjectSelection[]>(() =>
    !tenantAdmin && accessToken ? cachedProjectDirectory(accessToken) || [] : [],
  );
  const [loading, setLoading] = useState(false);
  const [loadWarning, setLoadWarning] = useState('');
  const onSelectionChangeRef = useRef(onSelectionChange);

  useEffect(() => {
    onSelectionChangeRef.current = onSelectionChange;
  }, [onSelectionChange]);

  void onError;

  useEffect(() => {
    if (!tenantAdmin || tenantId || !selectedOperationalProject) return;
    setBusinessContext({ tenantId: selectedOperationalProject.tenantId, dealerId: '', outletId: '' });
    onSelectionChangeRef.current(selectedOperationalProject.tenantId);
  }, [selectedOperationalProject, setBusinessContext, tenantAdmin, tenantId]);

  useEffect(() => {
    if (tenantAdmin) {
      setProjects([]);
      setLoading(false);
      setLoadWarning('');
      return;
    }
    if (!accessToken) {
      setProjects([]);
      setLoadWarning('');
      return;
    }

    const cached = cachedProjectDirectory(accessToken);
    if (cached) {
      setProjects(cached);
      setLoadWarning('');
      return;
    }

    let cancelled = false;
    setLoading(true);
    setLoadWarning('');

    void loadProjectDirectory(accessToken)
      .then((values) => {
        if (!cancelled) setProjects(values);
      })
      .catch((error) => {
        if (cancelled) return;
        const message = auditCoreErrorMessage(error);
        setProjects([]);
        setLoadWarning(
          message
            ? `Existing projects could not be loaded (${message}). Your current project has been preserved.`
            : 'Existing projects could not be loaded. Your current project has been preserved.',
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [accessToken, tenantAdmin]);

  useEffect(() => {
    if (tenantAdmin || !accessToken || !tenantId) return;

    const cached = cachedProjectDirectory(accessToken);
    if (!cached || cached.some((item) => item.tenantId === tenantId)) return;

    const refreshKey = missingProjectRefreshKey(accessToken, tenantId);
    if (refreshedMissingProjects.has(refreshKey)) return;
    refreshedMissingProjects.add(refreshKey);

    let cancelled = false;
    setLoading(true);
    setLoadWarning('');
    void loadProjectDirectory(accessToken, { forceRefresh: true })
      .then((values) => {
        if (!cancelled) setProjects(values);
      })
      .catch((error) => {
        if (cancelled) return;
        const message = auditCoreErrorMessage(error);
        setLoadWarning(
          message
            ? `Project list refresh failed (${message}). Your current project has been preserved.`
            : 'Project list refresh failed. Your current project has been preserved.',
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [accessToken, tenantAdmin, tenantId]);

  if (tenantAdmin) {
    const assignedTenantId = tenantId || selectedOperationalProject?.tenantId || '';
    const assignedProjectName = currentProjectName || selectedOperationalProject?.projectName || 'Assigned Project';
    return (
      <div className="uc02-field">
        <select aria-label="Assigned Project" value={assignedTenantId} disabled>
          {!assignedTenantId && <option value="">Select your Project from the dashboard</option>}
          {assignedTenantId && <option value={assignedTenantId}>{assignedProjectName}</option>}
        </select>
        {!assignedTenantId && <small>Tenant Admin manages only the Project currently assigned to its tenant context.</small>}
      </div>
    );
  }

  const currentIsListed = projects.some((item) => item.tenantId === tenantId);

  function select(nextTenantId: string) {
    setBusinessContext({ tenantId: nextTenantId, dealerId: '', outletId: '' });
    onSelectionChangeRef.current(nextTenantId);
  }

  return (
    <div className="uc02-field">
      <select
        aria-label="Select Project"
        value={tenantId}
        onChange={(event) => select(event.target.value)}
        disabled={!accessToken || loading}
      >
        <option value="">New Project</option>
        {tenantId && !currentIsListed && currentProjectName && (
          <option value={tenantId}>{currentProjectName}</option>
        )}
        {projects.map((item) => (
          <option key={item.tenantId} value={item.tenantId}>
            {item.projectName} · {item.projectStatus}
          </option>
        ))}
      </select>
      {loadWarning && <small className="uc02-selector-warning">{loadWarning}</small>}
    </div>
  );
}
