import { auditCoreRequest } from './client';

/** Why a discount is on the list. Invoice figures only, never the booking. */
export type DiscountVarianceStatus = 'OVER_ENTITLEMENT' | 'UNDER_ENTITLEMENT' | 'ENTITLEMENT_UNKNOWN';

export interface DiscountVarianceItem {
  journeyId: string;
  journeyReference: string | null;
  customer: string | null;
  pc: string | null;
  outlet: string | null;
  model: string | null;
  variant: string | null;
  discountKey: string;
  discount: string | null;
  status: DiscountVarianceStatus;
  entitled: string | null;
  invoice: string | null;
  variance: string | null;
}

export interface DiscountVarianceResponse {
  items: DiscountVarianceItem[];
  counts: { total: number; over: number; under: number; unknown: number; journeys: number };
  notYetCalculated: number;
  toleranceRupees: number;
}

function token(accessToken?: string): string {
  const value = accessToken?.trim();
  if (!value) throw new Error('A Security human access token is required.');
  return value;
}

/**
 * GET /p2/v1/tenants/{tenantId}/discounts/variance
 *
 * Every discount whose invoice figure is not what the booking was entitled to,
 * with its category, PC, outlet, customer and car model. Read-only.
 */
export async function getDiscountVariance(
  tenantId: string,
  options: { dealerId?: string; outletId?: string; limit?: number } = {},
  accessToken?: string,
): Promise<DiscountVarianceResponse> {
  const query = new URLSearchParams();
  if (options.dealerId) query.set('dealer_id', options.dealerId);
  if (options.outletId) query.set('outlet_id', options.outletId);
  if (options.limit) query.set('limit', String(options.limit));
  const suffix = query.toString() ? `?${query.toString()}` : '';
  return auditCoreRequest<DiscountVarianceResponse>(
    `/p2/v1/tenants/${encodeURIComponent(tenantId)}/discounts/variance${suffix}`,
    { method: 'GET', accessToken: token(accessToken), cache: 'no-store' },
  );
}
