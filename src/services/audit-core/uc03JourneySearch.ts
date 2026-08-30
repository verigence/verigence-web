import { auditCoreRequest } from './client';

export type JourneySearchMatch =
  | 'DEALER_BOOKING_NUMBER'
  | 'MOBILE_NUMBER'
  | 'CUSTOMER_ENTERED_NAME'
  | 'CUSTOMER_LEGAL_NAME'
  | 'VIN'
  | 'CHASSIS_NUMBER'
  | 'REGISTRATION_NUMBER'
  | 'INVOICE_REFERENCE'
  | 'DMS_REFERENCE'
  | 'PAYMENT_REFERENCE'
  | 'TECHNICAL_ID';

export interface JourneySearchItem {
  journeyId: string;
  customerDisplayName: string;
  customerLegalName: string | null;
  customerMobileLast4: string | null;
  bookingReference: string | null;
  productLabel: string | null;
  dealerId: string;
  dealerName: string;
  outletId: string;
  outletName: string;
  bookingStatus: string | null;
  deliveryStatus: string | null;
  vin: string | null;
  registrationNumber: string | null;
  invoiceReference: string | null;
  matchedOn: JourneySearchMatch;
  matchedValue: string | null;
  latestActivityAtUtc: string;
}

export interface JourneySearchResponse {
  query: string;
  items: JourneySearchItem[];
  resultCount: number;
}

export interface JourneyOverview {
  journey: Record<string, unknown>;
  customer: Record<string, unknown>;
  booking: Record<string, unknown> | null;
  commercialLines: Array<Record<string, unknown>>;
  discounts: Array<Record<string, unknown>>;
  payments: Array<Record<string, unknown>>;
  finance: Record<string, unknown> | null;
  insurance: Record<string, unknown> | null;
  addons: Array<Record<string, unknown>>;
  tradeIn: Record<string, unknown> | null;
  vehicle: Record<string, unknown> | null;
  registration: Record<string, unknown> | null;
  delivery: Record<string, unknown> | null;
  evidence: Array<Record<string, unknown>>;
  findings: Array<Record<string, unknown>>;
}

function accessTokenRequired(accessToken?: string): string {
  const token = accessToken?.trim();
  if (!token) throw new Error('A Security human access token is required.');
  return token;
}

export function searchUc03Journeys(
  tenantId: string,
  query: string,
  accessToken?: string,
  limit = 12,
): Promise<JourneySearchResponse> {
  const search = new URLSearchParams({ q: query, limit: String(limit) });
  return auditCoreRequest<JourneySearchResponse>(
    `/v1/tenants/${encodeURIComponent(tenantId)}/uc03/journey-search?${search.toString()}`,
    {
      accessToken: accessTokenRequired(accessToken),
      cache: 'no-store',
    },
  );
}

export function getUc03JourneyOverview(
  tenantId: string,
  journeyId: string,
  accessToken?: string,
): Promise<JourneyOverview> {
  return auditCoreRequest<JourneyOverview>(
    `/v1/tenants/${encodeURIComponent(tenantId)}/uc03/journeys/${encodeURIComponent(journeyId)}/overview`,
    {
      accessToken: accessTokenRequired(accessToken),
      cache: 'no-store',
    },
  );
}
