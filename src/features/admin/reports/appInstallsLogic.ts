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
