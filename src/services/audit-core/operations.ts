import type {
  CrmInteraction,
  DailyOpsRun,
  DealerSummary,
  EscalationSummary,
  EvidenceFact,
  EvidenceSummary,
  FindingSummary,
  OutletSummary,
  ProjectSummary,
  WorkTask,
} from '../../domain/models';
import { auditCoreRequest } from './client';

export interface CoreCustomer {
  customerId: string;
  dealerId: string;
  outletId: string;
  customerTypeCode: string;
  displayName: string;
  mobileLast4?: string | null;
  emailReference?: string | null;
  externalCustomerRef?: string | null;
  status: string;
}

export interface CoreJourney {
  journeyId: string;
  tenantId: string;
  customerId: string;
  dealerId: string;
  outletId: string;
  journeyReference?: string | null;
  observedStatusCode?: string | null;
  observedStatusSource?: string | null;
  auditState: string;
  auditOutcome: string;
  actualDeliveryStatusCode?: string | null;
  versionNo: number;
}

export interface CoreEvidenceDetail extends EvidenceSummary {
  facts: EvidenceFact[];
}

export interface CoreReviewDecision {
  reviewDecisionId: string;
  decision: string;
  reviewerActorId: string;
  reviewerRoleCode?: string | null;
  remarks?: string | null;
  decidedAtUtc: string;
}

export interface CoreAuditState {
  journeyId: string;
  auditState: string;
  auditOutcome: string;
  auditStartedAtUtc?: string | null;
  pcSubmittedAtUtc?: string | null;
  reviewCompletedAtUtc?: string | null;
  versionNo: number;
}

function auth(accessToken?: string) {
  return accessToken ? { accessToken } : {};
}

export function getProject(tenantId: string, accessToken?: string) {
  return auditCoreRequest<ProjectSummary>(`/v1/tenants/${tenantId}/project`, auth(accessToken));
}

export function patchProject(tenantId: string, projectName: string, accessToken?: string) {
  return auditCoreRequest<ProjectSummary>(`/v1/tenants/${tenantId}/project`, {
    method: 'PATCH', body: JSON.stringify({ projectName }), ...auth(accessToken),
  });
}

export function listDealers(tenantId: string, accessToken?: string) {
  return auditCoreRequest<DealerSummary[]>(`/v1/tenants/${tenantId}/dealers`, auth(accessToken));
}

export function createDealer(
  tenantId: string,
  payload: { dealerCode: string; dealerName: string; legalName?: string },
  accessToken?: string,
) {
  return auditCoreRequest<DealerSummary>(`/v1/tenants/${tenantId}/dealers`, {
    method: 'POST', body: JSON.stringify(payload), ...auth(accessToken),
  });
}

export function listOutlets(tenantId: string, dealerId: string, accessToken?: string) {
  return auditCoreRequest<OutletSummary[]>(
    `/v1/tenants/${tenantId}/dealers/${dealerId}/outlets`, auth(accessToken),
  );
}

export function createOutlet(
  tenantId: string,
  dealerId: string,
  payload: {
    outletCode: string;
    outletName: string;
    outletClassification: 'ONSITE' | 'SATELLITE';
    city?: string;
    stateRegion?: string;
    postalCode?: string;
  },
  accessToken?: string,
) {
  return auditCoreRequest<OutletSummary>(`/v1/tenants/${tenantId}/dealers/${dealerId}/outlets`, {
    method: 'POST', body: JSON.stringify(payload), ...auth(accessToken),
  });
}

export function listCustomers(tenantId: string, outletId: string, accessToken?: string) {
  return auditCoreRequest<CoreCustomer[]>(
    `/v1/tenants/${tenantId}/outlets/${outletId}/customers`, auth(accessToken),
  );
}

export function getCustomer(tenantId: string, customerId: string, accessToken?: string) {
  return auditCoreRequest<CoreCustomer>(
    `/v1/tenants/${tenantId}/customers/${customerId}`, auth(accessToken),
  );
}

export function listJourneys(tenantId: string, customerId: string, accessToken?: string) {
  return auditCoreRequest<CoreJourney[]>(
    `/v1/tenants/${tenantId}/customers/${customerId}/journeys`, auth(accessToken),
  );
}

export function getJourney(tenantId: string, journeyId: string, accessToken?: string) {
  return auditCoreRequest<CoreJourney>(
    `/v1/tenants/${tenantId}/journeys/${journeyId}`, auth(accessToken),
  );
}

export function getBooking(tenantId: string, journeyId: string, accessToken?: string) {
  return auditCoreRequest<Record<string, unknown>>(
    `/v1/tenants/${tenantId}/journeys/${journeyId}/booking`, auth(accessToken),
  );
}

export function getCommercials(tenantId: string, journeyId: string, accessToken?: string) {
  return auditCoreRequest<Record<string, unknown>>(
    `/v1/tenants/${tenantId}/journeys/${journeyId}/commercials`, auth(accessToken),
  );
}

export function listPayments(tenantId: string, journeyId: string, accessToken?: string) {
  return auditCoreRequest<Record<string, unknown>[]>(
    `/v1/tenants/${tenantId}/journeys/${journeyId}/payments`, auth(accessToken),
  );
}

export function getFinance(tenantId: string, journeyId: string, accessToken?: string) {
  return auditCoreRequest<Record<string, unknown>>(
    `/v1/tenants/${tenantId}/journeys/${journeyId}/finance`, auth(accessToken),
  );
}

export function getInsurance(tenantId: string, journeyId: string, accessToken?: string) {
  return auditCoreRequest<Record<string, unknown>>(
    `/v1/tenants/${tenantId}/journeys/${journeyId}/insurance`, auth(accessToken),
  );
}

export function getTradeIn(tenantId: string, journeyId: string, accessToken?: string) {
  return auditCoreRequest<Record<string, unknown>>(
    `/v1/tenants/${tenantId}/journeys/${journeyId}/trade-in`, auth(accessToken),
  );
}

export function getVehicle(tenantId: string, journeyId: string, accessToken?: string) {
  return auditCoreRequest<Record<string, unknown>>(
    `/v1/tenants/${tenantId}/journeys/${journeyId}/vehicle`, auth(accessToken),
  );
}

export function getRegistration(tenantId: string, journeyId: string, accessToken?: string) {
  return auditCoreRequest<Record<string, unknown>>(
    `/v1/tenants/${tenantId}/journeys/${journeyId}/registration`, auth(accessToken),
  );
}

export function getDelivery(tenantId: string, journeyId: string, accessToken?: string) {
  return auditCoreRequest<Record<string, unknown>>(
    `/v1/tenants/${tenantId}/journeys/${journeyId}/delivery`, auth(accessToken),
  );
}

export function listEvidence(tenantId: string, journeyId: string, accessToken?: string) {
  return auditCoreRequest<EvidenceSummary[]>(
    `/v1/tenants/${tenantId}/journeys/${journeyId}/evidence`, auth(accessToken),
  );
}

export function getEvidence(
  tenantId: string, journeyId: string, evidenceId: string, accessToken?: string,
) {
  return auditCoreRequest<CoreEvidenceDetail>(
    `/v1/tenants/${tenantId}/journeys/${journeyId}/evidence/${evidenceId}`, auth(accessToken),
  );
}

export function refreshEvidence(
  tenantId: string, journeyId: string, evidenceId: string, accessToken?: string,
) {
  return auditCoreRequest<CoreEvidenceDetail>(
    `/v1/tenants/${tenantId}/journeys/${journeyId}/evidence/${evidenceId}/refresh`,
    { method: 'POST', ...auth(accessToken) },
  );
}

export function uploadEvidence(
  tenantId: string,
  journeyId: string,
  file: File,
  evidencePurpose: string,
  documentTypeKey?: string,
  requirementKey?: string,
  accessToken?: string,
) {
  const form = new FormData();
  form.set('file', file);
  form.set('evidencePurpose', evidencePurpose);
  if (documentTypeKey) form.set('documentTypeKey', documentTypeKey);
  if (requirementKey) form.set('requirementKey', requirementKey);
  return auditCoreRequest<EvidenceSummary>(`/v1/tenants/${tenantId}/journeys/${journeyId}/evidence`, {
    method: 'POST',
    body: form,
    headers: { 'Idempotency-Key': crypto.randomUUID() },
    ...auth(accessToken),
  });
}

export function listFindings(tenantId: string, journeyId: string, accessToken?: string) {
  return auditCoreRequest<FindingSummary[]>(
    `/v1/tenants/${tenantId}/journeys/${journeyId}/findings`, auth(accessToken),
  );
}

export function createFinding(
  tenantId: string,
  journeyId: string,
  payload: {
    severity: string;
    title: string;
    description?: string;
    expectedSummary?: string;
    observedSummary?: string;
    evidence?: Array<{ evidenceId: string; evidenceFactId?: string; linkagePurpose?: string }>;
  },
  accessToken?: string,
) {
  return auditCoreRequest<FindingSummary>(`/v1/tenants/${tenantId}/journeys/${journeyId}/findings`, {
    method: 'POST', body: JSON.stringify(payload), ...auth(accessToken),
  });
}

export function getAuditState(tenantId: string, journeyId: string, accessToken?: string) {
  return auditCoreRequest<CoreAuditState>(
    `/v1/tenants/${tenantId}/journeys/${journeyId}/audit`, auth(accessToken),
  );
}

export function startAudit(tenantId: string, journeyId: string, accessToken?: string) {
  return auditCoreRequest<CoreAuditState>(
    `/v1/tenants/${tenantId}/journeys/${journeyId}/audit/start`,
    { method: 'POST', ...auth(accessToken) },
  );
}

export function submitAudit(tenantId: string, journeyId: string, accessToken?: string) {
  return auditCoreRequest<CoreAuditState>(
    `/v1/tenants/${tenantId}/journeys/${journeyId}/audit/submit`,
    { method: 'POST', headers: { 'Idempotency-Key': crypto.randomUUID() }, ...auth(accessToken) },
  );
}

export function listReviewDecisions(tenantId: string, journeyId: string, accessToken?: string) {
  return auditCoreRequest<CoreReviewDecision[]>(
    `/v1/tenants/${tenantId}/journeys/${journeyId}/review-decisions`, auth(accessToken),
  );
}

export function createReviewDecision(
  tenantId: string,
  journeyId: string,
  payload: { decision: 'BREACH' | 'NO_BREACH' | 'SEND_BACK'; reviewerRoleCode: 'TL' | 'PM'; remarks?: string },
  accessToken?: string,
) {
  return auditCoreRequest<CoreReviewDecision>(
    `/v1/tenants/${tenantId}/journeys/${journeyId}/review-decisions`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: { 'Idempotency-Key': crypto.randomUUID() },
      ...auth(accessToken),
    },
  );
}

export function listTasks(tenantId: string, accessToken?: string) {
  return auditCoreRequest<WorkTask[]>(`/v1/tenants/${tenantId}/tasks`, auth(accessToken));
}

export function taskAction(
  tenantId: string,
  taskId: string,
  action: 'claim' | 'start' | 'complete',
  accessToken?: string,
) {
  const headers = action === 'complete' ? { 'Idempotency-Key': crypto.randomUUID() } : undefined;
  return auditCoreRequest<WorkTask>(`/v1/tenants/${tenantId}/tasks/${taskId}/${action}`, {
    method: 'POST', headers, ...auth(accessToken),
  });
}

export function listDailyOps(tenantId: string, outletId: string, accessToken?: string) {
  return auditCoreRequest<DailyOpsRun[]>(
    `/v1/tenants/${tenantId}/outlets/${outletId}/daily-ops`, auth(accessToken),
  );
}

export function createDailyOps(tenantId: string, outletId: string, businessDate: string, accessToken?: string) {
  return auditCoreRequest<DailyOpsRun>(`/v1/tenants/${tenantId}/outlets/${outletId}/daily-ops`, {
    method: 'POST', body: JSON.stringify({ businessDate }), ...auth(accessToken),
  });
}

export function completeDailyOps(tenantId: string, runId: string, accessToken?: string) {
  return auditCoreRequest<DailyOpsRun>(`/v1/tenants/${tenantId}/daily-ops/${runId}/complete`, {
    method: 'POST', headers: { 'Idempotency-Key': crypto.randomUUID() }, ...auth(accessToken),
  });
}

export function listCrmInteractions(tenantId: string, journeyId: string, accessToken?: string) {
  return auditCoreRequest<CrmInteraction[]>(
    `/v1/tenants/${tenantId}/journeys/${journeyId}/crm-interactions`, auth(accessToken),
  );
}

export function createCrmInteraction(
  tenantId: string,
  journeyId: string,
  payload: { interactionType: string; notes?: string; assignedActorId?: string },
  accessToken?: string,
) {
  return auditCoreRequest<CrmInteraction>(
    `/v1/tenants/${tenantId}/journeys/${journeyId}/crm-interactions`,
    {
      method: 'POST', body: JSON.stringify(payload),
      headers: { 'Idempotency-Key': crypto.randomUUID() }, ...auth(accessToken),
    },
  );
}

export function listEscalations(tenantId: string, journeyId: string, accessToken?: string) {
  return auditCoreRequest<EscalationSummary[]>(
    `/v1/tenants/${tenantId}/journeys/${journeyId}/escalations`, auth(accessToken),
  );
}

export function createEscalation(
  tenantId: string,
  journeyId: string,
  payload: { escalationType: string; summary: string; severity?: string; assignedRoleCode?: string; details?: string },
  accessToken?: string,
) {
  return auditCoreRequest<EscalationSummary>(
    `/v1/tenants/${tenantId}/journeys/${journeyId}/escalations`,
    {
      method: 'POST', body: JSON.stringify(payload),
      headers: { 'Idempotency-Key': crypto.randomUUID() }, ...auth(accessToken),
    },
  );
}
