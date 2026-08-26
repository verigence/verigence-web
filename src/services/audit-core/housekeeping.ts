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
