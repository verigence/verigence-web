import { auditCoreRequest } from './client';

export interface SkuResolutionRunResult {
  tenantId: string;
  journeysTotal: number;
  nextOffset: number | null;
  journeysConsidered: number;
  journeysProcessed: number;
  journeysFailed: string[];
  withSkuBefore: number;
  withSkuAfter: number;
  withoutSkuBefore: number;
  withoutSkuAfter: number;
  stepErrors: number;
}

/** SuperAdmin: one batch of Journeys. Repeat with `nextOffset` until it is null. */
export function runSkuResolutionBatch(tenantId: string, offset: number, accessToken: string) {
  return auditCoreRequest<SkuResolutionRunResult>(
    `/v1/tenants/${encodeURIComponent(tenantId)}/admin/backfill/sku-resolution?offset=${offset}&limit=3`,
    { method: 'POST', accessToken },
  );
}

export interface SkuResolutionTotals {
  total: number;
  processed: number;
  failed: string[];
  stepErrors: number;
  withSkuBefore: number;
  withSkuAfter: number;
  withoutSkuAfter: number;
}

/** Runs every batch for the Project, reporting progress after each one. Safe to repeat. */
export async function runSkuResolutionForProject(
  tenantId: string,
  accessToken: string,
  onProgress: (totals: SkuResolutionTotals) => void,
): Promise<SkuResolutionTotals> {
  let offset = 0;
  let totals: SkuResolutionTotals | undefined;
  for (;;) {
    const batch = await runSkuResolutionBatch(tenantId, offset, accessToken);
    totals = {
      total: batch.journeysTotal,
      processed: (totals?.processed ?? 0) + batch.journeysProcessed,
      failed: [...(totals?.failed ?? []), ...batch.journeysFailed],
      stepErrors: (totals?.stepErrors ?? 0) + batch.stepErrors,
      withSkuBefore: totals?.withSkuBefore ?? batch.withSkuBefore,
      withSkuAfter: batch.withSkuAfter,
      withoutSkuAfter: batch.withoutSkuAfter,
    };
    onProgress(totals);
    if (batch.nextOffset === null || batch.journeysConsidered === 0) return totals;
    offset = batch.nextOffset;
  }
}
