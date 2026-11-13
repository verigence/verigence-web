import { describe, expect, it } from 'vitest';

import {
  addPending, datesText, dutySummary, flowOf, measuresFor, minutesText, pendingOf, periodsOf, sparkPoints, sumAt, trend, valueText,
  type Measure,
} from './uc03Performance';

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


describe('periods, pending work and bookings / deliveries', () => {
  const days = ['2026-11-07', '2026-11-08', '2026-11-09', '2026-11-10'];   // Sat, Sun, Mon, Tue

  it('makes a column per day, or per Monday-to-Sunday week', () => {
    expect(periodsOf(days, 'DAILY').map((p) => p.label)).toEqual(['Sat 7', 'Sun 8', 'Mon 9', 'Tue 10']);
    expect(periodsOf(days, 'DAILY').map((p) => Boolean(p.off))).toEqual([false, true, false, false]);   // Sunday is off
    // The part-week at the start is left out.
    const weeks = periodsOf(days, 'WEEKLY');
    expect(weeks.map((p) => p.label)).toEqual(['Week of 9 Nov']);
    expect(weeks.map((p) => p.indexes)).toEqual([[2, 3]]);
    expect(sumAt([1, 2, 3, 4], weeks[0].indexes)).toBe(7);
  });

  it('reads pending work: the total and what is older than three days', () => {
    const counts = { tasksOpen: [2, 3, 4, 1] };
    expect(pendingOf(counts, 'tasksOpen')).toEqual({ total: 10, old: 5 });
    expect(pendingOf(counts, 'nothing')).toEqual({ total: 0, old: 0 });
    expect(addPending([counts, { tasksOpen: [1, 0, 0, 0], other: [0, 0, 0, 2] }, undefined]))
      .toEqual({ tasksOpen: [3, 3, 4, 1], other: [0, 0, 0, 2] });
  });

  it('adds bookings and deliveries over outlets and days', () => {
    const day = { bookings: 2, deliveries: 1, onRegister: 3, inTool: 1, notNotified: 1, registerMissing: 0 };
    const total = flowOf([{ days: { '2026-11-09': day } }, { days: { '2026-11-09': day, '2026-11-10': day } }], ['2026-11-09']);
    expect(total.bookings).toBe(4);
    expect(total.onRegister - total.inTool).toBe(4);
  });

  it('names the dates a duty was missed', () => {
    expect(datesText(['2026-11-09', '2026-11-10'])).toBe('9 Nov, 10 Nov');
    expect(datesText(['2026-11-01', '2026-11-02', '2026-11-03'], 2)).toBe('2 Nov, 3 Nov +1 more');
  });
});
