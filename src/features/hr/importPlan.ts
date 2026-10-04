import type { ImportPreviewRow, ImportResult } from '../../services/hr/employees';

/** How many rows go to HR in one call. The service accepts at most 10; smaller keeps a call short. */
export const IMPORT_BATCH_SIZE = 5;

export function readyRowNumbers(rows: ImportPreviewRow[]): number[] {
  return rows.filter((r) => r.status === 'READY').map((r) => r.row);
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export function summariseResults(results: ImportResult[]) {
  return {
    created: results.filter((r) => r.status === 'CREATED').length,
    failed: results.filter((r) => r.status === 'FAILED').length,
    skipped: results.filter((r) => r.status === 'SKIPPED').length,
    loginsCreated: results.filter((r) => r.status === 'CREATED' && r.loginStatus === 'CREATED').length,
    loginsPending: results.filter((r) => r.status === 'CREATED' && r.loginStatus !== 'CREATED').length,
  };
}

/**
 * Login details to hand out, as tab-separated text. Deliberately a plain text file rather than a
 * spreadsheet format: generated passwords can start with = + or @, which a spreadsheet program
 * would try to run as a formula.
 */
export function credentialsText(results: ImportResult[]): string {
  const lines = ['Employee ID\tName\tSign-in email\tInitial password'];
  for (const r of results) {
    if (r.status !== 'CREATED' || !r.initialPassword) continue;
    lines.push([r.employeeCode ?? '', r.fullName ?? '', r.personalEmail ?? '', r.initialPassword].join('\t'));
  }
  return `${lines.join('\n')}\n`;
}
