import { auditCoreRequest } from './client';

function auth(accessToken?: string) {
  return accessToken ? { accessToken } : {};
}

export interface NightlyReprocessingRunSummary {
  ranAtUtc: string;
  documentsQueued: number | null;
  error: string | null;
}

export interface NightlyReprocessingStatus {
  recentRuns: NightlyReprocessingRunSummary[];
}

// Tenant-agnostic: DI runs this batch once globally, not per tenant, so the
// read side carries no tenant scope either.
export function getNightlyReprocessingStatus(accessToken?: string) {
  return auditCoreRequest<NightlyReprocessingStatus>(
    '/v1/admin/nightly-reprocessing-runs', auth(accessToken),
  );
}
