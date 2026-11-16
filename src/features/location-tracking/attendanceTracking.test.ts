import { beforeEach, describe, expect, it, vi } from 'vitest';

const plugin = vi.hoisted(() => ({
  available: true,
  status: { available: true, active: false } as Record<string, unknown>,
  start: vi.fn(),
  stop: vi.fn(),
}));

vi.mock('../../services/device/backgroundLocation', () => ({
  trackerAvailable: () => plugin.available,
  trackerStatus: async () => (plugin.available ? plugin.status : { available: false, active: false }),
  startTracker: plugin.start,
  stopTracker: plugin.stop,
}));
const api = vi.hoisted(() => ({ start: vi.fn(), stop: vi.fn() }));
vi.mock('../../services/audit-core/locationTracking', async (original) => ({
  ...(await original<typeof import('../../services/audit-core/locationTracking')>()),
  startLocationTracking: api.start,
  stopLocationTracking: api.stop,
}));
vi.mock('../../services/audit-core/client', () => ({ auditCoreBaseUrl: () => 'https://verigence.example/audit-core' }));

import { beginTracking, resetTrackingMemory, syncTracking, trackingDecision } from './attendanceTracking';
import { trackingPanelText } from './trackingText';
import { coverageText } from '../dealguard-presence/LocationChecksLog';

// 16 Nov 2026, 11:00 IST.
const NOW = Date.parse('2026-11-16T05:30:00Z');
const side = { at: '2026-11-16T04:00:00Z' };
type Today = Parameters<typeof trackingDecision>[0];
const day = (checkIn: boolean, checkOut: boolean, workDate = '2026-11-16') => ({
  workDate,
  day: { checkIn: checkIn ? side : null, checkOut: checkOut ? side : null },
}) as unknown as Today;

beforeEach(() => {
  resetTrackingMemory();
  plugin.available = true;
  plugin.status = { available: true, active: false };
  plugin.start.mockReset().mockResolvedValue({ available: true, active: true });
  plugin.stop.mockReset().mockResolvedValue({ available: true, active: false });
  api.start.mockReset();
  api.stop.mockReset().mockResolvedValue({ stopped: 1 });
});

describe('the phone records the location from check-in to check-out', () => {
  it('starts after check-in, stops after check-out, and leaves other days alone', () => {
    const idle = { available: true, active: false };
    const running = { available: true, active: true };
    expect(trackingDecision(day(true, false), idle, NOW)).toBe('START');
    expect(trackingDecision(day(true, false), running, NOW)).toBe('NONE');
    expect(trackingDecision(day(true, true), running, NOW)).toBe('STOP');
    expect(trackingDecision(day(false, false), idle, NOW)).toBe('NONE');
    // After 19:30 IST, or yesterday's attendance: nothing starts.
    expect(trackingDecision(day(true, false), idle, Date.parse('2026-11-16T14:05:00Z'))).toBe('NONE');
    expect(trackingDecision(day(true, false, '2026-11-15'), idle, NOW)).toBe('NONE');
    expect(trackingDecision(day(true, false), { available: false, active: false }, NOW)).toBe('NONE');
  });

  it('starts the phone service with the day’s key from Audit Core', async () => {
    api.start.mockResolvedValue({
      tracking: true, key: 'k'.repeat(43), path: '/p2/v1/tenants/t1/location-tracking/checks',
      trackingUntilUtc: '2026-11-16T14:00:00Z', intervalMinutes: 20, window: { from: '10:00', to: '19:30' },
      tenantId: 't1', projectName: 'Mahindra Orissa',
    });
    const result = await syncTracking('token', day(true, false) as never, 't1', NOW);
    expect(result.active).toBe(true);
    expect(api.start).toHaveBeenCalledWith('token', 't1');
    expect(plugin.start).toHaveBeenCalledWith({
      baseUrl: 'https://verigence.example/audit-core', path: '/p2/v1/tenants/t1/location-tracking/checks',
      key: 'k'.repeat(43), trackingUntilMs: Date.parse('2026-11-16T14:00:00Z'), intervalMinutes: 20,
      windowFromMinute: 600, windowToMinute: 1170,
    });
  });

  it('does not ask again the same day once Audit Core says there is nothing to record against', async () => {
    api.start.mockResolvedValue({ tracking: false, reason: 'NO_PROJECT', intervalMinutes: 20, window: { from: '10:00', to: '19:30' } });
    expect(await beginTracking('token', undefined, NOW)).toEqual({ started: false, reason: 'NO_PROJECT' });
    await beginTracking('token', undefined, NOW);
    expect(api.start).toHaveBeenCalledTimes(1);
    expect(plugin.start).not.toHaveBeenCalled();
  });

  it('stops the phone and the key at check-out', async () => {
    plugin.status = { available: true, active: true };
    await syncTracking('token', day(true, true) as never, undefined, NOW);
    expect(plugin.stop).toHaveBeenCalled();
    expect(api.stop).toHaveBeenCalledWith('token');
  });

  it('does nothing outside the Android app', async () => {
    plugin.available = false;
    expect(await beginTracking('token', undefined, NOW)).toEqual({ started: false, reason: 'NOT_ANDROID' });
    expect(api.start).not.toHaveBeenCalled();
  });
});

describe('what the person and the report read', () => {
  it('says what the phone is doing', () => {
    const active = trackingPanelText({ available: true, active: true, pending: 2, lastReadingMs: Date.parse('2026-11-16T05:20:00Z') }, null, NOW);
    expect(active.title).toBe('Recording your work location');
    expect(active.detail).toContain('Last reading 10:50.');
    expect(active.detail).toContain('2 readings kept on the phone');
    expect(trackingPanelText({ available: true, active: false }, { started: false, reason: 'NO_PROJECT' }, NOW).detail)
      .toContain('not assigned to a Project');
    expect(trackingPanelText({ available: true, active: false, locationPermission: false }, null, NOW).detail)
      .toContain('permission is off');
  });

  it('puts checked hours against hours on DealGuard', () => {
    const base = { actorId: 'a', checks: 3, away: 0, counts: {} as never, last: null, items: [] };
    expect(coverageText({ ...base, hoursChecked: 4, hoursOnDealGuard: 6 })).toBe('checked in 4 of 6 hours on DealGuard');
    expect(coverageText({ ...base, hoursChecked: 2, hoursOnDealGuard: 0, background: true, longestGapMinutes: 75 }))
      .toBe('phone recording, longest gap 75 min');
    expect(coverageText(base)).toBe('');
  });
});
