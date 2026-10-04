import { describe, expect, it } from 'vitest';

import type { DsPreviewRow, DsResult } from '../../../services/hr/designationSalaryImport';
import { DS_BATCH_SIZE, committableRows, summariseDsResults, templatePendingRows } from '../designationSalaryPlan';
import { chunk } from '../importPlan';

const row = (n: number, status: DsPreviewRow['status'], templatePending = false): DsPreviewRow => ({
  row: n, status, employeeCode: `E${n}`, fullName: 'N', designation: null, salaryAction: status === 'READY' ? 'PROPOSE' : null, salary: null, effectiveFrom: null, templatePending, notes: [], errors: [],
});

describe('designation and salary import plan', () => {
  it('sends every READY row, template pending or not, and nothing else', () => {
    expect(committableRows([row(2, 'READY'), row(3, 'READY', true), row(4, 'NO_CHANGE'), row(5, 'ERROR')])).toEqual([2, 3]);
  });

  it('batches by ten', () => {
    const batches = chunk(Array.from({ length: 23 }, (_, i) => i + 2), DS_BATCH_SIZE);
    expect(batches.map((b) => b.length)).toEqual([10, 10, 3]);
  });

  it('finds the rows that will wait for the template', () => {
    expect(templatePendingRows([row(2, 'READY'), row(3, 'READY', true), row(4, 'ERROR', true)]).map((r) => r.row)).toEqual([3]);
  });

  it('counts the outcome, splitting template pending from waiting for Finance', () => {
    const rows = [row(2, 'READY'), row(3, 'READY'), row(4, 'READY', true), row(5, 'READY'), row(6, 'READY')];
    const results: DsResult[] = [
      { row: 2, status: 'APPLIED', designation: 'UPDATED', salary: 'PROPOSED' },
      { row: 3, status: 'APPLIED', designation: 'UNCHANGED', salary: 'EXISTS' },
      { row: 4, status: 'APPLIED', designation: 'UPDATED', salary: 'PROPOSED' },
      { row: 5, status: 'FAILED', error: 'x' },
      { row: 6, status: 'SKIPPED' },
    ];
    expect(summariseDsResults(results, rows)).toEqual({ applied: 3, failed: 1, skipped: 1, designationsUpdated: 2, waitingForFinance: 1, templatePending: 1 });
  });
});
