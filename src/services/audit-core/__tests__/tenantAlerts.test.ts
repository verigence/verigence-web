import { describe, expect, it } from 'vitest';

import {
  alertMessage,
  dismissedStorageKey,
  readDismissed,
  unseenAlerts,
  writeDismissed,
  type TenantAlert,
} from '../tenantAlerts';

function alert(id: string, overrides: Partial<TenantAlert> = {}): TenantAlert {
  return {
    alertId: id,
    kind: 'SAME_FILE_UPLOADED',
    outcome: 'DELETED',
    title: 'Same file being uploaded',
    body: '',
    journeyReference: `ADI-RD-${id}`,
    payload: {
      customerName: 'Amit Kumar Sahoo',
      model: 'THAR',
      newJourney: { reference: `ADI-RD-${id}`, pcName: 'Rakesh', dealerName: 'Adishakti', outletName: 'Rasulgarh' },
    },
    publishedAtUtc: '2026-10-31T06:00:00Z',
    expiresAtUtc: '2026-11-01T06:00:00Z',
    ...overrides,
  };
}

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
  };
}

describe('unseenAlerts', () => {
  const now = new Date('2026-10-31T08:00:00Z');

  it('drops dismissed and expired alerts and puts the newest first', () => {
    const items = [
      alert('a', { publishedAtUtc: '2026-10-31T05:00:00Z' }),
      alert('b', { publishedAtUtc: '2026-10-31T07:00:00Z' }),
      alert('c'),
      alert('d', { expiresAtUtc: '2026-10-31T07:59:00Z' }),
    ];
    expect(unseenAlerts(items, new Set(['c']), now).map((a) => a.alertId)).toEqual(['b', 'a']);
  });

  it('shows nothing before the first answer', () => {
    expect(unseenAlerts(undefined, new Set(), now)).toEqual([]);
  });
});

describe('dismissed alerts', () => {
  it('are remembered per Project and person', () => {
    const storage = memoryStorage();
    const key = dismissedStorageKey('tenant-1', 'pc@example.test');
    writeDismissed(key, ['a', 'b'], storage);
    expect([...readDismissed(key, storage)]).toEqual(['a', 'b']);
    expect(readDismissed(dismissedStorageKey('tenant-2', 'pc@example.test'), storage).size).toBe(0);
    expect(readDismissed(dismissedStorageKey('tenant-1', 'tl@example.test'), storage).size).toBe(0);
  });

  it('survive storage that is broken or refuses', () => {
    const broken = {
      getItem: () => { throw new Error('denied'); },
      setItem: () => { throw new Error('quota'); },
    };
    expect(readDismissed('k', broken).size).toBe(0);
    expect(() => writeDismissed('k', ['a'], broken)).not.toThrow();
    expect(readDismissed('k', { getItem: () => '{not json' }).size).toBe(0);
    expect(readDismissed('k', null).size).toBe(0);
  });
});

describe('alertMessage', () => {
  it('uses the text Audit Core wrote', () => {
    expect(alertMessage(alert('a', { body: 'Same file being uploaded — X.' }))).toBe('Same file being uploaded — X.');
  });

  it('names customer, model, PC and dealership when there is no text', () => {
    expect(alertMessage(alert('a'))).toBe(
      'Same file being uploaded — Amit Kumar Sahoo, THAR, PC Rakesh, Adishakti/Rasulgarh. The new file ADI-RD-a was deleted.',
    );
    expect(alertMessage(alert('a', { outcome: 'KEPT_NOT_INDIVIDUAL' }))).toContain('was kept for review.');
  });
});
