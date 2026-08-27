import { auditCoreRequest } from './client';

export interface BookingUploadRequirementContext {
  requirementRef: string;
  requirementKey: string;
  documentTypeKey: string;
  requirementLevel: string;
  requirementStatus: string;
  applicabilityState: 'APPLICABLE' | 'NOT_APPLICABLE' | 'UNRESOLVED';
  applicabilityReason: string | null;
  currentDocumentId: string | null;
  activeDocumentIds: string[];
  repeatable: boolean;
  captureEligibleFieldKeys: string[];
}

export interface BookingDocumentUploadContext {
  journeyId: string;
  externalContextRef: string;
  requirements: BookingUploadRequirementContext[];
}

export interface BookingReviewContentAccess {
  contentUrl: string | null;
  contentUrlExpiresAtUtc: string | null;
  mimeType: string | null;
}

export interface BookingReviewCachedDocument extends BookingReviewContentAccess {
  requirementRef: string;
  requirementKey: string;
  documentTypeKey: string;
  documentId: string;
  repeatable: boolean;
}

export interface BookingReviewCachedContext {
  journeyId: string;
  externalContextRef: string;
  documents: BookingReviewCachedDocument[];
  cachedAt: number;
}

export interface BookingExtractionFieldDecision {
  fieldKey: string;
  sourceFactRef: string;
  sourceFactVersion: 1;
  sourceConfidence: number | null;
  decision: 'APPROVED' | 'CORRECTED';
  approvedValue: unknown;
}

export interface BookingExtractionDecisionResult {
  fieldKey: string;
  decision: 'APPROVED' | 'CORRECTED';
  owningDomainKey: string;
  owningRecordReference: string;
  eventId: string;
}

export interface BookingExtractionDecisionResponse {
  journeyId: string;
  requirementRef: string;
  documentId: string;
  aggregateVersion: number;
  decisions: BookingExtractionDecisionResult[];
}

type StoredBookingReviewCache = {
  context: BookingDocumentUploadContext;
  directUploads: Record<string, string[]>;
  contentAccessByDocument?: Record<string, BookingReviewContentAccess>;
  cachedAt: number;
};

const contextCache = new Map<string, Promise<BookingDocumentUploadContext>>();
const directUploadIds = new Map<string, Map<string, string[]>>();
const contentAccessByJourney = new Map<string, Map<string, BookingReviewContentAccess>>();
const latestDecisionVersions = new Map<string, number>();
const REVIEW_CACHE_PREFIX = 'uc03-booking-review-di-context-v2';

function token(accessToken?: string): string {
  const value = accessToken?.trim();
  if (!value) throw new Error('A Security human access token is required.');
  return value;
}

function key(tenantId: string, journeyId: string): string {
  return `${tenantId}:${journeyId}`;
}

function reviewStorageKey(tenantId: string, journeyId: string): string {
  return `${REVIEW_CACHE_PREFIX}:${tenantId}:${journeyId}`;
}

function newIdempotencyKey(prefix: string): string {
  const random = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${random}`;
}

function contextPath(tenantId: string, journeyId: string): string {
  return `/v1/tenants/${encodeURIComponent(tenantId)}/journeys/${encodeURIComponent(journeyId)}`
    + '/booking/document-upload-context';
}

function readStoredReviewCache(tenantId: string, journeyId: string): StoredBookingReviewCache | null {
  try {
    const raw = sessionStorage.getItem(reviewStorageKey(tenantId, journeyId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredBookingReviewCache;
    if (!parsed?.context || parsed.context.journeyId !== journeyId || !parsed.context.externalContextRef) return null;
    return parsed;
  } catch {
    return null;
  }
}

function directUploadsForJourney(tenantId: string, journeyId: string): Map<string, string[]> {
  const journeyKey = key(tenantId, journeyId);
  const current = directUploadIds.get(journeyKey);
  if (current) return current;

  const stored = readStoredReviewCache(tenantId, journeyId);
  const hydrated = new Map<string, string[]>(Object.entries(stored?.directUploads ?? {}));
  directUploadIds.set(journeyKey, hydrated);
  return hydrated;
}

function contentAccessForJourney(
  tenantId: string,
  journeyId: string,
): Map<string, BookingReviewContentAccess> {
  const journeyKey = key(tenantId, journeyId);
  const current = contentAccessByJourney.get(journeyKey);
  if (current) return current;

  const stored = readStoredReviewCache(tenantId, journeyId);
  const hydrated = new Map<string, BookingReviewContentAccess>(
    Object.entries(stored?.contentAccessByDocument ?? {}),
  );
  contentAccessByJourney.set(journeyKey, hydrated);
  return hydrated;
}

function persistReviewCache(
  tenantId: string,
  journeyId: string,
  context?: BookingDocumentUploadContext,
): void {
  try {
    const existing = readStoredReviewCache(tenantId, journeyId);
    const activeContext = context ?? existing?.context;
    if (!activeContext) return;
    const directUploads = Object.fromEntries(directUploadsForJourney(tenantId, journeyId));
    const contentAccessByDocument = Object.fromEntries(contentAccessForJourney(tenantId, journeyId));
    sessionStorage.setItem(reviewStorageKey(tenantId, journeyId), JSON.stringify({
      context: activeContext,
      directUploads,
      contentAccessByDocument,
      cachedAt: Date.now(),
    } satisfies StoredBookingReviewCache));
  } catch {
    // Session cache is an optimization only. Direct upload/review must continue
    // normally even when browser/mobile WebView storage is unavailable.
  }
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

export function getCachedBookingReviewContext(
  tenantId: string,
  journeyId: string,
): BookingReviewCachedContext | null {
  const stored = readStoredReviewCache(tenantId, journeyId);
  if (!stored) return null;

  const localUploads = directUploadsForJourney(tenantId, journeyId);
  const contentAccess = contentAccessForJourney(tenantId, journeyId);
  const documents: BookingReviewCachedDocument[] = [];

  for (const requirement of stored.context.requirements) {
    const localIds = localUploads.get(requirement.requirementRef) ?? [];
    const persistedIds = unique([
      ...(requirement.activeDocumentIds ?? []),
      ...(requirement.currentDocumentId ? [requirement.currentDocumentId] : []),
    ]);

    const documentIds = requirement.repeatable
      ? unique([...persistedIds, ...localIds])
      : localIds.length > 0
        ? [localIds[localIds.length - 1]]
        : requirement.currentDocumentId
          ? [requirement.currentDocumentId]
          : persistedIds.length > 0
            ? [persistedIds[persistedIds.length - 1]]
            : [];

    for (const documentId of documentIds) {
      const access = contentAccess.get(documentId);
      documents.push({
        requirementRef: requirement.requirementRef,
        requirementKey: requirement.requirementKey,
        documentTypeKey: requirement.documentTypeKey || requirement.requirementKey,
        documentId,
        repeatable: requirement.repeatable,
        contentUrl: access?.contentUrl ?? null,
        contentUrlExpiresAtUtc: access?.contentUrlExpiresAtUtc ?? null,
        mimeType: access?.mimeType ?? null,
      });
    }
  }

  return {
    journeyId,
    externalContextRef: stored.context.externalContextRef,
    documents,
    cachedAt: stored.cachedAt,
  };
}

export function clearBookingDocumentUploadContext(tenantId: string, journeyId: string): void {
  contextCache.delete(key(tenantId, journeyId));
}

export function rememberBookingDocumentContentAccess(
  tenantId: string,
  journeyId: string,
  documentId: string,
  access: BookingReviewContentAccess,
): void {
  const byDocument = contentAccessForJourney(tenantId, journeyId);
  byDocument.set(documentId, access);
  contentAccessByJourney.set(key(tenantId, journeyId), byDocument);
  persistReviewCache(tenantId, journeyId);
}

export function rememberDirectBookingUpload(
  tenantId: string,
  journeyId: string,
  requirementRef: string,
  documentId: string,
  repeatable: boolean,
  contentAccess?: BookingReviewContentAccess,
): void {
  const byRequirement = directUploadsForJourney(tenantId, journeyId);
  if (repeatable) {
    const current = byRequirement.get(requirementRef) ?? [];
    if (!current.includes(documentId)) byRequirement.set(requirementRef, [...current, documentId]);
  } else {
    // A single-value replacement is immediately the only local/current document.
    // The older DI document remains historical in DI/Audit Core; it simply should
    // not appear as another active upload in the current PC screen.
    byRequirement.set(requirementRef, [documentId]);
  }
  directUploadIds.set(key(tenantId, journeyId), byRequirement);
  if (contentAccess) {
    contentAccessForJourney(tenantId, journeyId).set(documentId, contentAccess);
  }
  persistReviewCache(tenantId, journeyId);
}

export function locallyUploadedDocumentIds(
  tenantId: string,
  journeyId: string,
  requirementRef: string,
): string[] {
  return directUploadsForJourney(tenantId, journeyId).get(requirementRef) ?? [];
}

export async function prepareBookingDocumentUploadContext(
  tenantId: string,
  journeyId: string,
  accessToken?: string,
  force = false,
): Promise<BookingDocumentUploadContext> {
  const cacheKey = key(tenantId, journeyId);
  if (force) contextCache.delete(cacheKey);
  let request = contextCache.get(cacheKey);
  if (!request) {
    request = auditCoreRequest<BookingDocumentUploadContext>(contextPath(tenantId, journeyId), {
      method: 'POST',
      accessToken: token(accessToken),
      cache: 'no-store',
    }).then((context) => {
      persistReviewCache(tenantId, journeyId, context);
      return context;
    }).catch((cause) => {
      contextCache.delete(cacheKey);
      throw cause;
    });
    contextCache.set(cacheKey, request);
  }
  return request;
}

export async function submitBookingDocumentExtractionDecisions(
  tenantId: string,
  journeyId: string,
  requirementRef: string,
  documentId: string,
  fields: BookingExtractionFieldDecision[],
  accessToken?: string,
): Promise<BookingExtractionDecisionResponse> {
  const result = await auditCoreRequest<BookingExtractionDecisionResponse>(
    `/v1/tenants/${encodeURIComponent(tenantId)}/journeys/${encodeURIComponent(journeyId)}`
      + '/booking/document-extraction-decisions',
    {
      method: 'POST',
      accessToken: token(accessToken),
      headers: { 'Idempotency-Key': newIdempotencyKey('uc03-booking-di-review') },
      body: JSON.stringify({ requirementRef, documentId, fields }),
    },
  );
  latestDecisionVersions.set(key(tenantId, journeyId), result.aggregateVersion);
  return result;
}

export function latestBookingDocumentDecisionVersion(
  tenantId: string,
  journeyId: string,
  fallback: number,
): number {
  return latestDecisionVersions.get(key(tenantId, journeyId)) ?? fallback;
}
