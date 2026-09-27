import { auditCoreRequest } from './client';
import { awaitPrimaryUc03WorkQueue } from './uc03';

export interface ReviewPendingItem {
  journeyId: string;
  bookingReference: string | null;
  customerDisplayName: string;
  productLabel: string | null;
  dealerName: string;
  outletName: string;
  bookingBusinessStatus: string | null;
  captureCompletedAtUtc: string;
  latestActivityAtUtc: string;
}

export interface ReviewPendingPage {
  items: ReviewPendingItem[];
  totalCount: number;
}

function token(accessToken?: string): string {
  const value = accessToken?.trim();
  if (!value) throw new Error('A Security human access token is required.');
  return value;
}

export async function listReviewPending(
  tenantId: string,
  accessToken?: string,
  limit = 50,
): Promise<ReviewPendingPage> {
  // Review Pending is secondary landing data. Never let the full list compete
  // with the shared metrics + first Work Queue bootstrap request.
  await awaitPrimaryUc03WorkQueue(tenantId);
  const params = new URLSearchParams({ limit: String(limit) });
  return auditCoreRequest(`/v1/tenants/${encodeURIComponent(tenantId)}/uc03/review-pending?${params}`, {
    accessToken: token(accessToken),
    cache: 'no-store',
  });
}
