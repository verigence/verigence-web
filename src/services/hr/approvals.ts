import { hrRawRequest, hrRequest } from './client';

/**
 * Approvals inbox (HRMgmt /hr/v1/approvals/...). The server decides which items a person may
 * see and decide; these functions only carry the request. Each call is made once, never retried.
 *
 * There is no count endpoint in HRMgmt: each list returns its items (up to 300) and nothing
 * else, so no cheap "getApprovalCounts" is offered. The page shows the length of the lists it
 * has already loaded.
 */
const base = '/hr/v1';

/** Permission keys from hrmgmt/permissions.py. Informational only: the server re-checks everything. */
export const APPROVAL_PERMISSION = {
  attendanceReadAll: 'hr.attendance.read_all',
  leaveReview: 'hr.leave.review',
  claimReview: 'hr.claim.review',
  claimReviewFinance: 'hr.claim.review_finance',
  payrollApprove: 'hr.payroll.approve',
} as const;

/** Error codes the decision endpoints return. */
export const APPROVAL_ERROR = {
  alreadyDecided: 'APPROVAL_ALREADY_DECIDED',
  noteRequired: 'APPROVAL_NOTE_REQUIRED',
  leaveBalanceTooLow: 'LEAVE_BALANCE_TOO_LOW',
  notFound: 'HR_NOT_FOUND',
} as const;

// ---- shared ----------------------------------------------------------------------------------

/** Attendance and leave accept APPROVE or REJECT; claims also accept CORRECTION. */
export type DecisionKind = 'APPROVE' | 'REJECT' | 'CORRECTION';

export interface DecisionBody<D extends DecisionKind = DecisionKind> {
  decision: D;
  /** At most 500 characters. Required by the server for REJECT and CORRECTION. */
  note?: string;
}

export const DECISION_NOTE_MAX = 500;

interface Items<T> {
  items: T[];
}

// ---- attendance exceptions -------------------------------------------------------------------

export type AttendanceEvent = 'CHECK_IN' | 'CHECK_OUT';
export type AttendanceExceptionKind = 'LATE_CHECK_IN' | 'EARLY_CHECK_OUT' | 'OUT_OF_FENCE' | 'NO_OUTLET_LOCATION';

export interface AttendanceApproval {
  exceptionId: string;
  attendanceId: string;
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  /** YYYY-MM-DD */
  workDate: string;
  event: AttendanceEvent;
  kind: AttendanceExceptionKind | string;
  reason: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  decisionNote: string | null;
  /** ISO timestamp of the check-in or check-out this exception is about. */
  at: string | null;
  distanceM: number | null;
  outletName: string | null;
}

export const listAttendanceApprovals = async (accessToken: string): Promise<AttendanceApproval[]> =>
  (await hrRequest<Items<AttendanceApproval>>(`${base}/approvals/attendance`, { accessToken })).items;

export const decideAttendance = (accessToken: string, exceptionId: string, body: DecisionBody<'APPROVE' | 'REJECT'>) =>
  hrRequest<{ exceptionId: string; status: 'APPROVED' | 'REJECTED' }>(
    `${base}/approvals/attendance/${encodeURIComponent(exceptionId)}/decision`,
    { accessToken, method: 'POST', body: { ...body } },
  );

/** The stamped photo, as a blob (it needs the caller's token, so an <img src> cannot fetch it). */
export async function fetchAttendancePhoto(accessToken: string, attendanceId: string, event: AttendanceEvent): Promise<Blob> {
  const side = event === 'CHECK_IN' ? 'in' : 'out';
  const response = await hrRawRequest(`${base}/attendance/${encodeURIComponent(attendanceId)}/photo/${side}`, { accessToken });
  return response.blob();
}

// ---- leave -----------------------------------------------------------------------------------

export type LeaveApproverRule = 'AUTO' | 'CEO' | 'PM' | 'TL_PM' | 'HR';

export interface LeaveApproval {
  requestId: string;
  leaveType: 'SICK' | 'EARNED' | 'UNPAID' | string;
  /** YYYY-MM-DD */
  fromDate: string;
  toDate: string;
  halfDay: boolean;
  days: number;
  reason: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | string;
  approverRule: LeaveApproverRule | string;
  submittedAt: string;
  decidedAt: string | null;
  decisionNote: string | null;
  employeeId: string;
  employeeName: string;
  employeeCode: string;
}

export const listLeaveApprovals = async (accessToken: string): Promise<LeaveApproval[]> =>
  (await hrRequest<Items<LeaveApproval>>(`${base}/approvals/leave`, { accessToken })).items;

export const decideLeave = (accessToken: string, requestId: string, body: DecisionBody<'APPROVE' | 'REJECT'>) =>
  hrRequest<{ requestId: string; status: 'APPROVED' | 'REJECTED' }>(
    `${base}/approvals/leave/${encodeURIComponent(requestId)}/decision`,
    { accessToken, method: 'POST', body: { ...body } },
  );

// ---- reimbursement claims --------------------------------------------------------------------

export type ClaimStage = 'TL_PM' | 'HR' | 'FINANCE';

export interface ClaimApproval {
  claimId: string;
  category: string;
  categoryLabel: string;
  /** YYYY-MM-DD */
  expenseDate: string;
  amount: number | null;
  distanceKm: number | null;
  description: string | null;
  status: string;
  /** Plain-words label of who the claim is waiting for, e.g. "Finance". */
  waitingFor: string | null;
  stage: ClaimStage | string | null;
  stagePlan: Array<ClaimStage | string>;
  /** Older than the allowed period: needs a Finance exception approval as well. */
  stale: boolean;
  /** YYYY-MM */
  payrollMonth: string;
  payrollRunId: string | null;
  submittedAt: string;
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  monthTravelTotal: number;
}

export interface ClaimReceipt {
  receiptId: string;
  name: string | null;
  contentType: string;
  sizeBytes: number;
}

export interface ClaimDetail {
  claimId: string;
  receipts: ClaimReceipt[];
}

export const listClaimApprovals = async (accessToken: string): Promise<ClaimApproval[]> =>
  (await hrRequest<Items<ClaimApproval>>(`${base}/approvals/claims`, { accessToken })).items;

export const decideClaim = (accessToken: string, claimId: string, body: DecisionBody) =>
  hrRequest<{ claimId: string; status: string }>(`${base}/approvals/claims/${encodeURIComponent(claimId)}/decision`, {
    accessToken,
    method: 'POST',
    body: { ...body },
  });

/** The claim's receipt list (the approvals list does not carry it). */
export const getClaimDetail = (accessToken: string, claimId: string) =>
  hrRequest<ClaimDetail>(`${base}/claims/${encodeURIComponent(claimId)}`, { accessToken });

export async function fetchClaimReceipt(accessToken: string, claimId: string, receiptId: string): Promise<Blob> {
  const response = await hrRawRequest(
    `${base}/claims/${encodeURIComponent(claimId)}/receipts/${encodeURIComponent(receiptId)}`,
    { accessToken },
  );
  return response.blob();
}
