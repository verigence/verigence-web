import { AuditCoreTimeoutError, auditCoreRequest } from './client';
import { newIdempotencyKey } from './uc03Booking';
import type { CaptureV2Document, CaptureV2Requirement } from './uc03DocumentCaptureV2';

export interface DeliveryCaptureV2 {
  journeyId: string;
  externalContextRef: string;
  phase: 'DELIVERY';
  requirements: CaptureV2Requirement[];
  uploads: CaptureV2Document[];
  canSubmit: boolean;
  submitted: boolean;
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

export interface DeliveryCaptureV2Submission {
  journeyId: string;
  phase: 'DELIVERY';
  status: 'SUBMITTED';
  aggregateVersion: number;
  raisedFlagIds: string[];
}

function token(accessToken?: string): string {
  const value = accessToken?.trim();
  if (!value) throw new Error('A Security human access token is required.');
  return value;
}

function base(tenantId: string, journeyId: string): string {
  return `/v2/tenants/${encodeURIComponent(tenantId)}/journeys/${encodeURIComponent(journeyId)}/delivery`;
}

function clientUploadId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `delivery-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

const PENDING_CLASSIFICATION_STATES = new Set(['RECEIVING', 'STORED', 'CLASSIFYING']);
const CAPTURE_STATUS_TIMEOUT_MS = 3_000;
const LOCAL_FALLBACK_POLL_WINDOW_MS = 30_000;
const LOCAL_FALLBACK_PREFIX = 'fallback:';
const localFallbackPollStartedAt = new Map<string, number>();

export function deliveryCaptureV2IsProcessing(capture?: DeliveryCaptureV2): boolean {
  if (!capture) return false;

  const now = Date.now();
  if (capture.externalContextRef.startsWith(LOCAL_FALLBACK_PREFIX)) {
    const startedAt = localFallbackPollStartedAt.get(capture.journeyId) ?? now;
    localFallbackPollStartedAt.set(capture.journeyId, startedAt);
    if (now - startedAt < LOCAL_FALLBACK_POLL_WINDOW_MS) return true;
  } else {
    localFallbackPollStartedAt.delete(capture.journeyId);
  }

  return capture.uploads.some((document) => {
    const state = document.state.toUpperCase();
    if (PENDING_CLASSIFICATION_STATES.has(state)) return true;
    return state === 'CLASSIFIED' && !document.classifiedDocumentTypeKey;
  });
}

export async function getDeliveryCaptureV2(
  tenantId: string,
  journeyId: string,
  accessToken?: string,
): Promise<DeliveryCaptureV2> {
  const access = token(accessToken);
  const deliveryBase = base(tenantId, journeyId);
  try {
    return await auditCoreRequest<DeliveryCaptureV2>(`${deliveryBase}/capture`, {
      accessToken: access,
      cache: 'no-store',
      timeoutMs: CAPTURE_STATUS_TIMEOUT_MS,
    });
  } catch (error) {
    if (!(error instanceof AuditCoreTimeoutError)) throw error;
    const local = await auditCoreRequest<DeliveryCaptureV2>(`${deliveryBase}/capture-local`, {
      accessToken: access,
      cache: 'no-store',
      timeoutMs: CAPTURE_STATUS_TIMEOUT_MS,
    });
    return { ...local, externalContextRef: `${LOCAL_FALLBACK_PREFIX}${local.externalContextRef}` };
  }
}

export async function uploadDeliveryCaptureV2Files(
  tenantId: string,
  journeyId: string,
  files: File[],
  accessToken?: string,
): Promise<void> {
  if (!files.length) return;
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
  let nextIndex = 0;
  const worker = async () => {
    while (true) {
      const index = nextIndex++;
      if (index >= intent.uploads.length) return;
      const upload = intent.uploads[index];
      const local = byClientId.get(upload.clientUploadId);
      if (!local) throw new Error('Delivery upload intent does not match a selected file.');
      const headers = new Headers(upload.uploadHeaders);
      if (local.file.type && !headers.has('Content-Type')) headers.set('Content-Type', local.file.type);
      const put = await fetch(upload.uploadUrl, { method: 'PUT', headers, body: local.file });
      if (!put.ok) throw new Error(`Delivery document upload failed with HTTP ${put.status}.`);

      // Finalize is only a latency hint. Once the direct object PUT succeeds, DI status
      // reconciliation can recover a lost/failed finalize and queue classification later.
      // Do not turn a safely stored Delivery document into a false upload failure.
      try {
        await auditCoreRequest<FinalizeResponse>(
          `${base(tenantId, journeyId)}/documents/${encodeURIComponent(upload.documentId)}/finalize`,
          { method: 'POST', accessToken: access },
        );
      } catch {
        // The next Delivery status read reconciles RECEIVING objects that already exist.
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(6, intent.uploads.length) }, () => worker()));
}

export async function deleteDeliveryCaptureV2Document(
  tenantId: string,
  journeyId: string,
  documentId: string,
  accessToken?: string,
): Promise<void> {
  await auditCoreRequest<void>(`${base(tenantId, journeyId)}/documents/${encodeURIComponent(documentId)}`, {
    method: 'DELETE',
    accessToken: token(accessToken),
  });
}

export async function submitDeliveryCaptureV2(
  tenantId: string,
  journeyId: string,
  accessToken?: string,
): Promise<DeliveryCaptureV2Submission> {
  return auditCoreRequest<DeliveryCaptureV2Submission>(`${base(tenantId, journeyId)}/submit`, {
    method: 'POST',
    accessToken: token(accessToken),
    headers: { 'Idempotency-Key': newIdempotencyKey('uc03-v2-delivery-submit') },
  });
}