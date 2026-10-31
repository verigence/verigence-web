import { describe, expect, it } from 'vitest';

import {
  alignHours, cuRange, durationText, emptyWorkerHour, hourTick, msText, nodeLabel, nodeTone, pctFloor, probeText, r2Bars,
  ratioText, workerBars,
} from '../infraLogic';

describe('Cloudflare & Neon helpers', () => {
  it('names node states and tones', () => {
    expect(nodeTone('CRITICAL')).toBe('bad');
    expect(nodeTone('NOT_CONFIGURED')).toBe('muted');
    expect(nodeLabel('WARNING')).toBe('Warning');
  });

  it('describes a live probe', () => {
    const base = { checkedAtUtc: '2026-10-31T09:00:00Z' };
    expect(probeText({ ...base, configured: false, ok: null, latencyMs: null, error: 'x' })).toBe('Not configured');
    expect(probeText({ ...base, configured: true, ok: true, statusCode: 200, latencyMs: 1234, error: null })).toBe('HTTP 200 · 1,234 ms');
    expect(probeText({ ...base, configured: true, ok: true, latencyMs: 80, error: null })).toBe('Answered · 80 ms');
    expect(probeText({ ...base, configured: true, ok: false, latencyMs: 5000, error: 'No answer (ConnectTimeout).' }))
      .toBe('No answer (ConnectTimeout). · 5,000 ms');
  });

  it('formats ratios, durations, CPU time and autoscaling', () => {
    expect(ratioText(0.9876)).toBe('98.8%');
    expect(ratioText(null)).toBe('—');
    expect(durationText(42)).toBe('42 s');
    expect(durationText(400)).toBe('6.7 min');
    expect(durationText(7200)).toBe('2.0 h');
    expect(msText(1.234)).toBe('1.2 ms');
    expect(msText(24000)).toBe('24,000 ms');
    expect(cuRange({ minCu: 0.25, maxCu: 8 })).toBe('0.25–8 CU');
    expect(cuRange({ minCu: 2, maxCu: 2 })).toBe('2 CU (fixed)');
  });

  it('shows hours in IST', () => {
    expect(hourTick('2026-10-31T09:00:00Z', 24)).toBe('14:30');
    expect(hourTick('2026-10-31T09:00:00Z', 168)).toContain('31 Oct');
  });

  it('fills every hour of the window so quiet hours are gaps, matching any ISO spelling', () => {
    const now = Date.parse('2026-10-31T10:20:00Z');
    const rows = alignHours([
      { ...emptyWorkerHour('2026-10-31T08:00:00+00:00'), requests: 5, errors: 1 },
      { ...emptyWorkerHour('2026-10-31T10:00:00Z'), requests: 7 },
    ], 4, now, emptyWorkerHour);
    expect(rows.map((r) => r.hour)).toEqual([
      '2026-10-31T07:00:00.000Z', '2026-10-31T08:00:00.000Z', '2026-10-31T09:00:00.000Z', '2026-10-31T10:00:00.000Z',
    ]);
    expect(rows.map((r) => r.requests)).toEqual([0, 5, 0, 7]);
    expect(workerBars(rows)[1]).toMatchObject({ ok: 4, errors: 1 });
  });

  it('stacks R2 lists with the other operations', () => {
    expect(r2Bars([{ hour: 'h', reads: 1, writes: 2, lists: 3, deletes: 4, other: 5, clientErrors: 0, serverErrors: 0 }])[0].listsOther).toBe(8);
  });

  it('keeps a cache-hit axis tight but never below 80%', () => {
    expect(pctFloor([99.5, 100, null])).toBe(90);
    expect(pctFloor([42])).toBe(80);
    expect(pctFloor([])).toBe(95);
  });
});
