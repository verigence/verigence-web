import type { QueryClient } from '@tanstack/react-query';

import type { OperationalProject } from '../../services/audit-core/uc03';
import { useProjectContextStore } from '../../store/projectContextStore';
import { useSessionStore } from '../../store/sessionStore';

function clearTenantQueries(queryClient: QueryClient): void {
  void queryClient.cancelQueries({
    predicate: (query) => query.queryKey[0] !== 'uc03-projects',
  });
  queryClient.removeQueries({
    predicate: (query) => query.queryKey[0] !== 'uc03-projects',
  });
}

export function selectOperationalProject(
  project: OperationalProject,
  queryClient: QueryClient,
): void {
  clearTenantQueries(queryClient);
  useSessionStore.getState().setBusinessContext({
    tenantId: project.tenantId,
    dealerId: '',
    outletId: '',
  });
  useProjectContextStore.getState().selectProject(project);
}

export function clearOperationalProject(queryClient: QueryClient): void {
  clearTenantQueries(queryClient);
  useSessionStore.getState().setBusinessContext({
    tenantId: '',
    dealerId: '',
    outletId: '',
  });
  useProjectContextStore.getState().clearSelection();
}

export function resetOperationalContext(queryClient?: QueryClient): void {
  if (queryClient) clearTenantQueries(queryClient);
  useSessionStore.getState().setBusinessContext({
    tenantId: '',
    dealerId: '',
    outletId: '',
  });
  useProjectContextStore.getState().reset();
}
