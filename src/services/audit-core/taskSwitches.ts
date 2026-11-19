import { auditCoreRequest } from './client';

/**
 * Per-Project task switches (product owner 2026-11-19): "is there a way i can see the list
 * of the tasks being produced and tick them off, because some of the tasks are not relevant
 * currently, but it may be required in future ... at the project level and it should be
 * under project administration only". Switched off, the check stops for the Project and its
 * open tasks and findings leave the existing journeys; switched on, every booking is
 * checked again. Audit Core /p2/v1/tenants/{tenantId}/task-switches (Tenant Admin,
 * Super Admin).
 */
export type TaskSwitch = {
  code: string;
  name: string;
  example: string | null;
  category: string;
  owner: string | null;
  open: number;
  raisedLast30Days: number;
  lastRaisedAtUtc: string | null;
  enabled: boolean;
  reason: string | null;
  changedByName: string | null;
  changedAtUtc: string | null;
};

export type TaskSwitchList = { items: TaskSwitch[]; switchedOff: number };

export type TaskSwitchResult = {
  code: string;
  enabled: boolean;
  tasksClosed?: number;
  findingsVoided?: number;
  checksSet?: number;
  bookingsRechecked?: number;
};

const base = (tenantId: string) => `/p2/v1/tenants/${encodeURIComponent(tenantId)}/task-switches`;

export function listTaskSwitches(tenantId: string, accessToken?: string) {
  return auditCoreRequest<TaskSwitchList>(base(tenantId), { accessToken, cache: 'no-store' });
}

export function setTaskSwitch(tenantId: string, code: string, enabled: boolean, reason: string, accessToken?: string) {
  return auditCoreRequest<TaskSwitchResult>(`${base(tenantId)}/${encodeURIComponent(code)}`,
    { method: 'PUT', body: JSON.stringify({ enabled, reason }), accessToken });
}

/** What a change did, in one line. */
export function switchOutcome(result: TaskSwitchResult): string {
  if (!result.enabled) {
    const closed = result.tasksClosed ?? 0;
    return `Switched off. ${closed} open task${closed === 1 ? '' : 's'} closed on the existing journeys.`;
  }
  if (result.bookingsRechecked !== undefined) {
    return `Switched on. ${result.bookingsRechecked} bookings are being checked again; the tasks that still apply come back shortly.`;
  }
  return 'Switched on.';
}

/** The list a search and the on / off filter leave. */
export function filterTaskSwitches(items: TaskSwitch[], query: string, show: 'ALL' | 'ON' | 'OFF'): TaskSwitch[] {
  const q = query.trim().toLowerCase();
  return items.filter((item) => (show === 'ALL' || (show === 'ON') === item.enabled)
    && (!q || [item.name, item.code, item.category, item.owner ?? '', item.example ?? '']
      .some((value) => value.toLowerCase().includes(q))));
}
