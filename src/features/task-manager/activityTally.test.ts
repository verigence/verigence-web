import { describe, expect, it } from 'vitest';

import {
  activitySource, classify, DEFAULT_READING_WINDOW_MINUTES, emptyTally, isTap, istDate, istMinute, parseTally, readingWindow,
  record, recordVisit, screenOf, SESSION_GAP_MS, sourcesText, totals,
} from './activityTally';
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

  it('is active in the minute of a click and the reading window after it, idle after, background when hidden', () => {
    expect(DEFAULT_READING_WINDOW_MINUTES).toBe(3);
    // A click at 10:00:50: 10:01, 10:02 and 10:03 are reading time; 10:04 is idle.
    const click = T0 + 50_000;
    expect(classify(T0 + 70_000, true, click)).toBe('A');            // 10:01:10
    expect(classify(T0 + 3 * 60_000 + 59_000, true, click)).toBe('A'); // 10:03:59
    expect(classify(T0 + 4 * 60_000, true, click)).toBe('I');        // 10:04:00
    expect(classify(T0, false, T0)).toBe('B');
    expect(classify(T0, true, 0)).toBe('I');                          // never clicked
  });

  it('uses the reading window SuperAdmin set, 1 to 10 minutes, and 3 when it cannot be read', () => {
    const click = T0;
    expect(classify(T0 + 5 * 60_000, true, click, 0, 5)).toBe('A');
    expect(classify(T0 + 6 * 60_000, true, click, 0, 5)).toBe('I');
    expect(classify(T0 + 2 * 60_000, true, click, 0, 1)).toBe('I');
    expect(readingWindow(7)).toBe(7);
    for (const bad of [0, 11, 2.5, '', null, undefined, 'x']) expect(readingWindow(bad)).toBe(3);
    expect(readingWindow('4')).toBe(4);
  });

  it('scrolling alone is never active: a scrolled minute with no click in the window is S, and idle', () => {
    // Scrolling every 3 minutes from 10:00 with no click (the old rule kept all of it active).
    let tally = emptyTally();
    for (let m = 0; m < 30; m += 1) {
      const now = T0 + m * 60_000 + 30_000;
      const scrolled = m % 3 === 0 ? now : tally.lastScrollAt;
      tally = { ...tally, lastScrollAt: scrolled };
      tally = record(tally, now, classify(now, true, tally.lastClickAt, tally.lastScrollAt));
    }
    const day = tally.days[0];
    expect(day.minutes['600']).toBe('S');
    expect(day.minutes['601']).toBe('I');
    expect(totals(day)).toMatchObject({ activeSeconds: 0, idleSeconds: 30 * 60 });
    expect(totals(day).minuteStates.slice(600, 606)).toBe('SIISII');
    expect(day.firstActiveAt).toBeUndefined();
    expect(day.sessions).toBeUndefined();
  });

  it('a scroll in the reading window after a click is reading time', () => {
    const click = T0 + 10_000;
    let tally = record({ ...emptyTally(), lastClickAt: click }, click, 'K');
    const scroll = T0 + 2 * 60_000 + 5_000;
    tally = record({ ...tally, lastScrollAt: scroll }, scroll, classify(scroll, true, click, scroll));
    const later = T0 + 5 * 60_000 + 5_000;
    tally = record({ ...tally, lastScrollAt: later }, later, classify(later, true, click, later));
    const day = tally.days[0];
    expect([day.minutes['600'], day.minutes['602'], day.minutes['605']]).toEqual(['K', 'A', 'S']);
    expect(totals(day)).toMatchObject({ activeSeconds: 120, idleSeconds: 60 });
  });

  it('a touch is a tap only when it comes up near where it went down, soon', () => {
    const down = { x: 100, y: 200, at: T0 };
    expect(isTap(down, { x: 104, y: 206, at: T0 + 150 })).toBe(true);
    expect(isTap(down, { x: 100, y: 260, at: T0 + 200 })).toBe(false); // the start of a scroll
    expect(isTap(down, { x: 100, y: 200, at: T0 + 1500 })).toBe(false); // a long press
  });

  it('a tally an older version wrote is not taken as a click', () => {
    const old = JSON.stringify({ lastInteractionAt: T0, days: [] });
    expect(parseTally(old)).toEqual({ lastClickAt: 0, lastScrollAt: 0, days: [] });
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


describe('minute states and screens (2026-10-28)', () => {
  const at = (hhmm: string) => Date.parse(`2026-10-28T${hhmm}:00+05:30`);

  it('sends one character per minute, a click minute as K', () => {
    let tally = emptyTally();
    tally = record(tally, at('10:00'), 'K');
    tally = record(tally, at('10:01'), 'A');
    tally = record(tally, at('10:05'), 'I');
    const t = totals(tally.days[0]);
    expect(t.minuteStates).toHaveLength(1440);
    expect(t.minuteStates.slice(600, 606)).toBe('KA...I');
    expect(t.activeSeconds).toBe(120);
  });

  it('records each screen opened once, with its journey', () => {
    let tally = emptyTally();
    tally = recordVisit(tally, at('10:00'), 'Bookings & Deliveries list');
    tally = recordVisit(tally, at('10:01'), 'Bookings & Deliveries list');
    tally = recordVisit(tally, at('10:02'), 'Journey › Documents', 'j-1');
    expect(totals(tally.days[0]).visits.map((v) => v.screen)).toEqual(['Bookings & Deliveries list', 'Journey › Documents']);
  });

  it('names screens without ids', () => {
    const id = '9dcba68f-eab9-4423-9ee0-b6ede5ed3f2f';
    expect(screenOf(`/p2/journeys/${id}/overview`, '?tab=addons')).toEqual({ screen: 'Journey › Addons', journeyId: id });
    expect(screenOf('/p2/bookings', '')).toEqual({ screen: 'Bookings & Deliveries list', journeyId: null });
    expect(screenOf('/admin/engagement', '').screen).toBe('Admin › Engagement');
  });
});
