import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

const disable = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock('../../services/security/rememberSessionLifecycle', () => ({ disableRememberedSession: disable }));
vi.mock('../../services/security/rememberDebugLog', () => ({ rememberLog: () => undefined }));
vi.mock('../../services/device/identity', () => ({
  getVerigenceDeviceContext: () => ({ deviceId: 'd1', deviceType: 'MOBILE' }),
}));

import { useSessionStore } from '../sessionStore';

function signIn() {
  useSessionStore.getState().signInAuthenticated('pc@example.test', 'token', 'PC', '2099-01-01T00:00:00Z', 's1', 'd1');
}

describe('ending the session and "Keep me signed in"', () => {
  beforeEach(() => {
    disable.mockClear();
    signIn();
  });

  it('an automatic ending keeps the remembered credential', () => {
    useSessionStore.getState().signOut('SESSION_ENDED');
    expect(useSessionStore.getState().signedIn).toBe(false);
    expect(disable).not.toHaveBeenCalled();
  });

  it("the person's own Sign out forgets this device", () => {
    useSessionStore.getState().signOut('USER');
    expect(useSessionStore.getState().signedIn).toBe(false);
    expect(disable).toHaveBeenCalledTimes(1);
  });
});

/** Every `signOut('USER')` in the app sits behind a "Sign out" button the person presses. */
describe('which screens may forget the remembered credential', () => {
  const root = join(__dirname, '..', '..');
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) {
        if (name !== '__tests__') walk(path);
      } else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) {
        files.push(path);
      }
    }
  };
  walk(root);

  it('only the explicit Sign out buttons use the USER reason', () => {
    const users = files
      .filter((file) => /signOut\(\s*'USER'\s*\)/.test(readFileSync(file, 'utf8')))
      .map((file) => relative(root, file).replaceAll('\\', '/'))
      .sort();
    expect(users).toEqual([
      'components/ProjectContextGate.tsx',
      'features/announcements/MaintenancePage.tsx',
      'layout/AppShell.tsx',
    ]);
  });

  it('the automatic renewal path never forgets it', () => {
    const renewal = readFileSync(join(root, 'components', 'SessionRenewalGate.tsx'), 'utf8');
    expect(renewal).toContain("signOut('SESSION_ENDED')");
    expect(renewal).not.toMatch(/signOut\(\s*'USER'/);
    expect(renewal).not.toContain('disableRememberedSession');
    expect(renewal).not.toContain('clearRejectedRememberedSession');
  });
});
