import { auditCoreRequest } from './client';
import { newIdempotencyKey } from './uc03Booking';

export interface BookingDetailsV2View {
  aggregateVersion: number;
  priceListId: string | null;
  customerType: string | null;
  dealType: string | null;
  dealSource: string | null;
  leadSource: string | null;
  registrationState: string | null;
  territoryCategorization: string | null;
  districtName: string | null;
  registrationType: string | null;
  registrationCategory: string | null;
  outrightPurchase: boolean | null;
  tradeIn: boolean | null;
  gstBenefit: boolean | null;
  corporateIdAvailable: boolean | null;
}

export interface BookingDetailsV2Payload {
  priceListId: string | null;
  customerType: string;
  dealType: string;
  dealSource: string;
  leadSource: string;
  registrationState: string;
  territoryCategorization: string;
  districtName: string;
  registrationType: string;
  registrationCategory: string;
  outrightPurchase: boolean;
  tradeIn: boolean;
  gstBenefit: boolean;
  corporateIdAvailable: boolean | null;
}

export interface BookingSubmitV2Result {
  journeyId: string;
  phase: 'BOOKING';
  status: 'IN_PROGRESS' | 'COMPLETED';
  pcVerificationStatus: 'PENDING' | null;
  aggregateVersion: number;
}

function token(accessToken?: string): string {
  const value = accessToken?.trim();
  if (!value) throw new Error('A Security human access token is required.');
  return value;
}

function base(tenantId: string, journeyId: string): string {
  return `/v2/tenants/${encodeURIComponent(tenantId)}/journeys/${encodeURIComponent(journeyId)}/booking`;
}

export async function getBookingDetailsV2(
  tenantId: string,
  journeyId: string,
  accessToken?: string,
): Promise<BookingDetailsV2View> {
  return auditCoreRequest<BookingDetailsV2View>(`${base(tenantId, journeyId)}/details`, {
    accessToken: token(accessToken),
    cache: 'no-store',
  });
}

export async function submitBookingV2(
  tenantId: string,
  journeyId: string,
  payload: BookingDetailsV2Payload,
  aggregateVersion: number,
  accessToken?: string,
): Promise<BookingSubmitV2Result> {
  return auditCoreRequest<BookingSubmitV2Result>(`${base(tenantId, journeyId)}/submit`, {
    method: 'POST',
    accessToken: token(accessToken),
    headers: {
      'Idempotency-Key': newIdempotencyKey('uc03-v2-booking-submit'),
      'If-Match': `"${aggregateVersion}"`,
    },
    body: JSON.stringify(payload),
  });
}
