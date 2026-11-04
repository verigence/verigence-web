import { describe, expect, it } from 'vitest';

import { isCriticalAlert, isFlashingAlert, orderAlerts, type TenantAlert } from '../../../services/audit-core/tenantAlerts';
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

describe('a duplicate booking across outlets (2026-11-03)', () => {
  const cross = (id: string, newPc: string, oldPc: string): TenantAlert => ({
    alertId: id, kind: 'DUPLICATE_ACROSS_OUTLETS', title: 'Duplicate booking across outlets', body: '',
    publishedAtUtc: '', expiresAtUtc: '',
    payload: { newJourney: { pcActorId: newPc }, existingJourney: { pcActorId: oldPc }, severity: 'CRITICAL' },
  });

  it('beeps for the PC of either booking', () => {
    const alerts = [cross('x', 'pc-new', 'pc-old')];
    expect(alertsToBeep(alerts, 'pc-new', new Set()).map((a) => a.alertId)).toEqual(['x']);
    expect(alertsToBeep(alerts, 'pc-old', new Set()).map((a) => a.alertId)).toEqual(['x']);
    expect(alertsToBeep(alerts, 'tl-1', new Set())).toEqual([]);
  });

  it('comes before the other alerts', () => {
    const ordered = orderAlerts([alert('a', 'pc-1'), cross('x', 'pc-2', 'pc-3'), alert('b', 'pc-1')]);
    expect(ordered.map((a) => a.alertId)).toEqual(['x', 'a', 'b']);
  });
});

describe('duplicate bookings, product owner 2026-11-04', () => {
  const alert = (id: string, kind: string): TenantAlert => ({
    alertId: id, kind, title: '', body: '', publishedAtUtc: '', expiresAtUtc: '',
    payload: { newJourney: { pcActorId: 'pc-new' }, existingJourney: { pcActorId: 'pc-old' }, severity: 'CRITICAL' },
  });

  it('beeps for both PCs at two outlets of one dealership', () => {
    const alerts = [alert('s', 'DUPLICATE_SAME_DEALERSHIP')];
    expect(alertsToBeep(alerts, 'pc-new', new Set()).map((a) => a.alertId)).toEqual(['s']);
    expect(alertsToBeep(alerts, 'pc-old', new Set()).map((a) => a.alertId)).toEqual(['s']);
    expect(alertsToBeep(alerts, 'reviewer', new Set())).toEqual([]);
  });

  it('flashes only the alert for another dealership; both are critical', () => {
    expect(isFlashingAlert(alert('x', 'DUPLICATE_ACROSS_OUTLETS'))).toBe(true);
    expect(isFlashingAlert(alert('s', 'DUPLICATE_SAME_DEALERSHIP'))).toBe(false);
    expect(isCriticalAlert(alert('s', 'DUPLICATE_SAME_DEALERSHIP'))).toBe(true);
  });
});
