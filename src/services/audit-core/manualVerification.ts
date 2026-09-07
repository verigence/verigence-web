import { auditCoreRequest } from './client';

function auth(accessToken?: string) {
  return accessToken ? { accessToken } : {};
}

export interface ManualVerificationField {
  extractedFieldId: string;
  fieldKey: string;
  canonicalFieldId: string | null;
  extractedValue: unknown;
  effectiveValue: unknown;
  confidence: number | null;
  sourceFactRef: string | null;
  sourceFactVersion: number;
}

export interface ManualVerificationItem {
  findingId: string;
  stageCode: 'BOOKING' | 'DELIVERY';
  diDocumentId: string;
  documentLabel: string;
  severity: string;
  ownerRoleCode: string | null;
  slaDueAtUtc: string | null;
  createdAtUtc: string;
  fields: ManualVerificationField[];
}

export interface ManualVerificationView {
  journeyId: string;
  items: ManualVerificationItem[];
}

export interface FieldDecision {
  extractedFieldId: string;
  action: 'CONFIRM' | 'CORRECT';
  effectiveValue?: unknown;
}

export interface ResolveManualVerificationResponse {
  findingId: string;
  findingStatus: string;
  fieldsVerified: number;
  stageManualVerificationOpen: number;
}

export function isManualVerificationRule(ruleKey: string | null | undefined): boolean {
  return Boolean(ruleKey && ruleKey.startsWith('MANUAL_VERIFICATION:'));
}

export function getManualVerification(
  tenantId: string,
  journeyId: string,
  accessToken?: string,
) {
  return auditCoreRequest<ManualVerificationView>(
    `/v1/tenants/${encodeURIComponent(tenantId)}/journeys/${journeyId}/manual-verification`,
    auth(accessToken),
  );
}

export function resolveManualVerification(
  tenantId: string,
  journeyId: string,
  findingId: string,
  decisions: FieldDecision[],
  accessToken?: string,
) {
  return auditCoreRequest<ResolveManualVerificationResponse>(
    `/v1/tenants/${encodeURIComponent(tenantId)}/journeys/${journeyId}/manual-verification/${findingId}/resolve`,
    {
      method: 'POST',
      body: JSON.stringify({ decisions }),
      ...auth(accessToken),
    },
  );
}
