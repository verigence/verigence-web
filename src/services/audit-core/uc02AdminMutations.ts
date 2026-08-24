import { auditCoreRequest } from './client';
import type { DealerAdmin, OutletAdmin } from './uc02Admin';

function auth(accessToken?: string) {
  return accessToken ? { accessToken } : {};
}

export interface ProjectMasterDeleteResult {
  tenantId: string;
  action: string;
  status: string;
  deletedRows: Record<string, number>;
}

export function patchDealerAdmin(
  tenantId: string,
  dealerId: string,
  versionNo: number,
  payload: { dealerName?: string; status?: string },
  accessToken?: string,
) {
  return auditCoreRequest<DealerAdmin>(`/v1/tenants/${tenantId}/dealers/${dealerId}`, {
    method: 'PATCH',
    headers: { 'If-Match': `"${versionNo}"` },
    body: JSON.stringify(payload),
    ...auth(accessToken),
  });
}

export function deleteDealerAdmin(
  tenantId: string,
  dealerId: string,
  versionNo: number,
  accessToken?: string,
) {
  return auditCoreRequest<void>(`/v1/tenants/${tenantId}/dealers/${dealerId}`, {
    method: 'DELETE',
    headers: { 'If-Match': `"${versionNo}"` },
    ...auth(accessToken),
  });
}

export function patchOutletAdmin(
  tenantId: string,
  dealerId: string,
  outletId: string,
  versionNo: number,
  payload: {
    outletName?: string;
    outletClassification?: 'ONSITE' | 'SATELLITE';
    addressText?: string | null;
    city?: string | null;
    stateRegion?: string | null;
    postalCode?: string | null;
    googlePlaceId?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    monthlyVehicleVolume?: number | null;
    status?: string;
  },
  accessToken?: string,
) {
  return auditCoreRequest<OutletAdmin>(
    `/v1/tenants/${tenantId}/dealers/${dealerId}/outlets/${outletId}`,
    {
      method: 'PATCH',
      headers: { 'If-Match': `"${versionNo}"` },
      body: JSON.stringify(payload),
      ...auth(accessToken),
    },
  );
}

export function deleteOutletAdmin(
  tenantId: string,
  dealerId: string,
  outletId: string,
  versionNo: number,
  accessToken?: string,
) {
  return auditCoreRequest<void>(
    `/v1/tenants/${tenantId}/dealers/${dealerId}/outlets/${outletId}`,
    {
      method: 'DELETE',
      headers: { 'If-Match': `"${versionNo}"` },
      ...auth(accessToken),
    },
  );
}

export function resetProjectMasters(tenantId: string, accessToken?: string) {
  return auditCoreRequest<ProjectMasterDeleteResult>(
    `/v1/tenants/${tenantId}/project-masters/reset`,
    { method: 'POST', ...auth(accessToken) },
  );
}

export function deleteMahindraSegmentMaster(
  tenantId: string,
  segmentId: string,
  accessToken?: string,
) {
  return auditCoreRequest<ProjectMasterDeleteResult>(
    `/v1/tenants/${tenantId}/project-masters/mahindra/segments/${segmentId}`,
    { method: 'DELETE', ...auth(accessToken) },
  );
}

export function deleteMahindraDiscountPolicy(tenantId: string, accessToken?: string) {
  return auditCoreRequest<ProjectMasterDeleteResult>(
    `/v1/tenants/${tenantId}/project-masters/mahindra/discount-policy`,
    { method: 'DELETE', ...auth(accessToken) },
  );
}
