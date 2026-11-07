import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  deviceType: 'MOBILE' as 'MOBILE' | 'WEB',
  hint: true,
  credential: 'old' as string | undefined,
  stored: [] as string[],
  cleared: 0,
  resume: vi.fn(),
  logout: vi.fn(async () => undefined),
}));

vi.mock('../../device/identity', () => ({
  getVerigenceDeviceContext: () => ({ deviceId: 'd1', deviceType: state.deviceType }),
}));
vi.mock('../rememberDebugLog', () => ({ rememberLog: () => undefined }));
vi.mock('../rememberSession', () => ({
  hasRememberSessionHint: () => state.hint,
  isNativeRememberPlatform: () => state.deviceType === 'MOBILE',
  setRememberSessionHint: (on: boolean) => { state.hint = on; },
  setRememberedIdentityHint: () => undefined,
  readNativeRememberCredential: async () => state.credential,
  storeNativeRememberCredential: async (value: string) => { state.stored.push(value); state.credential = value; return true; },
  clearNativeRememberCredential: async () => { state.cleared += 1; state.credential = undefined; },
}));
vi.mock('../auth', async () => {
  class SecurityLoginError extends Error {
    constructor(message: string, readonly status: number, readonly code?: string) { super(message); }
  }
  return { SecurityLoginError, resumeHuman: state.resume, logoutHuman: state.logout, rememberHuman: vi.fn() };
});

import { SecurityLoginError } from '../auth';
import { mayHaveRememberedSession, resumeRememberedSession } from '../rememberSessionLifecycle';

const ok = (token: string) => ({ accessToken: 'a', expiresAtUtc: 'x', sessionId: 's', deviceId: 'd1', isSuperAdmin: false, remembered: true, rememberToken: token });

describe('resuming a remembered session while the app is open', () => {
  beforeEach(() => {
    state.deviceType = 'MOBILE';
    state.hint = true;
    state.credential = 'old';
    state.stored = [];
    state.cleared = 0;
    state.resume.mockReset();
    state.logout.mockClear();
  });

  it('exchanges the credential once even when asked twice at the same time, and keeps the rotated one', async () => {
    state.resume.mockImplementation(async () => ok('new'));
    const [a, b] = await Promise.all([resumeRememberedSession(), resumeRememberedSession()]);
    expect(state.resume).toHaveBeenCalledTimes(1);
    expect(state.resume).toHaveBeenCalledWith({ deviceId: 'd1', deviceType: 'MOBILE' }, 'old');
    expect(a).toBe(b);
    expect(a.kind).toBe('resumed');
    expect(state.stored).toEqual(['new']);
    // the next exchange presents the newest credential
    state.resume.mockImplementation(async () => ok('newer'));
    await resumeRememberedSession();
    expect(state.resume).toHaveBeenLastCalledWith(expect.anything(), 'new');
  });

  it('clears the credential only when Security says no for good', async () => {
    state.resume.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    expect((await resumeRememberedSession()).kind).toBe('transient');
    expect(state.cleared).toBe(0);
    state.resume.mockRejectedValueOnce(new SecurityLoginError('Signed out', 401, 'AUTH_TOKEN_INVALID'));
    expect((await resumeRememberedSession()).kind).toBe('rejected');
    expect(state.cleared).toBeGreaterThan(0);
    expect(state.hint).toBe(false);
  });

  it('on the phone, resumes whenever a credential is stored, even with the localStorage hint missing', async () => {
    // 2026-11-07: the hint was the only thing the app looked at, and it was never set on phones.
    state.hint = false;
    state.resume.mockImplementation(async () => ok('rotated'));
    expect(mayHaveRememberedSession()).toBe(true);
    const outcome = await resumeRememberedSession();
    expect(state.resume).toHaveBeenCalledWith({ deviceId: 'd1', deviceType: 'MOBILE' }, 'old');
    expect(outcome.kind).toBe('resumed');
    expect(state.stored).toEqual(['rotated']);
    expect(state.hint).toBe(true);
  });

  it('on the phone, makes no network call and revokes nothing when no credential is stored', async () => {
    state.credential = undefined;
    const outcome = await resumeRememberedSession();
    expect(outcome.kind).toBe('none');
    expect(state.resume).not.toHaveBeenCalled();
    expect(state.logout).not.toHaveBeenCalled();
    expect(state.hint).toBe(false); // a stale hint is dropped
  });

  it('keeps the credential when Security refuses the person for now (paused, app update) rather than the credential', async () => {
    state.resume.mockRejectedValueOnce(new SecurityLoginError('Paused', 403, 'ACCESS_BLOCKED'));
    expect((await resumeRememberedSession()).kind).toBe('refused');
    state.resume.mockRejectedValueOnce(new SecurityLoginError('Update', 426, 'APP_UPDATE_REQUIRED'));
    expect((await resumeRememberedSession()).kind).toBe('refused');
    expect(state.cleared).toBe(0);
    expect(state.credential).toBe('old');
    expect(state.logout).not.toHaveBeenCalled();
  });

  it('clears and revokes the credential when Security says it was superseded by a sign-in on another phone', async () => {
    state.resume.mockRejectedValueOnce(new SecurityLoginError('Superseded', 401, 'SESSION_SUPERSEDED'));
    expect((await resumeRememberedSession()).kind).toBe('rejected');
    expect(state.credential).toBeUndefined();
    expect(state.logout).toHaveBeenCalledWith({ deviceId: 'd1', deviceType: 'MOBILE' }, 'old');
  });

  it('on Web, does nothing for someone who did not choose Keep me signed in', async () => {
    state.deviceType = 'WEB';
    state.hint = false;
    expect(mayHaveRememberedSession()).toBe(false);
    expect((await resumeRememberedSession()).kind).toBe('none');
    expect(state.resume).not.toHaveBeenCalled();
  });

  it('on Web, resumes with the cookie when the hint is set', async () => {
    state.deviceType = 'WEB';
    state.resume.mockImplementation(async () => ({ ...ok(''), rememberToken: null }));
    expect((await resumeRememberedSession()).kind).toBe('resumed');
    expect(state.resume).toHaveBeenCalledWith({ deviceId: 'd1', deviceType: 'WEB' }, undefined);
  });
});
