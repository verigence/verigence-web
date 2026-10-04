import { describe, expect, it } from 'vitest';

import { addablePeople, visibleNavGroups } from '../featureFlags';

const groups = ['workspace', 'operations', 'phase2', 'insights', 'administration', 'hr'].map((key) => ({ key }));
const keys = (g: Array<{ key: string }>) => g.map((x) => x.key);

describe('visibleNavGroups', () => {
  it('never draws the retired workspace group', () => {
    expect(keys(visibleNavGroups(groups, { AUDIT: true, ANALYTICS: true }))).not.toContain('workspace');
  });

  it('shows Audit and Analytics only when their feature is on', () => {
    expect(keys(visibleNavGroups(groups, { AUDIT: true, ANALYTICS: false }))).toEqual(['operations', 'phase2', 'administration', 'hr']);
    expect(keys(visibleNavGroups(groups, { AUDIT: false, ANALYTICS: true }))).toEqual(['operations', 'insights', 'administration', 'hr']);
    expect(keys(visibleNavGroups(groups, { AUDIT: true, ANALYTICS: true }))).toEqual(['operations', 'phase2', 'insights', 'administration', 'hr']);
  });

  it('hides both while loading or after an error, and leaves the other groups alone', () => {
    expect(keys(visibleNavGroups(groups, undefined))).toEqual(['operations', 'administration', 'hr']);
  });
});

describe('addablePeople', () => {
  const users = [
    { userId: 'u2', displayName: 'Zoya', status: 'ACTIVE' },
    { userId: 'u1', displayName: 'Asha', status: 'active' },
    { userId: 'u3', displayName: 'Bela', status: 'SUSPENDED' },
    { userId: 'u4', displayName: 'Chandan', status: 'ACTIVE' },
  ];
  it('lists active people without their own setting, A to Z', () => {
    expect(addablePeople(users, [{ userId: 'u4', displayName: 'Chandan', email: null, enabled: true }]).map((u) => u.userId)).toEqual(['u1', 'u2']);
  });
});
