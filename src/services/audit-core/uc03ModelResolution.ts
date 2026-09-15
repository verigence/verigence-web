import { auditCoreRequest } from './client';

export interface ModelResolutionCandidate {
  productSkuId: string;
  skuCode: string;
  modelName: string;
  variantName: string | null;
  colourName: string | null;
  exShowroomPrice: string | null;
  totalPrice: string | null;
}

export interface ModelResolutionCandidatesResponse {
  journeyId: string;
  findingId: string;
  reviewedModelName: string | null;
  reviewedVariantName: string | null;
  reviewedColourName: string | null;
  matchStage: string;
  candidates: ModelResolutionCandidate[];
}

export interface ConfirmModelResolutionSkuResponse {
  journeyId: string;
  productSkuId: string;
  skuCode: string;
  modelName: string;
  variantName: string | null;
  colourName: string | null;
  flagsResolved: number;
}

function token(accessToken?: string): string {
  const value = accessToken?.trim();
  if (!value) throw new Error('A Security human access token is required.');
  return value;
}

/**
 * GET /v2/tenants/{tenantId}/journeys/{journeyId}/booking/model-resolution
 *
 * Today's shortlist for an open MODEL_NOT_IDENTIFIED gap, computed fresh
 * against the current effective price list. Throws a 404 AuditCoreHttpError
 * when there is nothing open to resolve -- callers should treat that as
 * "nothing to show", not an error banner.
 */
export async function getModelResolutionCandidates(
  tenantId: string,
  journeyId: string,
  accessToken?: string,
): Promise<ModelResolutionCandidatesResponse> {
  return auditCoreRequest<ModelResolutionCandidatesResponse>(
    `/v2/tenants/${encodeURIComponent(tenantId)}/journeys/${encodeURIComponent(journeyId)}/booking/model-resolution`,
    { method: 'GET', accessToken: token(accessToken), cache: 'no-store' },
  );
}

/**
 * POST /v2/tenants/{tenantId}/journeys/{journeyId}/booking/model-resolution/confirm-sku
 *
 * A PC's manual pick when the model couldn't auto-resolve. Pins the SKU,
 * resolves the open finding and completes its linked Task.
 */
export async function confirmModelResolutionSku(
  tenantId: string,
  journeyId: string,
  productSkuId: string,
  accessToken?: string,
): Promise<ConfirmModelResolutionSkuResponse> {
  return auditCoreRequest<ConfirmModelResolutionSkuResponse>(
    `/v2/tenants/${encodeURIComponent(tenantId)}/journeys/${encodeURIComponent(journeyId)}/booking/model-resolution/confirm-sku`,
    {
      method: 'POST',
      accessToken: token(accessToken),
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productSkuId }),
      cache: 'no-store',
    },
  );
}
