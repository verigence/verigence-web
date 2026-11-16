import { auditCoreRequest } from './client';

/** SuperAdmin: the reading window of "time on Verigence" (Audit Core /v1/admin/activity-settings, 2026-11-09). */
export type ActivityWindowChange = {
  tenantId: string | null; projectName: string | null; previousMinutes: number | null; minutes: number | null;
  /** ENGAGEMENT: a change of the output window or the clicking-around screen changes (2026-11-16). */
  setting?: 'READING_WINDOW' | 'ENGAGEMENT';
  outputWindowMinutes?: number | null; hopScreenChanges?: number | null;
  changedByActorId: string; changedAtUtc: string;
};

/** The engagement report's two numbers (2026-11-16): default, range and the all-Projects value. */
export type EngagementSettingSpec = { default: number; min: number; max: number; allProjects: number };
export type EngagementSettingKey = 'outputWindowMinutes' | 'hopScreenChanges';
export type ActivitySettingsAdmin = {
  defaultMinutes: number; minMinutes: number; maxMinutes: number;
  allProjects: { minutes: number; isDefault: boolean; setByActorId: string | null; setAtUtc: string | null;
                 outputWindowMinutes?: number | null; hopScreenChanges?: number | null };
  projects: Array<{ tenantId: string; projectName: string | null; minutes: number | null; setByActorId: string | null; setAtUtc: string | null;
                    outputWindowMinutes?: number | null; hopScreenChanges?: number | null }>;
  /** Absent from servers older than 2026-11-16. */
  engagement?: Record<EngagementSettingKey, EngagementSettingSpec>;
  changes: ActivityWindowChange[];
  projectChoices: Array<{ tenantId: string; projectName: string | null; status: string | null }>;
};
export type ActivityWindowCommand = { tenantId: string | null; readingWindowMinutes: number | null };
/** Only the keys sent change; null for a Project = follow the all-Projects value. */
export type EngagementSettingsCommand = { tenantId: string | null } & Partial<Record<EngagementSettingKey, number | null>>;

export function getActivitySettingsAdmin(accessToken: string) {
  return auditCoreRequest<ActivitySettingsAdmin>('/v1/admin/activity-settings', { accessToken, cache: 'no-store' });
}

export function setActivityWindow(command: ActivityWindowCommand, accessToken: string) {
  return auditCoreRequest<ActivitySettingsAdmin>('/v1/admin/activity-settings', {
    method: 'PUT', accessToken, body: JSON.stringify(command),
  });
}

export function setEngagementSettings(command: EngagementSettingsCommand, accessToken: string) {
  return auditCoreRequest<ActivitySettingsAdmin>('/v1/admin/activity-settings', {
    method: 'PUT', accessToken, body: JSON.stringify(command),
  });
}
