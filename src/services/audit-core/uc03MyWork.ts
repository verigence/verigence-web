import { auditCoreRequest } from './client';

/** PC Home and the Tracker tab for PCs and Reviewers (Audit Core GET /p2/v1/tenants/{t}/my-work, 2026-11-02). */

export type GateRegisterStatus = 'NOT_UPLOADED' | 'MISSED' | 'COUNTS_PENDING' | 'ANSWER_PENDING' | 'DONE';

/** One gate register day of an outlet: what the register says against the tool. */
export type GateRegisterDay = {
  date: string; label: string; dueAtUtc: string; status: GateRegisterStatus;
  total: number | null; intimated: number | null; uploadedInTool: number;
  pendingWithPc: number | null; notIntimated: number | null; gatePassId: string | null;
  /** Pages of the uploaded register photo (0 when none), opened through the gate pass image link. */
  pages?: number; uploadedAtUtc?: string | null;
};

type OutletBase = { outletId: string; outletName: string; dealerId: string; dealerName: string; classification: string };

export type PcFigures = {
  journeysTotal: number; journeysUploaded: number; bookingsUploaded: number; deliveriesUpdated: number;
  /** Journeys the PC uploaded that the system deleted as the same file uploaded again (from 12 Nov 2026);
   * absent from an older Audit Core. */
  duplicatesDeleted?: number;
  /** The PC's journeys whose delivery file closed in the period (Daily processing report rule). */
  journeysCompleted: number;
  gateRegisterDays: number; gateRegisterUploaded: number; gateRegisterMissed: number;
  registerTotal: number; registerIntimated: number; uploadedInTool: number;
  pendingDeliveryFiles: number; notIntimated: number; tasksWorked: number; tasksClosed: number; tasksPending: number;
};
export type PcOutlet = OutletBase & PcFigures & { gateRegister: GateRegisterDay[] };

export type ReviewerFigures = {
  journeysWorked: number; reviewsClosed: number; corrections: number;
  tasksWorked: number; tasksClosed: number; tasksPending: number;
};
export type ReviewerOutlet = OutletBase & ReviewerFigures;

/** How My Tracker groups its rows (product owner 2026-11-03: daily, weekly or monthly). */
export type MyWorkGrouping = 'day' | 'week' | 'month';

/** One row of My Tracker (a day, a Monday-to-Sunday week or a calendar month), per outlet; tasks pending has no row. */
export type PcRowFigures = Pick<PcFigures, 'journeysUploaded' | 'bookingsUploaded' | 'deliveriesUpdated' | 'duplicatesDeleted'
  | 'journeysCompleted' | 'gateRegisterDays' | 'gateRegisterUploaded' | 'registerTotal' | 'registerIntimated'
  | 'uploadedInTool' | 'pendingDeliveryFiles' | 'tasksWorked' | 'tasksClosed'>;
export type PcRowOutlet = PcRowFigures & {
  outletId: string; outletName: string; classification: string;
  /** A day's register entry (status and figures); null for a week or month, or a Sunday. */
  gateRegister: GateRegisterDay | null;
};
export type PcRow = { from: string; to: string; label: string; outlets: PcRowOutlet[]; totals: PcRowFigures };

export type ReviewerRowFigures = Omit<ReviewerFigures, 'tasksPending'>;
export type ReviewerRowOutlet = ReviewerRowFigures & { outletId: string; outletName: string; classification: string };
export type ReviewerRow = { from: string; to: string; label: string; outlets: ReviewerRowOutlet[]; totals: ReviewerRowFigures };

export type MyWork =
  | { role: 'PC'; from: string; to: string; by: MyWorkGrouping; outlets: PcOutlet[]; totals: PcFigures; periods: PcRow[] }
  | { role: 'REVIEWER'; from: string; to: string; by: MyWorkGrouping; outlets: ReviewerOutlet[]; totals: ReviewerFigures;
      periods: ReviewerRow[] };

export type CheckoutCheck = {
  day: string; label: string;
  pending: Array<{ outletId: string; outletName: string; dealerName: string }>;
};

const base = (tenantId: string) => `/p2/v1/tenants/${encodeURIComponent(tenantId)}`;

export function getMyWork(tenantId: string, range: { from: string; to: string }, accessToken?: string,
  by: MyWorkGrouping = 'day') {
  const params = new URLSearchParams({ from: range.from, to: range.to, by });
  return auditCoreRequest<MyWork>(`${base(tenantId)}/my-work?${params.toString()}`, { accessToken });
}

/** The previous day's gate registers the PC has not finished at their onsite outlets: a warning before check-out. */
export function getCheckoutCheck(tenantId: string, accessToken?: string) {
  return auditCoreRequest<CheckoutCheck>(`${base(tenantId)}/my-work/checkout-check`, { accessToken, timeoutMs: 8_000 });
}

/** YYYY-MM-DD of a moment in IST, the gate register's day. */
export function istDate(at: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(at);
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export type MyWorkPeriod = 'today' | 'yesterday' | 'week' | 'lastWeek' | 'month' | 'lastMonth';

/** Today; yesterday (product owner 2026-11-03: the day the N-1 gate register covers);
 *  this week (Monday to today); last week (Monday to Sunday); this month (the 1st to today);
 *  or last month (the whole calendar month), in IST. */
export function periodRange(period: MyWorkPeriod, now: Date = new Date()): { from: string; to: string } {
  const today = istDate(now);
  if (period === 'today') return { from: today, to: today };
  if (period === 'yesterday') {
    const yesterday = addDays(today, -1);
    return { from: yesterday, to: yesterday };
  }
  if (period === 'month') return { from: `${today.slice(0, 8)}01`, to: today };
  if (period === 'lastMonth') {
    const lastDay = addDays(`${today.slice(0, 8)}01`, -1);
    return { from: `${lastDay.slice(0, 8)}01`, to: lastDay };
  }
  const weekday = new Date(`${today}T00:00:00Z`).getUTCDay(); // 0 Sunday .. 6 Saturday
  const monday = addDays(today, -((weekday + 6) % 7));
  if (period === 'week') return { from: monday, to: today };
  return { from: addDays(monday, -7), to: addDays(monday, -1) };
}

/** The longest range My Tracker reads at once (Audit Core MAX_DAYS). */
export const MAX_RANGE_DAYS = 92;

/** Days from ``from`` to ``to``, both counted. */
export function rangeDays(range: { from: string; to: string }): number {
  return Math.round((Date.parse(`${range.to}T00:00:00Z`) - Date.parse(`${range.from}T00:00:00Z`)) / 86_400_000) + 1;
}
