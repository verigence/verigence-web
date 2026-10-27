import { describe, expect, it } from 'vitest';

import type { DiDashboard, DiDay, DiOutcome } from '../../services/audit-core/taskManager';
import { diHighlights, pcsByBadScans } from './diHighlights';

const KINDS: DiOutcome[] = ['READ_FIRST', 'READ_RETRIED', 'NEEDS_REVIEW', 'EXTRA_COPY', 'BAD_SCAN', 'NOT_READ_IN_TIME',
  'FAILED_OTHER', 'DUPLICATE', 'REMOVED', 'IN_PROGRESS'];

function day(d: string, outcomes: Partial<Record<DiOutcome, number>>, failedPct: number | null): DiDay {
  const full = Object.fromEntries(KINDS.map((k) => [k, outcomes[k] ?? 0])) as Record<DiOutcome, number>;
  const documents = Object.values(full).reduce((a, b) => a + b, 0);
  return { day: d, files: documents, pages: documents * 2, duplicateFiles: 0, notUploadedFiles: 0, documents, filesInProgress: 0,
    outcomes: full, pagesByOutcome: full, badScanReasons: {}, avgPagesPerFile: 2, fileSizeMb: { avg: 1, max: 2 },
    processingMinutes: { min: 1, avg: 2, median: 2, max: 5, count: 3 }, readFirstPct: 80, failedPct };
}

const data = {
  totals: { ...day('', { READ_FIRST: 40, READ_RETRIED: 5, BAD_SCAN: 3, NOT_READ_IN_TIME: 1, FAILED_OTHER: 1 }, 10), readFirstPct: 80 },
  days: [day('2026-10-26', { READ_FIRST: 20, BAD_SCAN: 1 }, 5), day('2026-10-27', { READ_FIRST: 20, FAILED_OTHER: 2 }, 9)],
  failureReasons: [
    { group: 'Bad scan', reason: 'Blurred', documents: 3, pages: 3 },
    { group: 'Not read in time', reason: 'Took over 30 minutes', documents: 1, pages: 1 },
    { group: 'System', reason: 'DI unavailable', documents: 2, pages: 2 },
  ],
  byPc: [
    { actorId: 'a', name: 'A', documents: 30, pages: 60, badScans: 1, notReadInTime: 0, failedOther: 1, readFirst: 28, badScanPct: 3, readFirstPct: 93 },
    { actorId: 'b', name: 'B', documents: 10, pages: 20, badScans: 2, notReadInTime: 1, failedOther: 0, readFirst: 6, badScanPct: 20, readFirstPct: 60 },
    { actorId: 'c', name: 'C', documents: 2, pages: 4, badScans: 0, notReadInTime: 0, failedOther: 0, readFirst: 2, badScanPct: 0, readFirstPct: 100 },
  ],
  byDocumentType: [
    { documentType: 'pan_card', documents: 10, readFirst: 10, retried: 0, failed: 0, readFirstPct: 100 },
    { documentType: 'tax_invoice', documents: 12, readFirst: 8, retried: 1, failed: 3, readFirstPct: 67 },
  ],
} as unknown as DiDashboard;

describe('DI highlights', () => {
  it('picks the headline figures', () => {
    const h = diHighlights(data);
    expect(h.failed).toBe(2);
    expect(h.topBadScanReason?.reason).toBe('Blurred');
    expect(h.topFailReason?.reason).toBe('DI unavailable');
    expect(h.mostBadScans?.actorId).toBe('b');
    expect(h.bestReader?.actorId).toBe('a'); // C has too few documents to single out
    expect(h.hardestType?.documentType).toBe('tax_invoice');
    expect(h.worstDay?.day).toBe('2026-10-27');
  });

  it('lists PCs with the most bad scans first', () => {
    expect(pcsByBadScans(data).map((p) => p.actorId)).toEqual(['b', 'a', 'c']);
  });
});
