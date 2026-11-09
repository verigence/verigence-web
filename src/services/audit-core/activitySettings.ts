import { auditCoreRequest } from './client';

/** SuperAdmin: the reading window of "time on Verigence" (Audit Core /v1/admin/activity-settings, 2026-11-09). */
export type ActivityWindowChange = {
  tenantId: string | null; projectName: string | null; previousMinutes: number | null; minutes: number | null;
  changedByActorId: string; changedAtUtc: string;
};
export type ActivitySettingsAdmin = {
  defaultMinutes: number; minMinutes: number; maxMinutes: number;
  allProjects: { minutes: number; isDefault: boolean; setByActorId: string | null; setAtUtc: string | null };
  projects: Array<{ tenantId: string; projectName: string | null; minutes: number; setByActorId: string | null; setAtUtc: string | null }>;
  changes: ActivityWindowChange[];
  projectChoices: Array<{ tenantId: string; projectName: string | null; status: string | null }>;
};
export type ActivityWindowCommand = { tenantId: string | null; readingWindowMinutes: number | null };

export function getActivitySettingsAdmin(accessToken: string) {
  return auditCoreRequest<ActivitySettingsAdmin>('/v1/admin/activity-settings', { accessToken, cache: 'no-store' });
}

export function setActivityWindow(command: ActivityWindowCommand, accessToken: string) {
  return auditCoreRequest<ActivitySettingsAdmin>('/v1/admin/activity-settings', {
    method: 'PUT', accessToken, body: JSON.stringify(command),
  });
}
