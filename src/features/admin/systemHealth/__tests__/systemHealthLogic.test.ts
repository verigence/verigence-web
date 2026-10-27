import { describe, expect, it } from 'vitest';

import {
  agoText, alertCounts, barHeights, bytesText, connectionsInUse, cpuText, errorRate, memoryText, overallStatus,
  pctTone, serviceTone, usePct,
} from '../systemHealthLogic';

describe('system health logic', () => {
  it('lets the worst alert decide the headline', () => {
    expect(overallStatus([])).toEqual({ label: 'Healthy', tone: 'ok' });
    expect(overallStatus([{ severity: 'WARNING', code: 'X', message: '' }]).tone).toBe('warn');
    const both = [{ severity: 'WARNING' as const, code: 'X', message: '' }, { severity: 'CRITICAL' as const, code: 'Y', message: '' }];
    expect(overallStatus(both).tone).toBe('bad');
    expect(alertCounts(both)).toEqual({ critical: 1, warning: 1 });
  });

  it('marks a silent service red and a restarted one amber', () => {
    expect(serviceTone({ status: 'DOWN', restarts: 0, uncleanStops: 0, serverErrorsLastHour: 0 })).toBe('bad');
    expect(serviceTone({ status: 'UP', restarts: 1, uncleanStops: 0, serverErrorsLastHour: 0 })).toBe('warn');
    expect(serviceTone({ status: 'UP', restarts: 0, uncleanStops: 0, serverErrorsLastHour: 0 })).toBe('ok');
    expect(serviceTone({ status: 'NO_HEARTBEAT', restarts: 0, uncleanStops: 0, serverErrorsLastHour: 0 })).toBe('muted');
  });

  it('works out use against the limit', () => {
    expect(usePct(11, 12)).toBe(92);
    expect(usePct(1, null)).toBeNull();
    expect(pctTone(92)).toBe('bad');
    expect(pctTone(75)).toBe('warn');
    expect(pctTone(10)).toBe('ok');
    expect(pctTone(null)).toBe('muted');
    expect(cpuText({ cpuMax: 0.6807, cpuLimit: 12 })).toBe('0.68 of 12 vCPU');
    expect(memoryText({ memoryMaxGb: 0.5, memoryLimitGb: 16 })).toBe('512 MB of 16 GB');
    expect(memoryText({ memoryMaxGb: 1.7, memoryLimitGb: 16 })).toBe('1.70 GB of 16 GB');
  });

  it('reads error rates and sizes plainly', () => {
    expect(errorRate(53, 60998)).toBe('<0.1%');
    expect(errorRate(6051, 60998)).toBe('9.9%');
    expect(errorRate(0, 0)).toBe('—');
    expect(bytesText(1536)).toBe('1.5 KB');
    expect(bytesText(3 * 1024 ** 3)).toBe('3.0 GB');
    expect(connectionsInUse({ connections: { active: 1, idle: 40, 'idle in transaction': 4 } })).toBe(45);
  });

  it('says how long ago and scales the hourly bars', () => {
    const now = Date.parse('2026-10-27T10:00:00Z');
    expect(agoText('2026-10-27T09:48:00Z', now)).toBe('12 min ago');
    expect(agoText('2026-10-27T07:00:00Z', now)).toBe('3 h ago');
    expect(agoText(null, now)).toBe('—');
    expect(barHeights([0, 5, 10])).toEqual([0, 50, 100]);
    expect(barHeights([0, 0])).toEqual([0, 0]);
  });
});
