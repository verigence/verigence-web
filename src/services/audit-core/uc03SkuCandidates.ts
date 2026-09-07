import { auditCoreRequest } from './client';

export interface SkuCandidateRequest {
  modelName: string;
  variantName?: string | null;
  colourName?: string | null;
  skuCode?: string | null;
  totalCommercialAmount: number;
  currencyCode?: string | null;
  maxCandidates?: number;
}

export interface SkuCandidate {
  rank: number;
  productSkuId: string;
  skuCode: string;
  modelName: string;
  variantName: string;
  colourName: string | null;
  displayLabel: string;
  masterTotalAmount: string;
  observedTotalCommercialAmount: string;
  commercialDifferenceAmount: string;
  commercialDifferencePercent: string;
  score: string;
  candidateStatus: 'CONFIRMED' | 'TENTATIVE';
  confirmationRequired: boolean;
}

export interface SkuCandidateResponse {
  journeyId: string;
  effectiveOn: string;
  priceListVersionId: string;
  currencyCode: string;
  status: 'BOOKING_SKU_RESOLVED' | 'CONFIRMATION_REQUIRED' | 'CONFIRMED_SKU_PRESERVED';
  selectionNote: string;
  bookingRecordUpdated: boolean;
  mostLikelyProductSkuId: string | null;
  matchingRowCount: number;
  resolutionBasis: 'DIRECT_SKU' | 'MODEL_PRICE_EXACT_UNIQUE' | 'MULTIPLE_EXACT_BOOKING_MATCHES' | 'EXISTING_CONFIRMED';
  deliveryValidationRequired: true;
  candidates: SkuCandidate[];
}

function token(accessToken?: string): string {
  const value = accessToken?.trim();
  if (!value) throw new Error('A Security human access token is required.');
  return value;
}

/**
 * POST /v2/tenants/{tenantId}/journeys/{journeyId}/booking/sku-candidates
 *
 * Resolves the most likely product SKU from Booking Form evidence.
 * Persists the result to journey_products unless a CONFIRMED SKU already exists.
 * Throws VAC-SKU-001 (422) when no exact match is found in the price master.
 */
export async function deriveSkuCandidates(
  tenantId: string,
  journeyId: string,
  command: SkuCandidateRequest,
  accessToken?: string,
): Promise<SkuCandidateResponse> {
  return auditCoreRequest<SkuCandidateResponse>(
    `/v2/tenants/${encodeURIComponent(tenantId)}/journeys/${encodeURIComponent(journeyId)}/booking/sku-candidates`,
    {
      method: 'POST',
      accessToken: token(accessToken),
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(command),
      cache: 'no-store',
    },
  );
}
