import { auditCoreRequest } from './client';

export type JourneyHousekeepingScope = 'TENANT' | 'OUTLET' | 'JOURNEY';

export interface JourneyHousekeepingPreview {
  tenantId: string;
  scope: JourneyHousekeepingScope;
  scopeId: string;
  journeys: number;
  customers: number;
  evidence: number;
  diDocuments: number;
  auditFindings: number;
  payments: number;
  deliveries: number;
  workflowTasks: number;
}

export interface JourneyHousekeepingResult {
  tenantId: string;
  scope: JourneyHousekeepingScope;
  scopeId: string;
  purgeStatus: 'REMOVED';
  deletedJourneys: number;
  deletedCustomers: number;
  deletedEvidence: number;
  deletedDiDocuments: number;
  deletedDiStorageObjects: number;
  masterDataPreserved: boolean;
}

export interface JourneyHousekeepingSelection {
  scope: JourneyHousekeepingScope;
  outletId?: string;
  journeyId?: string;
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

export interface ProjectDeletionResult {
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

function queryFor(selection: JourneyHousekeepingSelection): string {
  const query = new URLSearchParams({ scope: selection.scope });
  if (selection.outletId) query.set('outletId', selection.outletId);
  if (selection.journeyId) query.set('journeyId', selection.journeyId);
  return query.toString();
}

export function previewJourneyHousekeeping(
  tenantId: string,
  selection: JourneyHousekeepingSelection,
  accessToken: string,
) {
  return auditCoreRequest<JourneyHousekeepingPreview>(
    `/v1/tenants/${tenantId}/admin/housekeeping/journeys/preview?${queryFor(selection)}`,
    { accessToken },
  );
}

export function purgeJourneyHousekeeping(
  tenantId: string,
  selection: JourneyHousekeepingSelection,
  confirmScopeId: string,
  accessToken: string,
) {
  return auditCoreRequest<JourneyHousekeepingResult>(
    `/v1/tenants/${tenantId}/admin/housekeeping/journeys/purge`,
    {
      method: 'POST',
      accessToken,
      body: JSON.stringify({
        scope: selection.scope,
        outletId: selection.outletId,
        journeyId: selection.journeyId,
        confirmScopeId,
        confirmation: 'PURGE_JOURNEY_DATA',
      }),
    },
  );
}

export function getProjectDeletionImpact(tenantId: string, accessToken: string) {
  return auditCoreRequest<ProjectDeletionImpact>(
    `/v1/tenants/${tenantId}/project/deletion-impact`,
    { accessToken },
  );
}

export function hardDeleteProject(
  tenantId: string,
  confirmProjectName: string,
  idempotencyKey: string,
  accessToken: string,
) {
  return auditCoreRequest<ProjectDeletionResult>(
    `/v1/tenants/${tenantId}/project`,
    {
      method: 'DELETE',
      accessToken,
      headers: { 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify({ confirmProjectName }),
    },
  );
}
