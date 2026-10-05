import { describe, expect, it } from 'vitest';

import { canSendRequest, statusChangeActions, statusChoices } from '../statusChange';

describe('statusChange', () => {
  it('offers every status except the current one', () => {
    expect(statusChoices('ACTIVE')).toEqual(['SUSPENDED', 'TERMINATED', 'QUIT']);
    expect(statusChoices('QUIT')).toEqual(['ACTIVE', 'SUSPENDED', 'TERMINATED']);
  });

  it('needs a status and a reason of at least 3 letters', () => {
    expect(canSendRequest({ toStatus: 'QUIT', reason: 'ab ' })).toBe(false);
    expect(canSendRequest({ toStatus: '', reason: 'Resigned' })).toBe(false);
    expect(canSendRequest({ toStatus: 'QUIT', reason: 'Resigned' })).toBe(true);
  });

  it('lets only the CEO decide, never on their own request, and only the asker cancel', () => {
    const open = { status: 'PENDING' as const, requestedBy: 'hr-1' };
    const ceo = { userId: 'ceo-1', canApprove: true, canManage: true };
    const hr = { userId: 'hr-1', canApprove: false, canManage: true };
    expect(statusChangeActions(open, ceo)).toEqual({ approve: true, reject: true, cancel: false });
    expect(statusChangeActions(open, hr)).toEqual({ approve: false, reject: false, cancel: true });
    expect(statusChangeActions(open, { ...hr, userId: 'hr-2' })).toEqual({ approve: false, reject: false, cancel: false });
    expect(statusChangeActions({ ...open, requestedBy: 'ceo-1' }, ceo)).toEqual({ approve: false, reject: false, cancel: true });
    expect(statusChangeActions({ status: 'APPROVED', requestedBy: 'hr-1' }, ceo)).toEqual({ approve: false, reject: false, cancel: false });
    expect(statusChangeActions(open, { userId: null, canApprove: true, canManage: true })).toEqual({ approve: true, reject: true, cancel: false });
  });
});
