import { describe, expect, it } from 'vitest';

import { checkNewContact, contactChangeActions, contactLoginNote } from '../contactChange';

describe('checkNewContact', () => {
  it('cleans a good email and mobile', () => {
    expect(checkNewContact('EMAIL', ' New@Example.com ', 'old@example.com')).toEqual({ value: 'new@example.com', error: null });
    expect(checkNewContact('MOBILE', '+91 98765 43210', '9000000000')).toEqual({ value: '9876543210', error: null });
  });
  it('refuses bad or unchanged values', () => {
    expect(checkNewContact('EMAIL', 'nope', 'a@b.com').error).toBeTruthy();
    expect(checkNewContact('EMAIL', 'A@B.com', 'a@b.com').error).toBeTruthy();
    expect(checkNewContact('MOBILE', '12345', null).error).toBeTruthy();
    expect(checkNewContact('MOBILE', '9876543210', '9876543210').error).toBeTruthy();
  });
});

describe('contactChangeActions', () => {
  const open = { status: 'PENDING' as const, requestedBy: 'emp-1' };
  it('lets HR decide an open request, never their own, and nobody else decide', () => {
    expect(contactChangeActions(open, { userId: 'hr-1', canManage: true })).toEqual({ approve: true, reject: true });
    expect(contactChangeActions(open, { userId: 'emp-1', canManage: true })).toEqual({ approve: false, reject: false });
    expect(contactChangeActions(open, { userId: 'x', canManage: false })).toEqual({ approve: false, reject: false });
    expect(contactChangeActions({ ...open, status: 'APPROVED' }, { userId: 'hr-1', canManage: true })).toEqual({ approve: false, reject: false });
  });
});

describe('contactLoginNote', () => {
  it('tells HR to send the Welcome email after an email change on a login', () => {
    expect(contactLoginNote({ status: 'APPROVED', field: 'EMAIL', loginOutcome: 'LOGIN_UPDATED' })).toMatch(/Welcome email/);
    expect(contactLoginNote({ status: 'APPROVED', field: 'MOBILE', loginOutcome: 'NO_LOGIN' })).toMatch(/no Verigence login/);
    expect(contactLoginNote({ status: 'REJECTED', field: 'EMAIL', loginOutcome: null })).toBe('');
  });
});
