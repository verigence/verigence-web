import { auditCoreRequest } from './client';
import { newIdempotencyKey } from './uc03Booking';

export type PcVerificationStatus = 'NOT_SUBMITTED' | 'PENDING' | 'VERIFIED';

export interface PcVerificationView {
  journeyId: string;
  captureSubmitted: boolean;
  pcVerificationStatus: PcVerificationStatus;
  reviewReady: boolean;
  linkedDocumentCount: number;
  pendingDocumentCount: number;
  failedDocumentCount: number;
  pendingProposalCount: number;
  aggregateVersion: number;
  captureCompletedAtUtc: string | null;
  latestActivityAtUtc: string;
}

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

function base(tenantId: string, journeyId: string): string {
  return `/v1/tenants/${encodeURIComponent(tenantId)}/journeys/${encodeURIComponent(journeyId)}/pc-verification`;
}

function commandHeaders(prefix: string, version: number): HeadersInit {
  return {
    'Idempotency-Key': newIdempotencyKey(prefix),
    'If-Match': `"${version}"`,
  };
}

export function getPcVerification(
  tenantId: string,
  journeyId: string,
  accessToken?: string,
): Promise<PcVerificationView> {
  return auditCoreRequest(base(tenantId, journeyId), {
    accessToken: token(accessToken),
    cache: 'no-store',
  });
}

export function submitPcBookingCapture(
  tenantId: string,
  journeyId: string,
  version: number,
  values: Record<string, unknown>,
  accessToken?: string,
): Promise<PcVerificationView> {
  return auditCoreRequest(`${base(tenantId, journeyId)}/submit`, {
    method: 'POST',
    accessToken: token(accessToken),
    headers: commandHeaders('uc03-pc-capture-submit', version),
    body: JSON.stringify({ values }),
  });
}

export function verifyPcBooking(
  tenantId: string,
  journeyId: string,
  version: number,
  accessToken?: string,
): Promise<PcVerificationView> {
  return auditCoreRequest(`${base(tenantId, journeyId)}/verify`, {
    method: 'POST',
    accessToken: token(accessToken),
    headers: commandHeaders('uc03-pc-verify', version),
  });
}

export function listReviewPending(
  tenantId: string,
  accessToken?: string,
  limit = 50,
): Promise<ReviewPendingPage> {
  const params = new URLSearchParams({ limit: String(limit) });
  return auditCoreRequest(`/v1/tenants/${encodeURIComponent(tenantId)}/uc03/review-pending?${params}`, {
    accessToken: token(accessToken),
    cache: 'no-store',
  });
}
