import { auditCoreRequest } from './client';

/** Why a discount is on the list. Invoice figures only, never the booking. */
/** KIT_AS_CASH (2026-11-06): the part of a consumer offer the unused accessories kit covers, a breach listed apart. */
/** OVER_UNLESS_INHOUSE (2026-11-14): a dealer discount above the grid tier it was judged at but within a
 *  higher tier (in-house insurance / EW) -- over only if those were not in-house, never counted as excess. */
export type DiscountVarianceStatus =
  'OVER_ENTITLEMENT' | 'UNDER_ENTITLEMENT' | 'ENTITLEMENT_UNKNOWN' | 'KIT_AS_CASH' | 'OVER_UNLESS_INHOUSE'
  /** FIGURES_DISAGREE (2026-11-14): the statement's figure is contradicted by the Tally ledger -- listed apart, never excess. */
  | 'FIGURES_DISAGREE';

/** What one document gives for the benefit. */
export interface DiscountReading { document: string | null; amount: string | null }

/** What the master offers: the dealer grid's tiers, or the consumer scheme. */
export interface DiscountOffer {
  source: string | null;
  tier?: string | null;
  tiers?: Record<string, string | null> | null;
  code?: string | null;
  eligibility?: string | null;
  kit?: string | null;
}

export interface DiscountVarianceItem {
  journeyId: string;
  journeyReference: string | null;
  customer: string | null;
  pc: string | null;
  outlet: string | null;
  /** Dealership, outlet and dates, for the screen's filters (2026-11-06). */
  dealerId?: string | null;
  dealer?: string | null;
  outletId?: string | null;
  bookingDate?: string | null;
  deliveryDate?: string | null;
  model: string | null;
  variant: string | null;
  discountKey: string;
  discount: string | null;
  status: DiscountVarianceStatus;
  entitled: string | null;
  /** The amount given (the name is kept from when only invoices counted). */
  invoice: string | null;
  variance: string | null;
  /** Where the given figure is from, as the Excess Discount check reads it (2026-10-31):
   * the billed column (NDC / cost sheet / invoice), the booking, or the reconciled figure. */
  givenFrom?: 'billed' | 'booking' | 'effective' | string | null;
  givenDocument?: string | null;
  /** KIT_AS_CASH: the kit amount given as cash. */
  kit?: string | null;
  /** ENTITLEMENT_UNKNOWN: why there is no entitlement to compare with; OVER_UNLESS_INHOUSE: what would cover it. */
  reason?: string | null;
  /** OVER_UNLESS_INHOUSE: what the grid allows with in-house insurance / EW. */
  ifInhouse?: string | null;
  /** FIGURES_DISAGREE: the Tally ledger's amount. */
  ledger?: string | null;
  /** What each document read for this benefit (2026-11-14: "check what is read, what is the offer"). */
  readings?: DiscountReading[];
  offer?: DiscountOffer | null;
}

export interface DiscountVarianceResponse {
  items: DiscountVarianceItem[];
  counts: { total: number; over: number; under: number; unknown: number; kitAsCash?: number; unlessInhouse?: number; figuresDisagree?: number; journeys: number };
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
  options: { dealerId?: string; outletId?: string; limit?: number; status?: DiscountVarianceStatus } = {},
  accessToken?: string,
): Promise<DiscountVarianceResponse> {
  const query = new URLSearchParams();
  if (options.dealerId) query.set('dealer_id', options.dealerId);
  if (options.outletId) query.set('outlet_id', options.outletId);
  if (options.limit) query.set('limit', String(options.limit));
  if (options.status) query.set('status', options.status);
  const suffix = query.toString() ? `?${query.toString()}` : '';
  return auditCoreRequest<DiscountVarianceResponse>(
    `/p2/v1/tenants/${encodeURIComponent(tenantId)}/discounts/variance${suffix}`,
    { method: 'GET', accessToken: token(accessToken), cache: 'no-store' },
  );
}
