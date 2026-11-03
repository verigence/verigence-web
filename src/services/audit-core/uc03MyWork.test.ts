import { describe, expect, it } from 'vitest';

import { istDate, periodRange } from './uc03MyWork';

describe('PC Home periods (IST)', () => {
  // Monday 2 Nov 2026, 22:40 IST = 17:10 UTC.
  const monday = new Date('2026-11-02T17:10:00Z');

  it('reads the day in IST, not UTC', () => {
    expect(istDate(new Date('2026-11-02T19:00:00Z'))).toBe('2026-11-03'); // 00:30 IST on Tuesday
  });

  it('today, this week from Monday, last week Monday to Sunday', () => {
    expect(periodRange('today', monday)).toEqual({ from: '2026-11-02', to: '2026-11-02' });
    expect(periodRange('yesterday', monday)).toEqual({ from: '2026-11-01', to: '2026-11-01' });
    // 00:30 IST on Tuesday 3 Nov: yesterday is Monday 2 Nov in IST, not Sunday.
    expect(periodRange('yesterday', new Date('2026-11-02T19:00:00Z'))).toEqual({ from: '2026-11-02', to: '2026-11-02' });
    expect(periodRange('week', monday)).toEqual({ from: '2026-11-02', to: '2026-11-02' });
    expect(periodRange('lastWeek', monday)).toEqual({ from: '2026-10-26', to: '2026-11-01' });
    const saturday = new Date('2026-11-07T06:00:00Z');
    expect(periodRange('week', saturday)).toEqual({ from: '2026-11-02', to: '2026-11-07' });
    const sunday = new Date('2026-11-08T06:00:00Z');
    expect(periodRange('week', sunday)).toEqual({ from: '2026-11-02', to: '2026-11-08' });
  });
});
