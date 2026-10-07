import type {
  DailyOpsRun,
  WorkTask,
} from '../../domain/models';
import { auditCoreRequest } from './client';


function auth(accessToken?: string) {
  return accessToken ? { accessToken } : {};
}

export function getFinance(tenantId: string, journeyId: string, accessToken?: string) {
  return auditCoreRequest<Record<string, unknown>>(
    `/v1/tenants/${tenantId}/journeys/${journeyId}/finance`, auth(accessToken),
  );
}

export interface LoanDisbursementCandidate {
  paymentId: string;
  amount: string;
  paymentAtUtc: string | null;
  paymentMethodCode: string | null;
  bankName: string | null;
  remarks: string | null;
  paymentReference: string | null;
}

// The exact list uc03_finance_disbursement_resolution.py's own automatic
// resolver considers -- every payment after the minimum booking amount,
// restricted to modes an institutional loan disbursement could actually
// use (never Cash/UPI/Card/QR). Used both by the Task Queue's inline
// picker and the standalone Journey Documents correction, so a PC always
// sees exactly what the system itself already tried.
export function getLoanDisbursementCandidates(tenantId: string, journeyId: string, accessToken?: string) {
  return auditCoreRequest<LoanDisbursementCandidate[]>(
    `/v1/tenants/${tenantId}/journeys/${journeyId}/finance/loan-disbursement-candidates`, auth(accessToken),
  );
}

// Standalone correction path (no Task Queue item involved) -- same write,
// same TL notice, same candidate validation as confirming a
// FINANCE_DISBURSEMENT_REVIEW task (taskAction below).
export function putLoanDisbursement(
  tenantId: string, journeyId: string, paymentId: string, accessToken?: string,
) {
  return auditCoreRequest<Record<string, unknown>>(
    `/v1/tenants/${tenantId}/journeys/${journeyId}/finance/loan-disbursement`,
    { method: 'PUT', body: JSON.stringify({ paymentId }), ...auth(accessToken) },
  );
}

export function getInsurance(tenantId: string, journeyId: string, accessToken?: string) {
  return auditCoreRequest<Record<string, unknown>>(
    `/v1/tenants/${tenantId}/journeys/${journeyId}/insurance`, auth(accessToken),
  );
}

export function taskAction(
  tenantId: string,
  taskId: string,
  action: 'claim' | 'start' | 'complete',
  accessToken?: string,
  // PC_VERIFY_UNRECOGNIZED_DOCUMENT: 'CORRECT' (dismiss) or 'INCORRECT'
  // (soft-deletes the document). WRONG_DOCUMENT_REVIEW reuses the same
  // vocabulary: 'CORRECT' (false match, release the hold) or 'INCORRECT'
  // (genuinely the wrong document, void it and ask for a reupload).
  // Required by the backend for these two task types, ignored (and
  // omitted) for every other completion.
  outcome?: 'CORRECT' | 'INCORRECT',
  // FINANCE_DISBURSEMENT_REVIEW: the payment_id a PC picked from
  // getLoanDisbursementCandidates as the actual loan disbursement.
  // Required by the backend for that task type, ignored for every other.
  paymentId?: string,
) {
  const headers = action === 'complete' ? { 'Idempotency-Key': crypto.randomUUID() } : undefined;
  const body = outcome || paymentId ? JSON.stringify({ outcome, paymentId }) : undefined;
  return auditCoreRequest<WorkTask>(`/v1/tenants/${tenantId}/tasks/${taskId}/${action}`, {
    method: 'POST',
    headers,
    body,
    ...auth(accessToken),
  });
}

export function listDailyOps(tenantId: string, outletId: string, accessToken?: string) {
  return auditCoreRequest<DailyOpsRun[]>(
    `/v1/tenants/${tenantId}/outlets/${outletId}/daily-ops`, auth(accessToken),
  );
}
