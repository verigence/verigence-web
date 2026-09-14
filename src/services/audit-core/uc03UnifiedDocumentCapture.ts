import { auditCoreRequest } from './client';
import { invalidateCaptureReadState as invalidateBookingCaptureReadState } from './uc03DocumentCaptureV2';
import { invalidateCaptureReadState as invalidateDeliveryCaptureReadState } from './uc03DeliveryCaptureV2';

/**
 * Booking's and Delivery's own getBookingCaptureV2/getDeliveryCaptureV2 each
 * keep an in-process read cache (see their own invalidateCaptureReadState)
 * that only clears when THEIR OWN upload/delete/resync functions call it.
 * A unified upload/reconcile writes to the exact same
 * document_capture_v2_documents rows those reads serve, through a
 * completely different module -- without clearing both caches here, every
 * screen reading either stage's capture data (Capture New Booking,
 * Delivery's own screen, Journey Documents) keeps showing whatever it last
 * saw before this upload, indefinitely (react-query's own refetchInterval
 * also stops polling once it sees a caught-up-looking empty snapshot, so a
 * page reload was the only way anything ever caught up).
 */
function invalidateBothCaptureReadStates(tenantId: string, journeyId: string): void {
  invalidateBookingCaptureReadState(tenantId, journeyId);
  invalidateDeliveryCaptureReadState(tenantId, journeyId);
}

/**
 * One upload surface for Booking and Delivery alike -- no stage picker.
 * The backend (uc03_unified_document_capture.py) merges both stages'
 * candidate document types into a single DI classification call and
 * decides Booking vs. Delivery itself once each document classifies
 * (reconcileUnifiedDocuments below). Deliberately parallel to, and
 * independent of, uc03DocumentCaptureV2.ts / uc03DeliveryCaptureV2.ts --
 * neither of those (nor the screens built on them) are touched.
 */

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
  return `/v2/tenants/${encodeURIComponent(tenantId)}/journeys/${encodeURIComponent(journeyId)}/uc03/documents`;
}

function clientUploadId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `unified-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export interface UnifiedUploadResult {
  uploaded: number;
  failed: number;
}

/**
 * Upload one or more files through the unified intake: create the merged
 * upload intents, PUT each file to its signed URL, then finalize each
 * document so DI proceeds to classify it. Call reconcileUnifiedDocuments
 * afterward (or let the page's own polling pick it up) to see where each
 * document landed.
 */
export async function uploadUnifiedCaptureFiles(
  tenantId: string,
  journeyId: string,
  files: File[],
  accessToken?: string,
): Promise<UnifiedUploadResult> {
  if (!files.length) return { uploaded: 0, failed: 0 };
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
    timeoutMs: 30_000,
    body: JSON.stringify({
      files: prepared.map(({ clientUploadId: id, filename, contentType }) => ({
        clientUploadId: id,
        filename,
        contentType,
      })),
    }),
  });

  const byClientId = new Map(prepared.map((item) => [item.clientUploadId, item]));
  let uploaded = 0;
  let failed = 0;
  let nextIndex = 0;
  const worker = async () => {
    for (;;) {
      const index = nextIndex++;
      if (index >= intent.uploads.length) return;
      const upload = intent.uploads[index];
      const local = byClientId.get(upload.clientUploadId);
      if (!local) {
        failed += 1;
        continue;
      }
      try {
        const headers = new Headers(upload.uploadHeaders);
        if (local.file.type && !headers.has('Content-Type')) headers.set('Content-Type', local.file.type);
        const put = await fetch(upload.uploadUrl, { method: 'PUT', headers, body: local.file });
        if (!put.ok) throw new Error(`Upload failed with HTTP ${put.status}.`);
        await auditCoreRequest<FinalizeResponse>(
          `${base(tenantId, journeyId)}/${encodeURIComponent(upload.documentId)}/finalize`,
          { method: 'POST', accessToken: access, timeoutMs: 30_000 },
        );
        uploaded += 1;
      } catch {
        failed += 1;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(6, intent.uploads.length) }, () => worker()));
  if (uploaded > 0) invalidateBothCaptureReadStates(tenantId, journeyId);
  return { uploaded, failed };
}

/**
 * Re-runs classification-based dispatch for every document on this journey
 * (both DI phases polled, merged) -- corrects stage_code/requirement_key on
 * anything newly classified since the last check, auto-starting Delivery
 * the first time something resolves there. Safe and cheap to call anytime;
 * the page calls it right after an upload completes.
 */
export async function reconcileUnifiedDocuments(
  tenantId: string,
  journeyId: string,
  accessToken?: string,
): Promise<void> {
  await auditCoreRequest<{ journeyId: string; reconciled: boolean }>(`${base(tenantId, journeyId)}/reconcile`, {
    method: 'POST',
    accessToken: token(accessToken),
    timeoutMs: 30_000,
  });
  invalidateBothCaptureReadStates(tenantId, journeyId);
}
