import { hrRequest } from './client';

/** Permission key held by HR (and the CEO) for the leave overview, reversal and balance changes. */
export const LEAVE_PERMISSION = {
  review: 'hr.leave.review',
} as const;

/**
 * Leave types (product owner decision, 4 Nov 2026). There is no sick leave and no yearly Earned
 * allowance any more: paid leave is earned from attendance. SICK and EARNED stay only so that old
 * requests in the history can still be shown; they can no longer be applied for or adjusted.
 */
export type LegacyLeaveType = 'SICK' | 'EARNED';
/** What can be applied for. */
export type ApplyLeaveType = 'PAID' | 'SPECIAL' | 'COMP_OFF' | 'UNPAID';
/** Any type a request may carry, including the old ones in history. */
export type LeaveType = ApplyLeaveType | LegacyLeaveType;
/** The types with a balance. PAID and COMP_OFF carry over (all-time); SPECIAL is a yearly quota. Unpaid leave has none. */
export type PaidLeaveType = 'PAID' | 'SPECIAL' | 'COMP_OFF';
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
  /** Only on special occasion leave: what the occasion is. */
  occasion: string | null;
  status: LeaveStatus;
  approverRule: ApproverRule;
  submittedAt: string;
  decidedAt: string | null;
  decisionNote: string | null;
}

export interface LeaveApplyInput {
  leave_type: ApplyLeaveType;
  from_date: string;
  to_date: string;
  half_day: boolean;
  reason?: string;
  /** Required (not empty, at most 100 characters) for SPECIAL; sent for nothing else. */
  occasion?: string;
}

/** One completed block of attendance days and what it earned. */
export interface LeaveEarningBlock {
  blockNo: number;
  /** yyyy-mm-dd */
  completedOn: string;
  attendanceDays: number;
  /** Paid days added to the balance. */
  credited: number;
  /** Paid days not added because the balance was at the cap. */
  lapsed: number;
}

/** How paid leave is earned from attendance, with the settings in force and the count so far. */
export interface LeaveEarning {
  /** Days of attendance that earn paid leave (setting, for example 22). */
  attendanceDaysNeeded: number;
  /** Paid days earned for each completed block (setting, for example 1). */
  paidDaysEarned: number;
  /** The most paid days the balance can hold (setting, for example 3). */
  balanceCap: number;
  /** Days of attendance counted towards the next block. */
  attendanceDaysSoFar: number;
  /** yyyy-mm-dd: a day whose exception is still waiting for a decision pauses the count from here. */
  countPausedFrom: string | null;
  /** Newest first, at most 24. */
  blocks: LeaveEarningBlock[];
}

/** Working days in the last 30 with no check-in and no leave. */
export interface LeaveAbsences {
  dates: string[];
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
  earning: LeaveEarning;
  requests: LeaveRequest[];
}

export interface LeaveAdjustInput {
  leave_type: PaidLeaveType;
  year: number;
  /** Positive adds days, negative takes days off. One decimal place, not zero. */
  days: number;
  note: string;
}

type HolidayStatus = 'TENTATIVE' | 'DECLARED';

interface Holiday {
  date: string;
  name: string;
  status: HolidayStatus;
  /** FULL_DAY, or which half is off. Older services did not send it: treat as FULL_DAY. */
  dayPart?: 'FULL_DAY' | 'MORNING' | 'AFTERNOON';
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

/** How paid leave is earned and how far the signed-in person is towards the next day. */
export const getMyLeaveEarning = (token: string) =>
  hrRequest<LeaveEarning>(`${base}/leave/earning`, { accessToken: token });

/** Working days in the last 30 with no check-in and no leave; each can still be applied for. */
export const getMyAbsences = (token: string) =>
  hrRequest<LeaveAbsences>(`${base}/leave/absences`, { accessToken: token });

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

/**
 * The holidays that apply to the signed-in person (mine=true): company-wide ones and those of their
 * projects or outlets. Only DECLARED holidays are skipped when days are counted; a half-day holiday
 * counts as half a day.
 */
export const getHolidays = (token: string, year?: number) =>
  hrRequest<HolidayList>(`${base}/holidays${yearQuery(year)}${year ? '&' : '?'}mine=true`, { accessToken: token });

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
