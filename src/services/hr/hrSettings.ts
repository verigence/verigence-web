import { hrRequest } from './client';

/**
 * HR settings, holidays, claim categories and the Audit Core work-context sync.
 * Shapes follow the HRMgmt service (api/admin.py, api/claims.py, settings_store.py).
 * Every function makes exactly one request; the screens never retry on their own.
 */

export type SettingKind = 'time' | 'int' | 'money' | 'money_or_null' | 'text';

export interface SettingItem {
  key: string;
  group: string;
  label: string;
  kind: SettingKind;
  /** time: "HH:MM"; int/money: number; money_or_null: number or null; text: string. */
  value: string | number | null;
  default: string | number | null;
  /** The service does not send bounds or units today. If it starts to, the form uses them. */
  min?: number | null;
  max?: number | null;
  unit?: string | null;
}

export interface SettingsList {
  items: SettingItem[];
}

export type SettingValue = string | number | null;

export type HolidayStatus = 'TENTATIVE' | 'DECLARED';

export interface Holiday {
  /** ISO date, YYYY-MM-DD. */
  date: string;
  name: string;
  status: HolidayStatus;
}

export interface HolidayList {
  items: Holiday[];
  note?: string;
}

export interface HolidayInput {
  name: string;
  status: HolidayStatus;
}

export interface ClaimCategory {
  code: string;
  label: string;
  kind: string;
  receiptRequired: boolean;
  perKm: boolean;
  ratePerKm: number | null;
  taxable: boolean;
}

export interface WorkContextStatus {
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  lastStatus: string | null;
  lastError: string | null;
  assignmentsSeen: number | null;
}

export interface WorkContextRefreshResult {
  ok: boolean;
  assignmentsSeen: number;
  error: string | null;
}

const base = '/hr/v1';

export const listSettings = (token: string) =>
  hrRequest<SettingsList>(`${base}/settings`, { accessToken: token });

/** Send only the values that changed. The reply is the full, updated list. */
export const updateSettings = (token: string, values: Record<string, SettingValue>) =>
  hrRequest<SettingsList>(`${base}/settings`, {
    accessToken: token,
    method: 'PUT',
    body: { values },
  });

export const listHolidays = (token: string, year: number) =>
  hrRequest<HolidayList>(`${base}/holidays?year=${encodeURIComponent(String(year))}`, { accessToken: token });

export const putHoliday = (token: string, date: string, input: HolidayInput) =>
  hrRequest<Holiday>(`${base}/holidays/${encodeURIComponent(date)}`, {
    accessToken: token,
    method: 'PUT',
    body: { ...input },
  });

export const deleteHoliday = (token: string, date: string) =>
  hrRequest<{ date: string; removed: boolean }>(`${base}/holidays/${encodeURIComponent(date)}`, {
    accessToken: token,
    method: 'DELETE',
  });

export const listClaimCategories = (token: string) =>
  hrRequest<{ items: ClaimCategory[] }>(`${base}/claims/categories`, { accessToken: token });

export const updateClaimCategoryTaxable = (token: string, code: string, taxable: boolean) =>
  hrRequest<{ code: string; taxable: boolean }>(`${base}/claims/categories/${encodeURIComponent(code)}`, {
    accessToken: token,
    method: 'PATCH',
    body: { taxable },
  });

export const getWorkContextStatus = (token: string) =>
  hrRequest<WorkContextStatus>(`${base}/work-context/status`, { accessToken: token });

/** The service spaces refreshes at least five minutes apart (409 WORK_CONTEXT_TOO_SOON). */
export const refreshWorkContext = (token: string) =>
  hrRequest<WorkContextRefreshResult>(`${base}/work-context/refresh`, { accessToken: token, method: 'POST' });
