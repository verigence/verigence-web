import { describe, expect, it } from 'vitest';

import type { ImportPreviewRow, ImportResult } from '../../../services/hr/employees';
import { chunk, credentialsText, IMPORT_BATCH_SIZE, readyRowNumbers, summariseResults } from '../importPlan';

const row = (n: number, status: ImportPreviewRow['status']): ImportPreviewRow => ({
  row: n, status, employeeCode: `E${n}`, fullName: 'N', personalEmail: 'a@b.co', mobile: null, dateOfBirth: null,
  gender: null, department: null, qualification: null, panMasked: null, aadhaarMasked: null, notes: [], errors: [],
});

describe('import plan', () => {
  it('imports only the ready rows, in sheet order', () => {
    expect(readyRowNumbers([row(2, 'READY'), row(3, 'EXISTS'), row(4, 'ERROR'), row(5, 'READY')])).toEqual([2, 5]);
  });

  it('never sends more rows per call than the service allows', () => {
    const batches = chunk(Array.from({ length: 32 }, (_, i) => i + 2), IMPORT_BATCH_SIZE);
    expect(batches.every((b) => b.length <= IMPORT_BATCH_SIZE && b.length <= 10)).toBe(true);
    expect(batches.flat()).toHaveLength(32);
    expect(chunk([], 5)).toEqual([]);
  });

  const results: ImportResult[] = [
    { row: 2, status: 'CREATED', employeeCode: 'JBR1', fullName: 'Asha', personalEmail: 'a@x.co', loginStatus: 'CREATED', initialPassword: '=Ab3@kLm9' },
    { row: 3, status: 'CREATED', employeeCode: 'JBR2', fullName: 'Ravi', personalEmail: 'r@x.co', loginStatus: 'FAILED' },
    { row: 4, status: 'FAILED', error: 'x' },
    { row: 5, status: 'SKIPPED' },
  ];

  it('counts what happened', () => {
    expect(summariseResults(results)).toEqual({ created: 2, failed: 1, skipped: 1, loginsCreated: 1, loginsPending: 1 });
  });

  it('lists passwords only for created logins, as plain tab-separated text', () => {
    const text = credentialsText(results);
    expect(text.split('\n')).toEqual([
      'Employee ID\tName\tSign-in email\tInitial password',
      'JBR1\tAsha\ta@x.co\t=Ab3@kLm9',
      '',
    ]);
  });
});
