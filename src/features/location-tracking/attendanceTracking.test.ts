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
import { trackingAsk } from './trackingText';
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
  it('asks for one phone setting at a time, in a line, and says nothing when there is nothing to ask', () => {
    const active = { available: true, active: true, pending: 2, lastReadingMs: Date.parse('2026-11-16T05:20:00Z') };
    // Product owner, 19 Nov 2026: "just ask them to allow all time".
    expect(trackingAsk({ ...active, backgroundPermission: false, unrestrictedBattery: false }, null, NOW))
      .toEqual({ kind: 'ALLOW_ALWAYS', text: 'Please set location for Verigence to Allow all the time.' });
    expect(trackingAsk({ ...active, backgroundPermission: true, unrestrictedBattery: false }, null, NOW)?.kind).toBe('KEEP_RUNNING');
    expect(trackingAsk({ ...active, backgroundPermission: true, unrestrictedBattery: true }, null, NOW)).toBeNull();
    expect(trackingAsk(active, null, NOW)).toBeNull();
  });

  it('never tells the person an hour, and is quiet about what they cannot change', () => {
    const off = { available: true, active: false };
    const evening = Date.parse('2026-11-16T14:30:00Z'); // 20:00 IST
    const every = [
      trackingAsk({ available: true, active: true, backgroundPermission: false }, null, NOW),
      trackingAsk({ available: true, active: true, backgroundPermission: true, unrestrictedBattery: false }, null, NOW),
      trackingAsk(off, null, NOW),
      trackingAsk(off, { started: false, reason: 'FAILED' }, NOW),
      trackingAsk(off, { started: false, reason: 'NO_LOCATION_PERMISSION' }, NOW),
      trackingAsk({ ...off, locationPermission: false }, null, NOW),
    ];
    for (const ask of every) {
      expect(ask).not.toBeNull();
      expect(ask!.text).not.toMatch(/\d/);
      expect(ask!.text).not.toMatch(/record|only|must|latest/i);
    }
    expect(trackingAsk(off, null, NOW)?.kind).toBe('TURN_ON');
    expect(trackingAsk({ ...off, locationPermission: false }, null, NOW)?.kind).toBe('PHONE_SETTINGS');
    // A PC working late is told nothing about hours; nor is one with no Project.
    expect(trackingAsk(off, null, evening)).toBeNull();
    expect(trackingAsk(off, { started: false, reason: 'WINDOW_OVER' }, evening)).toBeNull();
    expect(trackingAsk(off, { started: false, reason: 'NO_PROJECT' }, NOW)).toBeNull();
  });

  it('puts checked hours against hours on DealGuard', () => {
    const base = { actorId: 'a', checks: 3, away: 0, counts: {} as never, last: null, items: [] };
    expect(coverageText({ ...base, hoursChecked: 4, hoursOnDealGuard: 6 })).toBe('checked in 4 of 6 hours on DealGuard');
    expect(coverageText({ ...base, hoursChecked: 2, hoursOnDealGuard: 0, background: true, longestGapMinutes: 75 }))
      .toBe('phone recording, longest gap 75 min');
    expect(coverageText(base)).toBe('');
  });
});
