import type { QueryClient } from '@tanstack/react-query';

import {
  awaitPrimaryUc03WorkQueue,
  type OperationalOutletScope,
  type OperationalProject,
} from '../../services/audit-core/uc03';
import { useProjectContextStore } from '../../store/projectContextStore';
import { useSessionStore } from '../../store/sessionStore';

const WORKSPACE_HINT_PREFIX = 'verigence.uc03.workspace.v1:';
let restoredHintNeedsRevalidation = false;

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

export function accessTokenSubject(accessToken?: string): string | undefined {
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

function revalidateRestoredOperationalContext(queryClient: QueryClient): void {
  if (!restoredHintNeedsRevalidation) return;
  restoredHintNeedsRevalidation = false;
  void queryClient.invalidateQueries({ queryKey: ['uc03-projects'] });
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

    // The previously server-validated Project/Outlet is navigation-only. Seed it so
    // the first Work Queue request can start immediately. Do not make /me/projects
    // compete with that first useful request: the Work Queue itself still performs
    // live JWT, Security authorization, assignment and RLS checks.
    queryClient.setQueryData(['uc03-projects'], [project]);
    restoredHintNeedsRevalidation = true;

    // Dashboard registers its primary Work Queue request during the next render.
    // Reuse the existing primary-request coordinator so authoritative workspace
    // revalidation starts only after that first queue request has settled.
    globalThis.setTimeout(() => {
      void awaitPrimaryUc03WorkQueue(project.tenantId, outlet?.outletId).finally(() => {
        revalidateRestoredOperationalContext(queryClient);
      });
    }, 0);
    return true;
  } catch {
    restoredHintNeedsRevalidation = false;
    return false;
  }
}

/**
 * True when the shell's Outlet list can reach this Project's work on its own.
 *
 * Only a Process Coordinator works one Outlet at a time, so only a PC gets that
 * list -- and only a Project the list actually names is reachable without going
 * back through the selection gate. A Reviewer covers all of its Outlets at once
 * and a Project-wide role (TL, PM, Executive) carries no Outlet rows at all, so
 * neither can be entered from the shell.
 */
export function isShellSwitchableProject(project: OperationalProject): boolean {
  return project.operatingRole === 'PC' && project.scope.outlets.length > 0;
}

/**
 * The Project to open without asking, or undefined when the person must choose.
 *
 * One Project has always opened by itself. More than one did not, which left
 * everyone holding two assignments on an unnamed "Choose Workspace" list
 * ("Workspace 1", "Workspace 2") -- the selection gate may not show Project,
 * Dealer or Outlet names before a Project is selected, so the choice carried no
 * information to make it with.
 *
 * It is skipped when every Project is one the shell itself can switch between:
 * entering through any of them leaves the rest one named click away in the
 * sidebar, so nothing is unreachable and nothing has to be picked blind. A set
 * holding a Reviewer or a Project-wide assignment still needs the gate, because
 * the shell cannot offer those (see isShellSwitchableProject).
 */
export function autoSelectableProject(
  projects: OperationalProject[],
): OperationalProject | undefined {
  if (projects.length === 1) return projects[0];
  if (projects.length > 1 && projects.every(isShellSwitchableProject)) return projects[0];
  return undefined;
}

/**
 * The Outlet a Process Coordinator starts in before choosing one.
 *
 * 2026-10 product-owner decision: a PC holding several Outlets must land in the
 * app, not on a chooser. The ONSITE Outlet is where they sit, so it is the
 * default; SATELLITE Outlets are reached from the shell's Outlet list. Those are
 * the only two classifications Audit Core accepts (dealers.py: OutletCreate),
 * and ONSITE is its default, so the fallback to the first Outlet only matters
 * for older rows.
 *
 * Only a PC: a Reviewer covers all of its Outlets at once and the Project-wide
 * roles work above Outlet level, so neither has a current Outlet to pick.
 */
export function defaultOutletFor(
  project: OperationalProject,
): OperationalOutletScope | undefined {
  if (project.operatingRole !== 'PC') return undefined;
  const outlets = project.scope.outlets;
  return outlets.find((outlet) => (outlet.outletClassification || '').toUpperCase() === 'ONSITE')
    ?? outlets[0];
}

/** Whether this Outlet is one the person actually holds in this Project. */
export function projectHasOutlet(project: OperationalProject, outletId: string): boolean {
  return project.scope.outlets.some((outlet) => outlet.outletId === outletId);
}

export function selectOperationalOutlet(
  project: OperationalProject,
  outlet: OperationalOutletScope,
  queryClient: QueryClient,
): void {
  // Choosing an Outlet does not make the restored Project list authoritative, so
  // it must not cancel the pending revalidation. It used to: the gate
  // auto-selects the only Outlet of a one-Outlet PC straight after the hint is
  // restored, which cleared the flag before the revalidation ran. The list then
  // stayed as the single Project the hint carried -- for the whole session,
  // because that query never refetches -- so a second Project stayed invisible
  // and the nav kept gating on a stale operating role.
  clearTenantQueries(queryClient);

  // An Outlet-scoped person can hold Outlets in more than one Project, and the
  // shell offers all of them in one list. Picking an Outlet under a different
  // Project has to move the selected Project with it, or the session would keep
  // the previous Project's operating role and scope while reading the new
  // Tenant's data. Only when it actually differs: selecting the same Project
  // again would replace the object for no reason and re-render the shell.
  if (useProjectContextStore.getState().selectedProject?.tenantId !== project.tenantId) {
    useProjectContextStore.getState().selectProject(project);
  }

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
  // Same reason as selectOperationalOutlet: picking a Project from a list that
  // may itself be a one-entry stub from localStorage is not a reason to stop
  // asking the server what the person is actually assigned to.
  clearTenantQueries(queryClient);
  // A PC starts in their ONSITE Outlet rather than on a chooser, however many
  // Outlets they hold (it used to be pre-set only when there was exactly one).
  const startingOutlet = defaultOutletFor(project);
  useSessionStore.getState().setBusinessContext({
    tenantId: project.tenantId,
    dealerId: startingOutlet?.dealerId || '',
    outletId: startingOutlet?.outletId || '',
  });
  useProjectContextStore.getState().selectProject(project);
  if (project.operatingRole !== 'PC' || startingOutlet) {
    persistWorkspaceHint(project, startingOutlet?.outletId);
  }
}


export function clearOperationalProject(queryClient: QueryClient): void {
  restoredHintNeedsRevalidation = false;
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
  restoredHintNeedsRevalidation = false;
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
