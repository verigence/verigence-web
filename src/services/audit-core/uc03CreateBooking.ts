import { auditCoreRequest } from './client';
import { newIdempotencyKey } from './uc03Booking';

export interface CreateBookingOutlet {
  outletId: string;
  outletName: string;
  outletClassification: string;
  dealerId: string;
  dealerName: string;
}

export interface CreateBookingContext {
  outlets: CreateBookingOutlet[];
}

export interface CreateBookingResult {
  journeyId: string;
  customerId: string;
  dealerId: string;
  outletId: string;
  businessStatus: string;
  aggregateVersion: number;
}

function token(accessToken?: string): string {
  const value = accessToken?.trim();
  if (!value) throw new Error('A Security human access token is required.');
  return value;
}

export function getCreateBookingContext(
  tenantId: string,
  accessToken?: string,
): Promise<CreateBookingContext> {
  return auditCoreRequest<CreateBookingContext>(
    `/v1/tenants/${encodeURIComponent(tenantId)}/uc03/create-booking-context`,
    { accessToken: token(accessToken), cache: 'no-store' },
  );
}

export function createBooking(
  tenantId: string,
  outletId: string | undefined,
  accessToken?: string,
): Promise<CreateBookingResult> {
  return auditCoreRequest<CreateBookingResult>(
    `/v1/tenants/${encodeURIComponent(tenantId)}/uc03/bookings`,
    {
      method: 'POST',
      accessToken: token(accessToken),
      headers: { 'Idempotency-Key': newIdempotencyKey('uc03-create-booking') },
      body: JSON.stringify({ outletId: outletId || null }),
    },
  );
}
