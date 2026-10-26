/**
 * Time on Verigence, counted in the browser (product owner 2026-10-26;
 * Audit Core docs/TASK_MANAGER_DESIGN_v1.0.md section 9).
 *
 * The day (IST) is cut into 1-minute buckets. A minute is
 *  - ACTIVE: the app is visible and there was a click, tap, key or scroll in
 *    the last 4 minutes (reading a screen just after a click counts);
 *  - IDLE: the app is visible but nobody has touched it for 4 minutes or more;
 *  - BACKGROUND: the tab is hidden or the app minimised.
 * Every open tab writes into one shared tally (localStorage), keeping the
 * busiest state for a minute, so two tabs never double the time. Nothing is
 * captured beyond these counts.
 */
export type MinuteState = 'A' | 'I' | 'B';

export const IDLE_AFTER_MS = 4 * 60_000;
const IST_OFFSET_MS = 330 * 60_000;
const RANK: Record<MinuteState, number> = { A: 3, I: 2, B: 1 };

export type DayTally = {
  date: string;
  /** minute of the IST day (0-1439) -> state */
  minutes: Record<string, MinuteState>;
  firstActiveAt?: string | null;
  lastActiveAt?: string | null;
};

export type StoredTally = {
  lastInteractionAt: number;
  days: DayTally[];
};

export function istDate(at: number): string {
  return new Date(at + IST_OFFSET_MS).toISOString().slice(0, 10);
}

export function istMinute(at: number): number {
  const d = new Date(at + IST_OFFSET_MS);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

export function classify(now: number, visible: boolean, lastInteractionAt: number): MinuteState {
  if (!visible) return 'B';
  return now - lastInteractionAt < IDLE_AFTER_MS ? 'A' : 'I';
}

/** Record the state of the current minute; the busiest state wins. Keeps today and yesterday only. */
export function record(tally: StoredTally, now: number, state: MinuteState): StoredTally {
  const date = istDate(now);
  const minute = String(istMinute(now));
  const days = tally.days.filter((d) => d.date >= istDate(now - 86_400_000));
  let day = days.find((d) => d.date === date);
  if (!day) {
    day = { date, minutes: {} };
    days.push(day);
  }
  const current = day.minutes[minute];
  if (!current || RANK[state] > RANK[current]) day.minutes[minute] = state;
  if (state === 'A') {
    const at = new Date(now).toISOString();
    if (!day.firstActiveAt) day.firstActiveAt = at;
    day.lastActiveAt = at;
  }
  return { ...tally, days };
}

export function totals(day: DayTally) {
  let active = 0;
  let idle = 0;
  let background = 0;
  const hourly = new Array<number>(24).fill(0);
  for (const [minute, state] of Object.entries(day.minutes)) {
    if (state === 'A') {
      active += 1;
      hourly[Math.floor(Number(minute) / 60)] += 1;
    } else if (state === 'I') idle += 1;
    else background += 1;
  }
  return {
    activeSeconds: active * 60,
    idleSeconds: idle * 60,
    backgroundSeconds: background * 60,
    hourlyActiveMinutes: hourly,
  };
}

export function emptyTally(): StoredTally {
  return { lastInteractionAt: 0, days: [] };
}

export function parseTally(raw: string | null): StoredTally {
  if (!raw) return emptyTally();
  try {
    const value = JSON.parse(raw) as StoredTally;
    if (!value || !Array.isArray(value.days)) return emptyTally();
    return { lastInteractionAt: Number(value.lastInteractionAt) || 0, days: value.days };
  } catch {
    return emptyTally();
  }
}
