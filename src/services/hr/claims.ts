import { hrRawRequest, hrRequest } from './client';

/**
 * Reimbursement claims (HRMgmt /hr/v1/claims). Every call is made once with the caller's token;
 * nothing here retries. Money arrives from the service as JSON numbers: it is only ever shown, never
 * added up in the browser (the service decides every total and every limit).
 */

/** HR permission keys (hrmgmt/permissions.py). The service checks them again on every request. */
export const CLAIM_PERMISSION = {
  review: 'hr.claim.review',
  reviewFinance: 'hr.claim.review_finance',
  /** Held only by the CEO; the service lets the CEO see every claim, so the list-all screen does too. */
  payrollApprove: 'hr.payroll.approve',
} as const;

export const CLAIM_LIST_ALL_PERMISSIONS: readonly string[] = [
  CLAIM_PERMISSION.review,
  CLAIM_PERMISSION.reviewFinance,
  CLAIM_PERMISSION.payrollApprove,
];

/** Receipt limits from hrmgmt/receipts.py. */
export const MAX_RECEIPT_BYTES = 5 * 1024 * 1024;
export const MAX_RECEIPTS_PER_CLAIM = 5;
/** One claim may not exceed this many rupees (hrmgmt/claim_rules.py MAX_AMOUNT). */
export const MAX_CLAIM_AMOUNT = 100000;
export const MAX_DISTANCE_KM = 2000;
export const MAX_DESCRIPTION_LENGTH = 500;

export type ClaimStatus =
  | 'SUBMITTED'
  | 'CORRECTION_REQUESTED'
  | 'APPROVED'
  | 'HANDED_TO_PAYROLL'
  | 'PAID'
  | 'REJECTED'
  | 'CANCELLED';

export const CLAIM_STATUSES: readonly ClaimStatus[] = [
  'SUBMITTED',
  'CORRECTION_REQUESTED',
  'APPROVED',
  'HANDED_TO_PAYROLL',
  'PAID',
  'REJECTED',
  'CANCELLED',
];

export type ClaimStage = 'TL_PM' | 'HR' | 'FINANCE';
export type ClaimKind = 'TRAVEL' | 'MEALS';

export interface ClaimCategory {
  code: string;
  label: string;
  kind: ClaimKind;
  receiptRequired: boolean;
  perKm: boolean;
  /** Only for per-km categories; 0 means HR has not set the rate yet. */
  ratePerKm: number | null;
  taxable: boolean;
}

export interface ClaimSummary {
  /** The expense month this summary is for, YYYY-MM. */
  month: string;
  travelUsed: number;
  travelLimit: number;
  travelRemaining: number;
  financeThreshold: number;
  mealsUsed: number;
  mealsLimit: number | null;
  cutoffDay: number;
  staleAfterMonths: number;
  /** The payroll month a claim submitted today goes into, YYYY-MM. */
  nextPayrollMonth: string;
  /** Plain-words rules written by the service; shown as given. */
  rules: string[];
}

export interface Claim {
  claimId: string;
  category: string;
  categoryLabel: string;
  expenseDate: string;
  amount: number;
  distanceKm: number | null;
  description: string | null;
  status: ClaimStatus;
  waitingFor: string | null;
  stage: ClaimStage | null;
  stagePlan: ClaimStage[];
  stale: boolean;
  payrollMonth: string;
  payrollRunId: string | null;
  submittedAt: string;
}

/** Rows of the HR / Finance list-all screen carry who the claim belongs to. */
export interface ClaimWithPerson extends Claim {
  employeeId: string;
  employeeName: string;
  employeeCode: string;
}

export interface ClaimReceipt {
  receiptId: string;
  name: string | null;
  contentType: string;
  sizeBytes: number;
}

export interface ClaimHistoryEntry {
  at: string;
  event: string;
  stage: ClaimStage | null;
  note: string | null;
}

export interface ClaimDetail extends Claim {
  receipts: ClaimReceipt[];
  history: ClaimHistoryEntry[];
  /** Present when the claim is read with GET /claims/{id}; not on the submit/resubmit reply. */
  employeeId?: string;
  employeeName?: string;
  employeeCode?: string;
  isOwner?: boolean;
}

export interface ClaimInput {
  category: string;
  /** IST calendar date, YYYY-MM-DD. */
  expenseDate: string;
  /** Rupees as typed (at most two decimals). Left out for per-km categories. */
  amount?: string;
  /** Kilometres as typed. Only for per-km categories. */
  distanceKm?: string;
  description?: string;
  receipts: Blob[];
  /** Resubmit only: receipts already on the claim that the person removed. */
  removeReceiptIds?: string[];
}

const base = '/hr/v1/claims';
/** Photos can take a while on a slow mobile connection. */
const UPLOAD_TIMEOUT_MS = 90_000;

export const getClaimCategories = (token: string) =>
  hrRequest<{ items: ClaimCategory[] }>(`${base}/categories`, { accessToken: token }).then((r) => r.items);

export const getClaimSummary = (token: string, month?: string) => {
  const query = month ? `?${new URLSearchParams({ month }).toString()}` : '';
  return hrRequest<ClaimSummary>(`${base}/summary${query}`, { accessToken: token });
};

export const listMyClaims = (token: string) =>
  hrRequest<{ items: Claim[] }>(base, { accessToken: token }).then((r) => r.items);

export const listAllClaims = (token: string, params: { status?: ClaimStatus; month?: string }) => {
  const query = new URLSearchParams();
  if (params.status) query.set('status', params.status);
  if (params.month) query.set('month', params.month);
  const suffix = query.toString() ? `?${query.toString()}` : '';
  return hrRequest<{ items: ClaimWithPerson[] }>(`${base}/review${suffix}`, { accessToken: token }).then(
    (r) => r.items,
  );
};

export const getClaim = (token: string, claimId: string) =>
  hrRequest<ClaimDetail>(`${base}/${encodeURIComponent(claimId)}`, { accessToken: token });

/** The multipart body: no Content-Type header is set, so the browser adds the boundary. */
export function claimForm(input: ClaimInput): FormData {
  const form = new FormData();
  form.append('category', input.category);
  form.append('expense_date', input.expenseDate);
  if (input.amount !== undefined && input.amount !== '') form.append('amount', input.amount);
  if (input.distanceKm !== undefined && input.distanceKm !== '') form.append('distance_km', input.distanceKm);
  if (input.description?.trim()) form.append('description', input.description.trim());
  if (input.removeReceiptIds?.length) form.append('remove_receipts', input.removeReceiptIds.join(','));
  input.receipts.forEach((file, index) => {
    const name = file instanceof File && file.name ? file.name : `receipt-${index + 1}.jpg`;
    form.append('receipts', file, name);
  });
  return form;
}

export const submitClaim = (token: string, input: ClaimInput) =>
  hrRequest<ClaimDetail>(base, {
    accessToken: token,
    method: 'POST',
    body: claimForm({ ...input, removeReceiptIds: undefined }),
    timeoutMs: UPLOAD_TIMEOUT_MS,
  });

export const resubmitClaim = (token: string, claimId: string, input: ClaimInput) =>
  hrRequest<ClaimDetail>(`${base}/${encodeURIComponent(claimId)}/resubmit`, {
    accessToken: token,
    method: 'POST',
    body: claimForm(input),
    timeoutMs: UPLOAD_TIMEOUT_MS,
  });

export const cancelClaim = (token: string, claimId: string) =>
  hrRequest<{ claimId: string; status: ClaimStatus }>(`${base}/${encodeURIComponent(claimId)}/cancel`, {
    accessToken: token,
    method: 'POST',
  });

/** Receipts are only served with the caller's token, so they are fetched as blobs. */
export async function fetchClaimReceipt(token: string, claimId: string, receiptId: string): Promise<Blob> {
  const response = await hrRawRequest(
    `${base}/${encodeURIComponent(claimId)}/receipts/${encodeURIComponent(receiptId)}`,
    { accessToken: token },
  );
  return response.blob();
}
