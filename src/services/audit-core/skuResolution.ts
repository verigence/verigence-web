import { auditCoreRequest } from './client';

export type SkuRunOutcome = 'NEWLY_MATCHED' | 'ALREADY_HAD_SKU' | 'STILL_UNMATCHED' | 'FAILED';

export interface SkuResolutionBatchResult {
  runId: string;
  journeysTotal: number;
  nextOffset: number | null;
  journeysConsidered: number;
  journeysProcessed: number;
  journeysFailed: string[];
}

export interface SkuResolutionRunSummary {
  runId: string;
  status: 'RUNNING' | 'COMPLETE';
  startedAtUtc: string;
  finishedAtUtc: string | null;
  journeysTotal: number;
  journeysProcessed: number;
  newlyMatched: number;
  alreadyHadSku: number;
  stillUnmatched: number;
  failed: number;
  withSkuBefore: number;
  withSkuAfter: number;
}

export interface SkuResolutionRunItem {
  journeyId: string;
  journeyLabel: string | null;
  modelLabel: string | null;
  outcome: SkuRunOutcome;
  skuCode: string | null;
  detail: string | null;
}

export interface SkuResolutionRunDetail extends SkuResolutionRunSummary {
  items: SkuResolutionRunItem[];
}

const base = (tenantId: string) => `/v1/tenants/${encodeURIComponent(tenantId)}/admin/backfill/sku-resolution`;

/** SuperAdmin: one batch of Journeys. Repeat with `nextOffset` and the same `runId` until it is null. */
export function runSkuResolutionBatch(tenantId: string, offset: number, runId: string | undefined, accessToken: string) {
  const query = `offset=${offset}&limit=3${runId ? `&runId=${encodeURIComponent(runId)}` : ''}`;
  return auditCoreRequest<SkuResolutionBatchResult>(`${base(tenantId)}?${query}`, { method: 'POST', accessToken });
}

export const listSkuResolutionRuns = (tenantId: string, accessToken: string) =>
  auditCoreRequest<SkuResolutionRunSummary[]>(`${base(tenantId)}/runs`, { accessToken });

export const getSkuResolutionRun = (tenantId: string, runId: string, accessToken: string) =>
  auditCoreRequest<SkuResolutionRunDetail>(`${base(tenantId)}/runs/${encodeURIComponent(runId)}`, { accessToken });

/** Runs every batch for the Project into one kept run, reporting progress after each. Safe to repeat. */
export async function runSkuResolutionForProject(
  tenantId: string,
  accessToken: string,
  onProgress: (progress: { runId: string; processed: number; total: number }) => void,
): Promise<string> {
  let offset = 0;
  let runId: string | undefined;
  let processed = 0;
  for (;;) {
    const batch = await runSkuResolutionBatch(tenantId, offset, runId, accessToken);
    runId = batch.runId;
    processed += batch.journeysConsidered;
    onProgress({ runId, processed, total: batch.journeysTotal });
    if (batch.nextOffset === null || batch.journeysConsidered === 0) return runId;
    offset = batch.nextOffset;
  }
}
