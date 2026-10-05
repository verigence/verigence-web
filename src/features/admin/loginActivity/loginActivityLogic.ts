import type { LoginPerson, LoginState } from '../../../services/security/loginActivity';
import { sortByName } from '../../../utils/sortByName';

export const STATE_ORDER: LoginState[] = ['APP_SIGNED_IN', 'DOWNLOADED', 'WEB_ONLY', 'TRIED_FAILED', 'NOT_TRIED'];

export const STATE_LABEL: Record<LoginState, string> = {
  APP_SIGNED_IN: 'Signed in on the app',
  DOWNLOADED: 'Downloaded, not signed in on the app yet',
  WEB_ONLY: 'Signed in on the web only',
  TRIED_FAILED: 'Tried, could not sign in',
  NOT_TRIED: 'Has not tried',
};

const REASON_LABEL: Record<string, string> = {
  security_identity_resolution_failed: 'ID not found, or login not allowed yet',
  clerk_password_verification_rejected: 'Wrong password',
  clerk_account_blocked: 'Account is blocked',
  clerk_provider_rejected: 'Sign-in service refused it',
  request_missing_identifier_or_password: 'ID or password left empty',
  USER_PENDING_APPROVAL: 'Waiting for SuperAdmin approval',
  USER_NOT_ACTIVE: 'User is not active',
  IDENTITY_PROVIDER_UNAVAILABLE: 'Sign-in service was not available',
  AUTH_TOKEN_INVALID: 'Sign-in was refused',
};

/** Plain wording for why a sign-in was refused; an unknown code is shown as it is, never hidden. */
export const reasonLabel = (reason: string | null | undefined): string =>
  reason ? REASON_LABEL[reason] ?? reason : '';

export function countByState(people: readonly LoginPerson[]): Record<LoginState, number> {
  const counts: Record<LoginState, number> = { APP_SIGNED_IN: 0, DOWNLOADED: 0, WEB_ONLY: 0, TRIED_FAILED: 0, NOT_TRIED: 0 };
  for (const person of people) counts[person.state] += 1;
  return counts;
}

export interface ViewFilter {
  state: LoginState | 'ALL';
  employeesOnly: boolean;
  search: string;
}

/** The rows to show: filtered, then A to Z by name. */
export function visiblePeople(people: readonly LoginPerson[], filter: ViewFilter): LoginPerson[] {
  const needle = filter.search.trim().toLowerCase();
  const kept = people.filter((person) => {
    if (filter.employeesOnly && !person.isEmployee) return false;
    if (filter.state !== 'ALL' && person.state !== filter.state) return false;
    if (!needle) return true;
    return person.name.toLowerCase().includes(needle) || person.email.toLowerCase().includes(needle);
  });
  return sortByName(kept, (person) => person.name);
}

const csvCell = (value: string | number | null | undefined): string => {
  const text = value === null || value === undefined ? '' : String(value);
  // A cell that starts like a formula is read as one by spreadsheets: keep it as plain text.
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

export function reportCsv(people: readonly LoginPerson[]): string {
  const header = [
    'Name', 'Email', 'Employee', 'Status', 'Signed in OK', 'Failed tries', 'App sign-ins', 'Web sign-ins',
    'First sign-in', 'Last sign-in', 'Last try', 'Last try result', 'Reason', 'App version',
    'Downloads', 'First download', 'Last download',
  ];
  const rows = people.map((p) => [
    p.name, p.email, p.isEmployee ? 'Yes' : 'No', STATE_LABEL[p.state], p.loginsOk, p.loginsFailed, p.appLogins, p.webLogins,
    p.firstLoginAt, p.lastLoginAt, p.lastAttemptAt, p.lastOutcome, reasonLabel(p.lastReason), p.appVersion,
    p.downloads, p.firstDownloadAt, p.lastDownloadAt,
  ]);
  return [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');
}
