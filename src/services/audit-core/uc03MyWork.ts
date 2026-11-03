import { auditCoreRequest } from './client';

/** PC Home and the Tracker tab for PCs and Reviewers (Audit Core GET /p2/v1/tenants/{t}/my-work, 2026-11-02). */

export type GateRegisterStatus = 'NOT_UPLOADED' | 'MISSED' | 'COUNTS_PENDING' | 'ANSWER_PENDING' | 'DONE';

/** One gate register day of an outlet: what the register says against the tool. */
export type GateRegisterDay = {
  date: string; label: string; dueAtUtc: string; status: GateRegisterStatus;
  total: number | null; intimated: number | null; uploadedInTool: number;
  pendingWithPc: number | null; notIntimated: number | null; gatePassId: string | null;
};

type OutletBase = { outletId: string; outletName: string; dealerId: string; dealerName: string; classification: string };

export type PcFigures = {
  journeysTotal: number; journeysUploaded: number; bookingsUploaded: number; deliveriesUpdated: number;
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

/** One day of the Tracker (product owner 2026-11-03: "date wise"), per outlet; tasks pending has no day. */
export type PcDayFigures = Pick<PcFigures, 'journeysUploaded' | 'bookingsUploaded' | 'deliveriesUpdated'
  | 'journeysCompleted' | 'uploadedInTool' | 'pendingDeliveryFiles' | 'tasksWorked' | 'tasksClosed'>;
export type PcDayOutlet = PcDayFigures & {
  outletId: string; outletName: string; classification: string; gateRegister: GateRegisterDay | null;
};
export type PcDay = { date: string; label: string; outlets: PcDayOutlet[]; totals: PcDayFigures };

export type ReviewerDayFigures = Omit<ReviewerFigures, 'tasksPending'>;
export type ReviewerDayOutlet = ReviewerDayFigures & { outletId: string; outletName: string; classification: string };
export type ReviewerDay = { date: string; label: string; outlets: ReviewerDayOutlet[]; totals: ReviewerDayFigures };

export type MyWork =
  | { role: 'PC'; from: string; to: string; outlets: PcOutlet[]; totals: PcFigures; days: PcDay[] }
  | { role: 'REVIEWER'; from: string; to: string; outlets: ReviewerOutlet[]; totals: ReviewerFigures; days: ReviewerDay[] };

export type CheckoutCheck = {
  day: string; label: string;
  pending: Array<{ outletId: string; outletName: string; dealerName: string }>;
};

const base = (tenantId: string) => `/p2/v1/tenants/${encodeURIComponent(tenantId)}`;

export function getMyWork(tenantId: string, range: { from: string; to: string }, accessToken?: string) {
  const params = new URLSearchParams({ from: range.from, to: range.to });
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
