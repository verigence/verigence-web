import type { ActivityWindowChange } from '../../../services/audit-core/activitySettings';

/** SuperAdmin control of the reading window (product owner 2026-11-09): 1 to 10 minutes. */
export const WINDOW_CHOICES = Array.from({ length: 10 }, (_, i) => i + 1);

export function minutesText(minutes: number | null): string {
  if (minutes === null) return 'the all-Projects value';
  return `${minutes} minute${minutes === 1 ? '' : 's'}`;
}

/** The PUT for the form, or the problem with it. A Project may be set back to follow the all-Projects value. */
export function windowCommand(scope: string, value: string):
  { command: { tenantId: string | null; readingWindowMinutes: number | null }; error?: undefined } | { command?: undefined; error: string } {
  const tenantId = scope === '*' ? null : scope;
  if (value === 'inherit') {
    if (tenantId === null) return { error: 'Choose 1 to 10 minutes for every Project.' };
    return { command: { tenantId, readingWindowMinutes: null } };
  }
  const minutes = Number(value);
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 10) return { error: 'Choose 1 to 10 minutes.' };
  return { command: { tenantId, readingWindowMinutes: minutes } };
}

/** "All Projects: 3 → 5 minutes" / "<Project>: follows the all-Projects value". */
export function changeText(change: ActivityWindowChange): string {
  const scope = change.tenantId === null ? 'All Projects' : change.projectName ?? change.tenantId;
  if (change.setting === 'ENGAGEMENT') {
    // The log keeps the values set; a number put back to the all-Projects value is kept as no value.
    const parts: string[] = [];
    if (change.outputWindowMinutes != null) parts.push(`output window ${minutesText(change.outputWindowMinutes)}`);
    if (change.hopScreenChanges != null) parts.push(`clicking around after ${change.hopScreenChanges} screen changes`);
    return `${scope}: ${parts.join(', ') || 'engagement numbers follow the all-Projects values'}`;
  }
  const from = change.previousMinutes === null ? '' : `${minutesText(change.previousMinutes)} → `;
  return change.minutes === null && change.tenantId !== null
    ? `${scope}: ${from}follows the all-Projects value`
    : `${scope}: ${from}${minutesText(change.minutes)}`;
}

/**
 * The PUT for one engagement number (2026-11-16), or the problem with it. '' or 'inherit' for a
 * Project = follow the all-Projects value.
 */
export function engagementCommand(scope: string, key: 'outputWindowMinutes' | 'hopScreenChanges', value: string,
  range: { min: number; max: number }):
  { command: { tenantId: string | null; outputWindowMinutes?: number | null; hopScreenChanges?: number | null }; error?: undefined }
  | { command?: undefined; error: string } {
  const tenantId = scope === '*' ? null : scope;
  const words = key === 'outputWindowMinutes' ? 'The output window' : 'Screen changes for clicking around';
  if (value.trim() === '' || value === 'inherit') {
    if (tenantId === null) return { error: `${words} for every Project needs a value (${range.min} to ${range.max}).` };
    return { command: { tenantId, [key]: null } };
  }
  const n = Number(value);
  if (!Number.isInteger(n) || n < range.min || n > range.max) return { error: `${words} must be ${range.min} to ${range.max}.` };
  return { command: { tenantId, [key]: n } };
}
