import { AuditCoreTimeoutError, auditCoreRequest } from './client';
import { newIdempotencyKey } from './uc03Booking';

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

export interface UploadBookingCaptureV2Result extends FinalizeResponse {
  clientUploadId: string;
  originalFilename: string;
}

export interface BookingCaptureV2Completion {
  journeyId: string;
  phase: 'BOOKING';
  status: 'COMPLETED';
  aggregateVersion: number;
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

const EXTRACTION_POLL_WINDOW_MS = 2 * 60_000;
const CAPTURE_STATUS_TIMEOUT_MS = 3_000;
const LOCAL_FALLBACK_POLL_WINDOW_MS = 30_000;
const extractionPollStartedAt = new Map<string, number>();
const localFallbackPollStartedAt = new Map<string, number>();
const PENDING_PROCESSING_STATES = new Set(['NOT_STARTED', 'PROCESSING', 'RETRY_PENDING']);
const LOCAL_FALLBACK_PREFIX = 'fallback:';

/**
 * Keep the V2 capture query live while either classification or the extraction
 * launched by an accepted classification is still moving. Classification and
 * extraction are separate DI worker steps: the first CLASSIFIED response can
 * legitimately still say NOT_STARTED because the processing worker has not yet
 * claimed the newly-created INITIAL job.
 *
 * If the DI-backed status read exceeded the screen-read budget, getBookingCaptureV2
 * returns durable Audit Core state immediately and marks it as a local fallback.
 * Keep retrying that fallback for a bounded window so content links and processing
 * status recover automatically when DI becomes responsive again.
 */
export function captureV2HasPendingClassification(capture?: BookingCaptureV2): boolean {
  if (!capture) return false;
  const now = Date.now();
  let pending = false;

  if (capture.externalContextRef.startsWith(LOCAL_FALLBACK_PREFIX)) {
    const startedAt = localFallbackPollStartedAt.get(capture.journeyId) ?? now;
    localFallbackPollStartedAt.set(capture.journeyId, startedAt);
    if (now - startedAt < LOCAL_FALLBACK_POLL_WINDOW_MS) pending = true;
  } else {
    localFallbackPollStartedAt.delete(capture.journeyId);
  }

  for (const document of capture.uploads) {
    const state = document.state.toUpperCase();
    if (state === 'RECEIVING' || state === 'STORED' || state === 'CLASSIFYING') {
      pending = true;
      continue;
    }
    // Finalize can race a very fast classifier. Until a capture read provides the
    // accepted type, keep polling once more so requirements are reconciled correctly.
    if (state === 'CLASSIFIED' && !document.classifiedDocumentTypeKey) {
      pending = true;
      continue;
    }

    const processingStatus = document.processingStatus?.toUpperCase();
    if (state === 'CLASSIFIED' && processingStatus && PENDING_PROCESSING_STATES.has(processingStatus)) {
      const startedAt = extractionPollStartedAt.get(document.documentId) ?? now;
      extractionPollStartedAt.set(document.documentId, startedAt);
      if (now - startedAt < EXTRACTION_POLL_WINDOW_MS) pending = true;
      continue;
    }

    extractionPollStartedAt.delete(document.documentId);
  }

  return pending;
}

export async function getBookingCaptureV2(
  tenantId: string,
  journeyId: string,
  accessToken?: string,
): Promise<BookingCaptureV2> {
  const access = token(accessToken);
  const bookingBase = base(tenantId, journeyId);
  try {
    return await auditCoreRequest<BookingCaptureV2>(`${bookingBase}/capture`, {
      accessToken: access,
      cache: 'no-store',
      timeoutMs: CAPTURE_STATUS_TIMEOUT_MS,
    });
  } catch (error) {
    if (!(error instanceof AuditCoreTimeoutError)) throw error;
    const local = await auditCoreRequest<BookingCaptureV2>(`${bookingBase}/capture-local`, {
      accessToken: access,
      cache: 'no-store',
      timeoutMs: CAPTURE_STATUS_TIMEOUT_MS,
    });
    return { ...local, externalContextRef: `${LOCAL_FALLBACK_PREFIX}${local.externalContextRef}` };
  }
}

export async function uploadBookingCaptureV2Files(
  tenantId: string,
  journeyId: string,
  files: File[],
  accessToken?: string,
): Promise<UploadBookingCaptureV2Result[]> {
  if (files.length === 0) return [];

  const access = token(accessToken);
  const prepared = files.map((file) => ({
    clientUploadId: clientUploadId(),
    filename: file.name || 'document',
    contentType: file.type || null,
    file,
  }));

  const intent = await auditCoreRequest<UploadIntentResponse>(`${base(tenantId, journeyId)}/upload-intents`, {
    method: 'POST',
    accessToken: access,
    body: JSON.stringify({
      files: prepared.map(({ clientUploadId: id, filename, contentType }) => ({
        clientUploadId: id,
        filename,
        contentType,
      })),
    }),
  });

  const byClientId = new Map(prepared.map((item) => [item.clientUploadId, item]));
  const finalized = new Array<UploadBookingCaptureV2Result>(intent.uploads.length);
  let nextIndex = 0;

  const uploadWorker = async () => {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= intent.uploads.length) return;

      const upload = intent.uploads[index];
      const preparedItem = byClientId.get(upload.clientUploadId);
      if (!preparedItem) throw new Error(`Upload intent ${upload.clientUploadId} has no matching local file.`);

      const headers = new Headers(upload.uploadHeaders);
      if (preparedItem.file.type && !headers.has('Content-Type')) {
        headers.set('Content-Type', preparedItem.file.type);
      }
      const put = await fetch(upload.uploadUrl, {
        method: 'PUT',
        headers,
        body: preparedItem.file,
      });
      if (!put.ok) {
        throw new Error(`Document storage upload failed with HTTP ${put.status}.`);
      }

      const result = await auditCoreRequest<FinalizeResponse>(
        `${base(tenantId, journeyId)}/documents/${encodeURIComponent(upload.documentId)}/finalize`,
        {
          method: 'POST',
          accessToken: access,
        },
      );
      finalized[index] = {
        ...result,
        clientUploadId: upload.clientUploadId,
        originalFilename: preparedItem.filename,
      };
    }
  };

  // Six parallel direct-to-storage streams match the DI classifier pool and avoid
  // over-saturating mobile connections while still keeping multi-document capture fast.
  const concurrency = Math.min(6, intent.uploads.length);
  await Promise.all(Array.from({ length: concurrency }, () => uploadWorker()));
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

export async function completeBookingCaptureV2(
  tenantId: string,
  journeyId: string,
  aggregateVersion: number,
  accessToken?: string,
): Promise<BookingCaptureV2Completion> {
  return auditCoreRequest<BookingCaptureV2Completion>(`${base(tenantId, journeyId)}/complete`, {
    method: 'POST',
    accessToken: token(accessToken),
    headers: {
      'Idempotency-Key': newIdempotencyKey('uc03-v2-booking-complete'),
      'If-Match': `"${aggregateVersion}"`,
    },
  });
}
