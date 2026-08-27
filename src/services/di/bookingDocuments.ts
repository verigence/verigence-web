import { ensureCorrelationHeader, responseCorrelationId } from '../../observability/correlation';

const DEFAULT_DI_BASE_URL = 'https://di-api-dev.up.railway.app';
const configuredBaseUrl = (
  import.meta.env.VITE_DI_BASE_URL?.trim()
  || import.meta.env.VITE_DI_TEST_BASE_URL?.trim()
  || DEFAULT_DI_BASE_URL
).replace(/\/$/, '');

type DiEnvelope<T> = {
  errorCode?: string | null;
  errorMessage?: string | null;
  data?: T | null;
  detail?: unknown;
  title?: string;
  code?: string;
};

export interface PcBookingDocumentStatus {
  documentId: string;
  requirementRef: string;
  documentTypeKey: string | null;
  uploadStatus: string;
  processingStatus: string;
  registeredAtUtc: string;
}

export interface PcBookingDocumentList {
  externalContextRef: string;
  documents: PcBookingDocumentStatus[];
}

export interface PcBookingExtractionFact {
  sourceFactRef: string;
  sourceFactVersion: number;
  fieldKey: string;
  foundStatus: string;
  rawValue: string | null;
  normalizedValue: unknown;
  confidenceScore: number | null;
  pageNo: number | null;
  evidenceRegion: {
    type?: string;
    coordinateSystem?: string;
    box?: [number, number, number, number];
    [key: string]: unknown;
  } | null;
}

export interface PcBookingExtractionReview {
  documentId: string;
  processingStatus: string;
  facts: PcBookingExtractionFact[];
}

export interface PcBookingUploadResult {
  documentId: string;
  uploadStatus: string;
  processingStatus: string;
}

export interface PcBookingDocumentContent {
  documentId: string;
  url: string;
  mimeType: string;
  expiresInSeconds: number;
}

export class DiBookingHttpError extends Error {
  readonly status: number;
  readonly correlationId?: string;

  constructor(status: number, message: string, correlationId?: string) {
    super(message);
    this.name = 'DiBookingHttpError';
    this.status = status;
    this.correlationId = correlationId;
  }
}

function token(accessToken?: string): string {
  const value = accessToken?.trim();
  if (!value) throw new Error('A Security human access token is required.');
  return value;
}

function contextBase(tenantId: string, externalContextRef: string): string {
  return `${configuredBaseUrl}/v1/tenants/${encodeURIComponent(tenantId)}`
    + `/audit-storage-contexts/${encodeURIComponent(externalContextRef)}/pc-booking-documents`;
}

function problemMessage(payload: DiEnvelope<unknown> | undefined, status: number): string {
  if (typeof payload?.detail === 'string') return payload.detail;
  if (payload?.errorMessage) return payload.errorMessage;
  if (payload?.title) return payload.title;
  if (payload?.code) return payload.code;
  return `Document Intelligence request failed with HTTP ${status}.`;
}

async function request(
  url: string,
  accessToken: string,
  options: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(options.headers);
  const correlationId = ensureCorrelationHeader(headers);
  headers.set('Authorization', `Bearer ${token(accessToken)}`);
  const response = await fetch(url, { ...options, headers, credentials: 'include' });
  const echoed = responseCorrelationId(response, correlationId);
  if (!response.ok) {
    let payload: DiEnvelope<unknown> | undefined;
    try {
      payload = await response.clone().json() as DiEnvelope<unknown>;
    } catch {
      payload = undefined;
    }
    throw new DiBookingHttpError(response.status, problemMessage(payload, response.status), echoed);
  }
  return response;
}

async function envelope<T>(response: Response, operation: string): Promise<T> {
  const payload = await response.json() as DiEnvelope<T>;
  if (payload.errorCode && payload.errorCode !== '000') {
    throw new Error(`${operation}: ${payload.errorMessage || payload.errorCode}`);
  }
  if (!payload.data) throw new Error(`${operation}: DI returned no data.`);
  return payload.data;
}

export async function uploadPcBookingDocument(
  tenantId: string,
  externalContextRef: string,
  requirementRef: string,
  documentTypeKey: string,
  file: File,
  accessToken: string,
): Promise<PcBookingUploadResult> {
  const form = new FormData();
  form.append('requirementRef', requirementRef);
  form.append('documentTypeKey', documentTypeKey);
  form.append('file', file, file.name);
  const response = await request(contextBase(tenantId, externalContextRef), accessToken, {
    method: 'POST',
    body: form,
  });
  return envelope<PcBookingUploadResult>(response, 'Upload Booking document');
}

export async function listPcBookingDocuments(
  tenantId: string,
  externalContextRef: string,
  accessToken: string,
): Promise<PcBookingDocumentList> {
  const response = await request(contextBase(tenantId, externalContextRef), accessToken, {
    cache: 'no-store',
  });
  return envelope<PcBookingDocumentList>(response, 'List Booking documents');
}

export async function getPcBookingExtractionReview(
  tenantId: string,
  externalContextRef: string,
  documentId: string,
  accessToken: string,
): Promise<PcBookingExtractionReview> {
  const response = await request(
    `${contextBase(tenantId, externalContextRef)}/${encodeURIComponent(documentId)}/extraction-review`,
    accessToken,
    { cache: 'no-store' },
  );
  return envelope<PcBookingExtractionReview>(response, 'Read Booking extraction');
}

export async function getPcBookingDocumentContent(
  tenantId: string,
  externalContextRef: string,
  documentId: string,
  accessToken: string,
): Promise<PcBookingDocumentContent> {
  const response = await request(
    `${contextBase(tenantId, externalContextRef)}/${encodeURIComponent(documentId)}/content-access`,
    accessToken,
    { cache: 'no-store' },
  );
  return envelope<PcBookingDocumentContent>(response, 'Open Booking document');
}
