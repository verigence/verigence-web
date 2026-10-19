import { auditCoreRequest } from './client';

export interface SkuResolutionRunResult {
  tenantId: string;
  journeysConsidered: number;
  journeysProcessed: number;
  journeysFailed: string[];
  withSkuBefore: number;
  withSkuAfter: number;
  withoutSkuBefore: number;
  withoutSkuAfter: number;
  stepErrors: number;
}

/** SuperAdmin: run SKU resolution for every Journey in the Project. Safe to repeat. */
export function runSkuResolutionForProject(tenantId: string, accessToken: string) {
  return auditCoreRequest<SkuResolutionRunResult>(
    `/v1/tenants/${encodeURIComponent(tenantId)}/admin/backfill/sku-resolution`,
    { method: 'POST', accessToken },
  );
}
