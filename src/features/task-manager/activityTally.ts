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
/** A session is a stretch of use with no break of 30 minutes or more (2026-10-27). */
export const SESSION_GAP_MS = 30 * 60_000;
const IST_OFFSET_MS = 330 * 60_000;
const RANK: Record<MinuteState, number> = { A: 3, I: 2, B: 1 };

export type DayTally = {
  date: string;
  /** minute of the IST day (0-1439) -> state */
  minutes: Record<string, MinuteState>;
  firstActiveAt?: string | null;
  lastActiveAt?: string | null;
  /** Stretches of use, epoch ms; the last one grows while the person keeps working. */
  sessions?: Array<{ start: number; end: number }>;
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
    const sessions = day.sessions ?? (day.sessions = []);
    const last = sessions[sessions.length - 1];
    if (last && now - last.end < SESSION_GAP_MS && now >= last.start) last.end = Math.max(last.end, now);
    else if (sessions.length < 100) sessions.push({ start: now, end: now });
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
  const dayStart = Date.parse(`${day.date}T00:00:00+05:30`);
  const sessions = (day.sessions ?? []).map((session) => {
    let activeMinutes = 0;
    for (const [minute, state] of Object.entries(day.minutes)) {
      const at = dayStart + Number(minute) * 60_000;
      if (state === 'A' && at >= session.start - 60_000 && at <= session.end) activeMinutes += 1;
    }
    return {
      start: new Date(session.start).toISOString(),
      // A session that saw one click still lasted the minute it was in.
      end: new Date(Math.max(session.end, session.start + 60_000)).toISOString(),
      activeSeconds: activeMinutes * 60,
    };
  });
  return {
    activeSeconds: active * 60,
    idleSeconds: idle * 60,
    backgroundSeconds: background * 60,
    hourlyActiveMinutes: hourly,
    sessions,
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
