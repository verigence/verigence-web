import { describe, expect, it } from 'vitest';

import type { TenantAlert } from '../../../services/audit-core/tenantAlerts';
import { alertsToBeep, beepedStorageKey } from '../alertSound';

const alert = (id: string, pcActorId: string | null, kind = 'SAME_FILE_UPLOADED'): TenantAlert => ({
  alertId: id, kind, title: 'Same file being uploaded', body: '', publishedAtUtc: '', expiresAtUtc: '',
  payload: { newJourney: { pcActorId } },
});

describe('the same-file beep', () => {
  it('beeps only for the PC who entered the new file, once per alert', () => {
    const alerts = [alert('a', 'pc-1'), alert('b', 'pc-2'), alert('c', 'pc-1'), alert('d', 'pc-1', 'OTHER')];
    expect(alertsToBeep(alerts, 'pc-1', new Set()).map((a) => a.alertId)).toEqual(['a', 'c']);
    expect(alertsToBeep(alerts, 'pc-1', new Set(['a'])).map((a) => a.alertId)).toEqual(['c']);
    expect(alertsToBeep(alerts, 'tl-9', new Set())).toEqual([]);
    expect(alertsToBeep(alerts, undefined, new Set())).toEqual([]);
  });

  it('keeps what beeped per Project and person', () => {
    expect(beepedStorageKey('t1', 'pc-1')).not.toBe(beepedStorageKey('t1', 'pc-2'));
  });
});
