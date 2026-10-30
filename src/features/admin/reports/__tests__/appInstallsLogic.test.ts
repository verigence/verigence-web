import { describe, expect, it } from 'vitest';

import type { LoginPerson } from '../../../../services/security/loginActivity';
import { appInstallsCsv, byAppFirst, compareVersions, versionsInUse } from '../appInstallsLogic';

const STATE_LABEL: Record<LoginPerson['state'], string> = {
  APP_SIGNED_IN: 'On the app', DOWNLOADED: 'Downloaded, never signed in', WEB_ONLY: 'Web only',
  TRIED_FAILED: 'Could not sign in', NOT_TRIED: 'Never signed in',
};

const person = (over: Partial<LoginPerson>): LoginPerson => ({
  userId: 'u', name: 'Asha', email: 'asha@example.com', userStatus: 'ACTIVE', isEmployee: true,
  state: 'NOT_TRIED', loginsOk: 0, loginsFailed: 0, appLogins: 0, webLogins: 0, firstLoginAt: null,
  lastLoginAt: null, lastAttemptAt: null, lastOutcome: null, lastReason: null, appVersion: null,
  downloads: 0, firstDownloadAt: null, lastDownloadAt: null, lastDownloadVersion: null,
  downloadHistory: [], ...over,
});

describe('who has the app', () => {
  it('orders versions newest first, however many parts they have', () => {
    expect(['1.0', '1.3.2', '1.4.0', '1.10.0'].sort(compareVersions)).toEqual(['1.10.0', '1.4.0', '1.3.2', '1.0']);
  });

  it('puts people on the app first, then who downloaded it, then the rest', () => {
    const people = [
      person({ userId: '1', name: 'Never', state: 'NOT_TRIED' }),
      person({ userId: '2', name: 'Took it', state: 'DOWNLOADED', downloads: 1, lastDownloadAt: '2026-10-20T00:00:00Z' }),
      person({ userId: '3', name: 'Running', state: 'APP_SIGNED_IN', appVersion: '1.3.2', downloads: 1 }),
    ];
    expect(byAppFirst(people, { employeesOnly: false }).map((p) => p.userId)).toEqual(['3', '2', '1']);
  });

  it('leaves out everyone who is not an employee when asked', () => {
    const people = [person({ userId: '1' }), person({ userId: '2', isEmployee: false })];
    expect(byAppFirst(people, { employeesOnly: true }).map((p) => p.userId)).toEqual(['1']);
    expect(byAppFirst(people, { employeesOnly: false })).toHaveLength(2);
  });

  it('counts how many people are on each version, newest first', () => {
    const people = [
      person({ userId: '1', appVersion: '1.3.2' }),
      person({ userId: '2', appVersion: '1.4.0' }),
      person({ userId: '3', appVersion: '1.3.2' }),
      person({ userId: '4' }),
    ];
    expect(versionsInUse(people)).toEqual([['1.4.0', 1], ['1.3.2', 2]]);
  });

  it('writes a CSV with the version taken and the version running', () => {
    const rows = appInstallsCsv([person({
      name: 'Asha, B', state: 'APP_SIGNED_IN', downloads: 2, appLogins: 3,
      firstDownloadAt: '2026-10-05T00:00:00Z', lastDownloadAt: '2026-10-30T00:00:00Z',
      lastDownloadVersion: '1.4.0', appVersion: '1.3.2', lastLoginAt: '2026-10-30T05:00:00Z',
    })], STATE_LABEL).split('\n');
    expect(rows[0]).toContain('Version downloaded,Version running');
    expect(rows[1]).toContain('"Asha, B"');
    expect(rows[1]).toContain('1.4.0,1.3.2');
  });
});
