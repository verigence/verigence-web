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
  const from = change.previousMinutes === null ? '' : `${minutesText(change.previousMinutes)} → `;
  return change.minutes === null && change.tenantId !== null
    ? `${scope}: ${from}follows the all-Projects value`
    : `${scope}: ${from}${minutesText(change.minutes)}`;
}
