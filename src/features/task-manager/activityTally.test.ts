import { describe, expect, it } from 'vitest';

import { activitySource, classify, emptyTally, IDLE_AFTER_MS, istDate, istMinute, parseTally, record, SESSION_GAP_MS, sourcesText, totals } from './activityTally';
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

describe('sessions', () => {
  it('starts a new session after a 30-minute break and keeps one across short ones', () => {
    let tally = emptyTally();
    tally = record(tally, T0, 'A');
    tally = record(tally, T0 + 10 * 60_000, 'A'); // same session
    tally = record(tally, T0 + 10 * 60_000 + SESSION_GAP_MS, 'A'); // new session
    tally = record(tally, T0 + 60 * 60_000, 'I'); // idle does not open one
    const day = tally.days[0];
    expect(day.sessions).toHaveLength(2);
    const sent = totals(day).sessions;
    expect(sent[0]).toMatchObject({ start: new Date(T0).toISOString(), end: new Date(T0 + 600_000).toISOString(), activeSeconds: 120 });
    expect(sent[1].activeSeconds).toBe(60);
  });
});

describe('activity source (2026-10-27)', () => {
  it('tells the app, a phone browser and a computer apart', () => {
    expect(activitySource('android', 'anything')).toBe('ANDROID');
    expect(activitySource('ios', 'anything')).toBe('IOS');
    expect(activitySource('web', 'Mozilla/5.0 (Linux; Android 14; SM-A146B) Chrome/129 Mobile Safari/537.36')).toBe('MOBILE_WEB');
    expect(activitySource('web', 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X)')).toBe('MOBILE_WEB');
    expect(activitySource('web', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/129')).toBe('WEB');
    expect(activitySource('web', 'Mozilla/5.0 (Windows NT 10.0)', true)).toBe('MOBILE_WEB');
  });

  it('lists where the time went, largest first', () => {
    const text = (m: number) => `${m}m`;
    expect(sourcesText({ WEB: 30, ANDROID: 50, MOBILE_WEB: 0 }, text)).toBe('Android app 50m · Computer 30m');
    expect(sourcesText(undefined, text)).toBe('—');
  });
});

