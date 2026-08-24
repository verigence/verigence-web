import { auditCoreRequest } from './client';

function auth(accessToken?: string) {
  return accessToken ? { accessToken } : {};
}

export type FormMasterKey =
  | 'DOCUMENT_REQUIREMENT_PROFILE'
  | 'AUDIT_CONTROL'
  | 'PROJECT_POLICY'
  | 'BUSINESS_STATUS_CODES';

export interface FormMasterState {
  masterKey: FormMasterKey;
  lifecycleStatus?: string | null;
  versionId?: string | null;
  versionNo?: number | null;
  data?: Record<string, unknown> | Array<Record<string, unknown>> | null;
}

export interface DocumentRequirementItemInput {
  requirementKey: string;
  documentTypeKey: string;
  processArea: string;
  requirementLevel: 'REQUIRED' | 'CONDITIONAL' | 'OPTIONAL';
  sortOrder?: number;
}

export interface DocumentRequirementProfileInput {
  profileCode: string;
  profileName: string;
  effectiveFrom: string;
  effectiveTo?: string | null;
  items: DocumentRequirementItemInput[];
}

export interface AuditControlInput {
  controlKey: string;
  controlName: string;
  processArea: string;
  effectiveFrom: string;
  effectiveTo?: string | null;
  evaluatorKey: string;
  executionMode: 'ON_SAVE' | 'NIGHTLY' | 'ON_DEMAND';
  defaultSeverity: string;
}

export interface ProjectPolicyInput {
  effectiveFrom: string;
  effectiveTo?: string | null;
  satelliteMonthlyVolumeThreshold?: number | null;
  policySettings: Record<string, unknown>;
}

export interface BusinessStatusCodeInput {
  domainKey: string;
  statusCode: string;
  statusLabel: string;
  description?: string | null;
  effectiveFrom?: string | null;
  effectiveTo?: string | null;
  isActive: boolean;
}

export function getFormMaster(tenantId: string, masterKey: FormMasterKey, accessToken?: string) {
  return auditCoreRequest<FormMasterState>(
    `/v1/tenants/${tenantId}/project-master-forms/${masterKey}`,
    auth(accessToken),
  );
}

export function saveDocumentRequirementProfile(
  tenantId: string,
  payload: DocumentRequirementProfileInput,
  accessToken?: string,
) {
  return auditCoreRequest<FormMasterState>(
    `/v1/tenants/${tenantId}/project-master-forms/DOCUMENT_REQUIREMENT_PROFILE`,
    { method: 'PUT', body: JSON.stringify(payload), ...auth(accessToken) },
  );
}

export function saveAuditControl(tenantId: string, payload: AuditControlInput, accessToken?: string) {
  return auditCoreRequest<FormMasterState>(
    `/v1/tenants/${tenantId}/project-master-forms/AUDIT_CONTROL`,
    { method: 'PUT', body: JSON.stringify(payload), ...auth(accessToken) },
  );
}

export function saveProjectPolicy(tenantId: string, payload: ProjectPolicyInput, accessToken?: string) {
  return auditCoreRequest<FormMasterState>(
    `/v1/tenants/${tenantId}/project-master-forms/PROJECT_POLICY`,
    { method: 'PUT', body: JSON.stringify(payload), ...auth(accessToken) },
  );
}

export function saveBusinessStatusCode(
  tenantId: string,
  payload: BusinessStatusCodeInput,
  accessToken?: string,
) {
  return auditCoreRequest<FormMasterState>(
    `/v1/tenants/${tenantId}/project-master-forms/BUSINESS_STATUS_CODES`,
    { method: 'PUT', body: JSON.stringify(payload), ...auth(accessToken) },
  );
}
