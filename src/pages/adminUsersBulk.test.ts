import { describe, expect, it } from 'vitest';

import type { GlobalUserDirectoryItem } from '../services/security/onboardingAdmin';
import { canBulkDelete, isTestAccount } from './adminUsersBulk';

const user = (primaryEmail: string | null, status = 'ACTIVE') =>
  ({ userId: 'u', displayName: 'U', primaryEmail, status }) as unknown as GlobalUserDirectoryItem;

describe('isTestAccount', () => {
  it('flags users without an email or on a reserved test domain', () => {
    expect(isTestAccount(user(null))).toBe(true);
    expect(isTestAccount(user('  '))).toBe(true);
    expect(isTestAccount(user('not-an-email'))).toBe(true);
    expect(isTestAccount(user('v146-admin-1@example.invalid'))).toBe(true);
    expect(isTestAccount(user('a@example.com'))).toBe(true);
    expect(isTestAccount(user('a@qa.test'))).toBe(true);
  });

  it('keeps real addresses', () => {
    expect(isTestAccount(user('someone@gmail.com'))).toBe(false);
    expect(isTestAccount(user('ops@examplecars.in'))).toBe(false);
  });
});

describe('canBulkDelete', () => {
  it('never selects the signed-in administrator or a non-deletable status', () => {
    expect(canBulkDelete(user('Admin@Corp.in'), 'admin@corp.in')).toBe(false);
    expect(canBulkDelete(user('x@example.invalid', 'PENDING'), 'admin@corp.in')).toBe(false);
    expect(canBulkDelete(user('x@example.invalid', 'DISABLED'), 'admin@corp.in')).toBe(true);
  });
});
