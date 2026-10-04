import type { OperationalProject } from '../../services/audit-core/uc03';

export interface WorkContextLabels {
  project: string;
  dealer: string;
  outlet: string;
}

const NOT_ASSIGNED = 'Not assigned';

/** The person's real name: HR's record when there is one, otherwise the sign-in name. */
export function chooseDisplayName(hrFullName: string | null | undefined, sessionName: string | null | undefined): string {
  return hrFullName?.trim() || sessionName?.trim() || '';
}

const unique = (names: string[]) => [...new Set(names.filter(Boolean))];

/**
 * The names behind the selected work context, as the shell shows them. The outlet the person is
 * working in comes first; others in scope follow. Nothing is invented: what is unknown reads "Not assigned".
 */
export function workContextLabels(project: OperationalProject | undefined, selectedOutletId: string): WorkContextLabels {
  if (!project) return { project: NOT_ASSIGNED, dealer: NOT_ASSIGNED, outlet: NOT_ASSIGNED };
  const outlets = [...(project.scope?.outlets ?? [])];
  outlets.sort((a, b) => Number(b.outletId === selectedOutletId) - Number(a.outletId === selectedOutletId));
  const dealers = unique(outlets.map((o) => o.dealerName));
  const outletNames = unique(outlets.map((o) => o.outletName));
  const wide = project.scope?.allDealers || (project.scope?.outletCount ?? 0) > 0;
  return {
    project: project.projectName?.trim() || NOT_ASSIGNED,
    dealer: dealers.length ? dealers.join(', ') : project.scope?.allDealers ? 'All dealers' : NOT_ASSIGNED,
    outlet: outletNames.length ? outletNames.join(', ') : wide ? 'All outlets' : NOT_ASSIGNED,
  };
}
