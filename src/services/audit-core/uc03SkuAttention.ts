import { auditCoreRequest } from './client';

/** How badly a figure on the booking contradicts the vehicle set on it. */
export type ContradictionLevel = 'VARIANT' | 'MODEL';

export interface SkuAttentionTask {
  taskId: string;
  taskType: string;
  severity: string;
  status: string;
  title: string | null;
  raisedAt: string | null;
}

export interface SkuAttentionItem {
  journeyId: string;
  journeyReference: string | null;
  customer: string | null;
  pcName: string | null;
  dealerName: string | null;
  outletName: string | null;
  bookedModel: string | null;
  bookedVariant: string | null;
  pricedOn: string | null;
  pricingDateFromAPerson: boolean;
  hasAPriceBook: boolean;
  pinnedSkuId: string | null;
  pinnedSkuCode: string | null;
  pinnedVehicle: string | null;
  selectionStatus: string | null;
  matchBasis: string | null;
  figureRead: string | null;
  figureDocument: string | null;
  contradiction: { level: ContradictionLevel; priceNames: string; gap: string | null } | null;
  reasons: string[];
  tasks: SkuAttentionTask[];
}

export interface SkuAttentionResponse {
  needsAttention: number;
  byReason: Record<string, number>;
  reasonLabels: Record<string, string>;
  contradicted: Record<string, number>;
  items: SkuAttentionItem[];
}

function token(accessToken?: string): string {
  const value = accessToken?.trim();
  if (!value) throw new Error('A Security human access token is required.');
  return value;
}

/**
 * GET /p2/v1/tenants/{tenantId}/sku/attention
 *
 * Every booking with open SKU or pricing work: several options, no price
 * available, no usable booking date, or a price that contradicts the vehicle
 * set. Read-only; a Team Lead and a Reviewer both hold the permission.
 */
export async function getSkuAttention(
  tenantId: string,
  options: { dealerId?: string; outletId?: string; limit?: number } = {},
  accessToken?: string,
): Promise<SkuAttentionResponse> {
  const query = new URLSearchParams();
  if (options.dealerId) query.set('dealer_id', options.dealerId);
  if (options.outletId) query.set('outlet_id', options.outletId);
  if (options.limit) query.set('limit', String(options.limit));
  const suffix = query.toString() ? `?${query.toString()}` : '';
  return auditCoreRequest<SkuAttentionResponse>(
    `/p2/v1/tenants/${encodeURIComponent(tenantId)}/sku/attention${suffix}`,
    { method: 'GET', accessToken: token(accessToken), cache: 'no-store' },
  );
}
