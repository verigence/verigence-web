import type { ArchiveRun, ArchiveTone } from '../../../services/audit-core/systemHealth';
import type { Tone } from './systemHealthLogic';

/** The data archive tab's helpers (product owner 2026-11-09). */

export function archiveTone(tone: ArchiveTone): Tone {
  return tone === 'RED' ? 'bad' : tone === 'AMBER' ? 'warn' : 'ok';
}

export function archiveToneLabel(tone: ArchiveTone): string {
  return tone === 'RED' ? 'Failed last night' : tone === 'AMBER' ? 'Needs a look' : 'Healthy';
}

export function runTone(run: Pick<ArchiveRun, 'status'>): Tone {
  if (run.status === 'FAILED') return 'bad';
  if (run.status === 'REFUSED') return 'warn';
  return run.status === 'SUCCEEDED' ? 'ok' : 'muted';
}

/** "0.6 s", "42 s", "3 min 5 s", "1 h 2 min"; a run still going: "—". */
export function durationText(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return '—';
  if (seconds < 10) return `${Math.round(seconds * 10) / 10} s`;
  if (seconds < 60) return `${Math.round(seconds)} s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ${Math.round(seconds % 60)} s`;
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

/** The table without its schema: "rule_executions". */
export function tableLabel(table: string): string {
  return table.includes('.') ? table.slice(table.indexOf('.') + 1) : table;
}

/** "Mon 9 Nov" for 2026-11-09. */
export function nightLabel(night: string): string {
  const d = new Date(`${night}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return night;
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
}
