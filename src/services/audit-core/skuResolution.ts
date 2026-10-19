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
  const query = `offset=${offset}&limit=1${runId ? `&runId=${encodeURIComponent(runId)}` : ''}`;
  return auditCoreRequest<SkuResolutionBatchResult>(`${base(tenantId)}?${query}`, { method: 'POST', accessToken });
}

export const listSkuResolutionRuns = (tenantId: string, accessToken: string) =>
  auditCoreRequest<SkuResolutionRunSummary[]>(`${base(tenantId)}/runs`, { accessToken });

export const getSkuResolutionRun = (tenantId: string, runId: string, accessToken: string) =>
  auditCoreRequest<SkuResolutionRunDetail>(`${base(tenantId)}/runs/${encodeURIComponent(runId)}`, { accessToken });

/** Where a run has got to, so a stopped run can carry on instead of starting over. */
export interface SkuRunCursor {
  runId?: string;
  offset: number;
  processed: number;
  total: number;
}

const RETRY_DELAYS_MS = [3000, 6000, 12000];

async function batchWithRetry(tenantId: string, cursor: SkuRunCursor, accessToken: string) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await runSkuResolutionBatch(tenantId, cursor.offset, cursor.runId, accessToken);
    } catch (error) {
      // A batch is safe to repeat (same Journey, same run), so a dropped connection is simply retried.
      if (attempt >= RETRY_DELAYS_MS.length) throw error;
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[attempt]));
    }
  }
}

/**
 * Runs the Project's Journeys one at a time into one kept run. `cursor` is updated after every Journey;
 * pass the same cursor again to resume where a stopped run left off. Safe to repeat.
 */
export async function runSkuResolutionForProject(
  tenantId: string,
  accessToken: string,
  cursor: SkuRunCursor,
  onProgress: (cursor: SkuRunCursor) => void,
): Promise<string> {
  for (;;) {
    const batch = await batchWithRetry(tenantId, cursor, accessToken);
    cursor.runId = batch.runId;
    cursor.total = batch.journeysTotal;
    cursor.processed += batch.journeysConsidered;
    onProgress({ ...cursor });
    if (batch.nextOffset === null || batch.journeysConsidered === 0) return batch.runId;
    cursor.offset = batch.nextOffset;
  }
}
