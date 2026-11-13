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
  /** Journeys the PC uploaded that the system deleted as the same file uploaded again (from 12 Nov 2026);
   * absent from an older Audit Core. */
  duplicatesDeleted?: number;
};
export type ClosedFigures = { deliveryFiles: number; reviewer: number };
/** The files put in the Project's Google Drive in the period (product owner 2026-11-12). */
export type DriveFigures = {
  files: number; documents: number; photos: number; taken: number; duplicates: number; setAside: number;
  failed: number; waiting: number; reading: number; newBookings: number; addedToBookings: number;
  keptForReview: number; pages: number; pagesRead: number; pagesToRescan: number; pagesReading: number;
  manualVerificationTasks: number;
};
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
/** How the files came in (product owner 2026-11-13): on their own (app or web), in a bulk (folder)
 *  upload, or through Google Drive. */
export type ChannelFigures = {
  directFiles: number; directPages: number; bulkFiles: number; bulkPages: number; driveFiles: number; drivePages: number;
};
/** The Booking / Delivery documents-reviewed marks (by Reviewer, TL or PM) and the stages still
 *  awaiting one; a Reviewer's closure of a Journey and the TL's or PM's decision on it. */
export type ReviewFigures = {
  stagesReviewedByReviewer: number; stagesReviewedByLead: number; stagesReviewedByOther: number;
  stagesAwaitingReview: number;
  closedByReviewer: number; closedByLead: number; closedByOther: number; accepted: number; rejected: number;
  autoAccepted: number; awaitingDecision: number; awaitingReview: number;
};
/** Files uploaded in the period whose pages failed for good, by why. */
export type FailureFigures = {
  files: number; pages: number; quality: number; notRead: number; readFailed: number; notUploaded: number;
};
export type RecurringFigures = {
  due: number; onTime: number; late: number; incomplete: number; overdue: number; pending: number;
};
export type TrackerFigures = {
  gatePass: GatePassFigures; uploads: UploadFigures; closed: ClosedFigures; tasks: TaskFigures;
  recurring: Record<string, RecurringFigures>;
  /** Absent from an Audit Core that does not have the Drive intake yet. */
  drive?: DriveFigures;
  /** Absent from an Audit Core before 13 Nov 2026. */
  channels?: ChannelFigures;
  reviews?: ReviewFigures;
  failures?: FailureFigures;
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
  /** own: a PC's or Reviewer's own view -- only their own row is counted (2026-11-13). */
  scope: { projectWide: boolean; outlets: number; dealers: number; own?: boolean };
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

export type FailureWhy = 'quality' | 'notRead' | 'readFailed' | 'notUploaded';
export const FAILURE_WHY: Record<FailureWhy, { label: string; hint: string }> = {
  quality: { label: 'Page not clear', hint: 'Blurred, faded, too small or unreadable: scan it again.' },
  notRead: { label: 'Not read in time', hint: 'Verigence or the reading service was too slow; upload the page again.' },
  readFailed: { label: 'Reading failed', hint: 'Reading failed after every retry; upload the page again.' },
  notUploaded: { label: 'File not received', hint: 'The file never finished uploading or was never split into pages.' },
};

export type FailedRow = {
  kind: 'PAGE' | 'FILE'; journeyId: string; journeyReference: string | null; customerName: string | null;
  dealerName: string | null; outletName: string | null; filename: string | null; uploadedBy: string | null;
  uploadedByName?: string | null; uploadedAtUtc: string | null; failedAtUtc: string | null; pageNumbers: number[];
  attempts: number | null; reason: string; code: string | null; why?: FailureWhy; clearedFromJourney: boolean;
  openUrl: string | null;
};
export type FailedPages = { from: string; to: string; rows: FailedRow[]; truncated: boolean };

/** The failed pages and files of the files uploaded between two days (a TL's team, a PC's own). */
export function getFailedUploads(tenantId: string, from: string, to: string, accessToken?: string) {
  const params = new URLSearchParams({ from, to, by: 'uploaded' });
  return auditCoreRequest<FailedPages>(`${base(tenantId)}/reports/failed-pages?${params.toString()}`,
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

// ---------------------------------------------------------------- tabs (product owner 2026-11-09, 2026-11-13)

/** The Project Tracker is the one place for a Team Lead, PM or Executive (2026-11-09). Without the
 *  duplicates (2026-11-13: "Project Tracker has so much of duplicate information"): Performance, then
 *  the two pieces the product owner keeps -- work done on tasks with the delivery files closed, and
 *  deliveries against delivery files. The old tracker figures and the rest of the Daily processing and
 *  Daily gate pass tabs repeated Performance. The keys stay, so old addresses still open their tab.
 *  Journeys: the Dealership-wise / Outlet-wise / PC-wise panels moved off the TL's landing page; DMS
 *  dumps: the dealers' daily dumps like the gate register, the Team Lead's only (both 2026-11-13). */
export type TrackerTab = 'performance' | 'journeys' | 'daily-processing' | 'gate-pass' | 'dms-dumps';
export const TRACKER_TABS: Array<{ key: TrackerTab; label: string; roles?: string[] }> = [
  // How the team and each person is doing against their usual and their peers (2026-11-13).
  { key: 'performance', label: 'Performance' },
  { key: 'journeys', label: 'Journeys' },
  { key: 'daily-processing', label: 'Work done and files closed' },
  { key: 'gate-pass', label: 'Deliveries and delivery files' },
  { key: 'dms-dumps', label: 'DMS dumps', roles: ['TL'] },
];

/** The tabs a role sees. */
export function trackerTabsFor(role: string | null | undefined): typeof TRACKER_TABS {
  return TRACKER_TABS.filter((t) => !t.roles || t.roles.includes(String(role ?? '')));
}

export const PROJECT_TRACKER_PATH = '/p2/project-tracker';

/** The tab in the address (?tab=daily-processing); Performance by default, also for the old
 *  ?tab=tracker and the tracker's ?period= / ?view= addresses. */
export function trackerTabFromSearch(search: URLSearchParams): TrackerTab {
  const raw = search.get('tab');
  return TRACKER_TABS.some((t) => t.key === raw) ? (raw as TrackerTab) : 'performance';
}

/** The day the "Work done and files closed" tab shows: ?day=, else an old tracker address's ?date=,
 *  else today; never a malformed or future day. */
export function dailyProcessingDay(search: URLSearchParams, today: string = istDate()): string {
  for (const candidate of [search.get('day'), search.get('date')]) {
    if (candidate && /^\d{4}-\d{2}-\d{2}$/.test(candidate) && !Number.isNaN(Date.parse(`${candidate}T00:00:00Z`))
        && candidate <= today) return candidate;
  }
  return today;
}

/** The address of a tab: /p2/project-tracker?tab=daily-processing&day=2026-11-08; Performance is the
 *  page itself. Old addresses (/p2/reports/daily, the supervisor's /p2/gate-pass) open these. */
export function trackerTabHref(tab: TrackerTab, day?: string): string {
  if (tab === 'performance') return PROJECT_TRACKER_PATH;
  const params = new URLSearchParams({ tab });
  if (tab === 'daily-processing' && day && /^\d{4}-\d{2}-\d{2}$/.test(day)) params.set('day', day);
  return `${PROJECT_TRACKER_PATH}?${params.toString()}`;
}
