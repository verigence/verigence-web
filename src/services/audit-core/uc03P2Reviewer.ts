import { auditCoreRequest } from './client';

/**
 * The Reviewer's endpoints: the board of journeys in their covered outlets,
 * the per-stage review state, the two reviewed marks, the advisory claim, and
 * their own daily and weekly counts.
 *
 * Scope is server-side. A Reviewer holds one business assignment per outlet
 * and the board authorises against all of them at once, so nothing here sends
 * a dealer or outlet: asking for "my journeys" is the whole request.
 */

/** Same budget the other heavier Audit Core list reads use. */
const LIST_READ_TIMEOUT_MS = 20_000;

export type ReviewerStageSummary = {
  documentCount: number;
  reviewedAtUtc?: string | null;
  reviewedByActorId?: string | null;
};

export type ReviewerJourney = {
  journeyId: string;
  journeyReference?: string | null;
  customerName?: string | null;
  pcName?: string | null;
  createdAtUtc?: string | null;
  /** The day it was uploaded (created), YYYY-MM-DD in the Project's timezone. */
  uploadDate?: string | null;
  updatedAtUtc?: string | null;
  claimedByActorId?: string | null;
  claimedAtUtc?: string | null;
  claimedByMe: boolean;
  booking: ReviewerStageSummary;
  delivery: ReviewerStageSummary;
};

export type ReviewerOutletGroup = {
  dealerId: string;
  dealerName?: string | null;
  outletId: string;
  outletName?: string | null;
  outletCode?: string | null;
  journeys: ReviewerJourney[];
};

export type ReviewerOutletOption = {
  dealerId: string;
  dealerName?: string | null;
  outletId: string;
  outletName?: string | null;
  outletCode?: string | null;
  journeyCount: number;
  oldestUploadDate: string;
};

export type ReviewerBoardFilters = {
  outletId?: string;
  /** YYYY-MM-DD, inclusive. */
  dateFrom?: string;
  dateTo?: string;
};

export type ReviewerBoard = {
  state: 'open' | 'closed';
  journeyCount: number;
  /** How many matched before the row limit. */
  totalMatching?: number;
  timezone?: string;
  /** Every outlet the Reviewer covers, ignoring the outlet and date filters. */
  outletOptions?: ReviewerOutletOption[];
  outlets: ReviewerOutletGroup[];
};

export type ReviewGateOutstanding = {
  documentId: string;
  documentType?: string | null;
  fileName?: string | null;
};

export type ReviewGate = {
  documentCount: number;
  openedCount: number;
  outstanding: ReviewGateOutstanding[];
  satisfied: boolean;
  reason?: 'NO_DOCUMENTS' | 'DOCUMENTS_NOT_OPENED' | null;
};

export type StageReviewMark = {
  reviewedByActorId: string;
  reviewedByRole?: string | null;
  reviewedAtUtc: string;
  documentCount: number;
};

export type StageReviewState = {
  review: StageReviewMark | null;
  gate: ReviewGate;
  canMarkReviewed: boolean;
};

export type JourneyReviewState = {
  journeyId: string;
  actorId: string;
  claim: {
    claimedByActorId: string;
    claimedByRole?: string | null;
    claimedAtUtc: string;
    claimedByMe: boolean;
  } | null;
  stages: Record<'BOOKING' | 'DELIVERY', StageReviewState>;
};

export type ResyncPreview = {
  queueId: string;
  documentId: string | null;
  stageCode: 'BOOKING' | 'DELIVERY' | null;
  /** Hand-made values on this page that a resync would replace with DI's own. */
  modifiedFieldCount: number;
  stageReviewed: boolean;
  canResync: boolean;
  blockedReason?: 'NOT_SYNCED' | 'UNCLASSIFIED' | 'STAGE_REVIEWED' | null;
};

export type ReviewerActivityOutlet = {
  outletId: string;
  outletName?: string | null;
  dealerName?: string | null;
  stageCode: 'BOOKING' | 'DELIVERY';
  marks: number;
  journeys: number;
};

export type ReviewerActivityBucket = {
  /** A local date: the day, or the Monday the week starts on. */
  bucket: string;
  bookingReviewed: number;
  deliveryReviewed: number;
  journeys: number;
  fieldChanges: number;
  outlets: ReviewerActivityOutlet[];
};

export type ReviewerActivity = {
  period: 'day' | 'week';
  /** The project's own timezone, which is what the buckets are cut on. */
  timezone: string;
  actorId: string;
  buckets: ReviewerActivityBucket[];
};

function path(tenantId: string, suffix: string) {
  return `/p2/v1/tenants/${encodeURIComponent(tenantId)}${suffix}`;
}

function journeyPath(tenantId: string, journeyId: string, suffix: string) {
  return path(tenantId, `/journeys/${encodeURIComponent(journeyId)}${suffix}`);
}

export function getReviewerBoard(
  tenantId: string,
  state: 'open' | 'closed',
  accessToken?: string,
  filters: ReviewerBoardFilters = {},
): Promise<ReviewerBoard> {
  const params = new URLSearchParams({ state, limit: '500' });
  if (filters.outletId) params.set('outletId', filters.outletId);
  if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
  if (filters.dateTo) params.set('dateTo', filters.dateTo);
  return auditCoreRequest<ReviewerBoard>(
    `${path(tenantId, '/reviewer/journeys')}?${params.toString()}`,
    { accessToken, timeoutMs: LIST_READ_TIMEOUT_MS },
  );
}

export function getJourneyReviewState(
  tenantId: string,
  journeyId: string,
  accessToken?: string,
): Promise<JourneyReviewState> {
  return auditCoreRequest<JourneyReviewState>(
    journeyPath(tenantId, journeyId, '/review-state'),
    { accessToken },
  );
}

export function markStageDocumentsReviewed(
  tenantId: string,
  journeyId: string,
  stageCode: 'BOOKING' | 'DELIVERY',
  accessToken?: string,
): Promise<{ journeyId: string; stageCode: string; documentCount: number }> {
  return auditCoreRequest(
    journeyPath(tenantId, journeyId, `/stages/${stageCode}/documents-reviewed`),
    { method: 'POST', accessToken },
  );
}

export function claimJourney(
  tenantId: string,
  journeyId: string,
  accessToken?: string,
): Promise<{ journeyId: string; claimedByActorId: string }> {
  return auditCoreRequest(journeyPath(tenantId, journeyId, '/claim'), {
    method: 'PUT',
    accessToken,
  });
}

export function releaseJourneyClaim(
  tenantId: string,
  journeyId: string,
  accessToken?: string,
): Promise<void> {
  return auditCoreRequest(journeyPath(tenantId, journeyId, '/claim'), {
    method: 'DELETE',
    accessToken,
  });
}

export function getResyncPreview(
  tenantId: string,
  journeyId: string,
  queueId: string,
  accessToken?: string,
): Promise<ResyncPreview> {
  return auditCoreRequest<ResyncPreview>(
    journeyPath(tenantId, journeyId, `/pages/${encodeURIComponent(queueId)}/resync-preview`),
    { accessToken },
  );
}

export function getReviewerActivity(
  tenantId: string,
  period: 'day' | 'week',
  accessToken?: string,
): Promise<ReviewerActivity> {
  return auditCoreRequest<ReviewerActivity>(
    path(tenantId, `/reviewer/activity?period=${period}`),
    { accessToken, timeoutMs: LIST_READ_TIMEOUT_MS },
  );
}
