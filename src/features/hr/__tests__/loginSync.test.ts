import { describe, expect, it } from 'vitest';

import type { EmployeeSyncUnmatched, LoginCreateResult } from '../../../services/hr/employees';
import { blockedLabel, creatable, inGroups, shouldStop, totals } from '../loginSync';

const person = (id: string, over: Partial<EmployeeSyncUnmatched> = {}): EmployeeSyncUnmatched => ({
  employeeId: id,
  code: id,
  name: id,
  reason: 'NO_LOGIN',
  canCreate: true,
  ...over,
});

describe('loginSync', () => {
  it('splits into groups of five and keeps the order', () => {
    const ids = Array.from({ length: 12 }, (_, i) => `e${i}`);
    expect(inGroups(ids).map((g) => g.length)).toEqual([5, 5, 2]);
    expect(inGroups(ids).flat()).toEqual(ids);
    expect(inGroups([])).toEqual([]);
  });

  it('offers only the employees that can get a login now', () => {
    const list = [
      person('a'),
      person('b', { canCreate: false, blocked: 'NO_MOBILE' }),
      person('c', { reason: 'LOGIN_IN_USE', canCreate: undefined }),
      person('d', { reason: 'LINKED_USER_MISSING', canCreate: undefined }),
    ];
    expect(creatable(list).map((u) => u.employeeId)).toEqual(['a']);
  });

  it('says in plain words why a login cannot be created', () => {
    expect(blockedLabel('NO_MOBILE')).toMatch(/mobile/i);
    expect(blockedLabel('MOBILE_SHARED')).toMatch(/same mobile/i);
    expect(blockedLabel('EMAIL_OR_MOBILE_EXISTS')).toMatch(/already has/i);
    expect(blockedLabel('SECURITY_UNAVAILABLE')).toMatch(/Nothing was created/);
    expect(blockedLabel('SOMETHING_NEW')).toBe('SOMETHING_NEW');
    expect(blockedLabel(null)).toBe('');
  });

  it('counts the outcomes', () => {
    const r = (outcome: LoginCreateResult['outcome']): LoginCreateResult => ({ employeeId: 'x', code: null, name: null, outcome, reason: null });
    expect(totals([r('CREATED'), r('CREATED'), r('SKIPPED'), r('FAILED')])).toEqual({ created: 2, skipped: 1, failed: 1 });
  });

  it('stops after a group only when Verigence itself did not answer', () => {
    const r = (outcome: LoginCreateResult['outcome'], reason: string | null): LoginCreateResult => ({ employeeId: 'x', code: null, name: null, outcome, reason });
    expect(shouldStop([r('CREATED', null), r('FAILED', 'SECURITY_UNAVAILABLE')])).toBe(true);
    expect(shouldStop([r('FAILED', 'NOT_PERMITTED')])).toBe(true);
    expect(shouldStop([r('FAILED', 'EMAIL_OR_MOBILE_EXISTS'), r('SKIPPED', 'NO_MOBILE')])).toBe(false);
    expect(shouldStop([])).toBe(false);
  });
});
