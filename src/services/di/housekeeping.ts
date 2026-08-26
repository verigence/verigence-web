export type TenantTransactionDataStatus = {
  tenantId: string;
  documents: number;
  storageObjects: number;
  extractedFacts: number;
  acceptedFieldValues: number;
  processingJobs: number;
  processingRuns: number;
  processorInvocations: number;
};

export type TenantTransactionPurgeResult = {
  tenantId: string;
  purgeStatus: 'REMOVED';
  deletedDocuments: number;
  deletedStorageObjects: number;
  configurationPreserved: boolean;
};

type ApiEnvelope<T> = {
  errorCode?: string | null;
  errorMessage?: string | null;
  data?: T | null;
  detail?: unknown;
  code?: string;
  title?: string;
};

const DI_BASE = '/di';

function authHeaders(accessToken: string, json = false): HeadersInit {
  const result: Record<string, string> = { Authorization: `Bearer ${accessToken}` };
  if (json) result['Content-Type'] = 'application/json';
  return result;
}

function problemText(payload: ApiEnvelope<unknown>, status: number): string {
  if (typeof payload.detail === 'string') return payload.detail;
  if (payload.errorMessage) return payload.errorMessage;
  if (payload.title) return payload.title;
  if (payload.code) return payload.code;
  return `DI request failed (HTTP ${status})`;
}

async function unwrap<T>(response: Response, operation: string): Promise<T> {
  let payload: ApiEnvelope<T>;
  try {
    payload = await response.json() as ApiEnvelope<T>;
  } catch {
    throw new Error(`${operation} returned non-JSON HTTP ${response.status}.`);
  }
  if (!response.ok || (payload.errorCode && payload.errorCode !== '000')) {
    throw new Error(`${operation}: ${problemText(payload, response.status)}`);
  }
  if (payload.data === undefined || payload.data === null) {
    throw new Error(`${operation} returned no data.`);
  }
  return payload.data;
}

function base(tenantId: string): string {
  return `${DI_BASE}/v1/tenants/${encodeURIComponent(tenantId)}/admin/housekeeping/transaction-data`;
}

export async function getTenantTransactionDataStatus(
  tenantId: string,
  accessToken: string,
): Promise<TenantTransactionDataStatus> {
  const response = await fetch(base(tenantId), {
    headers: authHeaders(accessToken),
    cache: 'no-store',
  });
  return unwrap<TenantTransactionDataStatus>(response, 'Load DI housekeeping status');
}

export async function purgeTenantTransactionData(
  tenantId: string,
  accessToken: string,
): Promise<TenantTransactionPurgeResult> {
  const response = await fetch(`${base(tenantId)}/purge`, {
    method: 'POST',
    headers: authHeaders(accessToken, true),
    body: JSON.stringify({
      confirmTenantId: tenantId,
      confirmation: 'PURGE_TRANSACTION_DATA',
    }),
  });
  return unwrap<TenantTransactionPurgeResult>(response, 'Purge DI tenant transaction data');
}
