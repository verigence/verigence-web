import { auditCoreRawRequest, auditCoreRequest } from './client';

function auth(accessToken?: string) {
  return accessToken ? { accessToken } : {};
}

function idempotencyHeaders(key: string): HeadersInit {
  return { 'Idempotency-Key': key };
}

export interface Uc02ProjectSegment {
  segmentId: string;
  segmentCode: string;
  segmentName: string;
}

export interface Uc02Project {
  tenantId: string;
  projectCode: string;
  projectName: string;
  oemId: string;
  productCategoryId?: string | null;
  segments: Uc02ProjectSegment[];
  effectiveStartDate: string;
  effectiveEndDate?: string | null;
  timezoneName: string;
  regionCode?: string | null;
  projectStatus: string;
  versionNo: number;
  createdAtUtc: string;
  updatedAtUtc: string;
}

export interface ProjectSelection {
  tenantId: string;
  projectCode: string;
  projectName: string;
  projectStatus: string;
  securityTenantStatus: string;
}

export interface ProjectCreateInput {
  projectName: string;
  oemId: string;
  segmentIds: string[];
  effectiveStartDate: string;
  effectiveEndDate?: string | null;
  timezoneName: string;
  regionCode?: string | null;
}

/* Project creation is synchronous in the current Audit Core contract. A successful
 * response is already fully provisioned across Security, Audit Core and DI. */
export interface ProjectProvisioningResult {
  operationId: string;
  tenantId: string;
  projectName: string;
  projectStatus: string;
  provisioningStatus: 'READY';
  currentStep: 'COMPLETE';
  errorCode?: null;
  errorMessage?: null;
}

export interface DealerAdmin {
  dealerId: string;
  dealerCode: string;
  dealerName: string;
  legalName?: string | null;
  status: string;
  versionNo: number;
}

export interface OutletAdmin {
  outletId: string;
  dealerId: string;
  outletCode: string;
  outletName: string;
  outletClassification: 'ONSITE' | 'SATELLITE' | string;
  addressText?: string | null;
  city?: string | null;
  stateRegion?: string | null;
  postalCode?: string | null;
  googlePlaceId?: string | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
  monthlyVehicleVolume?: number | null;
  status: string;
  versionNo: number;
}

export interface RoleMappingCandidate {
  userId: string;
  displayName: string;
  primaryEmail?: string | null;
  status: string;
}

export type OperatingRole = 'PC' | 'TL' | 'PM' | 'CRM' | 'Executive';

export interface RoleMapping {
  userId: string;
  operatingRole: OperatingRole;
  dealerIds: string[];
  outletIds: string[];
}

export interface RoleMappingMutation {
  operationId: string;
  operationStatus: 'COMPLETED' | 'RECOVERY_REQUIRED';
  mapping?: RoleMapping | null;
}

export interface MasterDescriptor {
  ownerModule: 'AUDIT_CORE' | 'DI';
  masterKey: string;
  displayName: string;
  uploadMode: 'EXCEL' | 'FORM';
  administrationModes: string[];
  requiresWef: boolean;
  templateVersion?: string | null;
  currentVersionId?: string | null;
  currentWef?: string | null;
  lifecycleStatus?: string | null;
}

export interface MasterVersion {
  versionId: string;
  versionNo?: number | null;
  effectiveFrom?: string | null;
  effectiveTo?: string | null;
  lifecycleStatus: string;
  publishedAtUtc?: string | null;
  retiredAtUtc?: string | null;
  overlapWarning?: boolean;
  businessKey?: string | null;
  displayName?: string | null;
}

export interface MasterImport {
  importId: string;
  ownerModule: 'AUDIT_CORE' | 'DI';
  masterKey: string;
  effectiveFrom?: string | null;
  templateVersion?: string | null;
  fileName: string;
  fileHash: string;
  status: string;
  rowsParsed: number;
  validRows: number;
  warningRows: number;
  errorRows: number;
  confirmedVersionId?: string | null;
  createdBy: string;
  createdAtUtc: string;
  confirmedBy?: string | null;
  confirmedAtUtc?: string | null;
  versionNo: number;
}

export interface MahindraMasterOption {
  segmentId?: string | null;
  segmentCode?: string | null;
  segmentName?: string | null;
  uploadKey: string;
  displayName: string;
}

export interface MahindraMasterOptions {
  oemCode: 'MAHINDRA';
  segmentUploads: MahindraMasterOption[];
  discountUpload: MahindraMasterOption;
}

export interface MahindraMasterImport {
  importId: string;
  masterKey: string;
  segmentId?: string | null;
  segmentCode?: string | null;
  effectiveFrom: string;
  fileName: string;
  status: string;
  rowsParsed: number;
  validRows: number;
  errorRows: number;
  productMasterVersionId?: string | null;
  priceListVersionId?: string | null;
  discountPolicyVersionId?: string | null;
  lifecycleStatus?: string | null;
}

export interface ReadinessCheck {
  area: string;
  checkKey: string;
  severity: 'BLOCKING' | 'WARNING' | 'INFO';
  status: 'PASS' | 'FAIL' | 'PENDING';
  message: string;
  targetTask: string;
}

export interface ProjectReadiness {
  readyToActivate: boolean;
  evaluatedAtUtc: string;
  checks: ReadinessCheck[];
}

export interface ProjectActivationResult {
  tenantId: string;
  projectStatus: string;
  securityTenantStatus: string;
  readiness: ProjectReadiness;
}

export function listProjects(accessToken?: string) {
  return auditCoreRequest<ProjectSelection[]>('/v1/projects', auth(accessToken));
}

export function createProject(
  payload: ProjectCreateInput,
  idempotencyKey: string,
  accessToken?: string,
) {
  return auditCoreRequest<ProjectProvisioningResult>('/v1/projects', {
    method: 'POST',
    body: JSON.stringify(payload),
    headers: idempotencyHeaders(idempotencyKey),
    ...auth(accessToken),
  });
}

export function getProjectAdmin(tenantId: string, accessToken?: string) {
  return auditCoreRequest<Uc02Project>(`/v1/tenants/${tenantId}/project`, auth(accessToken));
}

export function patchProjectAdmin(
  tenantId: string,
  versionNo: number,
  payload: Partial<Pick<Uc02Project, 'projectName' | 'effectiveEndDate' | 'timezoneName' | 'regionCode'>> & {
    oemId?: string;
    segmentIds?: string[];
    effectiveStartDate?: string;
  },
  accessToken?: string,
) {
  return auditCoreRequest<Uc02Project>(`/v1/tenants/${tenantId}/project`, {
    method: 'PATCH',
    headers: { 'If-Match': `"${versionNo}"` },
    body: JSON.stringify(payload),
    ...auth(accessToken),
  });
}

export function listDealersAdmin(tenantId: string, accessToken?: string) {
  return auditCoreRequest<DealerAdmin[]>(`/v1/tenants/${tenantId}/dealers`, auth(accessToken));
}

export function createDealerAdmin(
  tenantId: string,
  payload: { dealerName: string; legalName?: string | null },
  accessToken?: string,
) {
  return auditCoreRequest<DealerAdmin>(`/v1/tenants/${tenantId}/dealers`, {
    method: 'POST', body: JSON.stringify(payload), ...auth(accessToken),
  });
}

export function listOutletsAdmin(tenantId: string, dealerId: string, accessToken?: string) {
  return auditCoreRequest<OutletAdmin[]>(
    `/v1/tenants/${tenantId}/dealers/${dealerId}/outlets`,
    auth(accessToken),
  );
}

export function createOutletAdmin(
  tenantId: string,
  dealerId: string,
  payload: {
    outletName: string;
    outletClassification: 'ONSITE' | 'SATELLITE';
    addressText?: string | null;
    city?: string | null;
    stateRegion?: string | null;
    postalCode?: string | null;
    googlePlaceId?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    monthlyVehicleVolume?: number | null;
  },
  accessToken?: string,
) {
  return auditCoreRequest<OutletAdmin>(`/v1/tenants/${tenantId}/dealers/${dealerId}/outlets`, {
    method: 'POST', body: JSON.stringify(payload), ...auth(accessToken),
  });
}

export function listRoleMappingCandidates(
  tenantId: string,
  query: string,
  accessToken?: string,
) {
  const search = query.trim() ? `?q=${encodeURIComponent(query.trim())}&limit=100` : '?limit=100';
  return auditCoreRequest<RoleMappingCandidate[]>(
    `/v1/tenants/${tenantId}/role-mapping-candidates${search}`,
    auth(accessToken),
  );
}

export function listRoleMappings(tenantId: string, accessToken?: string) {
  return auditCoreRequest<RoleMapping[]>(
    `/v1/tenants/${tenantId}/role-mappings`,
    auth(accessToken),
  );
}

export function putRoleMapping(
  tenantId: string,
  userId: string,
  payload: { operatingRole: OperatingRole; dealerIds: string[]; outletIds: string[] },
  idempotencyKey: string,
  accessToken?: string,
) {
  return auditCoreRequest<RoleMappingMutation>(
    `/v1/tenants/${tenantId}/role-mappings/${encodeURIComponent(userId)}`,
    {
      method: 'PUT',
      headers: idempotencyHeaders(idempotencyKey),
      body: JSON.stringify(payload),
      ...auth(accessToken),
    },
  );
}

export function deleteRoleMapping(
  tenantId: string,
  userId: string,
  idempotencyKey: string,
  accessToken?: string,
) {
  return auditCoreRequest<RoleMappingMutation>(
    `/v1/tenants/${tenantId}/role-mappings/${encodeURIComponent(userId)}`,
    {
      method: 'DELETE',
      headers: idempotencyHeaders(idempotencyKey),
      ...auth(accessToken),
    },
  );
}

export function listProjectMasters(tenantId: string, accessToken?: string) {
  return auditCoreRequest<MasterDescriptor[]>(
    `/v1/tenants/${tenantId}/project-masters`,
    auth(accessToken),
  );
}

export function listMasterVersions(
  tenantId: string,
  ownerModule: MasterDescriptor['ownerModule'],
  masterKey: string,
  accessToken?: string,
) {
  return auditCoreRequest<MasterVersion[]>(
    `/v1/tenants/${tenantId}/project-masters/${ownerModule}/${masterKey}/versions`,
    auth(accessToken),
  );
}

export async function downloadMasterTemplate(
  tenantId: string,
  ownerModule: MasterDescriptor['ownerModule'],
  masterKey: string,
  accessToken?: string,
): Promise<Blob> {
  const response = await auditCoreRawRequest(
    `/v1/tenants/${tenantId}/project-masters/${ownerModule}/${masterKey}/template`,
    auth(accessToken),
  );
  return response.blob();
}

export function uploadMasterImport(
  tenantId: string,
  ownerModule: MasterDescriptor['ownerModule'],
  masterKey: string,
  file: File,
  effectiveFrom: string | null,
  idempotencyKey: string,
  accessToken?: string,
) {
  const body = new FormData();
  body.append('file', file);
  if (effectiveFrom) body.append('effectiveFrom', effectiveFrom);
  return auditCoreRequest<MasterImport>(
    `/v1/tenants/${tenantId}/project-masters/${ownerModule}/${masterKey}/imports`,
    {
      method: 'POST',
      headers: idempotencyHeaders(idempotencyKey),
      body,
      ...auth(accessToken),
    },
  );
}

export function confirmMasterImport(tenantId: string, importId: string, accessToken?: string) {
  return auditCoreRequest<MasterImport>(
    `/v1/tenants/${tenantId}/project-master-imports/${importId}/confirm`,
    { method: 'POST', ...auth(accessToken) },
  );
}

export function publishMasterVersion(
  tenantId: string,
  ownerModule: MasterDescriptor['ownerModule'],
  masterKey: string,
  versionId: string,
  accessToken?: string,
) {
  return auditCoreRequest<MasterVersion>(
    `/v1/tenants/${tenantId}/project-masters/${ownerModule}/${masterKey}/versions/${versionId}/publish`,
    { method: 'POST', ...auth(accessToken) },
  );
}

export function getMahindraMasterOptions(tenantId: string, accessToken?: string) {
  return auditCoreRequest<MahindraMasterOptions>(
    `/v1/tenants/${tenantId}/mahindra-masters/options`,
    auth(accessToken),
  );
}

export async function downloadMahindraSegmentTemplate(
  tenantId: string,
  segmentId: string,
  accessToken?: string,
): Promise<Blob> {
  const response = await auditCoreRawRequest(
    `/v1/tenants/${tenantId}/mahindra-masters/segments/${segmentId}/template`,
    auth(accessToken),
  );
  return response.blob();
}

export async function downloadMahindraDiscountPolicyTemplate(
  tenantId: string,
  accessToken?: string,
): Promise<Blob> {
  const response = await auditCoreRawRequest(
    `/v1/tenants/${tenantId}/mahindra-masters/discount-policy/template`,
    auth(accessToken),
  );
  return response.blob();
}

export function uploadMahindraSegmentMaster(
  tenantId: string,
  segmentId: string,
  file: File,
  effectiveFrom: string,
  idempotencyKey: string,
  accessToken?: string,
) {
  const body = new FormData();
  body.append('file', file);
  body.append('effectiveFrom', effectiveFrom);
  return auditCoreRequest<MahindraMasterImport>(
    `/v1/tenants/${tenantId}/mahindra-masters/segments/${segmentId}/imports`,
    {
      method: 'POST',
      headers: idempotencyHeaders(idempotencyKey),
      body,
      ...auth(accessToken),
    },
  );
}

export function uploadMahindraDiscountPolicy(
  tenantId: string,
  file: File,
  effectiveFrom: string,
  idempotencyKey: string,
  accessToken?: string,
) {
  const body = new FormData();
  body.append('file', file);
  body.append('effectiveFrom', effectiveFrom);
  return auditCoreRequest<MahindraMasterImport>(
    `/v1/tenants/${tenantId}/mahindra-masters/discount-policy/imports`,
    {
      method: 'POST',
      headers: idempotencyHeaders(idempotencyKey),
      body,
      ...auth(accessToken),
    },
  );
}

export function confirmMahindraMasterImport(
  tenantId: string,
  importId: string,
  accessToken?: string,
) {
  return auditCoreRequest<MahindraMasterImport>(
    `/v1/tenants/${tenantId}/mahindra-masters/imports/${importId}/confirm`,
    { method: 'POST', ...auth(accessToken) },
  );
}

export function publishMahindraMasterImport(
  tenantId: string,
  importId: string,
  accessToken?: string,
) {
  return auditCoreRequest<MahindraMasterImport>(
    `/v1/tenants/${tenantId}/mahindra-masters/imports/${importId}/publish`,
    { method: 'POST', ...auth(accessToken) },
  );
}

export function getProjectReadiness(tenantId: string, accessToken?: string) {
  return auditCoreRequest<ProjectReadiness>(
    `/v1/tenants/${tenantId}/project/readiness`,
    auth(accessToken),
  );
}

export function activateProject(
  tenantId: string,
  idempotencyKey: string,
  accessToken?: string,
) {
  return auditCoreRequest<ProjectActivationResult>(
    `/v1/tenants/${tenantId}/project/activate`,
    {
      method: 'POST',
      headers: idempotencyHeaders(idempotencyKey),
      ...auth(accessToken),
    },
  );
}
