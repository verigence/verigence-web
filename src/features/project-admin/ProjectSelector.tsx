import { useEffect, useRef, useState } from 'react';

import { auditCoreErrorMessage } from '../../services/audit-core/errorMessage';
import { listProjects, type ProjectSelection } from '../../services/audit-core/uc02Admin';
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
  const tenantId = useSessionStore((state) => state.tenantId);
  const setBusinessContext = useSessionStore((state) => state.setBusinessContext);
  const [projects, setProjects] = useState<ProjectSelection[]>(() =>
    accessToken ? cachedProjectDirectory(accessToken) || [] : [],
  );
  const [loading, setLoading] = useState(false);
  const [loadWarning, setLoadWarning] = useState('');
  const onSelectionChangeRef = useRef(onSelectionChange);

  // Keep the callback current without making Project discovery depend on parent
  // render identity. Dealer/outlet/form state changes must not re-fetch /v1/projects.
  useEffect(() => {
    onSelectionChangeRef.current = onSelectionChange;
  }, [onSelectionChange]);

  // Active-project loading has its own error handling in ProjectAdministrationPage.
  // Keep this callback in the public component contract for compatibility, but never
  // turn a directory-discovery failure into the page-level Create Project error.
  void onError;

  useEffect(() => {
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

    // The resolved directory is retained only in this JavaScript process. Step
    // navigation/remounts reuse it and therefore do not call GET /v1/projects again.
    // Nothing is written to localStorage/sessionStorage and a different access token
    // cannot reuse another authenticated session's cached Project directory.
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
  }, [accessToken]);

  useEffect(() => {
    if (!accessToken || !tenantId) return;

    const cached = cachedProjectDirectory(accessToken);
    if (!cached || cached.some((item) => item.tenantId === tenantId)) return;

    // An explicitly selected existing Project is already in the browser directory.
    // A tenantId that appears after the directory was loaded is therefore normally a
    // newly-created Project. Refresh exactly once for that Project so the new entry is
    // incorporated, then keep using browser memory while the user moves across steps.
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
  }, [accessToken, tenantId]);

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
