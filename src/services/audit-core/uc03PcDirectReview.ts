import { auditCoreRequest } from './client';
import {
  locallyUploadedDocumentIds,
  prepareBookingDocumentUploadContext,
  type BookingUploadRequirementContext,
} from './uc03PcBookingDocuments';
import {
  getPcBookingDocumentContent,
  getPcBookingExtractionReview,
  listPcBookingDocuments,
  type PcBookingDocumentStatus,
} from '../di/bookingDocuments';

export interface PcBookingReviewDocument {
  documentId: string;
  requirementRef: string;
  requirementKey: string;
  documentTypeKey: string;
  captureEligibleFieldKeys: string[];
  uploadStatus: string;
  processingStatus: string;
  registeredAtUtc: string;
  linked: boolean;
}

export interface PcBookingReviewSnapshot {
  externalContextRef: string;
  documents: PcBookingReviewDocument[];
  linkedDocumentCount: number;
  processingCount: number;
  failedCount: number;
  readyCount: number;
  allReady: boolean;
}

export interface PcDirectReviewState {
  journeyId: string;
  activeDocumentIds: string[];
  reviewedDocumentIds: string[];
  pendingDocumentIds: string[];
  activeDocumentCount: number;
  reviewedDocumentCount: number;
  pendingDocumentCount: number;
  reviewComplete: boolean;
}

export interface PcDirectExtractedField {
  fieldKey: string;
  sourceFactRef: string;
  sourceFactVersion: number;
  extractedValue: unknown;
  modifiedValue: unknown | null;
  confidenceScore: number | null;
}

export interface PcDirectDocumentReviewResponse {
  journeyId: string;
  requirementRef: string;
  documentId: string;
  aggregateVersion: number;
  reviewEventId: string;
  storedFieldCount: number;
  modifiedFieldCount: number;
  projectedFieldCount: number;
  projectionFailureCount: number;
}

export interface PcDirectVerificationResponse {
  journeyId: string;
  pcVerificationStatus: 'PENDING' | 'VERIFIED';
  aggregateVersion: number;
}

type WarmEntry<T> = {
  expiresAt: number;
  promise: Promise<T>;
};

const REVIEW_WARM_TTL_MS = 15_000;
const snapshotWarmCache = new Map<string, WarmEntry<PcBookingReviewSnapshot>>();
const stateWarmCache = new Map<string, WarmEntry<PcDirectReviewState>>();

function token(accessToken?: string): string {
  const value = accessToken?.trim();
  if (!value) throw new Error('A Security human access token is required.');
  return value;
}

function base(tenantId: string, journeyId: string): string {
  return `/v1/tenants/${encodeURIComponent(tenantId)}/journeys/${encodeURIComponent(journeyId)}`;
}

function warmKey(tenantId: string, journeyId: string, accessToken?: string): string {
  return `${tenantId}:${journeyId}:${token(accessToken)}`;
}

function newIdempotencyKey(prefix: string): string {
  const random = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${random}`;
}

function stableDocumentReviewKey(tenantId: string, journeyId: string, documentId: string): string {
  const storageKey = `uc03-direct-review-fields:${tenantId}:${journeyId}:${documentId}`;
  const existing = sessionStorage.getItem(storageKey);
  if (existing) return existing;
  const created = newIdempotencyKey('uc03-booking-direct-review-fields');
  sessionStorage.setItem(storageKey, created);
  return created;
}

function byRegisteredAt(left: PcBookingDocumentStatus, right: PcBookingDocumentStatus): number {
  const leftTime = new Date(left.registeredAtUtc).getTime();
  const rightTime = new Date(right.registeredAtUtc).getTime();
  if (Number.isNaN(leftTime) || Number.isNaN(rightTime)) return left.documentId.localeCompare(right.documentId);
  return leftTime - rightTime;
}

function mappedDocument(
  requirement: BookingUploadRequirementContext,
  document: PcBookingDocumentStatus,
  linked: boolean,
): PcBookingReviewDocument {
  return {
    documentId: document.documentId,
    requirementRef: requirement.requirementRef,
    requirementKey: requirement.requirementKey,
    documentTypeKey: document.documentTypeKey || requirement.documentTypeKey || requirement.requirementKey,
    captureEligibleFieldKeys: requirement.captureEligibleFieldKeys,
    uploadStatus: document.uploadStatus,
    processingStatus: document.processingStatus,
    registeredAtUtc: document.registeredAtUtc,
    linked,
  };
}

function selectCurrentDocuments(
  tenantId: string,
  journeyId: string,
  requirements: BookingUploadRequirementContext[],
  diDocuments: PcBookingDocumentStatus[],
): PcBookingReviewDocument[] {
  const result: PcBookingReviewDocument[] = [];

  for (const requirement of requirements) {
    const matching = diDocuments
      .filter((document) => document.requirementRef === requirement.requirementRef)
      .sort(byRegisteredAt);
    if (matching.length === 0) continue;

    // Direct upload already knows the newly uploaded DI document id. Include that
    // local knowledge immediately instead of forcing Audit Core to recreate the
    // DI storage context merely to wait for the asynchronous linkage callback.
    const activeIds = new Set([
      ...requirement.activeDocumentIds,
      ...locallyUploadedDocumentIds(tenantId, journeyId, requirement.requirementRef),
    ]);
    if (requirement.repeatable) {
      for (const document of matching) {
        result.push(mappedDocument(requirement, document, activeIds.has(document.documentId)));
      }
      continue;
    }

    const document = matching[matching.length - 1];
    const linked = activeIds.has(document.documentId)
      || requirement.currentDocumentId === document.documentId;
    result.push(mappedDocument(requirement, document, linked));
  }

  return result.sort((left, right) => left.registeredAtUtc.localeCompare(right.registeredAtUtc));
}

function clearWarmState(tenantId: string, journeyId: string, accessToken?: string): void {
  stateWarmCache.delete(warmKey(tenantId, journeyId, accessToken));
}

export function clearPcBookingReviewWarmCache(
  tenantId: string,
  journeyId: string,
  accessToken?: string,
): void {
  const key = warmKey(tenantId, journeyId, accessToken);
  snapshotWarmCache.delete(key);
  stateWarmCache.delete(key);
}

export function getPcBookingReviewSnapshot(
  tenantId: string,
  journeyId: string,
  accessToken?: string,
  _legacyForceContext = false,
): Promise<PcBookingReviewSnapshot> {
  const key = warmKey(tenantId, journeyId, accessToken);
  const cached = snapshotWarmCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.promise;

  const request = (async () => {
    // The upload path already prepared and cached this Audit Core/DI context.
    // Reusing it removes an expensive Audit Core -> Security -> DI round trip
    // from the Review button path. A cold page still prepares it once normally.
    const context = await prepareBookingDocumentUploadContext(
      tenantId,
      journeyId,
      accessToken,
      false,
    );
    const direct = await listPcBookingDocuments(
      tenantId,
      context.externalContextRef,
      token(accessToken),
    );
    const documents = selectCurrentDocuments(
      tenantId,
      journeyId,
      context.requirements,
      direct.documents,
    );
    const failedCount = documents.filter((document) => (
      document.uploadStatus.toUpperCase() === 'REJECTED'
      || document.processingStatus.toUpperCase() === 'FAILED'
    )).length;
    const readyCount = documents.filter((document) => (
      document.linked && document.processingStatus.toUpperCase() === 'PROCESSED'
    )).length;
    const processingCount = documents.filter((document) => (
      !document.linked
      || ['PENDING', 'PROCESSING'].includes(document.processingStatus.toUpperCase())
    )).length;

    return {
      externalContextRef: context.externalContextRef,
      documents,
      linkedDocumentCount: documents.filter((document) => document.linked).length,
      processingCount,
      failedCount,
      readyCount,
      allReady: documents.length > 0
        && failedCount === 0
        && processingCount === 0
        && readyCount === documents.length,
    };
  })().catch((cause) => {
    if (snapshotWarmCache.get(key)?.promise === request) snapshotWarmCache.delete(key);
    throw cause;
  });

  snapshotWarmCache.set(key, {
    expiresAt: Date.now() + REVIEW_WARM_TTL_MS,
    promise: request,
  });
  return request;
}

export function getPcDirectReviewState(
  tenantId: string,
  journeyId: string,
  accessToken?: string,
): Promise<PcDirectReviewState> {
  const key = warmKey(tenantId, journeyId, accessToken);
  const cached = stateWarmCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.promise;

  const request = auditCoreRequest<PcDirectReviewState>(`${base(tenantId, journeyId)}/booking/direct-document-review`, {
    accessToken: token(accessToken),
    cache: 'no-store',
  }).catch((cause) => {
    if (stateWarmCache.get(key)?.promise === request) stateWarmCache.delete(key);
    throw cause;
  });

  stateWarmCache.set(key, {
    expiresAt: Date.now() + REVIEW_WARM_TTL_MS,
    promise: request,
  });
  return request;
}

export async function warmPcBookingReview(
  tenantId: string,
  journeyId: string,
  accessToken?: string,
): Promise<void> {
  const [snapshotResult] = await Promise.all([
    getPcBookingReviewSnapshot(tenantId, journeyId, accessToken),
    getPcDirectReviewState(tenantId, journeyId, accessToken).catch(() => null),
  ]);

  const readyDocuments = snapshotResult.documents.filter((document) => (
    document.linked && document.processingStatus.toUpperCase() === 'PROCESSED'
  ));
  if (readyDocuments.length === 0) return;

  // Extraction JSON is small, so warm every ready document. Warm only the first
  // source blob to keep the initial Review field+highlight instantaneous without
  // downloading every potentially large PDF/image before the user opens Review.
  await Promise.allSettled([
    ...readyDocuments.map((document) => getPcBookingExtractionReview(
      tenantId,
      snapshotResult.externalContextRef,
      document.documentId,
      token(accessToken),
    )),
    getPcBookingDocumentContent(
      tenantId,
      snapshotResult.externalContextRef,
      readyDocuments[0].documentId,
      token(accessToken),
    ),
  ]);
}

export async function submitPcDirectDocumentReview(
  tenantId: string,
  journeyId: string,
  requirementRef: string,
  documentId: string,
  fields: PcDirectExtractedField[],
  accessToken?: string,
): Promise<PcDirectDocumentReviewResponse> {
  const result = await auditCoreRequest<PcDirectDocumentReviewResponse>(`${base(tenantId, journeyId)}/booking/direct-document-review-fields`, {
    method: 'POST',
    accessToken: token(accessToken),
    headers: { 'Idempotency-Key': stableDocumentReviewKey(tenantId, journeyId, documentId) },
    body: JSON.stringify({ requirementRef, documentId, fields }),
  });
  clearWarmState(tenantId, journeyId, accessToken);
  return result;
}

export async function verifyPcBookingDirect(
  tenantId: string,
  journeyId: string,
  version: number,
  accessToken?: string,
): Promise<PcDirectVerificationResponse> {
  const result = await auditCoreRequest<PcDirectVerificationResponse>(`${base(tenantId, journeyId)}/pc-verification/verify-direct`, {
    method: 'POST',
    accessToken: token(accessToken),
    headers: {
      'Idempotency-Key': newIdempotencyKey('uc03-pc-verify-direct'),
      'If-Match': `"${version}"`,
    },
  });
  clearPcBookingReviewWarmCache(tenantId, journeyId, accessToken);
  return result;
}
