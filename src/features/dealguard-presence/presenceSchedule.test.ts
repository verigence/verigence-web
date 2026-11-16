import { describe, expect, it } from 'vitest';

import { formatDistance, locationChecksPath } from '../../services/audit-core/locationChecks';
import {
  awayMessage,
  currentPlan,
  missedSlots,
  hourKey,
  inCheckWindow,
  istHourStart,
  lateEveningOf,
  nextSlot,
  nextWake,
  parsePlan,
  planHour,
  shouldShowLateNotice,
  slotIsDue,
  windowWithinHour,
} from './presenceSchedule';

/** A moment on 5 Nov 2026 at hh:mm IST (IST is UTC+05:30). */
function ist(hour: number, minute = 0, second = 0, day = 5): number {
  return Date.UTC(2026, 10, day, hour, minute, second) - (5 * 60 + 30) * 60_000;
}

function sequence(...values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length];
}

describe('DealGuard location check window', () => {
  it('runs from 10:00 to 19:30 IST only', () => {
    expect(inCheckWindow(ist(9, 59))).toBe(false);
    expect(inCheckWindow(ist(10, 0))).toBe(true);
    expect(inCheckWindow(ist(19, 29, 59))).toBe(true);
    expect(inCheckWindow(ist(19, 30))).toBe(false);
    expect(inCheckWindow(ist(21, 0))).toBe(false);
  });

  it('uses IST clock hours', () => {
    expect(istHourStart(ist(11, 42, 10))).toBe(ist(11));
    expect(hourKey(ist(11, 42))).toBe('2026-11-05T11');
    expect(windowWithinHour(ist(9))).toBeNull();
    expect(windowWithinHour(ist(10))).toEqual([ist(10), ist(11)]);
    expect(windowWithinHour(ist(19))).toEqual([ist(19), ist(19, 30)]);
    expect(windowWithinHour(ist(20))).toBeNull();
  });
});

describe('random plan for an hour', () => {
  it('picks 1 to 3 moments inside the hour', () => {
    expect(planHour(ist(11, 0), sequence(0, 0.5)).slots).toHaveLength(1);
    expect(planHour(ist(11, 0), sequence(0.5, 0.1, 0.6)).slots).toHaveLength(2);
    const three = planHour(ist(11, 0), sequence(0.99, 0.1, 0.5, 0.9));
    expect(three.slots).toHaveLength(3);
    for (const slot of three.slots) {
      expect(slot).toBeGreaterThanOrEqual(ist(11));
      expect(slot).toBeLessThan(ist(12));
    }
    expect([...three.slots].sort((a, b) => a - b)).toEqual(three.slots);
  });

  it('keeps the 19:00 hour before 19:30 and plans nothing outside the window', () => {
    for (let i = 0; i < 50; i += 1) {
      for (const slot of planHour(ist(19, 5)).slots) expect(slot).toBeLessThan(ist(19, 30));
    }
    expect(planHour(ist(8, 15)).slots).toEqual([]);
    expect(planHour(ist(20, 15)).slots).toEqual([]);
  });

  it('keeps moments already past when the plan is made, as missed, and reuses the stored plan in the hour', () => {
    // 3 moments at 11:06, 11:30 and 11:54; opened at 11:40: 11:06 and 11:30 are missed.
    const fresh = currentPlan(null, ist(11, 40), sequence(0.99, 0.1, 0.5, 0.9));
    expect(fresh.slots).toEqual([ist(11, 6), ist(11, 30), ist(11, 54)]);
    expect(missedSlots(fresh, ist(11, 40))).toEqual([ist(11, 6), ist(11, 30)]);
    expect(nextSlot(fresh, ist(11, 40))).toBe(ist(11, 54));
    const stored = { hour: '2026-11-05T11', slots: [ist(11, 50)], done: [] };
    expect(currentPlan(stored, ist(11, 45))).toBe(stored);
    expect(currentPlan(stored, ist(12, 1)).hour).toBe('2026-11-05T12');
  });

  it('checks each moment once across tabs and wakes for the next hour', () => {
    const plan = { hour: '2026-11-05T11', slots: [ist(11, 10), ist(11, 40)], done: [ist(11, 10)] };
    expect(nextSlot(plan, ist(11, 5))).toBe(ist(11, 40));
    expect(slotIsDue(plan, ist(11, 10), ist(11, 10))).toBe(false); // already done in another tab
    expect(slotIsDue(plan, ist(11, 40), ist(11, 40, 5))).toBe(true);
    // Woke late (the screen was off): still this hour, so caught up.
    expect(slotIsDue(plan, ist(11, 40), ist(11, 55))).toBe(true);
    // The next hour: that moment is gone.
    expect(slotIsDue(plan, ist(11, 40), ist(12, 2))).toBe(false);
    expect(nextWake(plan, ist(11, 41, 30))).toBe(ist(12));
  });

  it('catches up only moments of this hour inside the window', () => {
    const plan = { hour: '2026-11-05T19', slots: [ist(19, 10), ist(19, 25)], done: [ist(19, 10)] };
    expect(missedSlots(plan, ist(19, 50))).toEqual([ist(19, 25)]);
    expect(missedSlots(plan, ist(19, 20))).toEqual([]);
    expect(missedSlots({ ...plan, done: [ist(19, 10), ist(19, 25)] }, ist(19, 50))).toEqual([]);
  });

  it('reads stored plans defensively', () => {
    expect(parsePlan('{bad')).toBeNull();
    expect(parsePlan(JSON.stringify({ hour: 'x' }))).toBeNull();
    expect(parsePlan(JSON.stringify({ hour: 'h', slots: [1, 'a'], done: [] }))).toEqual({ hour: 'h', slots: [1], done: [] });
  });
});

describe('late-evening note', () => {
  it('shows after 21:00 IST once an evening', () => {
    expect(lateEveningOf(ist(20, 59))).toBeNull();
    expect(lateEveningOf(ist(21, 0))).toBe('2026-11-05');
    expect(lateEveningOf(ist(1, 0, 0, 6))).toBe('2026-11-05');
    expect(lateEveningOf(ist(5, 0, 0, 6))).toBeNull();
    expect(shouldShowLateNotice(ist(21, 5), null)).toBe(true);
    expect(shouldShowLateNotice(ist(22, 0), '2026-11-05')).toBe(false);
    expect(shouldShowLateNotice(ist(21, 5, 0, 6), '2026-11-05')).toBe(true);
    expect(shouldShowLateNotice(ist(15, 0), null)).toBe(false);
  });
});

describe('away note and distances', () => {
  it('shows metres under a kilometre and km with one decimal above', () => {
    expect(formatDistance(350.4)).toBe('350 m');
    expect(formatDistance(999.4)).toBe('999 m');
    expect(formatDistance(3202)).toBe('3.2 km');
    expect(formatDistance(null)).toBe('—');
  });

  it('says it in a friendly way', () => {
    expect(awayMessage('3.2 km', 'Utkal Mahindra – CDA')).toBe(
      'You seem to be about 3.2 km from Utkal Mahindra – CDA. DealGuard is meant to be used at your outlet during working hours.',
    );
    expect(awayMessage('700 m', null)).toContain('from your outlet.');
  });

  it('reads the log from the Project or, for SuperAdmin, the admin path', () => {
    expect(locationChecksPath('project', 't 1')).toBe('/p2/v1/tenants/t%201/location-checks');
    expect(locationChecksPath('admin', 't')).toBe('/v1/admin/tenants/t/location-checks');
  });
});
