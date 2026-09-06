import { auditCoreRequest } from './client';
import { newIdempotencyKey } from './uc03Booking';

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

export function createBooking(
  tenantId: string,
  outletId: string,
  accessToken?: string,
): Promise<CreateBookingResult>;
export function createBooking(
  tenantId: string,
  outletId: string,
  legacyCustomerName: string,
  accessToken?: string,
): Promise<CreateBookingResult>;
export function createBooking(
  tenantId: string,
  outletId: string,
  accessTokenOrLegacyCustomerName?: string,
  legacyAccessToken?: string,
): Promise<CreateBookingResult> {
  if (!outletId.trim()) throw new Error('A working Outlet must be selected before creating a Booking.');
  // The active 06-Sep flow passes the token as argument 3. Keep the legacy 4-argument
  // signature only so retired callers continue to compile during rollout; their
  // customer-name argument is deliberately ignored and never sent to Audit Core.
  const accessToken = legacyAccessToken ?? accessTokenOrLegacyCustomerName;
  return auditCoreRequest<CreateBookingResult>(
    `/v1/tenants/${encodeURIComponent(tenantId)}/uc03/bookings`,
    {
      method: 'POST',
      accessToken: token(accessToken),
      headers: { 'Idempotency-Key': newIdempotencyKey('uc03-create-booking') },
      body: JSON.stringify({ outletId }),
    },
  );
}
