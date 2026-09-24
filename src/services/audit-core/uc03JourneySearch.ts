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

export interface JourneyReviewedField {
  reviewedFieldId: string;
  documentId: string;
  evidenceId?: string | null;
  stageCode: string;
  documentTypeKey?: string | null;
  requirementKey?: string | null;
  originalFilename?: string | null;
  canonicalFieldId?: string | null;
  fieldKey: string;
  semanticKey: string;
  businessCategory: string;
  extractedValue: unknown;
  modifiedValue: unknown;
  effectiveValue: unknown;
  displayValue: unknown;
  hasEffectiveValue: boolean;
  isModified: boolean;
  confidenceScore?: number | null;
  confidenceScale?: string | null;
  sourceFactVersion: number;
  reviewedByActorId?: string | null;
  reviewedAtUtc?: string | null;
  isPreferred: boolean;
  precedenceReason?: string | null;
}

export interface JourneyResolvedReviewedValue {
  value: unknown;
  reviewedFieldId?: string | null;
  documentId?: string | null;
  evidenceId?: string | null;
  documentTypeKey?: string | null;
  fieldKey?: string | null;
  stageCode?: string | null;
  businessCategory?: string | null;
  sourceFactVersion?: number | null;
  precedenceReason?: string | null;
}

export interface SkuPricingComponent {
  componentKey: string;
  masterAmount: number;
  bookingAmount: number | null;
  deviationAmount: number | null;
  deviationPercent: number | null;
  currencyCode: string;
  // True when this row shares its commercial key with another master
  // component (today, only the two extended-warranty tiers) and the
  // actual amount matched the OTHER one instead -- a genuine, still-
  // relevant alternative the price list offers, not a deviation.
  isAlternative: boolean;
}

export interface SkuPricing {
  skuCode: string;
  modelName: string | null;
  variantName: string | null;
  colourName: string | null;
  selectionStatus: string;
  selectionMethod: string | null;
  priceListVersionId: string;
  currencyCode: string;
  masterTotalAmount: number;
  masterComponents: SkuPricingComponent[];
  bookingTotalPrice: number | null;
  bookingNetAmount: number | null;
  bookingExShowroom: number | null;
  bookingDiscount: number | null;
  bookingBonus: number | null;
  totalDeviationAmount: number | null;
  totalDeviationPercent: number | null;
}

export interface JourneyOverview {
  journey: Record<string, unknown>;
  customer: Record<string, unknown>;
  booking: Record<string, unknown> | null;
  commercialLines: Array<Record<string, unknown>>;
  discounts: Array<Record<string, unknown>>;
  payments: Array<Record<string, unknown>>;
  receipts?: Array<Record<string, unknown>>;
  invoices?: Array<Record<string, unknown>>;
  finance: Record<string, unknown> | null;
  insurance: Record<string, unknown> | null;
  addons: Array<Record<string, unknown>>;
  tradeIn: Record<string, unknown> | null;
  scrappageCertificates?: Array<Record<string, unknown>>;
  vehicle: Record<string, unknown> | null;
  registration: Record<string, unknown> | null;
  delivery: Record<string, unknown> | null;
  evidence: Array<Record<string, unknown>>;
  findings: Array<Record<string, unknown>>;
  reviewedFields?: JourneyReviewedField[];
  resolvedReviewedValues?: Record<string, JourneyResolvedReviewedValue>;
  skuPricing: SkuPricing | null;
  /** One row per (lineKind, componentKey, sourceDocumentType) whenever more
   * than one document has ever reported a value for a commercial-line or
   * discount amount -- e.g. what the booking form said vs. what a later
   * invoice said for the same component. */
  dealSourceBreakdown?: DealSourceValue[];
  /** Present only when the primary vehicle-sale invoice's own date differs
   * from the Booking date AND actually resolves to a different price-list
   * or discount-scheme version -- i.e. there's a genuine choice to
   * surface, not just two different dates that happen to land on the same
   * masters. Booking date is always the one currently applied. */
  dealPricePointOptions?: DealPricePointOptions | null;
}

export interface DealPricePointOptions {
  bookingDate: string;
  invoiceDate: string;
  priceListDiffers: boolean;
  discountsDiffer: boolean;
}

export interface DealSourceValue {
  lineKind: 'COMMERCIAL' | 'DISCOUNT';
  componentKey: string;
  sourceDocumentType: string;
  amount: number;
  sourceEvidenceId?: string | null;
  sourceDocumentId?: string | null;
  updatedAtUtc?: string;
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
      // Journey 360 composes a broad audit view and can legitimately exceed the
      // generic 10-second read timeout while Security and Core data are resolved.
      // The UI must not convert a successful but slower response into a false
      // "Journey unavailable" state.
      timeoutMs: 30_000,
    },
  );
}
