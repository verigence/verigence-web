import type {
  LiveProbe, NeonEndpoint, NodeStatus, R2Hour, WorkerHour,
} from '../../../services/audit-core/systemHealth';
import type { Tone } from './systemHealthLogic';

/** Pure helpers for the System Health "Cloudflare & Neon" tab (2026-10-31). */

export function nodeTone(status: NodeStatus): Tone {
  return ({ OK: 'ok', WARNING: 'warn', CRITICAL: 'bad', NOT_CONFIGURED: 'muted' } as const)[status] ?? 'muted';
}

export function nodeLabel(status: NodeStatus): string {
  return ({ OK: 'Healthy', WARNING: 'Warning', CRITICAL: 'Needs attention', NOT_CONFIGURED: 'Not configured' } as const)[status]
    ?? status;
}

/** "HTTP 200 · 182 ms", "Answered in 95 ms", or why it failed. */
export function probeText(probe: LiveProbe | null | undefined): string {
  if (!probe || !probe.configured) return 'Not configured';
  const latency = probe.latencyMs === null ? '' : ` · ${probe.latencyMs.toLocaleString('en-IN')} ms`;
  if (!probe.ok) return `${probe.error ?? 'Failed'}${latency}`;
  return probe.statusCode ? `HTTP ${probe.statusCode}${latency}` : `Answered${latency}`;
}

export function ratioText(ratio: number | null | undefined, digits = 1): string {
  if (ratio === null || ratio === undefined) return '—';
  return `${(100 * ratio).toFixed(digits)}%`;
}

/** 42 -> "42 s", 400 -> "6.7 min", 7200 -> "2.0 h". */
export function durationText(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return '—';
  if (seconds < 60) return `${Math.round(seconds)} s`;
  if (seconds < 3600) return `${(seconds / 60).toFixed(1)} min`;
  return `${(seconds / 3600).toFixed(1)} h`;
}

export function msText(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return '—';
  return ms < 10 ? `${ms.toFixed(1)} ms` : `${Math.round(ms).toLocaleString('en-IN')} ms`;
}

export function cuRange(e: Pick<NeonEndpoint, 'minCu' | 'maxCu'>): string {
  if (e.minCu === null && e.maxCu === null) return '—';
  if (e.minCu === e.maxCu) return `${e.maxCu} CU (fixed)`;
  return `${e.minCu ?? '?'}–${e.maxCu ?? '?'} CU`;
}

const HOUR_IST = new Intl.DateTimeFormat('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' });
const DAY_HOUR_IST = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata',
});

/** An hour bucket as IST: "14:30" (Cloudflare and Neon hours are UTC; IST is UTC+5:30). */
export function hourTick(iso: string, windowHours: number): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return windowHours > 24 ? DAY_HOUR_IST.format(d) : HOUR_IST.format(d);
}

export function hourLabel(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : DAY_HOUR_IST.format(d);
}

/**
 * Every hour of the window, oldest first, so a quiet hour shows as a gap instead of
 * vanishing from the axis. Rows are matched on the hour whatever their ISO spelling.
 */
export function alignHours<T extends { hour: string | null }>(
  rows: T[], windowHours: number, now: number, empty: (hour: string) => T,
): T[] {
  const byHour = new Map<number, T>();
  for (const r of rows) {
    if (!r.hour) continue;
    const t = new Date(r.hour).getTime();
    if (!Number.isNaN(t)) byHour.set(Math.floor(t / 3_600_000), r);
  }
  const last = Math.floor(now / 3_600_000);
  const first = last - Math.max(windowHours - 1, 0);
  const out: T[] = [];
  for (let h = first; h <= last; h += 1) {
    const iso = new Date(h * 3_600_000).toISOString();
    const row = byHour.get(h);
    out.push(row ? { ...row, hour: iso } : empty(iso));
  }
  return out;
}

/** The Worker's hour split into answered and failed, so the stack adds up to the requests. */
export function workerBars(rows: WorkerHour[]): Array<WorkerHour & { ok: number }> {
  return rows.map((r) => ({ ...r, ok: Math.max(r.requests - r.errors, 0) }));
}

export const R2_SERIES = [
  { key: 'reads', label: 'Reads (Get/Head)' },
  { key: 'writes', label: 'Writes (Put/Copy/Upload)' },
  { key: 'listsOther', label: 'Lists and other' },
  { key: 'deletes', label: 'Deletes' },
] as const;

export function r2Bars(rows: R2Hour[]): Array<R2Hour & { listsOther: number }> {
  return rows.map((r) => ({ ...r, listsOther: r.lists + r.other }));
}

export function emptyWorkerHour(hour: string): WorkerHour {
  return { hour, requests: 0, errors: 0, subrequests: 0, cpuP50Ms: null, cpuP99Ms: null };
}

export function emptyR2Hour(hour: string): R2Hour {
  return { hour, reads: 0, writes: 0, lists: 0, deletes: 0, other: 0, clientErrors: 0, serverErrors: 0 };
}

/** A ratio series in percent for the chart (null stays a gap). */
export function pctSeries<T extends Record<string, unknown>>(rows: T[], key: keyof T & string): Array<T & { pct: number | null }> {
  return rows.map((r) => {
    const v = r[key];
    return { ...r, pct: typeof v === 'number' ? Math.round(v * 1000) / 10 : null };
  });
}

/** The lower end of a percent axis: show the dip, but never zoom past 80%. */
export function pctFloor(values: Array<number | null>): number {
  const low = Math.min(100, ...values.filter((v): v is number => typeof v === 'number'));
  return Math.max(80, Math.floor(low / 5) * 5 - 5);
}
