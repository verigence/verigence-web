/** Ranges of the day-stats card: a day, the calendar week or the calendar month around a day, never past today. */

export type Period = 'day' | 'week' | 'month';
// Projects run on India time: the backend caps the range at the IST day too.
export function istToday(): string {
  return new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
}

export function addDays(day: string, days: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function mondayOf(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  return addDays(day, -((d.getUTCDay() + 6) % 7));
}

function endOfMonth(day: string): string {
  const d = new Date(`${day.slice(0, 7)}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + 1);
  return addDays(d.toISOString().slice(0, 10), -1);
}

export function min(a: string, b: string): string {
  return a < b ? a : b;
}

/** The range a period covers around ``anchor``, never past today. */
export function rangeFor(period: Period, anchor: string, today: string): { from: string; to: string } {
  if (period === 'week') return { from: mondayOf(anchor), to: min(addDays(mondayOf(anchor), 6), today) };
  if (period === 'month') return { from: `${anchor.slice(0, 7)}-01`, to: min(endOfMonth(anchor), today) };
  return { from: anchor, to: anchor };
}

/** Step the anchor one period back or forward. */
export function stepAnchor(period: Period, anchor: string, direction: -1 | 1): string {
  if (period === 'week') return addDays(anchor, 7 * direction);
  if (period === 'month') {
    const d = new Date(`${anchor.slice(0, 7)}-01T00:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() + direction);
    return d.toISOString().slice(0, 10);
  }
  return addDays(anchor, direction);
}

const DAY_LABEL = new Intl.DateTimeFormat('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const MONTH_LABEL = new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });

export function rangeLabel(period: Period, from: string, to: string, today: string): string {
  if (period === 'day') return from === today ? 'Today' : from === addDays(today, -1) ? 'Yesterday' : DAY_LABEL.format(new Date(`${from}T00:00:00Z`));
  if (period === 'month') return MONTH_LABEL.format(new Date(`${from}T00:00:00Z`));
  return `${DAY_LABEL.format(new Date(`${from}T00:00:00Z`))} – ${DAY_LABEL.format(new Date(`${to}T00:00:00Z`))}`;
}
