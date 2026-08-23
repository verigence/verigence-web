import { auditCoreRequest } from './client';
import { newIdempotencyKey } from './uc03Booking';

export type DeliveryAuditState = 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETE';
export type DeliveryAuditStatus = 'NOT_EVALUATED' | 'NO_FLAGS' | 'FLAGS_RAISED';
export type DeliveryDocumentAnswer = 'YES' | 'NO' | 'NA' | 'UNANSWERED';

export interface DeliveryDocumentView {
  requirementKey: string;
  documentTypeKey: string;
  requirementLevel: 'REQUIRED' | 'CONDITIONAL' | 'OPTIONAL';
  requirementStatus: string;
  applicabilityState: 'APPLICABLE' | 'NOT_APPLICABLE' | 'UNRESOLVED';
  applicabilityReason: string | null;
  answer: DeliveryDocumentAnswer;
  evidenceId: string | null;
  remarks: string | null;
}

export interface DeliveryFlagView {
  flagId: string;
  ruleKey: string | null;
  type: string;
  severity: string;
  status: string;
  title: string;
  description: string | null;
  blockingCompletion: boolean;
  createdAtUtc: string;
}

export interface DeliveryPaymentView {
  paymentId: string;
  paymentAtUtc: string;
  amount: string;
  currencyCode: string;
  paymentMethodCode: string;
  paymentReference: string | null;
  verificationResult: string | null;
  verificationNotes: string | null;
  verificationAtUtc: string | null;
}

export interface DeliveryWorkspace {
  journeyId: string;
  operatingRole: string;
  delivery: {
    businessStatus: string;
    auditState: DeliveryAuditState;
    auditStatus: DeliveryAuditStatus;
    aggregateVersion: number;
    startedAtUtc: string | null;
    completedAtUtc: string | null;
  };
  booking: {
    businessStatus: string | null;
    closureDisposition: string | null;
    incompleteAtDelivery: boolean;
    warning: string | null;
  };
  intimation: { answer: 'YES' | 'NO' | 'UNANSWERED'; reason: string | null };
  vehicle: {
    expectedVin: string | null;
    expectedChassisNumber: string | null;
    observedVin: string | null;
    observedChassisNumber: string | null;
    observedSourceEvidenceId: string | null;
    reconciliationStatus: 'NOT_EVALUATED' | 'MATCH' | 'MISMATCH' | 'REVIEW_REQUIRED';
    evaluatorKey: string | null;
    evaluatedAtUtc: string | null;
  };
  documents: DeliveryDocumentView[];
  payments: DeliveryPaymentView[];
  flags: DeliveryFlagView[];
}

export interface DeliveryCommandResult {
  journeyId: string;
  businessStatus: string;
  auditState: DeliveryAuditState;
  auditStatus: DeliveryAuditStatus;
  aggregateVersion: number;
  raisedFlagIds: string[];
}

function token(accessToken?: string): string {
  const value = accessToken?.trim();
  if (!value) throw new Error('A Security human access token is required.');
  return value;
}

function base(tenantId: string, journeyId: string): string {
  return `/v1/tenants/${encodeURIComponent(tenantId)}/journeys/${encodeURIComponent(journeyId)}`;
}

function commandHeaders(prefix: string, version: number): HeadersInit {
  return {
    'Idempotency-Key': newIdempotencyKey(prefix),
    'If-Match': `"${version}"`,
  };
}

function stableDeliveryUploadKey(journeyId: string, requirementKey: string, file: File): string {
  const fingerprint = `${journeyId}:${requirementKey}:${file.name}:${file.size}:${file.lastModified}`;
  const storageKey = `uc03-delivery-upload:${fingerprint}`;
  const existing = sessionStorage.getItem(storageKey);
  if (existing) return existing;
  const created = newIdempotencyKey('uc03-delivery-upload');
  sessionStorage.setItem(storageKey, created);
  return created;
}

export async function getDeliveryWorkspace(
  tenantId: string,
  journeyId: string,
  accessToken?: string,
): Promise<DeliveryWorkspace> {
  return auditCoreRequest<DeliveryWorkspace>(`${base(tenantId, journeyId)}/delivery/workspace`, {
    accessToken: token(accessToken),
    cache: 'no-store',
  });
}

export async function startDelivery(
  tenantId: string,
  journeyId: string,
  accessToken?: string,
): Promise<DeliveryCommandResult> {
  return auditCoreRequest(`${base(tenantId, journeyId)}/delivery/start`, {
    method: 'POST',
    accessToken: token(accessToken),
    headers: commandHeaders('uc03-delivery-start', 0),
  });
}

export async function recordDeliveryIntimation(
  tenantId: string,
  journeyId: string,
  answer: 'YES' | 'NO',
  version: number,
  accessToken?: string,
  reason?: string,
): Promise<{ aggregateVersion: number; flagId: string | null }> {
  return auditCoreRequest(`${base(tenantId, journeyId)}/delivery/intimation`, {
    method: 'PUT',
    accessToken: token(accessToken),
    headers: commandHeaders('uc03-delivery-intimation', version),
    body: JSON.stringify({ answer, reason: reason?.trim() || null }),
  });
}

export async function assessDeliveryDocument(
  tenantId: string,
  journeyId: string,
  requirementKey: string,
  answer: DeliveryDocumentAnswer,
  version: number,
  accessToken?: string,
  evidenceId?: string | null,
  remarks?: string,
): Promise<{ aggregateVersion: number; flagId: string | null }> {
  return auditCoreRequest(
    `${base(tenantId, journeyId)}/stages/DELIVERY/documents/${encodeURIComponent(requirementKey)}`,
    {
      method: 'PUT',
      accessToken: token(accessToken),
      headers: commandHeaders(`uc03-delivery-doc-${requirementKey.toLowerCase()}`, version),
      body: JSON.stringify({ answer, evidenceId: evidenceId || null, remarks: remarks?.trim() || null }),
    },
  );
}

export async function uploadDeliveryEvidence(
  tenantId: string,
  journeyId: string,
  document: DeliveryDocumentView,
  file: File,
  accessToken?: string,
): Promise<{ evidenceId: string; processingStatus: string }> {
  const form = new FormData();
  form.append('file', file);
  form.append('evidencePurpose', `UC03_DELIVERY:${document.requirementKey}`);
  form.append('requirementKey', document.requirementKey);
  form.append('documentTypeKey', document.documentTypeKey);
  return auditCoreRequest(`${base(tenantId, journeyId)}/evidence`, {
    method: 'POST',
    accessToken: token(accessToken),
    headers: {
      'Idempotency-Key': stableDeliveryUploadKey(journeyId, document.requirementKey, file),
    },
    body: form,
  });
}

export async function recordDeliveryVehicleObservation(
  tenantId: string,
  journeyId: string,
  version: number,
  payload: { vin?: string; chassisNumber?: string; sourceEvidenceId?: string | null },
  accessToken?: string,
): Promise<{ aggregateVersion: number; reconciliationStatus: string; flagId: string | null }> {
  return auditCoreRequest(`${base(tenantId, journeyId)}/delivery/vehicle-observation`, {
    method: 'PUT',
    accessToken: token(accessToken),
    headers: commandHeaders('uc03-delivery-vehicle', version),
    body: JSON.stringify({
      vin: payload.vin?.trim() || null,
      chassisNumber: payload.chassisNumber?.trim() || null,
      sourceEvidenceId: payload.sourceEvidenceId || null,
    }),
  });
}

export async function completeDelivery(
  tenantId: string,
  journeyId: string,
  version: number,
  accessToken?: string,
): Promise<DeliveryCommandResult> {
  return auditCoreRequest(`${base(tenantId, journeyId)}/delivery/complete`, {
    method: 'POST',
    accessToken: token(accessToken),
    headers: commandHeaders('uc03-delivery-complete', version),
  });
}
