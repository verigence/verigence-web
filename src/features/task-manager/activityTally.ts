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
export type MinuteState = 'A' | 'I' | 'B' | 'K';

export const IDLE_AFTER_MS = 4 * 60_000;
/** A session is a stretch of use with no break of 30 minutes or more (2026-10-27). */
export const SESSION_GAP_MS = 30 * 60_000;
const IST_OFFSET_MS = 330 * 60_000;
/** K: a click, tap or key in that very minute (2026-10-28), so scrolling with
 * no click can be told apart from work. It counts as active everywhere. */
const RANK: Record<MinuteState, number> = { K: 4, A: 3, I: 2, B: 1 };

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
    } else if (state === 'I') idle += 1;
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
