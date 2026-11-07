import { hrRequest } from './client';

/**
 * HR settings, holidays, claim categories and the Audit Core work-context sync.
 * Shapes follow the HRMgmt service (api/admin.py, api/claims.py, settings_store.py).
 * Every function makes exactly one request; the screens never retry on their own.
 */

type SettingKind = 'time' | 'int' | 'money' | 'money_or_null' | 'text';

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
/** FULL_DAY, or which half is off (product owner, 7 Nov 2026). */
export type HolidayDayPart = 'FULL_DAY' | 'MORNING' | 'AFTERNOON';
/** ALL: the whole company. SELECTED: the projects and outlets in `scope`. */
export type HolidayAppliesTo = 'ALL' | 'SELECTED';

/** A whole project (outletId null) or one outlet of a project. Names come from the work context. */
export interface HolidayScope {
  tenantId: string;
  projectCode: string | null;
  projectName: string | null;
  outletId: string | null;
  outletCode: string | null;
  outletName: string | null;
}

export interface Holiday {
  holidayId: string;
  /** ISO date, YYYY-MM-DD. */
  date: string;
  name: string;
  status: HolidayStatus;
  dayPart: HolidayDayPart;
  appliesTo: HolidayAppliesTo;
  /** Filled for HR only; empty for everyone else and for company-wide holidays. */
  scope: HolidayScope[];
  updatedAt?: string | null;
}

export interface HolidayList {
  items: Holiday[];
  note?: string;
}

export interface HolidayInput {
  date: string;
  name: string;
  status: HolidayStatus;
  dayPart: HolidayDayPart;
  appliesTo: HolidayAppliesTo;
  scope: Array<{ tenantId: string; outletId: string | null }>;
}

export interface HolidayScopeOutlet {
  outletId: string;
  outletCode: string | null;
  outletName: string | null;
}

export interface HolidayScopeProject {
  tenantId: string;
  projectCode: string | null;
  projectName: string | null;
  outlets: HolidayScopeOutlet[];
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

export const addHoliday = (token: string, input: HolidayInput) =>
  hrRequest<Holiday>(`${base}/holidays`, { accessToken: token, method: 'POST', body: { ...input } });

export const changeHoliday = (token: string, holidayId: string, input: HolidayInput) =>
  hrRequest<Holiday>(`${base}/holidays/entries/${encodeURIComponent(holidayId)}`, {
    accessToken: token,
    method: 'PUT',
    body: { ...input },
  });

/** Removed, not deleted: the service keeps the holiday with who removed it and when. */
export const removeHoliday = (token: string, holidayId: string) =>
  hrRequest<{ holidayId: string; date: string; removed: boolean }>(
    `${base}/holidays/entries/${encodeURIComponent(holidayId)}`,
    { accessToken: token, method: 'DELETE' },
  );

/** Projects and their outlets a holiday can be given to (HR's copy of the work context). */
export const getHolidayScopeOptions = (token: string) =>
  hrRequest<{ projects: HolidayScopeProject[] }>(`${base}/holidays/scope-options`, { accessToken: token });

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

// ---- Team Leads paused for approvals past the Monday 09:00 deadline (SuperAdmin) ----------------

export interface ApproverPauseItem {
  type: 'ATTENDANCE' | 'LEAVE' | 'CLAIM' | string;
  id: string;
  detail: string;
  forDate: string;
  raisedAt: string;
  deadline: string;
  employeeName: string;
  employeeCode: string | null;
}

export interface ApproverPause {
  pauseId: string;
  userId: string;
  name: string;
  employeeCode: string | null;
  deadlineAt: string;
  overdueCount: number;
  overdueItems: ApproverPauseItem[];
  pausedAt: string;
  /** False when Security could not be told; then `securityError` says why. */
  pausedInSecurity: boolean;
  securityError: string | null;
  restoredAt: string | null;
  restoredBy: string | null;
  restoreNote: string | null;
}

export const listApproverPauses = (accessToken: string) =>
  hrRequest<{ items: ApproverPause[]; activeCount: number }>('/hr/v1/admin/approver-pauses', { accessToken });

export const restoreApproverPause = (accessToken: string, pauseId: string, note: string) =>
  hrRequest<ApproverPause>(`/hr/v1/admin/approver-pauses/${encodeURIComponent(pauseId)}/restore`, {
    accessToken,
    method: 'POST',
    body: { note },
  });
