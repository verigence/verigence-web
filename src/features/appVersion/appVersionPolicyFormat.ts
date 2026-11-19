/** Shared by the two "oldest app version allowed" panels: for everyone, and for one Project. */
import type { DevicesBelow, ProjectVersionPolicy } from '../../services/security/appVersion';
import { isBelow } from './appVersionLogic';

export const policyKey = ['security', 'app-version-policy'] as const;

/** A stored instant as the value of a datetime-local input, in India time. */
export function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
}

/** A datetime-local value, read as India time, as an ISO instant. */
export function fromLocalInput(value: string): string | null {
  return value ? `${value}:00+05:30` : null;
}

export function formatIst(iso: string): string {
  return new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
}

export const peopleBelow = (rows: DevicesBelow[]) => rows.reduce((n, r) => n + r.people, 0);

/** "In force" or "From 19 Nov 2026, 8:00 pm" for a Project's minimum. */
export function projectFromLabel(policy: Pick<ProjectVersionPolicy, 'inForce' | 'effectiveFrom'>): string {
  if (policy.inForce) return 'In force';
  return policy.effectiveFrom ? `From ${formatIst(policy.effectiveFrom)}` : 'In force';
}

/**
 * Why a Project minimum would do nothing: the minimum for everyone already asks for as much.
 * `everyoneMinimum` is the one in force, or null.
 */
export function coveredByEveryone(candidate: string, everyoneMinimum: string | null): boolean {
  return Boolean(everyoneMinimum) && !isBelow(everyoneMinimum, candidate);
}
