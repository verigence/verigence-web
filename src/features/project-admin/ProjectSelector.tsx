import { useEffect, useRef, useState } from 'react';

import { auditCoreErrorMessage } from '../../services/audit-core/errorMessage';
import { listProjects, type ProjectSelection } from '../../services/audit-core/uc02Admin';
import { useSessionStore } from '../../store/sessionStore';

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
  const [projects, setProjects] = useState<ProjectSelection[]>([]);
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
    let cancelled = false;
    setLoading(true);
    setLoadWarning('');
    void listProjects(accessToken)
      .then((values) => {
        if (cancelled) return;
        setProjects(values);

        // Project directory discovery is not authoritative enough to mutate the
        // user's active business context. A transient empty/mismatched directory
        // must never silently throw the user back to "New Project". The active
        // Project remains until the user explicitly changes it or its own GET fails.
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
