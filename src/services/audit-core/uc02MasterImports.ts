import { auditCoreRawRequest, auditCoreRequest } from './client';

function auth(accessToken?: string) {
  return accessToken ? { accessToken } : {};
}

export interface MasterImportRow {
  rowNumber: number;
  parsedData: Record<string, unknown>;
  validationStatus: 'VALID' | 'WARNING' | 'ERROR';
  messages: string[];
}

export interface MasterImportRowsPage {
  items: MasterImportRow[];
  offset: number;
  limit: number;
  total: number;
}

export function listMasterImportRows(
  tenantId: string,
  importId: string,
  validationStatus?: MasterImportRow['validationStatus'],
  accessToken?: string,
) {
  const query = validationStatus ? `?validationStatus=${validationStatus}` : '';
  return auditCoreRequest<MasterImportRowsPage>(
    `/v1/tenants/${tenantId}/project-master-imports/${importId}/rows${query}`,
    auth(accessToken),
  );
}

export async function downloadMasterImportErrorReport(
  tenantId: string,
  importId: string,
  accessToken?: string,
): Promise<Blob> {
  const response = await auditCoreRawRequest(
    `/v1/tenants/${tenantId}/project-master-imports/${importId}/error-report`,
    auth(accessToken),
  );
  return response.blob();
}
