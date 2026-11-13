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
  /** The dashboard of the reader's role (section "dashboard": nothing else is sent with it). */
  dashboard?: Dashboard; role?: string | null;
  measures: Measure[]; schedules: DutySchedule[]; plannedDuties: Array<{ title: string; frequency: string }>;
  peers: Record<string, PeerFigures>; people: PerformancePerson[]; notes: string[];
  /** What a SuperAdmin has left on (absent from an older Audit Core: everything shown). */
  shows?: { duties: boolean; peers: boolean };
  unitMeasures?: UnitMeasure[]; outlets?: PerformanceOutlet[]; dealers?: PerformanceDealer[];
  /** The sections the reader's role may see, and their figures (product owner 2026-11-13). */
  sections?: Array<{ key: SectionKey; label: string }>;
  pending?: {
    kinds: Array<{ key: string; label: string }>; buckets: string[];
    outlets: Array<Place & { counts: PendingCounts }>;
    people: Array<{ actorId: string; name: string | null; role: string; counts: PendingCounts }>;
  };
  flow?: { outlets: Array<Place & { days: Record<string, FlowDay> }> };
  efficiency?: { people: EfficiencyRow[] };
  delinquency?: { lines: DelinquencyLine[] };
  tasks?: { outlets: Array<Place & TaskRow>; people: Array<{ actorId: string; name: string | null; role: string } & TaskRow> };
  uploads?: { outlets: Array<Place & ChannelRow>; people: Array<Who & ChannelRow> };
  quality?: { outlets: Array<Place & QualityRow>; people: Array<Who & QualityRow> };
};
export type Who = { actorId: string; name: string | null; role: string };
/** Files per day by how they came in: on their own, in a bulk (folder) upload, or through Google Drive. */
export type ChannelRow = { direct: number[]; bulk: number[]; drive: number[] };
export type QualityRow = {
  pagesUploaded: number; blurred?: number; faded?: number; tooSmall?: number; otherQuality?: number; duplicatePages?: number;
  duplicateFiles?: number;
};
export type SectionKey = 'pending' | 'flow' | 'uploads' | 'quality' | 'tasks' | 'trend' | 'efficiency' | 'duties';
export type Place = { outletId: string; outletName: string; dealerId: string; dealerName: string };
/** Per kind of pending work: how many, by age (today, 1-3 days, 4-7 days, older). */
export type PendingCounts = Record<string, number[]>;
export type FlowDay = {
  bookings: number; deliveries: number; onRegister: number; inTool: number; notNotified: number; notUploaded: number;
  registerMissing: number;
};
export type TaskRow = { raised: number[]; closed: number[]; open: number; overdue: number };
export type EfficiencyRow = {
  actorId: string; name: string | null; daysWorked: number; deliveryStarted: number; deliveryClosed: number;
  closedShare: number | null; daysToClose: number | null; pagesUploaded: number; pagesRejected: number;
  firstTimeRight: number | null; tasksWithDue: number; tasksInTime: number; tasksInTimeShare: number | null;
  journeysPerDay: number | null;
};
export type DelinquencyLine = DutyFigures & {
  actorId: string; name: string | null; role: string; scheduleId: string; missedDates: string[]; lateDates: string[];
};

// ---------------------------------------------------------------- the dashboard of each role (2026-11-13)

export type Tone = 'good' | 'warn' | 'bad' | null;
export type DashTile = { key: string; label: string; value: number | string; hint: string; tone: Tone };
/** within: a kind counted inside another (overdue tasks inside open tasks), shown under it. */
export type DashPendingKind = { key: string; label: string; total: number; buckets: number[]; within: string | null };
export type DashSeries = { name: string; data: number[]; kind?: 'line' };
export type DashColumnKind = 'bar' | 'num' | 'alert' | 'warn' | 'pct';
export type DashColumn = { key: string; label: string; kind: DashColumnKind };
export type DashRow = { id: string; name: string; sub: string; spark?: number[]; values: Record<string, number | null> };
export type DashCard = { key: string; title: string; sort: string; spark?: string; columns: DashColumn[]; rows: DashRow[] };
export type DashDutyDay = { date: string; due: number; onTime?: number; late?: number; notDone?: number; pending?: number };
export type DashDuty = DutyFigures & {
  title: string; frequency: string; days: DashDutyDay[]; missedBy: Array<{ name: string; dates: string[] }>;
};
export type DashQuality = {
  pagesUploaded: number; rejected: number; rightFirstTime: number | null;
  reasons: Array<{ key: string; label: string; value: number }>; duplicatePages: number; duplicateFiles: number;
};
export type Dashboard = {
  view: 'PC' | 'REVIEWER' | 'TEAM'; title: string; period: string; days: string[]; widgets: string[];
  kpis?: { title: string; tiles: DashTile[] };
  pending?: { title: string; buckets: string[]; kinds: DashPendingKind[] };
  attention?: { total: number; lines: Array<{ tone: 'bad' | 'warn'; who: string; text: string }> };
  trend?: { title: string; series: DashSeries[] };
  tasks?: { raised: number[]; closed: number[]; open: number; overdue: number };
  scorecards?: DashCard[];
  peers?: { title: string; people: number; rows: Array<{ key: string; label: string; me: number | null; peers: number }> };
  duties?: { rows: DashDuty[]; planned: Array<{ title: string }> };
  quality?: DashQuality;
  channels?: { direct: number; bulk: number; drive: number };
};

/** The rows of a scorecard ordered by a column (the name when ``key`` is "name"). */
export function sortRows(rows: DashRow[], key: string, descending: boolean): DashRow[] {
  const sign = descending ? -1 : 1;
  return [...rows].sort((a, b) => {
    if (key === 'name') return sign * a.name.localeCompare(b.name);
    const x = a.values[key], y = b.values[key];
    if (x == null || y == null) return x == null && y == null ? a.name.localeCompare(b.name) : x == null ? 1 : -1;
    return sign * (x - y) || a.name.localeCompare(b.name);
  });
}

/** The total of each countable column of a scorecard (a share has no total). */
export function cardTotals(card: DashCard): Record<string, number | null> {
  const out: Record<string, number | null> = {};
  for (const column of card.columns) {
    out[column.key] = column.kind === 'pct' ? null
      : Math.round(card.rows.reduce((n, r) => n + (r.values[column.key] ?? 0), 0) * 10) / 10;
  }
  return out;
}

export type DutyState = 'none' | 'done' | 'late' | 'missed' | 'pending';
/** What a day of a duty came to: anything missed marks the day missed, then late, then still open. */
export function dutyDayState(day: DashDutyDay): DutyState {
  if (!day.due) return 'none';
  if (day.notDone) return 'missed';
  if (day.late) return 'late';
  if (day.pending) return 'pending';
  return 'done';
}

/** One section (the tab that is open) of a date range: nothing else is read or sent. */
export function getPerformance(tenantId: string, from: string, to: string, section: SectionKey | 'dashboard', accessToken?: string) {
  const params = new URLSearchParams({ from, date: to, section });
  return auditCoreRequest<Performance>(
    `/p2/v1/tenants/${encodeURIComponent(tenantId)}/reports/performance?${params.toString()}`,
    { accessToken, timeoutMs: 60_000 });
}

// ---------------------------------------------------------------- SuperAdmin settings (2026-11-13)

export type PerformanceSettingItem = { key: string; label: string; group: string; shown: Record<string, boolean> };
/** Each item is switched per role (2026-11-13: what a TL sees, what a PM sees). */
export type PerformanceSettings = { roles: string[]; items: PerformanceSettingItem[] };

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

// ---------------------------------------------------------------- periods, pending and flow (2026-11-13)

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const utc = (iso: string) => new Date(`${iso}T00:00:00Z`);
const shortDay = (iso: string) => `${utc(iso).getUTCDate()} ${MONTH_NAMES[utc(iso).getUTCMonth()]}`;

export type Mode = 'DAILY' | 'WEEKLY';
/** A range of more than a fortnight reads better week by week. */
export const defaultMode = (days: number): Mode => (days > 14 ? 'WEEKLY' : 'DAILY');

/** The day ``n`` days before (or after) an ISO day. */
export function addDays(iso: string, n: number): string {
  const d = utc(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export const daysBetween = (from: string, to: string) => Math.round((utc(to).getTime() - utc(from).getTime()) / 86_400_000) + 1;
/** off: a Sunday (the off day): nothing is expected, so nothing is marked. */
export type Period = { key: string; label: string; indexes: number[]; off?: boolean };

/** The columns of a grid: each day, or each Monday-to-Sunday week, of the days returned. */
export function periodsOf(days: string[], mode: Mode): Period[] {
  if (mode === 'DAILY') {
    return days.map((d, i) => ({ key: d, label: `${DAY_NAMES[utc(d).getUTCDay()]} ${utc(d).getUTCDate()}`, indexes: [i],
      off: utc(d).getUTCDay() === 0 }));
  }
  const weeks: Period[] = [];
  days.forEach((d, i) => {
    const monday = new Date(utc(d));
    monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
    const key = monday.toISOString().slice(0, 10);
    const last = weeks[weeks.length - 1];
    if (last && last.key === key) last.indexes.push(i);
    else weeks.push({ key, label: `Week of ${shortDay(key)}`, indexes: [i] });
  });
  return weeks;
}

export const sumAt = (series: number[] | undefined, indexes: number[]) => indexes.reduce((n, i) => n + (series?.[i] ?? 0), 0);

/** A person's or outlet's pending work of one kind: the total and how much is older than three days. */
export function pendingOf(counts: PendingCounts | undefined, kind: string): { total: number; old: number } {
  const c = counts?.[kind] ?? [0, 0, 0, 0];
  return { total: c.reduce((a, b) => a + b, 0), old: (c[2] ?? 0) + (c[3] ?? 0) };
}

/** Pending counts added together (the outlets of a dealership, or a whole column). */
export function addPending(all: Array<PendingCounts | undefined>): PendingCounts {
  const out: PendingCounts = {};
  for (const counts of all) {
    for (const [kind, c] of Object.entries(counts ?? {})) {
      const into = (out[kind] ??= [0, 0, 0, 0]);
      c.forEach((n, i) => { into[i] += n; });
    }
  }
  return out;
}

const NO_FLOW: FlowDay = { bookings: 0, deliveries: 0, onRegister: 0, inTool: 0, notNotified: 0, notUploaded: 0, registerMissing: 0 };

/** The bookings, deliveries and gate register of some outlets over some days, added together. */
export function flowOf(outlets: Array<{ days: Record<string, FlowDay> }>, days: string[]): FlowDay {
  const out = { ...NO_FLOW };
  for (const o of outlets) {
    for (const d of days) {
      const cell = o.days[d];
      if (!cell) continue;
      (Object.keys(out) as Array<keyof FlowDay>).forEach((k) => { out[k] += cell[k] ?? 0; });
    }
  }
  return out;
}

/** "12 Nov, 13 Nov" for the dates a duty was missed (at most ``limit``, then "+n more"). */
export function datesText(dates: string[], limit = 6): string {
  const shown = dates.slice(-limit).map(shortDay).join(', ');
  return dates.length > limit ? `${shown} +${dates.length - limit} more` : shown;
}
