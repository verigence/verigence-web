import { auditCoreRequest } from './client';

function token(accessToken?: string): string {
  const value = accessToken?.trim();
  if (!value) throw new Error('A Security human access token is required.');
  return value;
}

export interface DuplicateBookingSide {
  journeyId: string | null;
  journeyReference: string | null;
  customerName: string | null;
  dealerName: string | null;
  outletName: string | null;
  productLabel: string | null;
  bookingReference: string | null;
  bookingConfirmDate: string | null;
}

export interface DuplicateBookingPair {
  findingId: string;
  status: string;
  severity: string;
  raisedAtUtc: string;
  matchBasis: string | null;
  matchBasisLabel: string | null;
  matchConfidencePercent: number | null;
  matchConfidenceLabel: string | null;
  // The journey the finding lives on -- believed NOT to hold the booking.
  duplicate: DuplicateBookingSide;
  // The journey believed to actually hold the booking (whichever paid its
  // minimum booking amount earlier).
  holder: DuplicateBookingSide;
}

export interface DuplicateBookingsResponse {
  roles: string[];
  generatedAtUtc: string;
  pairs: DuplicateBookingPair[];
}

function tenantBase(tenantId: string): string {
  return `/v1/tenants/${encodeURIComponent(tenantId)}/uc03`;
}

/**
 * GET /v1/tenants/{tenantId}/uc03/duplicate-bookings
 *
 * Every DUPLICATE_BOOKING pairing, both sides side by side (customer,
 * dealer, outlet, vehicle, booking-confirm date), plus the match basis and
 * confidence, and which side currently holds the booking. Open to PC/TL/PM/
 * Executive alike, scoped by the caller's ordinary business assignments --
 * unlike Audit Review's own Accept/Reject adjudication (TL/PM/Executive
 * only), this is pure information. Purely read-only: acting on the
 * underlying finding stays on the Task Queue.
 */
export function getDuplicateBookings(
  tenantId: string,
  accessToken?: string,
  includeClosed?: boolean,
): Promise<DuplicateBookingsResponse> {
  const params = new URLSearchParams();
  if (includeClosed) params.set('includeClosed', 'true');
  const query = params.toString() ? `?${params.toString()}` : '';
  return auditCoreRequest<DuplicateBookingsResponse>(`${tenantBase(tenantId)}/duplicate-bookings${query}`, {
    accessToken: token(accessToken),
    cache: 'no-store',
  });
}
