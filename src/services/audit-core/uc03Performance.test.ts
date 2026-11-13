import { describe, expect, it } from 'vitest';

import { dutySummary, measuresFor, minutesText, sparkPoints, trend, valueText, type Measure } from './uc03Performance';

const files: Measure = { key: 'filesUploaded', label: 'Files uploaded', group: 'OUTPUT', roles: ['PC'] };
const rejected: Measure = { key: 'pagesRejected', label: 'Pages rejected', group: 'QUALITY', roles: ['PC'], lowerIsBetter: true };
const active: Measure = { key: 'activeMinutes', label: 'Active time', group: 'UTILISATION', roles: ['PC', 'TL'], unit: 'MINUTES' };

describe('performance figures', () => {
  it('shows minutes as hours and minutes', () => {
    expect(minutesText(45)).toBe('45m');
    expect(minutesText(200)).toBe('3h 20m');
    expect(valueText(active, 65)).toBe('1h 05m');
    expect(valueText(files, 4.5)).toBe('4.5');
    expect(valueText(files, null)).toBe('—');
  });

  it('reads today against the usual, and knows when fewer is better', () => {
    expect(trend(files, 10, null)).toBeNull();
    expect(trend(files, 10, 10.4)).toEqual({ dir: 'level', good: null });
    expect(trend(files, 12, 6)).toEqual({ dir: 'up', good: true });
    expect(trend(files, 2, 6)).toEqual({ dir: 'down', good: false });
    expect(trend(rejected, 1, 6)).toEqual({ dir: 'down', good: true });
    expect(trend(rejected, 9, 3)).toEqual({ dir: 'up', good: false });
  });

  it('keeps the measures of a role', () => {
    expect(measuresFor([files, rejected, active], ['TL', 'PM']).map((m) => m.key)).toEqual(['activeMinutes']);
  });

  it('sums duties across schedules and draws a sparkline', () => {
    expect(dutySummary({ a: { due: 2, onTime: 1, late: 1, notDone: 0, pending: 0 }, b: { due: 1, onTime: 0, late: 0, notDone: 1, pending: 0 } }))
      .toEqual({ due: 3, onTime: 1, late: 1, notDone: 1, pending: 0 });
    expect(sparkPoints([0, 5, 10], 10, 10)).toBe('0.0,9.0 5.0,5.0 10.0,1.0');
    expect(sparkPoints([])).toBe('');
  });
});
