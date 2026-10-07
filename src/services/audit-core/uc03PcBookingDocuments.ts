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

interface BookingReviewContentAccess {
  contentUrl: string | null;
  contentUrlExpiresAtUtc: string | null;
  mimeType: string | null;
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


