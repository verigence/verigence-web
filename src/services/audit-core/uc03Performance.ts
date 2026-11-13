import { auditCoreRequest } from './client';

/**
 * Performance (product owner 2026-11-13): each person's day against their own usual and their
 * peers, and the daily / weekly duties. Audit Core GET /p2/v1/tenants/{t}/reports/performance.
 * A Team Lead, PM or Executive reads their people by name; a PC or Reviewer their own row and
 * the unnamed peer median.
 */
export type MeasureKey = 'filesUploaded' | 'journeysUploaded' | 'journeysClosed' | 'reviews' | 'tasksClosed' | 'pagesRejected' | 'activeMinutes';
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
  /** The outlets the person is mapped to (absent in an older Audit Core). */
  outletIds?: string[];
};
/** An outlet or a dealership: the same facts counted by the outlet they belong to (2026-11-13). */
export type UnitMeasure = { key: string; label: string; group: string; lowerIsBetter?: boolean; unit?: 'MINUTES' };
export type PerformanceUnit = {
  today: Record<string, number>; usual: Record<string, number | null>; series: Record<string, number[]>;
  standing: Record<string, Standing>; activeToday: boolean; people: number;
  dutiesToday: DutyFigures | null; dutiesWindow: DutyFigures | null;
};
export type PerformanceOutlet = PerformanceUnit & {
  outletId: string; outletName: string; dealerId: string; dealerName: string; classification: string | null;
};
export type PerformanceDealer = PerformanceUnit & { dealerId: string; dealerName: string; outletIds: string[]; outlets: number };
export type PeerFigures = {
  people: number; activeToday: number;
  median: Record<MeasureKey, number | null>; usualMedian: Record<MeasureKey, number | null>;
};
export type DutySchedule = { scheduleId: string; title: string; frequency: string; status: string; assignedRole: string | null };
export type Performance = {
  date: string; first: string; days: string[]; timezone: string; current: boolean; asOfUtc: string; own: boolean;
  measures: Measure[]; schedules: DutySchedule[]; plannedDuties: Array<{ title: string; frequency: string }>;
  peers: Record<string, PeerFigures>; people: PerformancePerson[]; notes: string[];
  /** What a SuperAdmin has left on (absent from an older Audit Core: everything shown). */
  shows?: { duties: boolean; peers: boolean };
  unitMeasures?: UnitMeasure[]; outlets?: PerformanceOutlet[]; dealers?: PerformanceDealer[];
};

export function getPerformance(tenantId: string, date: string, days: number, accessToken?: string) {
  const params = new URLSearchParams({ date, days: String(days) });
  return auditCoreRequest<Performance>(
    `/p2/v1/tenants/${encodeURIComponent(tenantId)}/reports/performance?${params.toString()}`,
    { accessToken, timeoutMs: 60_000 });
}

// ---------------------------------------------------------------- SuperAdmin settings (2026-11-13)

export type PerformanceSettingItem = { key: string; label: string; group: string; shown: boolean; updatedAtUtc: string | null };
export type PerformanceSettings = { items: PerformanceSettingItem[] };

export function getPerformanceSettings(accessToken?: string) {
  return auditCoreRequest<PerformanceSettings>('/v1/admin/performance-settings', { accessToken });
}

export function setPerformanceSettings(shown: Record<string, boolean>, accessToken?: string) {
  return auditCoreRequest<PerformanceSettings>('/v1/admin/performance-settings',
    { accessToken, method: 'PUT', body: JSON.stringify({ shown }) });
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

export function valueText(measure: Pick<Measure, 'unit'>, value: number | null | undefined): string {
  if (value == null) return '—';
  if (measure.unit === 'MINUTES') return minutesText(value);
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

/** Today against the person's usual: up, down or level (within a tenth), and whether that is good. */
export function trend(measure: Pick<Measure, 'lowerIsBetter'>, today: number, usual: number | null): { dir: 'up' | 'down' | 'level'; good: boolean | null } | null {
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

// ---------------------------------------------------------------- cards (dealership, outlet, person)

/** One card of the Performance view: a dealership, an outlet or a person, with the same shape. */
export type Card = {
  id: string; name: string; sub?: string; activeToday: boolean;
  today: Record<string, number>; usual: Record<string, number | null>; series: Record<string, number[]>;
  standing: Record<string, Standing>; dutiesToday: DutyFigures | null; dutiesWindow: DutyFigures | null;
};
export type CardMeasure = { key: string; label: string; lowerIsBetter?: boolean; unit?: 'MINUTES' };

/** The measures worth a line: those where some card has a figure today or usually. */
export function liveMeasures(measures: CardMeasure[], cards: Card[]): CardMeasure[] {
  return measures.filter((m) => cards.some((c) => (c.today[m.key] ?? 0) > 0 || (c.usual[m.key] ?? 0) > 0));
}

/** Where a card stands overall: by its first measure with a standing; "idle" with nothing recorded. */
export function overall(card: Card, measures: CardMeasure[]): Exclude<Standing, null> | 'idle' | null {
  if (!card.activeToday) return 'idle';
  for (const m of measures) if (card.standing[m.key]) return card.standing[m.key];
  return null;
}

/**
 * What needs a look, in words, worst first: nothing recorded, duties not done, a figure well below
 * peers, many pages rejected. At most ``limit`` lines.
 */
export function attention(cards: Card[], measures: CardMeasure[], limit = 8): Array<{ id: string; name: string; why: string; tone: 'bad' | 'warn' }> {
  const out: Array<{ id: string; name: string; why: string; tone: 'bad' | 'warn'; rank: number }> = [];
  for (const c of cards) {
    const notDone = c.dutiesWindow?.notDone ?? 0;
    if (notDone) out.push({ id: c.id, name: c.name, why: `${notDone} ${notDone === 1 ? 'duty' : 'duties'} not done in the period`, tone: 'bad', rank: 0 });
    if (!c.activeToday) { out.push({ id: c.id, name: c.name, why: 'nothing recorded this day', tone: 'warn', rank: 1 }); continue; }
    let low = false;
    for (const m of measures) {
      const today = c.today[m.key] ?? 0;
      const usual = c.usual[m.key];
      if (m.lowerIsBetter) {
        if (today >= 3 && usual != null && today > 2 * usual) {
          out.push({ id: c.id, name: c.name, why: `${valueText(m, today)} ${m.label.toLowerCase()} (usual ${valueText(m, usual)})`, tone: 'warn', rank: 2 });
        }
      } else if (!low && c.standing[m.key] === 'below' && usual != null && today < usual * 0.5) {
        // One line for the first figure well below: the others usually follow it.
        low = true;
        out.push({ id: c.id, name: c.name, why: `${m.label.toLowerCase()} ${valueText(m, today)}, usual ${valueText(m, usual)} and below peers`, tone: 'warn', rank: 3 });
      }
    }
  }
  return out.sort((a, b) => a.rank - b.rank).slice(0, limit).map(({ rank: _rank, ...line }) => line);
}

export function unitCard(unit: PerformanceUnit, id: string, name: string, sub?: string): Card {
  return { id, name, sub, activeToday: unit.activeToday, today: unit.today, usual: unit.usual, series: unit.series,
    standing: unit.standing, dutiesToday: unit.dutiesToday, dutiesWindow: unit.dutiesWindow };
}

export function personCard(p: PerformancePerson, sub?: string): Card {
  const today = dutySummary(p.dutiesToday);
  const all = dutySummary(p.dutiesWindow);
  return { id: p.actorId, name: p.name || 'Name not recorded', sub, activeToday: p.activeToday, today: p.today, usual: p.usual,
    series: p.series, standing: p.standing, dutiesToday: today.due ? today : null, dutiesWindow: all.due ? all : null };
}
