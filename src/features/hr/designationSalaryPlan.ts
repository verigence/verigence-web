import type { DsPreviewRow, DsResult } from '../../services/hr/designationSalaryImport';

/** The service accepts at most 10 rows per call. */
export const DS_BATCH_SIZE = 10;

/** Only rows the service marks READY are sent (that includes template-pending ones); no-change and error rows never are. */
export function committableRows(rows: DsPreviewRow[]): number[] {
  return rows.filter((r) => r.status === 'READY').map((r) => r.row);
}

/** Rows whose salary is saved without components, waiting for the ₹21,001–₹24,999 template. */
export const templatePendingRows = (rows: DsPreviewRow[]) => rows.filter((r) => r.status === 'READY' && r.templatePending);

/** `rows` is the preview, to tell which applied rows were saved as template pending. */
export function summariseDsResults(results: DsResult[], rows: DsPreviewRow[] = []) {
  const applied = results.filter((r) => r.status === 'APPLIED');
  const pending = new Set(templatePendingRows(rows).map((r) => r.row));
  const isPending = (r: DsResult) => pending.has(r.row);
  return {
    applied: applied.length,
    failed: results.filter((r) => r.status === 'FAILED').length,
    skipped: results.filter((r) => r.status === 'SKIPPED').length,
    designationsUpdated: applied.filter((r) => r.designation === 'UPDATED').length,
    waitingForFinance: applied.filter((r) => r.salary === 'PROPOSED' && !isPending(r)).length,
    templatePending: applied.filter(isPending).length,
  };
}

export const dsStatusText: Record<string, string> = {
  READY: 'Ready',
  NO_CHANGE: 'No change',
  ERROR: 'Needs fixing',
  APPLIED: 'Applied',
  SKIPPED: 'Skipped',
  FAILED: 'Not saved',
};

export const dsStatusTone: Record<string, string> = {
  READY: 'active',
  APPLIED: 'active',
  NO_CHANGE: 'rejected',
  SKIPPED: 'rejected',
  ERROR: 'suspended',
  FAILED: 'suspended',
};

export const dsSalaryActionText: Record<string, string> = {
  PROPOSE: 'Salary will be proposed',
  EXISTS: 'Same salary already on record',
};
