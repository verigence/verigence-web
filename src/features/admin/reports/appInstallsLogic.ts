import type { LoginPerson } from '../../../services/security/loginActivity';

/** Who has the app and which version: the parts worth testing on their own. */

/** Newest version first: 1.4.0 before 1.3.2 before 1.0. */
export function compareVersions(a: string, b: string): number {
  const left = a.split('.').map((n) => Number.parseInt(n, 10) || 0);
  const right = b.split('.').map((n) => Number.parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
    const diff = (right[i] ?? 0) - (left[i] ?? 0);
    if (diff) return diff;
  }
  return 0;
}

/** People on the app first, then those who only downloaded it, then the rest;
 * within each, the most recent download first, then by name. */
export function byAppFirst(
  people: readonly LoginPerson[], { employeesOnly }: { employeesOnly: boolean },
): LoginPerson[] {
  const rank = (p: LoginPerson) => (p.appVersion ? 0 : p.downloads ? 1 : 2);
  return people
    .filter((p) => !employeesOnly || p.isEmployee)
    .slice()
    .sort((a, b) => rank(a) - rank(b)
      || (b.lastDownloadAt ?? '').localeCompare(a.lastDownloadAt ?? '')
      || a.name.localeCompare(b.name));
}

/** How many people are on each version their app reported, newest first. */
export function versionsInUse(people: readonly LoginPerson[]): Array<[string, number]> {
  const counts = new Map<string, number>();
  for (const person of people) {
    if (!person.appVersion) continue;
    counts.set(person.appVersion, (counts.get(person.appVersion) ?? 0) + 1);
  }
  return [...counts.entries()].sort(([a], [b]) => compareVersions(a, b));
}

function cell(value: string | number | null): string {
  const text = value === null ? '' : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function appInstallsCsv(
  people: readonly LoginPerson[], stateLabel: Record<LoginPerson['state'], string>,
): string {
  const head = ['Name', 'E-mail', 'Status', 'Downloads', 'First download', 'Last download',
    'Version downloaded', 'Version running', 'Last app sign-in', 'App sign-ins'];
  const body = people.map((p) => [
    p.name, p.email, stateLabel[p.state], p.downloads, p.firstDownloadAt, p.lastDownloadAt,
    p.lastDownloadVersion, p.appVersion, p.appLogins ? p.lastLoginAt : null, p.appLogins,
  ].map(cell).join(','));
  return [head.join(','), ...body].join('\n');
}

/** Where a person stands with the app (2026-10-31 redesign). */
export type AppStanding = 'LATEST' | 'BEHIND' | 'NOT_OPENED' | 'NOT_ON_APP';

/** The newest version known: the newest anyone runs or has downloaded. */
export function newestVersion(people: readonly LoginPerson[]): string | null {
  const all = new Set<string>();
  for (const p of people) {
    if (p.appVersion) all.add(p.appVersion);
    if (p.lastDownloadVersion) all.add(p.lastDownloadVersion);
  }
  return [...all].sort(compareVersions)[0] ?? null;
}

/** On the newest version, on an older one, downloaded but never opened, or
 * not on the app at all. */
export function standing(person: LoginPerson, latest: string | null): AppStanding {
  if (person.appVersion) {
    return latest && compareVersions(person.appVersion, latest) > 0 ? 'BEHIND' : 'LATEST';
  }
  return person.downloads > 0 ? 'NOT_OPENED' : 'NOT_ON_APP';
}

/** How many released versions (as seen in use or downloaded) are newer than this one. */
export function releasesBehind(version: string | null, people: readonly LoginPerson[]): number {
  if (!version) return 0;
  const all = new Set<string>();
  for (const p of people) {
    if (p.appVersion) all.add(p.appVersion);
    if (p.lastDownloadVersion) all.add(p.lastDownloadVersion);
  }
  return [...all].filter((v) => compareVersions(v, version) < 0).length;
}

/** Downloaded a newer build than the one they run: it is on the phone but not installed / opened. */
export function updatePending(person: LoginPerson): boolean {
  return Boolean(person.appVersion && person.lastDownloadVersion
    && compareVersions(person.lastDownloadVersion, person.appVersion) < 0);
}

/** "just now", "12 min ago", "5 h ago", "3 days ago". */
export function ago(iso: string | null, now: Date = new Date()): string {
  if (!iso) return '—';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '—';
  const minutes = Math.max(0, Math.round((now.getTime() - then) / 60_000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

/** Name or e-mail contains the text (case-insensitive). */
export function matches(person: LoginPerson, text: string): boolean {
  const needle = text.trim().toLowerCase();
  return !needle || person.name.toLowerCase().includes(needle) || person.email.toLowerCase().includes(needle);
}
