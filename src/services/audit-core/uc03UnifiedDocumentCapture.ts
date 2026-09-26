import { auditCoreRequest } from './client';
import type { CaptureV2Applicability, CaptureV2Document } from './uc03DocumentCaptureV2';

/**
 * One upload surface for Booking and Delivery alike -- no stage picker.
 * The backend (uc03_unified_document_capture.py) merges both stages'
 * candidate document types into a single DI classification call and
 * decides Booking vs. Delivery itself once each document classifies
 * (reconcileUnifiedDocuments below).
 *
 * Phase 4 unification: this module now also owns the single GET/DELETE/
 * resync surface for both stages (uc03DocumentCaptureV2.ts's own
 * getBookingCaptureV2/getDeliveryCaptureV2/deleteBookingCaptureV2Document/
 * deleteDeliveryCaptureV2Document/resyncBookingCaptureV2/
 * resyncDeliveryCaptureV2 are gone -- the backend endpoints they called no
 * longer exist, and uc03DeliveryCaptureV2.ts itself was deleted once its
 * own submitDeliveryCaptureV2 lost its only caller when
 * DeliveryCaptureV2WorkspacePage/DeliveryDetailsV2Page were retired --
 * document submission is now a placeholder confirmation gesture, not a
 * backend call; individual and group rules already run per document as it
 * uploads). uc03DocumentCaptureV2.ts still exports the shared types and
 * completeBookingCaptureV2 (genuinely different concurrency model and
 * confirmation checks from Delivery's own history, not stage-duplicated
 * logic).
 */

interface UploadIntentResult {
  clientUploadId: string;
  documentId: string;
  uploadUrl: string;
  uploadHeaders: Record<string, string>;
  expiresAtUtc: string;
}

interface UploadIntentFailure {
  clientUploadId: string;
  errorCode: string;
  detail: string;
}

interface UploadIntentResponse {
  externalContextRef: string;
  uploads: UploadIntentResult[];
  // DI isolates each file on its own SAVEPOINT -- a problem with one file
  // (e.g. a stale conflicting intent) no longer fails every other file in
  // the same batch; it shows up here instead. Always present, but treat a
  // missing/undefined value as empty for safety against an older deploy.
  failures?: UploadIntentFailure[];
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
  // One entry per failed file, in whatever order they failed -- the intent
  // step's per-file failures (a stale conflicting intent, DI unreachable)
  // first, then any PUT/finalize failures. Empty when failed === 0.
  failureReasons: string[];
}

export interface UnifiedCaptureV2Requirement {
  requirementKey: string;
  stageCode: 'BOOKING' | 'DELIVERY';
  label: string;
  documentTypeKey: string;
  requirementLevel: 'REQUIRED' | 'CONDITIONAL' | 'OPTIONAL' | string;
  conditionKey: string | null;
  applicabilityState: CaptureV2Applicability;
  state: string;
  document: CaptureV2Document | null;
  canView: boolean;
  canDelete: boolean;
}

export interface UnifiedCaptureV2Upload extends CaptureV2Document {
  stageCode: 'BOOKING' | 'DELIVERY';
}

export interface UnifiedCaptureV2 {
  journeyId: string;
  externalContextRef: string;
  requirements: UnifiedCaptureV2Requirement[];
  uploads: UnifiedCaptureV2Upload[];
  bookingSubmitted: boolean;
  deliverySubmitted: boolean;
}

const EXTRACTION_POLL_WINDOW_MS = 2 * 60_000;
const LOCAL_CAPTURE_TIMEOUT_MS = 8_000;
const LIVE_CAPTURE_TIMEOUT_MS = 18_000;
const LIVE_REFRESH_MIN_INTERVAL_MS = 5_000;
const LOCAL_FALLBACK_POLL_WINDOW_MS = 30_000;
const LOCAL_FALLBACK_PREFIX = 'fallback:';
const PENDING_CLASSIFICATION_STATES = new Set(['RECEIVING', 'STORED', 'CLASSIFYING']);
const PENDING_PROCESSING_STATES = new Set(['NOT_STARTED', 'PROCESSING', 'RETRY_PENDING']);
const extractionPollStartedAt = new Map<string, number>();
const localFallbackPollStartedAt = new Map<string, number>();

interface UnifiedCaptureReadState {
  snapshot?: UnifiedCaptureV2;
  liveInFlight?: Promise<void>;
  lastLiveStartedAt: number;
}

const captureReadState = new Map<string, UnifiedCaptureReadState>();

function readKey(tenantId: string, journeyId: string): string {
  return `${tenantId}:${journeyId}`;
}

function markLocal(capture: UnifiedCaptureV2): UnifiedCaptureV2 {
  if (capture.externalContextRef.startsWith(LOCAL_FALLBACK_PREFIX)) return capture;
  return { ...capture, externalContextRef: `${LOCAL_FALLBACK_PREFIX}${capture.externalContextRef}` };
}

// Every mutation below (upload, delete, resync, reconcile) calls this so a
// screen's next read picks up the change instead of serving a stale
// snapshot -- react-query's own refetchInterval also stops polling once it
// sees a caught-up-looking snapshot, so without this a page reload would be
// the only way anything ever caught up.
export function invalidateUnifiedCaptureReadState(tenantId: string, journeyId: string): void {
  captureReadState.delete(readKey(tenantId, journeyId));
  localFallbackPollStartedAt.delete(journeyId);
}

function scheduleLiveRefresh(
  tenantId: string,
  journeyId: string,
  accessToken: string,
  state: UnifiedCaptureReadState,
): void {
  const now = Date.now();
  if (state.liveInFlight || now - state.lastLiveStartedAt < LIVE_REFRESH_MIN_INTERVAL_MS) return;

  state.lastLiveStartedAt = now;
  const captureBase = base(tenantId, journeyId);
  const refresh = auditCoreRequest<UnifiedCaptureV2>(`${captureBase}/capture`, {
    accessToken,
    cache: 'no-store',
    timeoutMs: LIVE_CAPTURE_TIMEOUT_MS,
  })
    .then((live) => {
      state.snapshot = live;
      localFallbackPollStartedAt.delete(journeyId);
    })
    .catch(() =>
      // Local (DB-only) fallback if the live call fails for any reason
      // (DI slow/unreachable) -- a background refresh must never leave the
      // screen stuck on nothing; the next scheduled refresh tries live again.
      auditCoreRequest<UnifiedCaptureV2>(`${captureBase}/capture-local`, {
        accessToken,
        cache: 'no-store',
        timeoutMs: LOCAL_CAPTURE_TIMEOUT_MS,
      })
        .then((local) => {
          state.snapshot = markLocal(local);
        })
        .catch(() => {
          // Durable Audit Core state remains usable either way -- this is
          // a background refresh, never the first paint's own source.
        }),
    )
    .finally(() => {
      if (state.liveInFlight === refresh) state.liveInFlight = undefined;
    });
  state.liveInFlight = refresh;
}

/**
 * Keep the checklist query live while either classification or the
 * extraction launched by an accepted classification is still moving, for
 * either stage's documents.
 */
export function unifiedCaptureV2IsProcessing(capture?: UnifiedCaptureV2): boolean {
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
    if (PENDING_CLASSIFICATION_STATES.has(state)) {
      pending = true;
      continue;
    }
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

/**
 * Reads the unified checklist: durable (DB-only) data first for fast, always-
 * available first paint, then a background live refresh (merging DI's two
 * phases -- see the backend's own section docstring for why that fixes the
 * "Missing"/lost-contentUrl bug a single-phase read had) that falls back to
 * the same local read if DI is slow or unreachable.
 */
export async function getUnifiedCaptureV2(
  tenantId: string,
  journeyId: string,
  accessToken?: string,
): Promise<UnifiedCaptureV2> {
  const access = token(accessToken);
  const key = readKey(tenantId, journeyId);
  const existing = captureReadState.get(key);

  if (existing?.snapshot) {
    scheduleLiveRefresh(tenantId, journeyId, access, existing);
    return existing.snapshot;
  }

  const captureBase = base(tenantId, journeyId);
  const local = markLocal(await auditCoreRequest<UnifiedCaptureV2>(`${captureBase}/capture-local`, {
    accessToken: access,
    cache: 'no-store',
    timeoutMs: LOCAL_CAPTURE_TIMEOUT_MS,
  }));
  const state: UnifiedCaptureReadState = {
    snapshot: local,
    lastLiveStartedAt: 0,
  };
  captureReadState.set(key, state);
  scheduleLiveRefresh(tenantId, journeyId, access, state);
  return local;
}

/**
 * Deletes one document regardless of which stage it belongs to -- the
 * backend resolves that from its own row, not from anything passed here.
 */
export async function deleteUnifiedCaptureV2Document(
  tenantId: string,
  journeyId: string,
  documentId: string,
  accessToken?: string,
): Promise<void> {
  await auditCoreRequest<void>(
    `${base(tenantId, journeyId)}/${encodeURIComponent(documentId)}`,
    {
      method: 'DELETE',
      accessToken: token(accessToken),
    },
  );
  invalidateUnifiedCaptureReadState(tenantId, journeyId);
}

export interface UnifiedResyncResult {
  documentsFound: number;
  documentsResynced: number;
  documentsNotYetExtracted: number;
  queuedDocumentCount: number;
}

/**
 * Forces every already-classified document, either stage, through the full
 * sync pipeline again. Safe to call any time; a document with nothing left
 * to do just costs one cheap, idempotent pass.
 */
export async function resyncUnifiedCaptureV2(
  tenantId: string,
  journeyId: string,
  accessToken?: string,
): Promise<UnifiedResyncResult> {
  const result = await auditCoreRequest<UnifiedResyncResult>(`${base(tenantId, journeyId)}/resync`, {
    method: 'POST',
    accessToken: token(accessToken),
  });
  invalidateUnifiedCaptureReadState(tenantId, journeyId);
  return result;
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
  if (!files.length) return { uploaded: 0, failed: 0, failureReasons: [] };
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
  const byUploadClientId = new Map(prepared.map((item) => [item.clientUploadId, item.filename]));
  let uploaded = 0;
  // Seed with the intent step's own per-file failures (DI isolates each
  // file on its own SAVEPOINT) -- these files never got a upload slot at
  // all, so the worker below never sees them.
  const failureReasons: string[] = (intent.failures ?? []).map(
    (failure) => `${byUploadClientId.get(failure.clientUploadId) ?? failure.clientUploadId}: ${failure.detail}`,
  );
  let failed = failureReasons.length;
  let nextIndex = 0;
  const worker = async () => {
    for (;;) {
      const index = nextIndex++;
      if (index >= intent.uploads.length) return;
      const upload = intent.uploads[index];
      const local = byClientId.get(upload.clientUploadId);
      if (!local) {
        failed += 1;
        failureReasons.push(`${upload.clientUploadId}: This file could not be matched to what was uploaded.`);
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
      } catch (error) {
        failed += 1;
        const reason = error instanceof Error ? error.message : 'This file could not be uploaded.';
        failureReasons.push(`${local.filename}: ${reason}`);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(6, intent.uploads.length) }, () => worker()));
  if (uploaded > 0) invalidateUnifiedCaptureReadState(tenantId, journeyId);
  return { uploaded, failed, failureReasons };
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
  invalidateUnifiedCaptureReadState(tenantId, journeyId);
}
