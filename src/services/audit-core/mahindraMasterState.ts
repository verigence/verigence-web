import { auditCoreRequest } from './client';
import type { MahindraMasterImport } from './uc02Admin';

function auth(accessToken?: string) {
  return accessToken ? { accessToken } : {};
}

function idempotencyHeaders(key: string): HeadersInit {
  return { 'Idempotency-Key': key };
}

export function listMahindraMasterImports(tenantId: string, accessToken?: string) {
  return auditCoreRequest<MahindraMasterImport[]>(
    `/v1/tenants/${tenantId}/mahindra-masters/imports`,
    auth(accessToken),
  );
}

export function uploadMahindraNativeSegmentMaster(
  tenantId: string,
  segmentId: string,
  file: File,
  effectiveFrom: string | null,
  idempotencyKey: string,
  accessToken?: string,
) {
  const body = new FormData();
  body.append('file', file);
  if (effectiveFrom) body.append('effectiveFrom', effectiveFrom);
  return auditCoreRequest<MahindraMasterImport>(
    `/v1/tenants/${tenantId}/mahindra-masters/segments/${segmentId}/native-imports`,
    {
      method: 'POST',
      headers: idempotencyHeaders(idempotencyKey),
      body,
      ...auth(accessToken),
    },
  );
}

export function uploadMahindraNativeDiscountPolicy(
  tenantId: string,
  file: File,
  effectiveFrom: string | null,
  idempotencyKey: string,
  accessToken?: string,
) {
  const body = new FormData();
  body.append('file', file);
  if (effectiveFrom) body.append('effectiveFrom', effectiveFrom);
  return auditCoreRequest<MahindraMasterImport>(
    `/v1/tenants/${tenantId}/mahindra-masters/discount-policy/native-imports`,
    {
      method: 'POST',
      headers: idempotencyHeaders(idempotencyKey),
      body,
      ...auth(accessToken),
    },
  );
}
