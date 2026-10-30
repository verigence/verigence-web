import { auditCoreRequest } from './client';

/** Day stats for the Employee (PC) and Team Lead dashboards (Audit Core /p2/v1 reports/day-stats, 2026-10-30). */

export type DayStatsUploads = { files: number; booking: number; delivery: number; journeys: number };
export type DayStatsTasks = { closed: number; journey: number; taskManager: number; closedLate: number };
export type DayStatsGatePass = { days: number; uploaded: number; finished: number; missing: number };
export type DayStatsDeliveries = {
  asPerRegister: number; updatedInTool: number; notNotifiedToPc: number; pendingDueToPc: number; backlogCleared: number;
};
export type DayStatsFigures = {
  uploads: DayStatsUploads; tasks: DayStatsTasks; gatePass: DayStatsGatePass; deliveries: DayStatsDeliveries;
};

/** One day of the daily gate pass at an outlet, as the consolidated gate pass view shows it. */
export type DayStatsGatePassDay = {
  date: string; label: string; status: 'NOT_UPLOADED' | 'COUNTS_PENDING' | 'ANSWER_PENDING' | 'DONE';
  asPerRegister: number | null; updatedInTool: number; notNotifiedToPc: number; pendingDueToPc: number;
  gatePassId: string | null; pcName: string | null;
};

export type DayStatsPc = {
  actorId: string | null; name: string | null; uploads: DayStatsUploads; tasks: DayStatsTasks;
  gatePass: { uploaded: number }; outlets: string[];
};
export type DayStatsOutlet = DayStatsFigures & {
  outletId: string; outletName: string; dealerId: string; dealerName: string; classification: string;
  gatePassApplicable: boolean; pcs: DayStatsPc[]; gatePassDays: DayStatsGatePassDay[];
};
export type DayStatsDealer = DayStatsFigures & { dealerId: string; dealerName: string; outlets: DayStatsOutlet[] };
export type DayStatsDay = {
  date: string; uploads: DayStatsUploads; tasks: DayStatsTasks;
  deliveries: { updatedInTool: number; asPerRegister: number; backlogCleared: number };
};
export type DayStatsSelf = {
  uploads: DayStatsUploads; tasks: DayStatsTasks; gatePass: { uploaded: number };
  tasksReviewed: number; journeyTasksWorked: number; journeyTasksWorkedClosed: number;
};

export type DayStats = {
  from: string; to: string; timezone: string;
  caller: { actorId: string; name: string | null; supervisor: boolean; roles: string[] };
  totals: DayStatsFigures;
  dealers: DayStatsDealer[];
  outlets: DayStatsOutlet[];
  pcs: DayStatsPc[];
  days: DayStatsDay[];
  self: DayStatsSelf;
  notes: string[];
};

export function getP2DayStats(tenantId: string, from: string, to: string, accessToken?: string) {
  const params = new URLSearchParams({ from, to });
  return auditCoreRequest<DayStats>(
    `/p2/v1/tenants/${encodeURIComponent(tenantId)}/reports/day-stats?${params.toString()}`,
    { accessToken, timeoutMs: 60_000 },
  );
}
