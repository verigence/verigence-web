import { hrRequest } from './client';

/** Permission key held by HR (and the CEO) for the leave overview, reversal and balance changes. */
export const LEAVE_PERMISSION = {
  review: 'hr.leave.review',
} as const;

export type LeaveType = 'SICK' | 'EARNED' | 'UNPAID';
/** Only these two have a yearly balance. Unpaid leave has none. */
export type PaidLeaveType = 'SICK' | 'EARNED';
export type LeaveStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
/** Who decides the request, chosen by the server when it is applied for. */
export type ApproverRule = 'AUTO' | 'CEO' | 'PM' | 'TL_PM' | 'HR';

export interface LeaveBalanceType {
  leaveType: PaidLeaveType;
  granted: number;
  used: number;
  pending: number;
  balance: number;
  /** balance minus pending: what can still be applied for. */
  available: number;
}

export interface LeaveBalance {
  year: number;
  types: LeaveBalanceType[];
}

export interface LeaveRequest {
  requestId: string;
  leaveType: LeaveType;
  fromDate: string;
  toDate: string;
  halfDay: boolean;
  days: number;
  reason: string | null;
  status: LeaveStatus;
  approverRule: ApproverRule;
  submittedAt: string;
  decidedAt: string | null;
  decisionNote: string | null;
}

export interface LeaveApplyInput {
  leave_type: LeaveType;
  from_date: string;
  to_date: string;
  half_day: boolean;
  reason?: string;
}

export interface LeaveOverviewItem {
  employeeId: string;
  employeeCode: string;
  fullName: string;
  types: LeaveBalanceType[];
}

export interface LeaveOverview {
  year: number;
  items: LeaveOverviewItem[];
}

export interface EmployeeLeave {
  balance: LeaveBalance;
  requests: LeaveRequest[];
}

export interface LeaveAdjustInput {
  leave_type: PaidLeaveType;
  year: number;
  /** Positive adds days, negative takes days off. One decimal place, not zero. */
  days: number;
  note: string;
}

export type HolidayStatus = 'TENTATIVE' | 'DECLARED';

export interface Holiday {
  date: string;
  name: string;
  status: HolidayStatus;
}

export interface HolidayList {
  items: Holiday[];
  note: string;
}

const base = '/hr/v1';

const yearQuery = (year?: number) => (year ? `?year=${encodeURIComponent(String(year))}` : '');

// ---- the signed-in employee ----------------------------------------------------------------------

export const getMyLeaveBalance = (token: string, year?: number) =>
  hrRequest<LeaveBalance>(`${base}/leave/balance${yearQuery(year)}`, { accessToken: token });

export const getMyLeaveRequests = (token: string) =>
  hrRequest<{ items: LeaveRequest[] }>(`${base}/leave/requests`, { accessToken: token });

export const applyLeave = (token: string, input: LeaveApplyInput) =>
  hrRequest<LeaveRequest>(`${base}/leave/requests`, {
    accessToken: token,
    method: 'POST',
    body: input as unknown as Record<string, unknown>,
  });

export const cancelLeave = (token: string, requestId: string) =>
  hrRequest<{ requestId: string; status: LeaveStatus }>(
    `${base}/leave/requests/${encodeURIComponent(requestId)}/cancel`,
    { accessToken: token, method: 'POST' },
  );

/** Visible to every signed-in person. Only DECLARED holidays are skipped when days are counted. */
export const getHolidays = (token: string, year?: number) =>
  hrRequest<HolidayList>(`${base}/holidays${yearQuery(year)}`, { accessToken: token });

// ---- HR (hr.leave.review) --------------------------------------------------------------------------

export const getLeaveOverview = (token: string, year?: number) =>
  hrRequest<LeaveOverview>(`${base}/leave/overview${yearQuery(year)}`, { accessToken: token });

export const getEmployeeLeave = (token: string, employeeId: string, year?: number) =>
  hrRequest<EmployeeLeave>(`${base}/leave/employee/${encodeURIComponent(employeeId)}${yearQuery(year)}`, {
    accessToken: token,
  });

/** Takes an approved leave back: the days return to the balance and the request becomes CANCELLED. */
export const reverseLeave = (token: string, requestId: string) =>
  hrRequest<{ requestId: string; status: LeaveStatus }>(
    `${base}/leave/requests/${encodeURIComponent(requestId)}/reverse`,
    { accessToken: token, method: 'POST' },
  );

export const adjustLeaveBalance = (token: string, employeeId: string, input: LeaveAdjustInput) =>
  hrRequest<LeaveBalance>(`${base}/leave/employee/${encodeURIComponent(employeeId)}/adjust`, {
    accessToken: token,
    method: 'POST',
    body: input as unknown as Record<string, unknown>,
  });
