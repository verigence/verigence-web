/**
 * When a PC's location is checked while they use DealGuard, and when the
 * late-evening note shows (product owner, 2026-11-05). Pure functions, so the
 * rules can be tested without timers or a device.
 *
 * - Checks: 1 to 3 random moments in each clock hour, only between 10:00 and
 *   19:30 IST. A moment already past when the hour's plan is made is skipped.
 *   The plan for an hour is kept in this browser's storage, so every open tab
 *   of DealGuard shares it and a moment is checked once.
 * - Late note: a PC opening DealGuard after 21:00 IST is told, once an evening
 *   on this device, that it is getting late.
 */

const IST_OFFSET_MS = (5 * 60 + 30) * 60_000;
const HOUR_MS = 3_600_000;

export const CHECK_WINDOW_START_MINUTE = 10 * 60; // 10:00 IST
export const CHECK_WINDOW_END_MINUTE = 19 * 60 + 30; // 19:30 IST
export const MIN_CHECKS_PER_HOUR = 1;
export const MAX_CHECKS_PER_HOUR = 3;
/** A timer that wakes this much after its moment (a sleeping phone) no longer counts as that moment. */
export const LATE_FIRE_TOLERANCE_MS = 60_000;

export const LATE_EVENING_START_MINUTE = 21 * 60; // 21:00 IST
/** After midnight is still the same late evening, until 05:00. */
export const LATE_EVENING_END_MINUTE = 5 * 60;

/** IST calendar date ("2026-11-05") and minute of the day for a moment. */
export function istParts(ms: number): { date: string; minute: number; hour: number } {
  const shifted = new Date(ms + IST_OFFSET_MS);
  const date = shifted.toISOString().slice(0, 10);
  const hour = shifted.getUTCHours();
  return { date, hour, minute: hour * 60 + shifted.getUTCMinutes() };
}

/** The start of the IST clock hour that holds ``ms`` (IST hours start on UTC half hours). */
export function istHourStart(ms: number): number {
  return Math.floor((ms + IST_OFFSET_MS) / HOUR_MS) * HOUR_MS - IST_OFFSET_MS;
}

export function hourKey(ms: number): string {
  const { date, hour } = istParts(ms);
  return `${date}T${String(hour).padStart(2, '0')}`;
}

/** Whether a moment is inside 10:00-19:30 IST. */
export function inCheckWindow(ms: number): boolean {
  const { minute } = istParts(ms);
  return minute >= CHECK_WINDOW_START_MINUTE && minute < CHECK_WINDOW_END_MINUTE;
}

/** The part of the clock hour starting at ``hourStart`` that lies inside the window, as [from, to) ms, or null. */
export function windowWithinHour(hourStart: number): [number, number] | null {
  const startMinute = istParts(hourStart).minute;
  const from = Math.max(startMinute, CHECK_WINDOW_START_MINUTE);
  const to = Math.min(startMinute + 60, CHECK_WINDOW_END_MINUTE);
  if (to <= from) return null;
  return [hourStart + (from - startMinute) * 60_000, hourStart + (to - startMinute) * 60_000];
}

export type HourPlan = { hour: string; slots: number[]; done: number[] };

/** 1-3 random moments (whole seconds) inside the window part of the hour holding ``now``. */
export function planHour(now: number, random: () => number = Math.random): HourPlan {
  const hourStart = istHourStart(now);
  const span = windowWithinHour(hourStart);
  const plan: HourPlan = { hour: hourKey(now), slots: [], done: [] };
  if (!span) return plan;
  const [from, to] = span;
  const seconds = Math.floor((to - from) / 1000);
  const count = MIN_CHECKS_PER_HOUR + Math.floor(random() * (MAX_CHECKS_PER_HOUR - MIN_CHECKS_PER_HOUR + 1));
  const picked = new Set<number>();
  for (let guard = 0; picked.size < Math.min(count, seconds) && guard < 50; guard += 1) {
    picked.add(from + Math.floor(random() * seconds) * 1000);
  }
  plan.slots = [...picked].sort((a, b) => a - b);
  return plan;
}

export function parsePlan(raw: string | null | undefined): HourPlan | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<HourPlan>;
    if (typeof value?.hour !== 'string' || !Array.isArray(value.slots) || !Array.isArray(value.done)) return null;
    const numbers = (list: unknown[]) => list.filter((n): n is number => typeof n === 'number' && Number.isFinite(n));
    return { hour: value.hour, slots: numbers(value.slots), done: numbers(value.done) };
  } catch {
    return null;
  }
}

/** The stored plan when it is this hour's, else a new one for this hour without the moments already past. */
export function currentPlan(stored: HourPlan | null, now: number, random: () => number = Math.random): HourPlan {
  if (stored && stored.hour === hourKey(now)) return stored;
  const plan = planHour(now, random);
  return { ...plan, slots: plan.slots.filter((slot) => slot > now) };
}

/** The next moment still to be checked (not done, not already past), or undefined. */
export function nextSlot(plan: HourPlan, now: number): number | undefined {
  return plan.slots.find((slot) => !plan.done.includes(slot) && slot + LATE_FIRE_TOLERANCE_MS > now);
}

/** Whether ``slot`` is to be checked now: it is due and no tab has checked it. */
export function slotIsDue(plan: HourPlan, slot: number, now: number): boolean {
  return plan.slots.includes(slot) && !plan.done.includes(slot)
    && now >= slot && now - slot <= LATE_FIRE_TOLERANCE_MS && inCheckWindow(slot);
}

/** When to wake next: the next moment of this hour, else the start of the next hour. */
export function nextWake(plan: HourPlan, now: number): number {
  return nextSlot(plan, now) ?? istHourStart(now) + HOUR_MS;
}

/** The evening a late moment belongs to ("2026-11-05" for 21:00 on the 5th and for 01:00 on the 6th), or null. */
export function lateEveningOf(ms: number): string | null {
  const { date, minute } = istParts(ms);
  if (minute >= LATE_EVENING_START_MINUTE) return date;
  if (minute < LATE_EVENING_END_MINUTE) return istParts(ms - 24 * HOUR_MS).date;
  return null;
}

/** The late note shows when it is late and it has not been shown this evening on this device. */
export function shouldShowLateNotice(now: number, lastShownEvening: string | null | undefined): boolean {
  const evening = lateEveningOf(now);
  return evening !== null && evening !== lastShownEvening;
}

/** "You seem to be about 3.2 km from Utkal Mahindra – CDA. …" */
export function awayMessage(distance: string, outletName: string | null | undefined): string {
  const place = outletName?.trim() ? outletName.trim() : 'your outlet';
  return `You seem to be about ${distance} from ${place}. DealGuard is meant to be used at your outlet during working hours.`;
}
