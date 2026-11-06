import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  hint: true,
  credential: 'old' as string | undefined,
  stored: [] as string[],
  cleared: 0,
  resume: vi.fn(),
  logout: vi.fn(async () => undefined),
}));

vi.mock('../../device/identity', () => ({
  getVerigenceDeviceContext: () => ({ deviceId: 'd1', deviceType: 'MOBILE' }),
}));
vi.mock('../rememberDebugLog', () => ({ rememberLog: () => undefined }));
vi.mock('../rememberSession', () => ({
  hasRememberSessionHint: () => state.hint,
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
import { resumeRememberedSession } from '../rememberSessionLifecycle';

const ok = (token: string) => ({ accessToken: 'a', expiresAtUtc: 'x', sessionId: 's', deviceId: 'd1', isSuperAdmin: false, remembered: true, rememberToken: token });

describe('resuming a remembered session while the app is open', () => {
  beforeEach(() => {
    state.hint = true;
    state.credential = 'old';
    state.stored = [];
    state.cleared = 0;
    state.resume.mockReset();
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

  it('does nothing for someone who did not choose Keep me signed in', async () => {
    state.hint = false;
    expect((await resumeRememberedSession()).kind).toBe('none');
    expect(state.resume).not.toHaveBeenCalled();
  });
});
