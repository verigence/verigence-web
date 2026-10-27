import type { DiDashboard } from '../../services/audit-core/taskManager';

/*
 * The few DI figures to read first (product owner 2026-10-27): how much was
 * read the first time, what has to be scanned again or failed and the main
 * reason, how long a file takes, which PC has the most bad scans and which
 * document fails most.
 */

/** PCs with fewer documents than this are not singled out on a share. */
export const MIN_DOCUMENTS = 5;

export function diHighlights(data: DiDashboard) {
  const t = data.totals;
  const failed = t.outcomes.NOT_READ_IN_TIME + t.outcomes.FAILED_OTHER;
  const reasons = [...data.failureReasons].sort((a, b) => b.documents - a.documents);
  const topReason = (group?: string) => reasons.find((r) => (group ? r.group === group : r.group !== 'Bad scan')) ?? null;
  const pcs = data.byPc.filter((p) => p.documents > 0);
  const mostBadScans = [...pcs].filter((p) => p.badScans > 0)
    .sort((a, b) => b.badScans - a.badScans || (b.badScanPct ?? 0) - (a.badScanPct ?? 0))[0] ?? null;
  const bestReader = [...pcs].filter((p) => p.documents >= MIN_DOCUMENTS && p.readFirstPct !== null)
    .sort((a, b) => (b.readFirstPct ?? 0) - (a.readFirstPct ?? 0) || b.documents - a.documents)[0] ?? null;
  const hardestType = [...data.byDocumentType].filter((d) => d.failed > 0)
    .sort((a, b) => b.failed - a.failed || b.documents - a.documents)[0] ?? null;
  const worstDay = [...data.days].filter((d) => d.documents > 0 && (d.failedPct ?? 0) > 0)
    .sort((a, b) => (b.failedPct ?? 0) - (a.failedPct ?? 0))[0] ?? null;
  return {
    readFirst: t.outcomes.READ_FIRST, readRetried: t.outcomes.READ_RETRIED, documents: t.documents,
    readFirstPct: t.readFirstPct, badScans: t.outcomes.BAD_SCAN, badScanPages: t.pagesByOutcome.BAD_SCAN,
    failed, topBadScanReason: topReason('Bad scan'), topFailReason: failed ? topReason() : null,
    mostBadScans, bestReader, hardestType, worstDay,
  };
}

/** PCs, most bad scans first, then most documents. */
export function pcsByBadScans(data: DiDashboard) {
  return [...data.byPc].filter((p) => p.documents > 0)
    .sort((a, b) => b.badScans - a.badScans || b.documents - a.documents);
}
