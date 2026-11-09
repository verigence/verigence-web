/**
 * The supervisory landing dashboard (Team Lead, Project Manager, Executive).
 *
 * Product owner 2026-11-09: "For exec role, lets give the option to search and
 * view the booking and deliveries filtered by PC, dealership, search by
 * customer name, mobile number, complete info as we were showing in the TL..
 * pls update the view for Exec and PM... i think this can be landing
 * page/dashboard view". The Team Lead's dashboard became the one supervisory
 * dashboard: a PM and an Executive land on it with their own title, and the
 * focus cards are only the places each role can open from its menu.
 */

export type SupervisoryRole = 'TL' | 'PM' | 'EXECUTIVE';

export const SUPERVISORY_ROLE_LABEL: Record<SupervisoryRole, string> = {
  TL: 'Team Lead',
  PM: 'Project Manager',
  EXECUTIVE: 'Executive',
};

/** The role when it is a supervisory one, else null. */
export function supervisoryRole(operatingRole: string | null | undefined): SupervisoryRole | null {
  return operatingRole === 'TL' || operatingRole === 'PM' || operatingRole === 'EXECUTIVE' ? operatingRole : null;
}

/**
 * The focus cards above the journeys, in order. Each one opens a page the role
 * has in its menu (layout/AppShell.tsx):
 *  - Task Queue (/p2/tasks): TL and PM; an Executive has no Booking & Delivery Task Queue.
 *  - Daily Operations (/daily-ops): the TL, as before.
 *  - Project Tracker (/p2/project-tracker): TL, PM and Executive.
 *  - Task Manager (/p2/task-manager): the Executive's own tasks (their menu's Task Manager);
 *    TL and PM reach theirs through the Task Queue.
 */
export type FocusKey = 'tasks' | 'dailyOps' | 'projectTracker' | 'taskManager';

export function focusCardsFor(role: SupervisoryRole): FocusKey[] {
  if (role === 'TL') return ['tasks', 'dailyOps', 'projectTracker'];
  if (role === 'PM') return ['tasks', 'projectTracker'];
  return ['projectTracker', 'taskManager'];
}

/**
 * Where /home sends a signed-in user: a Reviewer to their board, a PC to PC
 * Home, a Team Lead to Booking & Delivery (which for a TL is this dashboard's
 * list), and a PM, an Executive and everyone else to /dashboard -- for a PM and
 * an Executive the supervisory dashboard (2026-11-09; a PM used to land on the
 * bare Booking & Delivery list).
 */
export function homePathFor(operatingRole: string | null | undefined): string {
  if (operatingRole === 'REVIEWER') return '/p2/review';
  if (operatingRole === 'PC') return '/p2/home';
  if (operatingRole === 'TL') return '/p2/bookings';
  return '/dashboard';
}

/**
 * What /dashboard shows inside a Project: the supervisory dashboard for TL, PM
 * and Executive; PC Home for a PC (it is their home, 2026-11-02); the Phase 1
 * Overview for anyone else (admins, CRM).
 */
export type DashboardEntryKind = 'supervisory' | 'pcHome' | 'overview';

export function dashboardEntryFor(operatingRole: string | null | undefined): DashboardEntryKind {
  if (supervisoryRole(operatingRole)) return 'supervisory';
  if (operatingRole === 'PC') return 'pcHome';
  return 'overview';
}

/** The hero's scope line: every Dealership and Outlet for a Project-wide role, else how many. */
export function scopeSummary(scope: { allDealers: boolean; dealerCount: number; outletCount: number }): string {
  if (scope.allDealers) return 'All dealerships · All outlets';
  const dealers = `${scope.dealerCount} dealership${scope.dealerCount === 1 ? '' : 's'}`;
  const outlets = `${scope.outletCount} outlet${scope.outletCount === 1 ? '' : 's'}`;
  return `${dealers} · ${outlets}`;
}
