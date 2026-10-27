import type { EngagementPerson } from '../../services/audit-core/taskManager';

/*
 * The few figures a manager reads first (product owner 2026-10-27): who was in
 * first and out last each day, who spent the most and the least time on
 * Verigence, who was not seen at all, and where the time was spent. Worked out
 * from the people currently shown, so the role and name filters apply.
 */

export type Who = { actorId: string; name?: string | null; role?: string | null };
export type Stamp = Who & { at: string };
export type DayLeaders = { day: string; firstIn: Stamp | null; lastOut: Stamp | null; peopleActive: number; activeMinutes: number };
export type TimeRow = Who & { activeMinutes: number; daysActive: number; perDay: number | null };

const who = (p: EngagementPerson): Who => ({ actorId: p.actorId, name: p.name, role: p.role });

/** First in and last out for each day with any time on Verigence, newest day first. */
export function dayLeaders(people: EngagementPerson[]): DayLeaders[] {
  const byDay = new Map<string, DayLeaders>();
  for (const p of people) {
    for (const d of p.days ?? []) {
      if (!d.activeMinutes) continue;
      const row = byDay.get(d.day) ?? { day: d.day, firstIn: null, lastOut: null, peopleActive: 0, activeMinutes: 0 };
      row.peopleActive += 1;
      row.activeMinutes += d.activeMinutes;
      const first = d.firstActiveAtUtc;
      const last = d.lastActiveAtUtc;
      if (first && (!row.firstIn || Date.parse(first) < Date.parse(row.firstIn.at))) row.firstIn = { ...who(p), at: first };
      if (last && (!row.lastOut || Date.parse(last) > Date.parse(row.lastOut.at))) row.lastOut = { ...who(p), at: last };
      byDay.set(d.day, row);
    }
  }
  return [...byDay.values()].sort((a, b) => b.day.localeCompare(a.day));
}

/**
 * People with time on Verigence, most first, split into the top and the bottom
 * (at most three each, never overlapping), plus those mapped to the Project
 * with no time at all: they are "not seen", not "least".
 */
export function timeRanking(people: EngagementPerson[]) {
  const ranked: TimeRow[] = people
    .filter((p) => p.totals.activeMinutes > 0)
    .map((p) => ({
      ...who(p), activeMinutes: p.totals.activeMinutes, daysActive: p.totals.daysActive,
      perDay: p.totals.efficacy.avgActiveMinutesPerDayActive,
    }))
    .sort((a, b) => b.activeMinutes - a.activeMinutes || (a.name ?? a.actorId).localeCompare(b.name ?? b.actorId));
  const most = ranked.slice(0, Math.min(3, Math.ceil(ranked.length / 2)));
  const least = [...ranked].reverse().slice(0, Math.min(3, Math.floor(ranked.length / 2)));
  const notSeen = people.filter((p) => p.activeInProject && p.totals.activeMinutes === 0).map(who);
  const total = ranked.reduce((sum, r) => sum + r.activeMinutes, 0);
  const personDays = ranked.reduce((sum, r) => sum + r.daysActive, 0);
  return { ranked, most, least, notSeen, total, perPersonDay: personDays ? Math.round(total / personDays) : null };
}

/** The person with the highest count, or null when nobody has any. */
export function topBy(people: EngagementPerson[], count: (p: EngagementPerson) => number): (Who & { count: number }) | null {
  let best: EngagementPerson | null = null;
  for (const p of people) if (count(p) > 0 && (!best || count(p) > count(best))) best = p;
  return best ? { ...who(best), count: count(best) } : null;
}

/** "Computer 80% · Android app 20%", largest first; "" when nothing. */
export function sourceShareText(people: EngagementPerson[], labels: Record<string, string>): string {
  const sums = new Map<string, number>();
  for (const p of people) {
    for (const [source, minutes] of Object.entries(p.totals.activeMinutesBySource ?? {})) {
      sums.set(source, (sums.get(source) ?? 0) + (minutes ?? 0));
    }
  }
  const total = [...sums.values()].reduce((a, b) => a + b, 0);
  if (!total) return '';
  return [...sums.entries()].filter(([, m]) => m > 0).sort((a, b) => b[1] - a[1])
    .map(([source, m]) => `${labels[source] ?? source} ${Math.round((100 * m) / total)}%`).join(' · ');
}

/** "09:05" in IST. */
export function istClock(at: string): string {
  return new Date(at).toLocaleTimeString('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false });
}

/** "Tue 27 Oct". */
export function dayText(day: string): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString('en-GB', { timeZone: 'UTC', weekday: 'short', day: '2-digit', month: 'short' });
}
