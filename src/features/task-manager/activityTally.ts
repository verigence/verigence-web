/**
 * Time on Verigence, counted in the app and the browser (product owner 2026-10-26;
 * Audit Core docs/TASK_MANAGER_DESIGN_v1.0.md section 9).
 *
 * The day (IST) is cut into 1-minute buckets. Product owner, 9 Nov 2026: active time
 * counts real work only. A minute is
 *  - K: a click, tap or key in that very minute;
 *  - A (ACTIVE): the app is visible and there was a click, tap or key in that minute or
 *    in the reading window before it (3 minutes by default, set by SuperAdmin from 1 to
 *    10 and read from Audit Core) -- the time spent reading a screen after a click;
 *  - S: visible and scrolled in that minute, with no click, tap or key in the reading
 *    window. Scrolling alone is not work: S counts as idle, and is kept apart so the
 *    reports can show it;
 *  - I (IDLE): visible with no click, tap or key for longer than the reading window;
 *  - B (BACKGROUND): the tab is hidden or the app minimised.
 * Until then a click, tap, key, wheel or scroll kept the next 4 minutes active, so one
 * scroll every few minutes kept a whole day active.
 * Every open tab writes into one shared tally (localStorage), keeping the busiest state
 * for a minute, so two tabs never double the time. Nothing is captured beyond these counts.
 */
export type MinuteState = 'K' | 'A' | 'S' | 'I' | 'B';

/** The reading window when Audit Core cannot be asked (product owner 2026-11-09). */
export const DEFAULT_READING_WINDOW_MINUTES = 3;
export const MIN_READING_WINDOW_MINUTES = 1;
export const MAX_READING_WINDOW_MINUTES = 10;
/** A session is a stretch of use with no break of 30 minutes or more (2026-10-27). */
export const SESSION_GAP_MS = 30 * 60_000;
const IST_OFFSET_MS = 330 * 60_000;
/** Busiest wins (the same order Audit Core merges with). */
const RANK: Record<MinuteState, number> = { K: 5, A: 4, S: 3, I: 2, B: 1 };

/** A reading window from Audit Core, or the default when it is missing or out of range. */
export function readingWindow(value: unknown): number {
  const minutes = Number(value);
  return Number.isInteger(minutes) && minutes >= MIN_READING_WINDOW_MINUTES && minutes <= MAX_READING_WINDOW_MINUTES
    ? minutes : DEFAULT_READING_WINDOW_MINUTES;
}

export type DayTally = {
  date: string;
  /** minute of the IST day (0-1439) -> state */
  minutes: Record<string, MinuteState>;
  firstActiveAt?: string | null;
  lastActiveAt?: string | null;
  /** Stretches of use, epoch ms; the last one grows while the person keeps working. */
  sessions?: Array<{ start: number; end: number }>;
  /** Screens and journey tabs opened, in order (2026-10-28). */
  visits?: Array<{ at: number; screen: string; journeyId?: string | null }>;
};

export type StoredTally = {
  /** The last click, tap or key (epoch ms), shared by every tab. */
  lastClickAt: number;
  /** The last scroll or mouse wheel (epoch ms). */
  lastScrollAt: number;
  days: DayTally[];
};

export function istDate(at: number): string {
  return new Date(at + IST_OFFSET_MS).toISOString().slice(0, 10);
}

export function istMinute(at: number): number {
  const d = new Date(at + IST_OFFSET_MS);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

const minuteOf = (at: number) => Math.floor(at / 60_000);

/**
 * The state of the minute ``now`` is in: A when a click, tap or key was in this minute or in
 * the ``windowMinutes`` minutes before it; S when there was a scroll in this minute and no
 * click in that window; I otherwise; B when hidden. (A click's own minute is recorded K by
 * the click itself.)
 */
export function classify(now: number, visible: boolean, lastClickAt: number, lastScrollAt = 0,
  windowMinutes: number = DEFAULT_READING_WINDOW_MINUTES): MinuteState {
  if (!visible) return 'B';
  const minute = minuteOf(now);
  if (lastClickAt > 0 && lastClickAt <= now && minute - minuteOf(lastClickAt) <= windowMinutes) return 'A';
  if (lastScrollAt > 0 && lastScrollAt <= now && minuteOf(lastScrollAt) === minute) return 'S';
  return 'I';
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
  if (state === 'A' || state === 'K') {
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
    if (state === 'A' || state === 'K') {
      active += 1;
      hourly[Math.floor(Number(minute) / 60)] += 1;
    } else if (state === 'I' || state === 'S') idle += 1; // scrolling with no click is idle (2026-11-09)
    else background += 1;
  }
  const dayStart = Date.parse(`${day.date}T00:00:00+05:30`);
  const sessions = (day.sessions ?? []).map((session) => {
    let activeMinutes = 0;
    for (const [minute, state] of Object.entries(day.minutes)) {
      const at = dayStart + Number(minute) * 60_000;
      if ((state === 'A' || state === 'K') && at >= session.start - 60_000 && at <= session.end) activeMinutes += 1;
    }
    return {
      start: new Date(session.start).toISOString(),
      // A session that saw one click still lasted the minute it was in.
      end: new Date(Math.max(session.end, session.start + 60_000)).toISOString(),
      activeSeconds: activeMinutes * 60,
    };
  });
  const states = new Array<string>(MINUTES_PER_DAY).fill('.');
  for (const [minute, state] of Object.entries(day.minutes)) {
    const i = Number(minute);
    if (i >= 0 && i < MINUTES_PER_DAY) states[i] = state;
  }
  return {
    activeSeconds: active * 60,
    idleSeconds: idle * 60,
    backgroundSeconds: background * 60,
    hourlyActiveMinutes: hourly,
    sessions,
    minuteStates: states.join(''),
    visits: (day.visits ?? []).map((v) => ({ at: new Date(v.at).toISOString(), screen: v.screen, journeyId: v.journeyId ?? null })),
  };
}

const MINUTES_PER_DAY = 1440;
const MAX_VISITS = 3000;

/** Note the screen just opened; the same screen twice in a row is one visit. */
export function recordVisit(tally: StoredTally, now: number, screen: string, journeyId?: string | null): StoredTally {
  const date = istDate(now);
  const days = tally.days.filter((d) => d.date >= istDate(now - 86_400_000));
  let day = days.find((d) => d.date === date);
  if (!day) {
    day = { date, minutes: {} };
    days.push(day);
  }
  const visits = day.visits ?? (day.visits = []);
  const last = visits[visits.length - 1];
  if (!last || last.screen !== screen || (last.journeyId ?? null) !== (journeyId ?? null)) {
    if (visits.length < MAX_VISITS) visits.push({ at: now, screen, journeyId: journeyId ?? null });
  }
  return { ...tally, days };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SCREEN_NAMES: Array<[RegExp, string]> = [
  [/^\/p2\/journeys\/:id\/overview$/, 'Journey'],
  [/^\/p2\/journeys\/:id\/documents\/:id$/, 'Journey › Document'],
  [/^\/p2\/journeys\/:id\/documents$/, 'Journey › Upload / Edit Documents'],
  [/^\/p2\/journeys\/:id\/compliance-report$/, 'Journey › Compliance report'],
  [/^\/p2\/bookings$/, 'Bookings & Deliveries list'],
  [/^\/p2\/tasks$/, 'Tasks'],
  [/^\/p2\/review$/, 'Document Review board'],
  [/^\/dashboard$|^\/home$|^\/$/, 'Dashboard'],
];

const titleCase = (part: string) => part.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

/** A screen as a person would name it ("Journey › Documents"), and the
 * journey it is about. Ids are never part of the name. */
export function screenOf(pathname: string, search: string): { screen: string; journeyId: string | null } {
  const parts = pathname.split('/').filter(Boolean);
  const journeyAt = parts.findIndex((p) => p === 'journeys' || p === 'bookings' || p === 'deliveries' || p === 'audit');
  const journeyId = journeyAt >= 0 && UUID.test(parts[journeyAt + 1] ?? '') ? parts[journeyAt + 1] : null;
  const shape = `/${parts.map((p) => (UUID.test(p) || /^\d+$/.test(p) ? ':id' : p)).join('/')}`;
  const named = SCREEN_NAMES.find(([pattern]) => pattern.test(shape));
  const base = named ? named[1] : parts.filter((p) => !UUID.test(p) && !/^\d+$/.test(p)).map(titleCase).join(' › ') || 'Dashboard';
  const tab = new URLSearchParams(search).get('tab');
  return { screen: tab ? `${base} › ${titleCase(tab)}` : base, journeyId };
}

export function emptyTally(): StoredTally {
  return { lastClickAt: 0, lastScrollAt: 0, days: [] };
}

/** The shared tally from storage. A tally an older version wrote has only lastInteractionAt,
 * which a scroll also moved: it is not taken as a click. */
export function parseTally(raw: string | null): StoredTally {
  if (!raw) return emptyTally();
  try {
    const value = JSON.parse(raw) as Partial<StoredTally>;
    if (!value || !Array.isArray(value.days)) return emptyTally();
    return { lastClickAt: Number(value.lastClickAt) || 0, lastScrollAt: Number(value.lastScrollAt) || 0, days: value.days };
  } catch {
    return emptyTally();
  }
}

/** How far a finger may move and how long it may stay down for a touch to be a tap. */
export const TAP_MAX_MOVE_PX = 10;
export const TAP_MAX_MS = 1000;

/** Whether a touch that went down at ``start`` and up at ``end`` was a tap, not the start of a
 * scroll or a long press (product owner 2026-11-09: a scroll on a phone is not a tap). */
export function isTap(start: { x: number; y: number; at: number }, end: { x: number; y: number; at: number }): boolean {
  return Math.hypot(end.x - start.x, end.y - start.y) <= TAP_MAX_MOVE_PX && end.at - start.at <= TAP_MAX_MS;
}

/** Where this tally's time is spent: the app, a phone / tablet browser, or a
 * computer's browser (product owner 2026-10-27). */
export function activitySource(
  platform: string, userAgent: string, mobileHint?: boolean,
): 'WEB' | 'MOBILE_WEB' | 'ANDROID' | 'IOS' {
  if (platform === 'android') return 'ANDROID';
  if (platform === 'ios') return 'IOS';
  if (mobileHint === true) return 'MOBILE_WEB';
  return /Android|iPhone|iPad|iPod|Mobile|Tablet/i.test(userAgent) ? 'MOBILE_WEB' : 'WEB';
}

export const SOURCE_LABELS: Record<string, string> = {
  WEB: 'Computer', MOBILE_WEB: 'Phone browser', ANDROID: 'Android app', IOS: 'iOS app',
};

/** "Computer 2h 10m · Android app 40m", largest first; "—" when nothing. */
export function sourcesText(bySource: Record<string, number | undefined> | undefined,
  minutesText: (minutes: number) => string): string {
  const parts = Object.entries(bySource ?? {})
    .filter(([, minutes]) => (minutes ?? 0) > 0)
    .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
    .map(([source, minutes]) => `${SOURCE_LABELS[source] ?? source} ${minutesText(minutes ?? 0)}`);
  return parts.length ? parts.join(' · ') : '—';
}
