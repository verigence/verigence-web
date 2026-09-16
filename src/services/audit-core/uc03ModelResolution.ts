import { auditCoreRequest } from './client';

function idempotencyKey(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

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

export interface ModelCatalogSku {
  productSkuId: string;
  skuCode: string;
  modelName: string;
  variantName: string | null;
  colourName: string | null;
  fuel: string | null;
  transmission: string | null;
  drive: string | null;
  seater: string | null;
  exShowroomPrice: string | null;
  totalPrice: string | null;
}

export interface ModelCatalogResponse {
  journeyId: string;
  skus: ModelCatalogSku[];
}

/**
 * GET /v2/tenants/{tenantId}/journeys/{journeyId}/booking/model-resolution/catalog
 *
 * Every SKU in the Journey's currently effective price list, unconditionally
 * -- unlike getModelResolutionCandidates, works whether or not the Journey's
 * own SKU is already confirmed. Backs the "Modify Model" picker used to
 * propose a correction to an already-confirmed selection.
 */
export async function getModelCatalog(
  tenantId: string,
  journeyId: string,
  accessToken?: string,
): Promise<ModelCatalogResponse> {
  return auditCoreRequest<ModelCatalogResponse>(
    `/v2/tenants/${encodeURIComponent(tenantId)}/journeys/${encodeURIComponent(journeyId)}/booking/model-resolution/catalog`,
    { method: 'GET', accessToken: token(accessToken), cache: 'no-store' },
  );
}

export interface ModelSelectionCorrectionTask {
  taskId: string;
  journeyId: string;
  previousProductSkuId: string;
  proposedProductSkuId: string;
  proposedSkuCode: string;
  reason: string;
}

/**
 * POST /v2/tenants/{tenantId}/journeys/{journeyId}/booking/model-resolution/propose-correction
 *
 * A PC's proposed correction to an already-CONFIRMED SKU. Creates a Task
 * assigned to the Team Lead (Task Queue, not Audit Review) -- Completing it
 * reassigns the SKU and recomputes the deal; Cancelling it leaves the
 * original SKU untouched.
 */
export async function proposeModelSelectionCorrection(
  tenantId: string,
  journeyId: string,
  input: { productSkuId: string; reason: string },
  accessToken?: string,
): Promise<ModelSelectionCorrectionTask> {
  return auditCoreRequest<ModelSelectionCorrectionTask>(
    `/v2/tenants/${encodeURIComponent(tenantId)}/journeys/${encodeURIComponent(journeyId)}/booking/model-resolution/propose-correction`,
    {
      method: 'POST',
      accessToken: token(accessToken),
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey(),
      },
      body: JSON.stringify(input),
      cache: 'no-store',
    },
  );
}
