import { describe, expect, it } from 'vitest';

import { classify, emptyTally, IDLE_AFTER_MS, istDate, istMinute, parseTally, record, totals } from './activityTally';
import { raiseProblem } from './RaiseTmTaskDialog';
import { scheduleProblem } from './TmSchedules';
import { durationLabel, scheduleLabel } from './tmFormat';

// 2026-11-02 10:00 IST = 04:30 UTC
const T0 = Date.UTC(2026, 10, 2, 4, 30);

describe('time on Verigence tally', () => {
  it('uses IST days and minutes', () => {
    expect(istDate(T0)).toBe('2026-11-02');
    expect(istMinute(T0)).toBe(600);
    expect(istDate(Date.UTC(2026, 10, 1, 19, 0))).toBe('2026-11-02'); // 00:30 IST
  });

  it('is active within 4 minutes of an interaction, idle after, background when hidden', () => {
    expect(classify(T0, true, T0 - 60_000)).toBe('A');
    expect(classify(T0, true, T0 - IDLE_AFTER_MS)).toBe('I');
    expect(classify(T0, false, T0)).toBe('B');
  });

  it('keeps the busiest state per minute so two tabs never double count', () => {
    let tally = emptyTally();
    tally = record(tally, T0, 'B');
    tally = record(tally, T0 + 5_000, 'A'); // another tab, same minute
    tally = record(tally, T0 + 10_000, 'I');
    tally = record(tally, T0 + 60_000, 'I');
    const day = tally.days[0];
    expect(day.minutes['600']).toBe('A');
    expect(totals(day)).toMatchObject({ activeSeconds: 60, idleSeconds: 60, backgroundSeconds: 0 });
    expect(totals(day).hourlyActiveMinutes[10]).toBe(1);
    expect(day.firstActiveAt).toBe(new Date(T0 + 5_000).toISOString());
  });

  it('drops days older than yesterday and survives bad storage', () => {
    let tally = record(emptyTally(), T0 - 3 * 86_400_000, 'A');
    tally = record(tally, T0, 'A');
    expect(tally.days.map((d) => d.date)).toEqual(['2026-11-02']);
    expect(parseTally('{not json')).toEqual(emptyTally());
  });
});

describe('Task Manager forms', () => {
  it('requires the expected time to close and an assignee', () => {
    const base = { title: 'Stock check', description: 'Count the stock', assignees: ['a'], minutes: 120 };
    expect(raiseProblem(base)).toBeUndefined();
    expect(raiseProblem({ ...base, minutes: 0 })).toMatch(/expected time/);
    expect(raiseProblem({ ...base, assignees: [] })).toMatch(/at least one person/);
  });

  it('never allows a daily task on Sunday only', () => {
    const base = { title: 'Daily', description: 'Do it daily', expectedCloseMinutes: 60, assigneeMode: 'ROLE_EACH', assignedRole: 'PC' };
    expect(scheduleProblem({ ...base, frequency: 'DAILY', weekdays: [7] })).toMatch(/not Sunday/);
    expect(scheduleProblem({ ...base, frequency: 'WEEKLY', weekdays: [7] })).toBeUndefined();
    expect(scheduleProblem({ ...base, frequency: 'MONTHLY', monthDay: 0 })).toMatch(/day of the month/);
  });

  it('describes schedules and durations in plain words', () => {
    expect(scheduleLabel({ frequency: 'DAILY', weekdays: [1, 2, 3, 4, 5, 6], runTimeIst: '09:00', monthDay: null }))
      .toBe('Every working day (Mon–Sat) at 09:00 IST');
    expect(scheduleLabel({ frequency: 'WEEKLY', weekdays: [7], runTimeIst: '10:00', monthDay: null })).toMatch(/moves to Monday/);
    expect(durationLabel(2880)).toBe('2 days');
    expect(durationLabel(240)).toBe('4 hours');
  });
});
