import { auditCoreRequest } from './client';
import type { TaskManagerMode } from './taskManager';

/**
 * Every PC's day in one window (product owner 2026-11-23: "a single window where i can see what
 * all my PC are doing in a day"). Audit Core reads it through the Project Tracker's and the
 * engagement report's own functions, so its figures are theirs.
 */
export type PcDayChannel = 'direct' | 'bulk' | 'drive';
export type PcDayDuty = { title: string; due: number; onTime: number; late: number; notDone: number; pending: number };
export type PcDayRegister = {
  outletId: string; outletName: string | null; date: string;
  /** MISSED, NOT_UPLOADED (not due yet), COUNTS_PENDING, ANSWER_PENDING, DONE */
  status: string;
  onRegister: number | null; inTool: number; notIntimated: number | null; pendingWithPc: number | null;
  uploadedLate: boolean; uploadedBy: string | null; byThisPc: boolean;
};
export type PcDayPending = {
  deliveriesNotUploaded: number; deliveryFilesOpen: number; tasksOpen: number; tasksOverdue: number;
  paymentsNotReconciled: number; pagesToReupload: number;
};
export type PcDayActivity = {
  activeMinutes: number; bySource: Record<string, number>;
  firstActiveAtUtc: string | null; lastActiveAtUtc: string | null;
  longestNoOutputMinutes: number | null; longestNoOutputFrom: string | null; longestNoOutputTo: string | null;
  productiveMinutes: number | null; activeNoOutputMinutes: number | null;
};
export type PcDayPerson = {
  actorId: string; name: string | null;
  outlets: Array<{ outletId: string; outletName: string | null; dealerName: string | null }>;
  journeys: { bookings: number; deliveries: number; updated: number };
  files: Record<PcDayChannel | 'total', number>;
  pagesUploaded: number; pagesRejected: number;
  tasksWorked: number; tasksClosed: number; deliveryFilesClosed: number;
  duties: PcDayDuty[]; gateRegister: PcDayRegister[]; pending: PcDayPending;
  didWork: boolean; seen: boolean;
  /** Executive and Superadmin only. */
  activity?: PcDayActivity;
};
export type PcDay = {
  date: string; today: string; current: boolean; asOfUtc: string; timezone: string; registerDate: string;
  showsActivity: boolean;
  totals: {
    pcs: number; seen: number; bookings: number; deliveries: number; updated: number;
    files: Record<PcDayChannel | 'total', number>;
    tasksWorked: number; tasksClosed: number; deliveryFilesClosed: number; pagesRejected: number;
    duties: { due: number; onTime: number; late: number; notDone: number; pending: number };
    registers: { outlets: number; missed: number; uploaded: number };
    pending: PcDayPending;
  };
  people: PcDayPerson[];
  notes: string[];
};

export function getPcDay(mode: TaskManagerMode, tenantId: string, day: string, accessToken?: string) {
  const t = encodeURIComponent(tenantId);
  const path = mode === 'admin'
    ? `/v1/admin/tenants/${t}/task-manager/pc-day?${new URLSearchParams({ day })}`
    : `/p2/v1/tenants/${t}/reports/pc-day?${new URLSearchParams({ date: day })}`;
  return auditCoreRequest<PcDay>(path, { accessToken, timeoutMs: 60_000, cache: 'no-store' });
}
