import { auditCoreRequest } from './client';

/**
 * Performance (product owner 2026-11-13): each person's day against their own usual and their
 * peers, and the daily / weekly duties. Audit Core GET /p2/v1/tenants/{t}/reports/performance.
 * A Team Lead, PM or Executive reads their people by name; a PC or Reviewer their own row and
 * the unnamed peer median.
 */
export type MeasureKey = 'filesUploaded' | 'journeysUploaded' | 'reviews' | 'tasksClosed' | 'pagesRejected' | 'activeMinutes';
export type Measure = {
  key: MeasureKey; label: string; group: 'OUTPUT' | 'QUALITY' | 'UTILISATION'; roles: string[];
  unit?: 'MINUTES'; lowerIsBetter?: boolean;
};
export type Standing = 'above' | 'with' | 'below' | null;
export type DutyFigures = { due: number; onTime: number; late: number; notDone: number; pending: number };
export type PerformancePerson = {
  actorId: string; name: string | null; role: string; activeToday: boolean;
  today: Record<MeasureKey, number>; usual: Record<MeasureKey, number | null>;
  series: Record<MeasureKey, number[]>; standing: Record<MeasureKey, Standing>;
  dutiesToday: Record<string, DutyFigures>; dutiesWindow: Record<string, DutyFigures>;
};
export type PeerFigures = {
  people: number; activeToday: number;
  median: Record<MeasureKey, number | null>; usualMedian: Record<MeasureKey, number | null>;
};
export type DutySchedule = { scheduleId: string; title: string; frequency: string; status: string; assignedRole: string | null };
export type Performance = {
  date: string; first: string; days: string[]; timezone: string; current: boolean; asOfUtc: string; own: boolean;
  measures: Measure[]; schedules: DutySchedule[]; plannedDuties: Array<{ title: string; frequency: string }>;
  peers: Record<string, PeerFigures>; people: PerformancePerson[]; notes: string[];
};

export function getPerformance(tenantId: string, date: string, days: number, accessToken?: string) {
  const params = new URLSearchParams({ date, days: String(days) });
  return auditCoreRequest<Performance>(
    `/p2/v1/tenants/${encodeURIComponent(tenantId)}/reports/performance?${params.toString()}`,
    { accessToken, timeoutMs: 60_000 });
}

// ---------------------------------------------------------------- reading the figures

/** The role groups of the team view: PCs, Reviewers, and the leads together. */
export type RoleGroup = 'PC' | 'REVIEWER' | 'LEADS';
export const ROLE_GROUPS: Array<{ key: RoleGroup; label: string; roles: string[] }> = [
  { key: 'PC', label: 'PCs', roles: ['PC'] },
  { key: 'REVIEWER', label: 'Reviewers', roles: ['REVIEWER'] },
  { key: 'LEADS', label: 'TL, PM & Executive', roles: ['TL', 'PM', 'EXECUTIVE'] },
];

export function measuresFor(measures: Measure[], roles: string[]): Measure[] {
  return measures.filter((m) => m.roles.some((r) => roles.includes(r)));
}

/** 200 -> "3h 20m", 45 -> "45m". */
export function minutesText(minutes: number): string {
  const whole = Math.round(minutes);
  if (whole < 60) return `${whole}m`;
  return `${Math.floor(whole / 60)}h ${String(whole % 60).padStart(2, '0')}m`;
}

export function valueText(measure: Measure, value: number | null | undefined): string {
  if (value == null) return '—';
  if (measure.unit === 'MINUTES') return minutesText(value);
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

/** Today against the person's usual: up, down or level (within a tenth), and whether that is good. */
export function trend(measure: Measure, today: number, usual: number | null): { dir: 'up' | 'down' | 'level'; good: boolean | null } | null {
  if (usual == null) return null;
  if (Math.abs(today - usual) <= Math.max(usual * 0.1, 0.5)) return { dir: 'level', good: null };
  const up = today > usual;
  return { dir: up ? 'up' : 'down', good: measure.lowerIsBetter ? !up : up };
}

export const STANDING_LABEL: Record<Exclude<Standing, null>, string> = {
  above: 'Above peers', with: 'With peers', below: 'Below peers',
};

/** The duties of a person summed over their schedules: done (on time or late) of those due. */
export function dutySummary(duties: Record<string, DutyFigures>): DutyFigures {
  const total: DutyFigures = { due: 0, onTime: 0, late: 0, notDone: 0, pending: 0 };
  for (const d of Object.values(duties)) {
    total.due += d.due; total.onTime += d.onTime; total.late += d.late; total.notDone += d.notDone; total.pending += d.pending;
  }
  return total;
}

/** The points of a sparkline in a 0..width x 0..height box (y grows down). */
export function sparkPoints(series: number[], width = 72, height = 20): string {
  if (!series.length) return '';
  const max = Math.max(...series, 1);
  const step = series.length > 1 ? width / (series.length - 1) : 0;
  return series.map((v, i) => `${(i * step).toFixed(1)},${(height - (v / max) * (height - 2) - 1).toFixed(1)}`).join(' ');
}
