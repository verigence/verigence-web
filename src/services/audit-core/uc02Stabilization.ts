import { auditCoreRawRequest, auditCoreRequest } from './client';

function auth(accessToken?: string) {
  return accessToken ? { accessToken } : {};
}

export interface ProjectDeletionImpact {
  tenantId: string;
  projectName: string;
  projectStatus: string;
  journeyCount: number;
  canDelete: boolean;
  rule: string;
  cleanupTargets: string[];
}

export interface ProjectDeleteResult {
  operationId: string;
  tenantId: string;
  projectName: string;
  projectStatus: string;
  journeyCount: number;
  deletionStatus: string;
  diReceipt: Record<string, unknown>;
  securityReceipt: Record<string, unknown>;
  auditCoreReceipt: Record<string, unknown>;
}

export async function deleteConfiguringDealerSetup(
  tenantId: string,
  dealerId: string,
  idempotencyKey: string,
  accessToken?: string,
): Promise<void> {
  await auditCoreRawRequest(`/v1/tenants/${tenantId}/dealers/${dealerId}/setup`, {
    method: 'DELETE',
    headers: { 'Idempotency-Key': idempotencyKey },
    ...auth(accessToken),
  });
}

export function getProjectDeletionImpact(tenantId: string, accessToken?: string) {
  return auditCoreRequest<ProjectDeletionImpact>(
    `/v1/tenants/${tenantId}/project/deletion-impact`,
    auth(accessToken),
  );
}

export function hardDeleteProject(
  tenantId: string,
  confirmProjectName: string,
  idempotencyKey: string,
  accessToken?: string,
) {
  return auditCoreRequest<ProjectDeleteResult>(`/v1/tenants/${tenantId}/project`, {
    method: 'DELETE',
    headers: { 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify({ confirmProjectName }),
    ...auth(accessToken),
  });
}
