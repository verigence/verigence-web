import type { EmployeeSyncUnmatched, LoginCreateResult } from '../../services/hr/employees';

/** Logins are created five employees at a time, one request per group. */
export const CREATE_GROUP = 5;

export function inGroups<T>(items: T[], size: number = CREATE_GROUP): T[][] {
  const groups: T[][] = [];
  for (let i = 0; i < items.length; i += size) groups.push(items.slice(i, i + size));
  return groups;
}

/** The employees the check says can get a login now. */
export function creatable(unmatched: EmployeeSyncUnmatched[]): EmployeeSyncUnmatched[] {
  return unmatched.filter((u) => u.reason === 'NO_LOGIN' && u.canCreate);
}

/** Why a login cannot be created, in plain words, with what to do about it. */
export function blockedLabel(code: string | null | undefined): string {
  switch (code) {
    case 'NO_MOBILE':
      return 'No mobile number. Add it on the employee page.';
    case 'MOBILE_SHARED':
      return 'Another employee has the same mobile number. Correct one of them.';
    case 'EMPLOYEE_NOT_ACTIVE':
      return 'The employee is not active.';
    case 'EMAIL_OR_MOBILE_EXISTS':
      return 'Verigence already has this email or mobile for someone else. Correct it on the employee page.';
    case 'CONTACT_NOT_VALID':
      return 'The email or mobile was not accepted. Correct it on the employee page.';
    case 'NOT_PERMITTED':
      return 'This service is not allowed to create users. Tell your administrator.';
    case 'ALREADY_LINKED':
      return 'Already has a login.';
    case 'LOGIN_EXISTS':
      return 'A Verigence user already has this email. Press Check again; it will be linked.';
    case 'NOT_FOUND':
      return 'The employee was not found.';
    case 'SECURITY_UNAVAILABLE':
    case 'BAD_RESPONSE':
      return 'Verigence could not be reached. Nothing was created. Try again in a few minutes.';
    default:
      return code ?? '';
  }
}

export interface CreateTotals {
  created: number;
  skipped: number;
  failed: number;
}

export function totals(results: LoginCreateResult[]): CreateTotals {
  return {
    created: results.filter((r) => r.outcome === 'CREATED').length,
    skipped: results.filter((r) => r.outcome === 'SKIPPED').length,
    failed: results.filter((r) => r.outcome === 'FAILED').length,
  };
}

/** Answers that mean Verigence itself is not answering: the next group is not tried. */
const SERVICE_PROBLEMS = ['SECURITY_UNAVAILABLE', 'NOT_PERMITTED', 'BAD_RESPONSE'];

export function shouldStop(results: LoginCreateResult[]): boolean {
  return results.some((r) => r.outcome === 'FAILED' && SERVICE_PROBLEMS.includes(r.reason ?? ''));
}
