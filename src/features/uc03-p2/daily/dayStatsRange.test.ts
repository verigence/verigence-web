import { describe, expect, it } from 'vitest';

import { rangeFor, rangeLabel, stepAnchor } from './dayStatsRange';

describe('day stats ranges', () => {
  const today = '2026-10-30'; // a Friday

  it('a day is itself; a week is Monday to Sunday capped at today; a month is the 1st to its end capped at today', () => {
    expect(rangeFor('day', today, today)).toEqual({ from: '2026-10-30', to: '2026-10-30' });
    expect(rangeFor('week', today, today)).toEqual({ from: '2026-10-26', to: '2026-10-30' });
    expect(rangeFor('week', '2026-10-20', today)).toEqual({ from: '2026-10-19', to: '2026-10-25' });
    expect(rangeFor('month', today, today)).toEqual({ from: '2026-10-01', to: '2026-10-30' });
    expect(rangeFor('month', '2026-09-15', today)).toEqual({ from: '2026-09-01', to: '2026-09-30' });
  });

  it('steps a day, a week or a month at a time', () => {
    expect(stepAnchor('day', today, -1)).toBe('2026-10-29');
    expect(stepAnchor('week', today, -1)).toBe('2026-10-23');
    expect(stepAnchor('month', today, -1)).toBe('2026-09-01');
    expect(stepAnchor('month', '2026-12-30', 1)).toBe('2027-01-01');
  });

  it('labels today and yesterday by name and a month by its name', () => {
    expect(rangeLabel('day', today, today, today)).toBe('Today');
    expect(rangeLabel('day', '2026-10-29', '2026-10-29', today)).toBe('Yesterday');
    expect(rangeLabel('month', '2026-10-01', today, today)).toBe('October 2026');
  });
});
