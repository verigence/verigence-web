import { auditCoreRequest } from './client';
import { istDate } from './uc03MyWork';

/**
 * Project Tracker (product owner 2026-11-07): gate pass, files uploaded, files closed, tasks and
 * recurring tasks of the whole Project for a day, a week (Monday to Sunday) or a calendar month,
 * per dealership, outlet and PC. Audit Core GET /p2/v1/tenants/{t}/reports/project-tracker.
 */

export type TrackerPeriod = 'DAY' | 'WEEK' | 'MONTH';
export const TRACKER_PERIODS: TrackerPeriod[] = ['DAY', 'WEEK', 'MONTH'];

export type GatePassFigures = {
  due: number; onTime: number; late: number; missing: number; notYetDue: number; countsPending: number;
  onRegister: number; intimated: number; notNotified: number; uploadedInTool: number; pendingWithPc: number;
  stockTransfers: number;
};
export type UploadFigures = {
  files: number; pages: number; documents: number; journeys: number; bookings: number; deliveries: number;
  newJourneys: number;
};
export type ClosedFigures = { deliveryFiles: number; reviewer: number };
export type TaskSection = {
  raised: number; closed: number; closedByPc: number; closedByLead: number; closedByReviewer: number;
  closedByOther: number; closedBySystem: number; open: number; overdue: number;
};
export type RoleTasks = { raised: number; closed: number; open: number; overdue: number };
export type TaskFigures = {
  journey: TaskSection; taskManager: TaskSection; all: TaskSection;
  byRole: Record<string, RoleTasks>;
  worked: { total: number; byPc: number; byLead: number; byReviewer: number; byOther: number };
};
export type RecurringFigures = {
  due: number; onTime: number; late: number; incomplete: number; overdue: number; pending: number;
};
export type TrackerFigures = {
  gatePass: GatePassFigures; uploads: UploadFigures; closed: ClosedFigures; tasks: TaskFigures;
  recurring: Record<string, RecurringFigures>;
};
export type TrackerPerson = TrackerFigures & { actorId: string | null; name: string | null; role: string | null };
export type TrackerOutlet = TrackerFigures & {
  outletId: string | null; outletName: string; classification: string | null; people: TrackerPerson[];
};
export type TrackerDealer = TrackerFigures & { dealerId: string | null; dealerName: string; outlets: TrackerOutlet[] };
export type TrackerSchedule = {
  scheduleId: string; systemKind: string | null; title: string; frequency: string; category: string | null;
  status: string; assignedRole: string | null;
};
export type ProjectTracker = {
  period: {
    kind: TrackerPeriod; date: string; first: string; last: string; label: string; timezone: string;
    startUtc: string; endUtc: string; asOfUtc: string; current: boolean;
  };
  scope: { projectWide: boolean; outlets: number; dealers: number };
  schedules: TrackerSchedule[];
  totals: TrackerFigures;
  dealers: TrackerDealer[];
  notes: string[];
};

const base = (tenantId: string) => `/p2/v1/tenants/${encodeURIComponent(tenantId)}`;

export function getProjectTracker(tenantId: string, period: TrackerPeriod, date: string, accessToken?: string) {
  const params = new URLSearchParams({ period, date });
  return auditCoreRequest<ProjectTracker>(`${base(tenantId)}/reports/project-tracker?${params.toString()}`,
    { accessToken, timeoutMs: 60_000 });
}

// ---------------------------------------------------------------- period helpers (IST calendar)

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function lastDayOfMonth(date: string): string {
  const [y, m] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

/** The first and last day of the period containing ``date``: the day, its Monday-to-Sunday week, or its calendar month. */
export function trackerRange(period: TrackerPeriod, date: string): { first: string; last: string } {
  if (period === 'DAY') return { first: date, last: date };
  if (period === 'MONTH') return { first: `${date.slice(0, 8)}01`, last: lastDayOfMonth(date) };
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay(); // 0 Sunday .. 6 Saturday
  const monday = addDays(date, -((weekday + 6) % 7));
  return { first: monday, last: addDays(monday, 6) };
}

/** A date in the period before (-1) or after (+1) the one containing ``date``, as its first day. */
export function shiftPeriod(period: TrackerPeriod, date: string, step: -1 | 1): string {
  const { first, last } = trackerRange(period, date);
  if (period === 'DAY') return addDays(date, step);
  if (period === 'WEEK') return addDays(first, 7 * step);
  return step < 0 ? `${addDays(first, -1).slice(0, 8)}01` : addDays(last, 1);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const LONG_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October',
  'November', 'December'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function parts(date: string) {
  const [y, m, d] = date.split('-').map(Number);
  return { y, m, d, weekday: new Date(`${date}T00:00:00Z`).getUTCDay() };
}

/** "Sat 7 Nov 2026", "2 Nov – 8 Nov 2026" or "November 2026". */
export function trackerLabel(period: TrackerPeriod, date: string): string {
  const { first, last } = trackerRange(period, date);
  const a = parts(first);
  const b = parts(last);
  if (period === 'DAY') return `${WEEKDAYS[a.weekday]} ${a.d} ${MONTHS[a.m - 1]} ${a.y}`;
  if (period === 'MONTH') return `${LONG_MONTHS[a.m - 1]} ${a.y}`;
  return `${a.d} ${MONTHS[a.m - 1]}${a.y === b.y ? '' : ` ${a.y}`} – ${b.d} ${MONTHS[b.m - 1]} ${b.y}`;
}

/** The period and date from the page address (?period=week&date=2026-11-04), today's day by default.
 *  A malformed or future date falls back to today. */
export function trackerFromSearch(search: URLSearchParams, today: string = istDate()): { period: TrackerPeriod; date: string } {
  const raw = (search.get('period') || '').toUpperCase();
  const period: TrackerPeriod = TRACKER_PERIODS.includes(raw as TrackerPeriod) ? (raw as TrackerPeriod) : 'DAY';
  const asked = search.get('date') || '';
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(asked) && !Number.isNaN(Date.parse(`${asked}T00:00:00Z`));
  const date = valid && trackerRange(period, asked).first <= today ? asked : today;
  return { period, date };
}

/** The page address of a period: shareable. Today's period keeps the address short. */
export function trackerSearch(period: TrackerPeriod, date: string, today: string = istDate()): string {
  const params = new URLSearchParams({ period: period.toLowerCase() });
  if (trackerRange(period, date).first !== trackerRange(period, today).first) params.set('date', date);
  return params.toString();
}

/** Whether the period after the one containing ``date`` has started (the next arrow). */
export function hasNextPeriod(period: TrackerPeriod, date: string, today: string = istDate()): boolean {
  return shiftPeriod(period, date, 1) <= today;
}

// ---------------------------------------------------------------- calendar month (Team Lead dashboard)

/** The calendar month (YYYY-MM) of a moment in IST. */
export function istMonth(at: Date = new Date()): string {
  return istDate(at).slice(0, 7);
}

/** The last ``count`` calendar months up to and including ``month``, newest first. */
export function monthsUpTo(month: string, count = 12): { value: string; label: string }[] {
  const [y, m] = month.split('-').map(Number);
  return Array.from({ length: count }, (_, i) => {
    const date = new Date(Date.UTC(y, m - 1 - i, 1));
    const value = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
    return { value, label: `${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}` };
  });
}

/** "November 2026" for 2026-11. */
export function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return `${LONG_MONTHS[m - 1]} ${y}`;
}
