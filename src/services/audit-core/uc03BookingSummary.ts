import { auditCoreRequest } from './client';

export interface BookingSummaryProduct {
  productSkuId: string;
  modelCode: string;
  modelName: string;
  variantCode: string;
  variantName: string;
  colourCode: string | null;
  colourName: string | null;
  selectionSource: string | null;
}

export interface BookingSummary {
  bookingId: string;
  journeyId: string;
  bookingReference: string | null;
  bookingDate: string | null;
  salesStaffId: string;
  product: BookingSummaryProduct;
}

function token(accessToken?: string): string {
  const value = accessToken?.trim();
  if (!value) throw new Error('A Security human access token is required.');
  return value;
}

export async function getBookingSummary(
  tenantId: string,
  journeyId: string,
  accessToken?: string,
): Promise<BookingSummary> {
  return auditCoreRequest<BookingSummary>(
    `/v1/tenants/${encodeURIComponent(tenantId)}/journeys/${encodeURIComponent(journeyId)}/booking`,
    {
      accessToken: token(accessToken),
      cache: 'no-store',
    },
  );
}
