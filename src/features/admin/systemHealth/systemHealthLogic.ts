import type {
  DatabaseHealth, DocumentIntelligenceHealth, HealthAlert, ResourceHealth, ServiceHealth,
} from '../../../services/audit-core/systemHealth';

/** Pure helpers for the SuperAdmin System Health page (product owner 2026-10-27). */

export type Tone = 'ok' | 'warn' | 'bad' | 'muted';

export function alertCounts(alerts: HealthAlert[]): { critical: number; warning: number } {
  return {
    critical: alerts.filter((a) => a.severity === 'CRITICAL').length,
    warning: alerts.filter((a) => a.severity === 'WARNING').length,
  };
}

/** One word for the whole platform: the worst alert decides. */
export function overallStatus(alerts: HealthAlert[]): { label: string; tone: Tone } {
  const { critical, warning } = alertCounts(alerts);
  if (critical) return { label: 'Needs attention now', tone: 'bad' };
  if (warning) return { label: 'Running, with warnings', tone: 'warn' };
  return { label: 'Healthy', tone: 'ok' };
}

export function serviceTone(s: Pick<ServiceHealth, 'status' | 'restarts' | 'uncleanStops' | 'serverErrorsLastHour'>): Tone {
  if (s.status === 'DOWN') return 'bad';
  if (s.status === 'NO_HEARTBEAT') return 'muted';
  if (s.uncleanStops || s.restarts || s.serverErrorsLastHour) return 'warn';
  return 'ok';
}

export function serviceStatusLabel(status: ServiceHealth['status']): string {
  return { UP: 'Up', DOWN: 'Silent', NO_HEARTBEAT: 'No heartbeat yet' }[status];
}

/** Share of a limit, 0..100, or null when either side is unknown. */
export function usePct(value: number | null | undefined, limit: number | null | undefined): number | null {
  if (value === null || value === undefined || !limit) return null;
  return Math.round((100 * value) / limit);
}

export function pctTone(pct: number | null, warnAt = 70, badAt = 85): Tone {
  if (pct === null) return 'muted';
  if (pct >= badAt) return 'bad';
  if (pct >= warnAt) return 'warn';
  return 'ok';
}

export function cpuText(r: Pick<ResourceHealth, 'cpuMax' | 'cpuLimit'>): string {
  if (r.cpuMax === null) return '—';
  return r.cpuLimit ? `${r.cpuMax.toFixed(2)} of ${r.cpuLimit} vCPU` : `${r.cpuMax.toFixed(2)} vCPU`;
}

export function memoryText(r: Pick<ResourceHealth, 'memoryMaxGb' | 'memoryLimitGb'>): string {
  if (r.memoryMaxGb === null) return '—';
  const used = r.memoryMaxGb < 1 ? `${Math.round(r.memoryMaxGb * 1024)} MB` : `${r.memoryMaxGb.toFixed(2)} GB`;
  return r.memoryLimitGb ? `${used} of ${r.memoryLimitGb} GB` : used;
}

export function errorRate(errors: number, total: number): string {
  if (!total) return '—';
  const pct = (100 * errors) / total;
  return pct === 0 ? '0%' : pct < 0.1 ? '<0.1%' : `${pct.toFixed(1)}%`;
}

export function bytesText(bytes: number | null | undefined): string {
  if (!bytes && bytes !== 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit += 1; }
  return `${value.toFixed(value >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`;
}

export function connectionsInUse(db: Pick<DatabaseHealth, 'connections'>): number {
  return Object.values(db.connections ?? {}).reduce((sum, n) => sum + Number(n || 0), 0);
}

/** Document Intelligence jobs across Projects: in flight, past 30 minutes, failed. */
export function diTotals(di: DocumentIntelligenceHealth | null | undefined): { inFlight: number; over30m: number; failed: number } {
  const out = { inFlight: 0, over30m: 0, failed: 0 };
  if (!di?.available) return out;
  for (const p of di.projects) {
    for (const q of [p.classification, p.extraction]) {
      out.inFlight += q.inFlight;
      out.over30m += q.over30m;
      out.failed += q.failed;
    }
  }
  return out;
}

/** "12 min ago", "3 h ago", "2 d ago" from an ISO time. */
export function agoText(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return '—';
  const minutes = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60_000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.round(hours / 24)} d ago`;
}

/** Bar heights (0..100) for a small hourly chart, scaled to the busiest hour. */
export function barHeights(values: number[]): number[] {
  const top = Math.max(1, ...values);
  return values.map((v) => Math.round((100 * v) / top));
}
