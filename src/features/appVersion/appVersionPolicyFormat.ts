/** Shared by the two "oldest app version allowed" panels: for everyone, and for one Project. */
import type { DevicesBelow, ProjectChoice, ProjectVersionPolicy } from '../../services/security/appVersion';
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

/** The Projects in the picker: those with people, and any that already has a minimum. */
export function projectOptions(choices: ProjectChoice[], projects: ProjectVersionPolicy[]): ProjectChoice[] {
  const seen = new Set(choices.map((c) => c.tenantId));
  const extra = projects.filter((p) => !seen.has(p.tenantId)).map((p) => ({ tenantId: p.tenantId, tenantName: p.tenantName, people: 0 }));
  const all = [...choices, ...extra];
  // Two Projects can carry the same name: say which is which by their people.
  const names = new Map<string, number>();
  all.forEach((c) => names.set(c.tenantName, (names.get(c.tenantName) ?? 0) + 1));
  return all.map((c) => ((names.get(c.tenantName) ?? 0) > 1 ? { ...c, tenantName: `${c.tenantName} (${c.people} ${c.people === 1 ? 'person' : 'people'})` } : c));
}

/**
 * Why a Project minimum would do nothing: the minimum for everyone already asks for as much.
 * `everyoneMinimum` is the one in force, or null.
 */
export function coveredByEveryone(candidate: string, everyoneMinimum: string | null): boolean {
  return Boolean(everyoneMinimum) && !isBelow(everyoneMinimum, candidate);
}
