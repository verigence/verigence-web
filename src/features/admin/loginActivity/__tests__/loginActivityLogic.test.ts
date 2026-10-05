import { describe, expect, it } from 'vitest';

import type { LoginPerson } from '../../../../services/security/loginActivity';
import { countByState, reasonLabel, reportCsv, visiblePeople } from '../loginActivityLogic';

const person = (over: Partial<LoginPerson>): LoginPerson => ({
  userId: 'u', name: 'Asha', email: 'asha@example.com', userStatus: 'ACTIVE', isEmployee: true, state: 'NOT_TRIED',
  loginsOk: 0, loginsFailed: 0, appLogins: 0, webLogins: 0, firstLoginAt: null, lastLoginAt: null, lastAttemptAt: null,
  lastOutcome: null, lastReason: null, appVersion: null, downloads: 0, firstDownloadAt: null, lastDownloadAt: null, ...over,
});

const people = [
  person({ userId: '1', name: 'bimal', state: 'APP_SIGNED_IN' }),
  person({ userId: '2', name: 'Asha', state: 'TRIED_FAILED', lastReason: 'clerk_password_verification_rejected' }),
  person({ userId: '3', name: 'Chitra', state: 'NOT_TRIED', isEmployee: false, email: 'chitra@x.com' }),
];

describe('login activity view', () => {
  it('counts each state', () => {
    expect(countByState(people)).toEqual({ APP_SIGNED_IN: 1, DOWNLOADED: 0, WEB_ONLY: 0, TRIED_FAILED: 1, NOT_TRIED: 1 });
  });

  it('lists A to Z by default and can narrow by state, employees and search', () => {
    const all = { state: 'ALL' as const, employeesOnly: false, search: '' };
    expect(visiblePeople(people, all).map((p) => p.name)).toEqual(['Asha', 'bimal', 'Chitra']);
    expect(visiblePeople(people, { ...all, employeesOnly: true }).map((p) => p.name)).toEqual(['Asha', 'bimal']);
    expect(visiblePeople(people, { ...all, state: 'NOT_TRIED' }).map((p) => p.name)).toEqual(['Chitra']);
    expect(visiblePeople(people, { ...all, search: 'CHITRA@' }).map((p) => p.name)).toEqual(['Chitra']);
  });

  it('says why a sign-in failed in plain words, and shows an unknown code as it is', () => {
    expect(reasonLabel('clerk_password_verification_rejected')).toBe('Wrong password');
    expect(reasonLabel('SOMETHING_NEW')).toBe('SOMETHING_NEW');
    expect(reasonLabel(null)).toBe('');
  });

  it('writes a spreadsheet file that cannot run a formula', () => {
    const csv = reportCsv([person({ name: '=HYPERLINK("x")', email: 'a,b@x.com', lastReason: 'clerk_account_blocked' })]);
    const [head, row] = csv.split('\r\n');
    expect(head.startsWith('Name,Email,Employee')).toBe(true);
    expect(row.startsWith(`"'=HYPERLINK(""x"")","a,b@x.com",Yes`)).toBe(true);
    expect(row).toContain('Account is blocked');
  });
});
