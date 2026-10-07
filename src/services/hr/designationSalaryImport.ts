import { hrRequest } from './client';

/** Bulk designation and proposed-salary import from an Excel sheet (needs hr.employee.manage and hr.salary.propose). */

type DsRowStatus = 'READY' | 'NO_CHANGE' | 'ERROR';
type DsSalaryAction = 'PROPOSE' | 'EXISTS';

export interface DsPreviewRow {
  row: number;
  status: DsRowStatus;
  employeeCode: string;
  fullName: string | null;
  /** The new designation; null when it does not change. */
  designation: string | null;
  salaryAction: DsSalaryAction | null;
  salary: number | null;
  effectiveFrom: string | null;
  /** The salary will be saved without components, waiting for the ₹21,001–₹24,999 template. */
  templatePending: boolean;
  notes: string[];
  errors: string[];
}

export interface DsPreview {
  summary: { total: number; ready: number; templatePending: number; noChange: number; errors: number };
  rows: DsPreviewRow[];
}

export interface DsResult {
  row: number;
  employeeCode?: string;
  status: 'APPLIED' | 'SKIPPED' | 'FAILED';
  designation?: 'UPDATED' | 'UNCHANGED';
  salary?: 'PROPOSED' | 'EXISTS';
  error?: string;
}

const path = '/hr/v1/employees/designation-salary-import';

export const previewDesignationSalaryImport = (token: string, file: File) => {
  const form = new FormData();
  form.append('file', file, file.name);
  return hrRequest<DsPreview>(`${path}/preview`, { accessToken: token, method: 'POST', body: form, timeoutMs: 60_000 });
};

/** `rows` are sheet row numbers, at most 10 per call. The same file is sent every time. */
export const commitDesignationSalaryImport = (token: string, file: File, rows: number[]) => {
  const form = new FormData();
  form.append('file', file, file.name);
  form.append('rows', rows.join(','));
  return hrRequest<{ results: DsResult[] }>(`${path}/commit`, { accessToken: token, method: 'POST', body: form, timeoutMs: 120_000 });
};
