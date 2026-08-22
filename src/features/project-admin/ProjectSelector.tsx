import { useEffect, useState } from 'react';

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

  useEffect(() => {
    if (!accessToken) {
      setProjects([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void listProjects(accessToken)
      .then((values) => {
        if (!cancelled) setProjects(values);
      })
      .catch((error) => {
        if (!cancelled) onError(auditCoreErrorMessage(error));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, tenantId, onError]);

  const currentIsListed = projects.some((item) => item.tenantId === tenantId);

  function select(nextTenantId: string) {
    setBusinessContext({ tenantId: nextTenantId, dealerId: '', outletId: '' });
    onSelectionChange(nextTenantId);
  }

  return (
    <select
      className="uc02-project-select"
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
  );
}
