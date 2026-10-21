import { AuditCoreHttpError, auditCoreRequest } from './client';

export type SkuRunOutcome = 'NEWLY_MATCHED' | 'ALREADY_HAD_SKU' | 'STILL_UNMATCHED' | 'FAILED';

/**
 * RESOLVE is the old "Run SKU resolution" (matches the Journeys that have no SKU).
 * RERESOLVE_DRY_RUN is "Check SKUs" (re-checks every Journey, changes nothing) and
 * RERESOLVE_COMMIT is "Apply" (writes what the latest check showed).
 */
export type SkuRunMode = 'RESOLVE' | 'RERESOLVE_DRY_RUN' | 'RERESOLVE_COMMIT';

/** Where a Journey sits in a Check / Apply run (the server decides this). */
export type SkuReviewGroup = 'CHANGE' | 'CONFIRM' | 'KEEP' | 'LEFT_ALONE';

/** What one document (the booking form, the vehicle invoice) says about the vehicle. */
export interface SkuProposalDocument {
  documentType: string | null;
  documentId: string | null;
  words: string | null;
  exShowroom: string | null;
  sku: string | null;
  masterExShowroom: string | null;
}

/** The decision for one Journey in a Check or Apply run. */
export interface SkuProposal {
  action: string;
  group?: SkuReviewGroup;
  oldSku: string | null;
  oldBasis: string | null;
  proposedSku: string | null;
  proposedBasis: string | null;
  changes?: boolean;
  document?: string | null;
  words?: string | null;
  masterExShowroom?: string | null;
  documentExShowroom?: string | null;
  priceCheck?: 'MATCH' | 'DIFFERS' | 'MISSING' | null;
  why?: string | null;
  skipped?: string | null;
  tasks?: string[];
  booking?: SkuProposalDocument | null;
  invoice?: SkuProposalDocument | null;
  invoiceCount?: number;
  dryRun?: boolean;
  /** Apply runs only: what was actually done, and whether that differs from the check. */
  actionTaken?: 'SET' | 'REPLACED' | 'KEPT' | 'KEPT_AND_FLAGGED' | 'LEFT_ALONE' | 'NO_SKU';
  skuAfter?: string | null;
  basisAfter?: string | null;
  differsFromCheck?: boolean;
}

/** The numbers of a Check run, as the server states them when Apply starts (or is refused). */
export interface SkuCheckNumbers {
  runId: string;
  startedAtUtc: string;
  finishedAtUtc: string | null;
  journeysTotal: number;
  journeysChecked: number;
  failed: number;
  notChecked: number;
  willChange: number;
  needConfirmation: number;
  keep: number;
  leftAlone: number;
}

export interface SkuApplyCheck {
  allowed: boolean;
  code: string;
  message: string;
  check: SkuCheckNumbers | null;
}

export interface SkuResolutionBatchResult {
  runId: string;
  runMode?: SkuRunMode;
  checkedByRunId?: string | null;
  check?: SkuCheckNumbers | null;
  checkNote?: string | null;
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
  /** Absent on runs made before Check / Apply existed (those are RESOLVE runs). */
  runMode?: SkuRunMode;
  checkedByRunId?: string | null;
  /** Journeys per review group (CHANGE, CONFIRM, KEEP, LEFT_ALONE, FAILED) for Check and Apply runs. */
  actionCounts?: Partial<Record<SkuReviewGroup | 'FAILED', number>>;
}

export interface SkuResolutionRunItem {
  journeyId: string;
  journeyLabel: string | null;
  modelLabel: string | null;
  outcome: SkuRunOutcome;
  skuCode: string | null;
  detail: string | null;
  proposal?: SkuProposal | null;
}

export interface SkuResolutionRunDetail extends SkuResolutionRunSummary {
  items: SkuResolutionRunItem[];
}

const base = (tenantId: string) => `/v1/tenants/${encodeURIComponent(tenantId)}/admin/backfill/sku-resolution`;

/** SuperAdmin: one batch of Journeys. Repeat with `nextOffset` and the same `runId` until it is null. */
export function runSkuResolutionBatch(
  tenantId: string,
  offset: number,
  runId: string | undefined,
  accessToken: string,
  mode: SkuRunMode = 'RESOLVE',
) {
  const query = `offset=${offset}&limit=1&mode=${mode}${runId ? `&runId=${encodeURIComponent(runId)}` : ''}`;
  return auditCoreRequest<SkuResolutionBatchResult>(`${base(tenantId)}?${query}`, { method: 'POST', accessToken });
}

/** Whether Apply is allowed now (a complete Check of the last 24 hours, nothing changed since) and on which Check. */
export const getSkuApplyCheck = (tenantId: string, accessToken: string) =>
  auditCoreRequest<SkuApplyCheck>(`${base(tenantId)}/apply-check`, { accessToken });

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

async function batchWithRetry(tenantId: string, cursor: SkuRunCursor, accessToken: string, mode: SkuRunMode) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await runSkuResolutionBatch(tenantId, cursor.offset, cursor.runId, accessToken, mode);
    } catch (error) {
      // A batch is safe to repeat (same Journey, same run), so a dropped connection is simply retried.
      // A refusal (Apply without a fresh Check answers 409) is an answer, not a dropped connection.
      if (error instanceof AuditCoreHttpError && error.status >= 400 && error.status < 500) throw error;
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
  mode: SkuRunMode = 'RESOLVE',
): Promise<string> {
  for (;;) {
    const batch = await batchWithRetry(tenantId, cursor, accessToken, mode);
    cursor.runId = batch.runId;
    cursor.total = batch.journeysTotal;
    cursor.processed += batch.journeysConsidered;
    onProgress({ ...cursor });
    if (batch.nextOffset === null || batch.journeysConsidered === 0) return batch.runId;
    cursor.offset = batch.nextOffset;
  }
}
