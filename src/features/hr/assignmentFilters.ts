import type { AssignedEmployee, WorkAssignment } from '../../services/hr/workAssignments';

export const NO_PROJECT_FILTER = '__none__';
export const STALE_AFTER_HOURS = 36;

/** Employees matching a project (or none), and a name or code search. */
export function filterAssigned(employees: AssignedEmployee[], project: string, search: string): AssignedEmployee[] {
  const needle = search.trim().toLowerCase();
  return employees.filter((e) => {
    if (project === NO_PROJECT_FILTER && e.assignments.length > 0) return false;
    if (project && project !== NO_PROJECT_FILTER && !e.assignments.some((a) => a.projectCode === project)) return false;
    return !needle || e.fullName.toLowerCase().includes(needle) || e.employeeCode.toLowerCase().includes(needle);
  });
}

export interface Freshness {
  /** True when the copy may be out of date and HR should be told. */
  warn: boolean;
  text: string;
}

/** Whether the daily copy from Audit Core can be trusted: it must have arrived, recently, and with status OK. */
export function assignmentFreshness(syncedAt: string | null, syncStatus: string, now: Date = new Date()): Freshness {
  if (!syncedAt || Number.isNaN(new Date(syncedAt).getTime())) {
    return { warn: true, text: 'Project assignments have not been received from Audit Core yet.' };
  }
  const hours = (now.getTime() - new Date(syncedAt).getTime()) / 3_600_000;
  if (syncStatus !== 'OK') return { warn: true, text: 'The last update from Audit Core did not complete, so some assignments may be out of date.' };
  if (hours > STALE_AFTER_HOURS) return { warn: true, text: 'The last update from Audit Core is more than a day and a half old, so some assignments may be out of date.' };
  return { warn: false, text: '' };
}

/** "Dealer · Outlet", whichever of the two is known. */
export const assignmentWhere = (a: WorkAssignment): string =>
  [a.dealerName, a.outletName].filter(Boolean).join(' · ');
