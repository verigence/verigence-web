import { auditCoreRequest } from './client';

export interface WorkItemProductEnrichment {
  journeyId: string;
  model?: string | null;
  variant?: string | null;
  colour?: string | null;
  productLabel?: string | null;
  source: 'CORE' | 'DI';
}

interface WorkItemEnrichmentResponse {
  items: WorkItemProductEnrichment[];
}

export async function enrichUc03WorkItems(
  tenantId: string,
  journeyIds: string[],
  accessToken?: string,
): Promise<WorkItemEnrichmentResponse> {
  if (journeyIds.length === 0) return { items: [] };
  return auditCoreRequest<WorkItemEnrichmentResponse>(
    `/v1/tenants/${encodeURIComponent(tenantId)}/uc03/work-items/enrich`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ journeyIds: journeyIds.slice(0, 10) }),
      accessToken,
      timeoutMs: 8_000,
    },
  );
}
