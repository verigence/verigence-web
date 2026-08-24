export type DiDocumentType = {
  key: string;
  label: string;
  category: 'GOVT_ID' | 'PRINTABLE' | 'HANDWRITTEN' | 'ADDITIONAL';
};

export type DiSubject = {
  tenantId: string;
  subjectId: string;
  subjectType: string;
  displayName: string | null;
  status: string;
};

export type DiDocument = {
  documentId: string;
  documentTypeKey: string | null;
  uploadStatus: string;
  processingStatus: string | null;
  confirmationStatus: string | null;
  confidenceScore: number | null;
  registeredAtUtc: string;
};

export type DiUploadResult = {
  documentId: string;
  uploadStatus: string;
  processingStatus: string | null;
  errorCode: string | null;
  errorMessage: string | null;
};

export type DiField = {
  canonicalFieldId: string;
  fieldKey: string;
  currentValue: unknown;
  valueSource: string | null;
  confidenceScore: number | null;
  versionNo: number | null;
  acceptedAt: string | null;
};

export type DiAnalysis = Record<string, unknown>;

type ApiEnvelope<T> = {
  errorCode?: string | null;
  errorMessage?: string | null;
  data?: T | null;
  detail?: unknown;
  code?: string;
  title?: string;
};

const DEFAULT_BASE_URL = 'https://di-api-dev.up.railway.app';
const DEFAULT_TEST_TENANT_ID = '70c5661e-bab2-46e7-8199-0f9c32acbac3';
const DEFAULT_TEST_ACTOR = 'e2e-di-rules';

export const DI_TEST_DOCUMENT_TYPES: DiDocumentType[] = [
  { key: 'booking_form', label: 'Booking Form', category: 'HANDWRITTEN' },
  { key: 'booking_docket', label: 'Booking Docket', category: 'PRINTABLE' },
  { key: 'pan_card', label: 'PAN Card', category: 'GOVT_ID' },
  { key: 'aadhaar', label: 'Aadhaar Card', category: 'GOVT_ID' },
  { key: 'passport', label: 'Passport', category: 'GOVT_ID' },
  { key: 'driving_licence', label: 'Driving Licence', category: 'GOVT_ID' },
  { key: 'voter_id', label: 'Voter ID', category: 'GOVT_ID' },
  { key: 'corporate_id', label: 'Corporate ID', category: 'PRINTABLE' },
  { key: 'bank_statement', label: 'Bank Statement', category: 'PRINTABLE' },
  { key: 'bank_statement_extract', label: 'Bank Statement Extract', category: 'PRINTABLE' },
  { key: 'loan_statement', label: 'Loan Statement', category: 'PRINTABLE' },
  { key: 'customer_ledger', label: 'Customer Ledger', category: 'PRINTABLE' },
  { key: 'insurance_cover', label: 'Insurance Cover Note', category: 'PRINTABLE' },
  { key: 'utility_bill', label: 'Utility Bill', category: 'PRINTABLE' },
  { key: 'salary_slip', label: 'Salary Slip', category: 'PRINTABLE' },
  { key: 'signed_declaration', label: 'Signed Declaration', category: 'HANDWRITTEN' },
  { key: 'supporting_document', label: 'Supporting Document', category: 'ADDITIONAL' },
  { key: 'dealer_receipt', label: 'Dealer Receipt', category: 'PRINTABLE' },
  { key: 'upi_transaction', label: 'UPI Transaction', category: 'ADDITIONAL' },
  { key: 'delivery_order_cover', label: 'Delivery Order Cover', category: 'PRINTABLE' },
  { key: 'upi_screenshot', label: 'UPI Screenshot', category: 'ADDITIONAL' },
];

export const diTestConfig = {
  baseUrl: (import.meta.env.VITE_DI_TEST_BASE_URL?.trim() || DEFAULT_BASE_URL).replace(/\/$/, ''),
  tenantId: import.meta.env.VITE_DI_TEST_TENANT_ID?.trim() || DEFAULT_TEST_TENANT_ID,
  actorId: import.meta.env.VITE_DI_TEST_ACTOR_ID?.trim() || DEFAULT_TEST_ACTOR,
};

export function isDiTestConsoleAvailable(): boolean {
  const explicit = import.meta.env.VITE_ENABLE_DI_TEST_CONSOLE?.trim().toLowerCase();
  if (explicit === 'true') return true;
  if (explicit === 'false') return false;
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname.toLowerCase();
  return host === 'localhost' || host === '127.0.0.1' || host.includes('dev') || host.endsWith('.pages.dev');
}

function devToken(): string {
  return `mock.${diTestConfig.tenantId}.${diTestConfig.actorId}.TENANT_ADMIN`;
}

function headers(json = false): HeadersInit {
  const value: Record<string, string> = { Authorization: `Bearer ${devToken()}` };
  if (json) value['Content-Type'] = 'application/json';
  return value;
}

function stringifyProblem(payload: ApiEnvelope<unknown>, status: number): string {
  if (typeof payload.detail === 'string') return payload.detail;
  if (payload.errorMessage) return payload.errorMessage;
  if (payload.title) return payload.title;
  if (payload.code) return payload.code;
  return `DI request failed (HTTP ${status})`;
}

async function envelope<T>(response: Response, operation: string, allowBusinessError = false): Promise<ApiEnvelope<T>> {
  let payload: ApiEnvelope<T>;
  try {
    payload = await response.json() as ApiEnvelope<T>;
  } catch {
    throw new Error(`${operation} returned non-JSON HTTP ${response.status}.`);
  }
  if (!response.ok) throw new Error(`${operation}: ${stringifyProblem(payload, response.status)}`);
  if (!allowBusinessError && payload.errorCode && payload.errorCode !== '000') {
    throw new Error(`${operation}: ${payload.errorMessage || payload.errorCode}`);
  }
  return payload;
}

export async function diHealth(): Promise<Record<string, unknown>> {
  const response = await fetch(`${diTestConfig.baseUrl}/health/ready`);
  if (!response.ok) throw new Error(`DI readiness failed (HTTP ${response.status}).`);
  return await response.json() as Record<string, unknown>;
}

export async function createDiTestSubject(displayName: string): Promise<DiSubject> {
  const response = await fetch(`${diTestConfig.baseUrl}/v1/tenants/${encodeURIComponent(diTestConfig.tenantId)}/subjects`, {
    method: 'POST',
    headers: headers(true),
    body: JSON.stringify({ subjectType: 'PERSON', displayName: displayName.trim() || 'DI E2E Test Subject' }),
  });
  const payload = await envelope<DiSubject>(response, 'Create DI test subject');
  if (!payload.data?.subjectId) throw new Error('DI created the subject without returning subjectId.');
  return payload.data;
}

export async function uploadDiTestDocument(subjectId: string, documentTypeKey: string, file: File): Promise<DiUploadResult> {
  const form = new FormData();
  form.append('documentTypeKey', documentTypeKey.trim());
  form.append('file', file, file.name);
  const response = await fetch(
    `${diTestConfig.baseUrl}/v1/tenants/${encodeURIComponent(diTestConfig.tenantId)}/subjects/${encodeURIComponent(subjectId)}/documents`,
    { method: 'POST', headers: headers(false), body: form },
  );
  const payload = await envelope<Omit<DiUploadResult, 'errorCode' | 'errorMessage'>>(response, 'Upload DI document', true);
  if (!payload.data?.documentId) throw new Error(`Upload DI document: ${payload.errorMessage || 'documentId was not returned.'}`);
  return {
    ...payload.data,
    errorCode: payload.errorCode ?? null,
    errorMessage: payload.errorMessage ?? null,
  };
}

export async function getDiTestDocument(subjectId: string, documentId: string): Promise<DiDocument> {
  const response = await fetch(
    `${diTestConfig.baseUrl}/v1/tenants/${encodeURIComponent(diTestConfig.tenantId)}/subjects/${encodeURIComponent(subjectId)}/documents/${encodeURIComponent(documentId)}`,
    { headers: headers(false), cache: 'no-store' },
  );
  const payload = await envelope<DiDocument>(response, 'Get DI document');
  if (!payload.data) throw new Error('Get DI document returned no data.');
  return payload.data;
}

export async function getDiTestFields(subjectId: string, documentId: string): Promise<DiField[]> {
  const response = await fetch(
    `${diTestConfig.baseUrl}/v1/tenants/${encodeURIComponent(diTestConfig.tenantId)}/subjects/${encodeURIComponent(subjectId)}/documents/${encodeURIComponent(documentId)}/fields`,
    { headers: headers(false), cache: 'no-store' },
  );
  const payload = await envelope<{ documentId: string; fields: DiField[] }>(response, 'Fetch DI extracted fields');
  return payload.data?.fields ?? [];
}

export async function analyseDiTestDocuments(documentIds: string[]): Promise<DiAnalysis> {
  const response = await fetch(`${diTestConfig.baseUrl}/v1/tenants/${encodeURIComponent(diTestConfig.tenantId)}/analyse`, {
    method: 'POST',
    headers: headers(true),
    body: JSON.stringify({ documentIds }),
  });
  const payload = await envelope<DiAnalysis>(response, 'Run DI rule analysis');
  return payload.data ?? {};
}
