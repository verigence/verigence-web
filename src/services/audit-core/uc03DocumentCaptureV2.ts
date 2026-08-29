import { auditCoreRequest } from './client';

export type CaptureV2Applicability = 'APPLICABLE' | 'NOT_APPLICABLE' | 'UNRESOLVED';

export interface CaptureV2Declaration {
  conditionKey: string;
  applicable: boolean;
  documentAvailable: boolean | null;
  source: 'PC' | 'DOCUMENT';
}

export interface CaptureV2Document {
  documentId: string;
  clientUploadId: string;
  state: string;
  classifiedDocumentTypeKey: string | null;
  originalFilename: string;
  contentUrl: string | null;
  processingStatus: string | null;
}

export interface CaptureV2Requirement {
  requirementKey: string;
  label: string;
  documentTypeKey: string;
  requirementLevel: 'REQUIRED' | 'CONDITIONAL' | 'OPTIONAL' | string;
  conditionKey: string | null;
  applicabilityState: CaptureV2Applicability;
  state: string;
  document: CaptureV2Document | null;
  canView: boolean;
  canDelete: boolean;
  needsDecision: boolean;
  blocksContinue: boolean;
}

export interface BookingCaptureV2 {
  journeyId: string;
  externalContextRef: string;
  phase: 'BOOKING';
  requirements: CaptureV2Requirement[];
  uploads: CaptureV2Document[];
  declarations: CaptureV2Declaration[];
  canContinue: boolean;
}

interface UploadIntentResult {
  clientUploadId: string;
  documentId: string;
  uploadUrl: string;
  uploadHeaders: Record<string, string>;
  expiresAtUtc: string;
}

interface UploadIntentResponse {
  externalContextRef: string;
  uploads: UploadIntentResult[];
}

interface FinalizeResponse {
  documentId: string;
  state: string;
}

function token(accessToken?: string): string {
  const value = accessToken?.trim();
  if (!value) throw new Error('A Security human access token is required.');
  return value;
}

function base(tenantId: string, journeyId: string): string {
  return `/v2/tenants/${encodeURIComponent(tenantId)}/journeys/${encodeURIComponent(journeyId)}/booking`;
}

function clientUploadId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `upload-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function captureV2HasPendingClassification(capture?: BookingCaptureV2): boolean {
  if (!capture) return false;
  return capture.uploads.some((document) => {
    const state = document.state.toUpperCase();
    return state === 'RECEIVING' || state === 'STORED' || state === 'CLASSIFYING';
  });
}

export async function getBookingCaptureV2(
  tenantId: string,
  journeyId: string,
  accessToken?: string,
): Promise<BookingCaptureV2> {
  return auditCoreRequest<BookingCaptureV2>(`${base(tenantId, journeyId)}/capture`, {
    accessToken: token(accessToken),
    cache: 'no-store',
  });
}

export async function uploadBookingCaptureV2Files(
  tenantId: string,
  journeyId: string,
  files: File[],
  accessToken?: string,
): Promise<FinalizeResponse[]> {
  if (files.length === 0) return [];

  const prepared = files.map((file) => ({
    clientUploadId: clientUploadId(),
    filename: file.name || 'document',
    contentType: file.type || null,
    file,
  }));

  const intent = await auditCoreRequest<UploadIntentResponse>(`${base(tenantId, journeyId)}/upload-intents`, {
    method: 'POST',
    accessToken: token(accessToken),
    body: JSON.stringify({
      files: prepared.map(({ clientUploadId: id, filename, contentType }) => ({
        clientUploadId: id,
        filename,
        contentType,
      })),
    }),
  });

  const byClientId = new Map(prepared.map((item) => [item.clientUploadId, item.file]));
  const finalized: FinalizeResponse[] = [];

  for (const upload of intent.uploads) {
    const file = byClientId.get(upload.clientUploadId);
    if (!file) throw new Error(`Upload intent ${upload.clientUploadId} has no matching local file.`);

    const headers = new Headers(upload.uploadHeaders);
    if (file.type && !headers.has('Content-Type')) headers.set('Content-Type', file.type);
    const put = await fetch(upload.uploadUrl, {
      method: 'PUT',
      headers,
      body: file,
    });
    if (!put.ok) {
      throw new Error(`Document storage upload failed with HTTP ${put.status}.`);
    }

    finalized.push(await auditCoreRequest<FinalizeResponse>(
      `${base(tenantId, journeyId)}/documents/${encodeURIComponent(upload.documentId)}/finalize`,
      {
        method: 'POST',
        accessToken: token(accessToken),
      },
    ));
  }

  return finalized;
}

export async function deleteBookingCaptureV2Document(
  tenantId: string,
  journeyId: string,
  documentId: string,
  accessToken?: string,
): Promise<void> {
  await auditCoreRequest<void>(
    `${base(tenantId, journeyId)}/documents/${encodeURIComponent(documentId)}`,
    {
      method: 'DELETE',
      accessToken: token(accessToken),
    },
  );
}

export async function setBookingCaptureV2Declaration(
  tenantId: string,
  journeyId: string,
  conditionKey: string,
  applicable: boolean,
  documentAvailable: boolean | null,
  accessToken?: string,
): Promise<BookingCaptureV2> {
  return auditCoreRequest<BookingCaptureV2>(
    `${base(tenantId, journeyId)}/declarations/${encodeURIComponent(conditionKey)}`,
    {
      method: 'PUT',
      accessToken: token(accessToken),
      body: JSON.stringify({ applicable, documentAvailable }),
    },
  );
}
