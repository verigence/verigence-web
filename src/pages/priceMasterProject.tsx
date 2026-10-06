import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Navigate } from 'react-router-dom';

import { listProjects } from '../services/audit-core/uc02Admin';
import { useProjectContextStore } from '../store/projectContextStore';
import { useSessionStore } from '../store/sessionStore';

export type PriceMasterAccess = 'browse' | 'upload';

/** Who may open each price master screen: browse is for PC, TL, PM and SuperAdmin; upload for TL, PM and SuperAdmin. */
export function priceMasterAllowed(access: PriceMasterAccess, role: string, operatingRole?: string): boolean {
  if (role === 'SUPER_ADMIN') return true;
  return access === 'upload' ? ['TL', 'PM'].includes(operatingRole ?? '') : ['PC', 'TL', 'PM'].includes(operatingRole ?? '');
}

/**
 * The project the price master screens work on: the person's selected project; a SuperAdmin, who has none,
 * picks one. `redirect` is set when this role may not open the screen.
 */
export function usePriceMasterProject(access: PriceMasterAccess) {
  const role = useSessionStore((state) => state.role);
  const accessToken = useSessionStore((state) => state.accessToken);
  const selectedProject = useProjectContextStore((state) => state.selectedProject);
  const [picked, setPicked] = useState('');
  const isSuperAdmin = role === 'SUPER_ADMIN';
  const allowed = priceMasterAllowed(access, role, selectedProject?.operatingRole);

  const projectsQuery = useQuery({
    queryKey: ['admin-projects'],
    enabled: Boolean(accessToken) && isSuperAdmin && !selectedProject,
    queryFn: () => listProjects(accessToken!),
  });

  return {
    allowed,
    accessToken,
    tenantId: selectedProject?.tenantId ?? picked,
    needsPicker: isSuperAdmin && !selectedProject,
    projects: projectsQuery.data ?? [],
    projectsLoading: projectsQuery.isLoading,
    pick: setPicked,
  };
}

export function PriceMasterRedirect() {
  return <Navigate to="/dashboard" replace />;
}

export function ProjectPicker({
  projects,
  value,
  loading,
  onChange,
}: {
  projects: { tenantId: string; projectCode: string }[];
  value: string;
  loading: boolean;
  onChange: (tenantId: string) => void;
}) {
  return (
    <label className="oem-masters-page__project">
      Project
      <select value={value} onChange={(event) => onChange(event.target.value)} disabled={loading}>
        <option value="">Select a project…</option>
        {projects.map((project) => (
          <option key={project.tenantId} value={project.tenantId}>
            {project.projectCode}
          </option>
        ))}
      </select>
    </label>
  );
}
