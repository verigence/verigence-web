import type { QueryClient } from '@tanstack/react-query';

import type { OperationalOutletScope, OperationalProject } from '../../services/audit-core/uc03';
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

export function selectOperationalOutlet(
  project: OperationalProject,
  outlet: OperationalOutletScope,
  queryClient: QueryClient,
): void {
  clearTenantQueries(queryClient);
  useSessionStore.getState().setBusinessContext({
    tenantId: project.tenantId,
    dealerId: outlet.dealerId,
    outletId: outlet.outletId,
  });
}

export function selectOperationalProject(
  project: OperationalProject,
  queryClient: QueryClient,
): void {
  clearTenantQueries(queryClient);
  const onlyPcOutlet = project.operatingRole === 'PC' && project.scope.outlets.length === 1
    ? project.scope.outlets[0]
    : undefined;
  useSessionStore.getState().setBusinessContext({
    tenantId: project.tenantId,
    dealerId: onlyPcOutlet?.dealerId || '',
    outletId: onlyPcOutlet?.outletId || '',
  });
  useProjectContextStore.getState().selectProject(project);
}

export function clearOperationalOutlet(queryClient: QueryClient): void {
  clearTenantQueries(queryClient);
  useSessionStore.getState().setBusinessContext({ dealerId: '', outletId: '' });
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
