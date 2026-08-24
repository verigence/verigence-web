import { auditCoreRawRequest, auditCoreRequest } from './client';
import type { OutletAdmin } from './uc02Admin';

function auth(accessToken?: string) {
  return accessToken ? { accessToken } : {};
}

export function listProjectOutlets(tenantId: string, accessToken?: string) {
  return auditCoreRequest<OutletAdmin[]>(`/v1/tenants/${tenantId}/outlets`, auth(accessToken));
}

export async function deleteConfiguringDealerSetup(
  tenantId: string,
  dealerId: string,
  idempotencyKey: string,
  accessToken?: string,
): Promise<void> {
  await auditCoreRawRequest(`/v1/tenants/${tenantId}/dealers/${dealerId}/setup`, {
    method: 'DELETE',
    headers: { 'Idempotency-Key': idempotencyKey },
    ...auth(accessToken),
  });
}
