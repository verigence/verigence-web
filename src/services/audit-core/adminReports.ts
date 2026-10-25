import { auditCoreRequest } from './client';

type Cell = string | number | null;

/** One invoice-type document on a Journey, exactly as read (nothing derived). */
export type ReviewInvoice = Record<string, Cell>;

/** One Journey with the facts the system holds for it (nothing derived). */
export interface JourneyReviewRow {
  ref: string;
  invoices: ReviewInvoice[];
  [field: string]: Cell | ReviewInvoice[];
}

export interface JourneyReview {
  tenantId: string;
  generatedAtUtc: string;
  journeyCount: number;
  journeys: JourneyReviewRow[];
}

/** SuperAdmin only. Runs live against the Project's records, so allow it time. */
export const getJourneyReview = (tenantId: string, accessToken: string) =>
  auditCoreRequest<JourneyReview>(
    `/v1/tenants/${encodeURIComponent(tenantId)}/admin/reports/journey-review`,
    { accessToken, timeoutMs: 120_000 },
  );
