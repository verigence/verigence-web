import { hrRequest } from './client';

/** SuperAdmin only (hr.housekeeping.manage). Each call is made once; nothing is retried. */
export type HousekeepingKind = 'ATTENDANCE' | 'LEAVE' | 'CLAIMS';

export interface HousekeepingScope {
  kind: HousekeepingKind;
  from_date: string;
  to_date: string;
}

export interface HousekeepingPreview {
  kind: HousekeepingKind;
  from: string;
  to: string;
  counts: Record<string, number>;
  blockedBy: string | null;
  filesNotRemoved?: number;
}

const base = '/hr/v1/housekeeping';

export const previewHousekeeping = (token: string, scope: HousekeepingScope) =>
  hrRequest<HousekeepingPreview>(`${base}/preview`, { accessToken: token, method: 'POST', body: { ...scope } });

export const purgeHousekeeping = (token: string, scope: HousekeepingScope) =>
  hrRequest<HousekeepingPreview>(`${base}/purge`, { accessToken: token, method: 'POST', body: { ...scope, confirm: 'DELETE' } });

export interface EmployeeDeletePreview {
  employeeCode: string;
  fullName: string;
  employmentStatus: string;
  hasLogin: boolean;
  counts: Record<string, number>;
  blockedBy: string | null;
  note: string | null;
  deleted?: boolean;
  filesNotRemoved?: number;
}

/** Deletes one employee and all their records for good (people added only to test). */
export const previewEmployeeDelete = (token: string, employeeCode: string) =>
  hrRequest<EmployeeDeletePreview>(`${base}/employee/preview`, { accessToken: token, method: 'POST', body: { employee_code: employeeCode } });

export const deleteEmployeeForGood = (token: string, employeeCode: string) =>
  hrRequest<EmployeeDeletePreview>(`${base}/employee/delete`, { accessToken: token, method: 'POST', body: { employee_code: employeeCode, confirm: 'DELETE' } });
