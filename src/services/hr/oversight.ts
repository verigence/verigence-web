import { hrRequest } from './client';

/**
 * Approver oversight (HRMgmt /hr/v1/oversight/...): what is waiting with each Team Lead and
 * Project Manager, and since when. An Executive sees their projects; HR and the CEO see all.
 * Anyone else gets HTTP 403. Each call is made once, never retried.
 *
 * Deadline rule (server): anything raised in a week (Monday to Sunday, IST) must be decided by
 * 09:00 IST on the following Monday.
 */
const base = '/hr/v1';

export type OversightItemType = 'ATTENDANCE' | 'LEAVE' | 'CLAIM';

export interface PendingItem {
  type: OversightItemType;
  id: string;
  /** Attendance kind (e.g. LATE_CHECK_IN), leave type, or claim category code. */
  detail: string;
  /** yyyy-mm-dd */
  forDate: string;
  /** ISO timestamp */
  raisedAt: string;
  /** ISO timestamp */
  deadline: string;
  overdue: boolean;
  ageHours: number;
  employeeName: string;
  employeeCode: string;
}

export interface ApproverRole {
  project: string;
  role: string;
}

export interface ApproverOversight {
  userId: string;
  name: string;
  roles: ApproverRole[];
  pending: { ATTENDANCE: number; LEAVE: number; CLAIM: number; total: number };
  overdue: number;
  oldestRaisedAt: string | null;
  oldestAgeHours: number | null;
  decidedLast30Days: number;
  averageDecisionHours: number | null;
}

export interface ApproverOversightList {
  asOf: string;
  scope: 'ALL' | 'PROJECTS';
  items: ApproverOversight[];
  /** Items no Team Lead or Project Manager can decide. */
  withoutApprover: PendingItem[];
}

export interface ApproverPending {
  approver: string;
  items: PendingItem[];
}

export const getApproverOversight = (accessToken: string) =>
  hrRequest<ApproverOversightList>(`${base}/oversight/approvers`, { accessToken });

export const getApproverPending = (accessToken: string, userId: string, onlyOverdue = false) =>
  hrRequest<ApproverPending>(
    `${base}/oversight/approvers/${encodeURIComponent(userId)}/pending?only_overdue=${onlyOverdue ? 'true' : 'false'}`,
    { accessToken },
  );
