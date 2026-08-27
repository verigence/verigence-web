import type { QueryClient } from '@tanstack/react-query';

import type { OperationalOutletScope, OperationalProject } from '../../services/audit-core/uc03';
import { useProjectContextStore } from '../../store/projectContextStore';
import { useSessionStore } from '../../store/sessionStore';

const WORKSPACE_HINT_PREFIX = 'verigence.uc03.workspace.v1:';

interface WorkspaceHint {
  project: OperationalProject;
  outletId?: string;
}

function clearTenantQueries(queryClient: QueryClient): void {
  void queryClient.cancelQueries({
    predicate: (query) => query.queryKey[0] !== 'uc03-projects',
  });
  queryClient.removeQueries({
    predicate: (query) => query.queryKey[0] !== 'uc03-projects',
  });
}

function accessTokenSubject(accessToken?: string): string | undefined {
  if (!accessToken) return undefined;
  try {
    const payload = accessToken.split('.')[1];
    if (!payload) return undefined;
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    const decoded = JSON.parse(globalThis.atob(padded)) as { sub?: unknown };
    return typeof decoded.sub === 'string' && decoded.sub.trim() ? decoded.sub.trim() : undefined;
  } catch {
    return undefined;
  }
}

function workspaceHintKey(accessToken?: string): string | undefined {
  const subject = accessTokenSubject(accessToken);
  return subject ? `${WORKSPACE_HINT_PREFIX}${subject}` : undefined;
}

function persistWorkspaceHint(project: OperationalProject, outletId?: string): void {
  const key = workspaceHintKey(useSessionStore.getState().accessToken);
  if (!key) return;
  try {
    globalThis.localStorage?.setItem(key, JSON.stringify({ project, outletId } satisfies WorkspaceHint));
  } catch {
    // Local reuse is a performance hint only; the authoritative server flow remains intact.
  }
}

function clearWorkspaceHint(): void {
  const key = workspaceHintKey(useSessionStore.getState().accessToken);
  if (!key) return;
  try {
    globalThis.localStorage?.removeItem(key);
  } catch {
    // Ignore storage restrictions.
  }
}

export function restoreOperationalContextHint(
  accessToken: string,
  queryClient: QueryClient,
): boolean {
  const key = workspaceHintKey(accessToken);
  if (!key) return false;

  try {
    const raw = globalThis.localStorage?.getItem(key);
    if (!raw) return false;
    const hint = JSON.parse(raw) as Partial<WorkspaceHint>;
    const project = hint.project;
    if (!project?.tenantId || !project.projectCode || !project.operatingRole) return false;

    const outlet = hint.outletId
      ? project.scope?.outlets?.find((candidate) => candidate.outletId === hint.outletId)
      : undefined;
    if (project.operatingRole === 'PC' && !outlet) return false;

    useProjectContextStore.getState().setProjects([project]);
    useProjectContextStore.getState().selectProject(project);
    useSessionStore.getState().setBusinessContext({
      tenantId: project.tenantId,
      dealerId: outlet?.dealerId || '',
      outletId: outlet?.outletId || '',
    });

    // Seed navigation immediately, then force authoritative Project/assignment
    // revalidation in the background. Server JWT, Security authorization and RLS
    // remain the authority for every Work Queue/Booking request.
    queryClient.setQueryData(['uc03-projects'], [project]);
    void queryClient.invalidateQueries({ queryKey: ['uc03-projects'] });
    return true;
  } catch {
    return false;
  }
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
  persistWorkspaceHint(project, outlet.outletId);
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
  if (project.operatingRole !== 'PC' || onlyPcOutlet) {
    persistWorkspaceHint(project, onlyPcOutlet?.outletId);
  }
}

export function clearOperationalOutlet(queryClient: QueryClient): void {
  clearTenantQueries(queryClient);
  useSessionStore.getState().setBusinessContext({ dealerId: '', outletId: '' });
}

export function clearOperationalProject(queryClient: QueryClient): void {
  clearTenantQueries(queryClient);
  clearWorkspaceHint();
  useSessionStore.getState().setBusinessContext({
    tenantId: '',
    dealerId: '',
    outletId: '',
  });
  useProjectContextStore.getState().clearSelection();
}

export function resetOperationalContext(queryClient?: QueryClient): void {
  if (queryClient) {
    clearTenantQueries(queryClient);
    void queryClient.cancelQueries({ queryKey: ['uc03-projects'] });
    queryClient.removeQueries({ queryKey: ['uc03-projects'] });
  }
  useSessionStore.getState().setBusinessContext({
    tenantId: '',
    dealerId: '',
    outletId: '',
  });
  useProjectContextStore.getState().reset();
}
