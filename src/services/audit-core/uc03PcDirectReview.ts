import { auditCoreRequest } from './client';
import {
  prepareBookingDocumentUploadContext,
  type BookingExtractionFieldDecision,
  type BookingUploadRequirementContext,
} from './uc03PcBookingDocuments';
import {
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

export interface PcDirectDocumentReviewResponse {
  journeyId: string;
  requirementRef: string;
  documentId: string;
  aggregateVersion: number;
  reviewEventId: string;
  decisions: Array<{
    fieldKey: string;
    decision: 'APPROVED' | 'CORRECTED';
    owningDomainKey: string;
    owningRecordReference: string;
    eventId: string;
  }>;
}

export interface PcDirectVerificationResponse {
  journeyId: string;
  pcVerificationStatus: 'PENDING' | 'VERIFIED';
  aggregateVersion: number;
}

function token(accessToken?: string): string {
  const value = accessToken?.trim();
  if (!value) throw new Error('A Security human access token is required.');
  return value;
}

function base(tenantId: string, journeyId: string): string {
  return `/v1/tenants/${encodeURIComponent(tenantId)}/journeys/${encodeURIComponent(journeyId)}`;
}

function newIdempotencyKey(prefix: string): string {
  const random = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${random}`;
}

function stableDocumentReviewKey(tenantId: string, journeyId: string, documentId: string): string {
  const storageKey = `uc03-direct-review:${tenantId}:${journeyId}:${documentId}`;
  const existing = sessionStorage.getItem(storageKey);
  if (existing) return existing;
  const created = newIdempotencyKey('uc03-booking-direct-review');
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
  requirements: BookingUploadRequirementContext[],
  diDocuments: PcBookingDocumentStatus[],
): PcBookingReviewDocument[] {
  const result: PcBookingReviewDocument[] = [];

  for (const requirement of requirements) {
    const matching = diDocuments
      .filter((document) => document.requirementRef === requirement.requirementRef)
      .sort(byRegisteredAt);
    if (matching.length === 0) continue;

    const activeIds = new Set(requirement.activeDocumentIds);
    if (requirement.repeatable) {
      for (const document of matching) {
        result.push(mappedDocument(requirement, document, activeIds.has(document.documentId)));
      }
      continue;
    }

    // For a replacement upload, DI knows about the newest accepted document before
    // the asynchronous linkage callback may have reached Audit Core. Prefer that
    // newest DI document, but mark it not linked until Audit Core acknowledges it.
    const document = matching[matching.length - 1];
    const linked = activeIds.has(document.documentId)
      || requirement.currentDocumentId === document.documentId;
    result.push(mappedDocument(requirement, document, linked));
  }

  return result.sort((left, right) => left.registeredAtUtc.localeCompare(right.registeredAtUtc));
}

export async function getPcBookingReviewSnapshot(
  tenantId: string,
  journeyId: string,
  accessToken?: string,
  forceContext = false,
): Promise<PcBookingReviewSnapshot> {
  const context = await prepareBookingDocumentUploadContext(
    tenantId,
    journeyId,
    accessToken,
    forceContext,
  );
  const direct = await listPcBookingDocuments(
    tenantId,
    context.externalContextRef,
    token(accessToken),
  );
  const documents = selectCurrentDocuments(context.requirements, direct.documents);
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
}

export async function getPcDirectReviewState(
  tenantId: string,
  journeyId: string,
  accessToken?: string,
): Promise<PcDirectReviewState> {
  return auditCoreRequest<PcDirectReviewState>(`${base(tenantId, journeyId)}/booking/direct-document-review`, {
    accessToken: token(accessToken),
    cache: 'no-store',
  });
}

export async function submitPcDirectDocumentReview(
  tenantId: string,
  journeyId: string,
  requirementRef: string,
  documentId: string,
  fields: BookingExtractionFieldDecision[],
  accessToken?: string,
): Promise<PcDirectDocumentReviewResponse> {
  return auditCoreRequest<PcDirectDocumentReviewResponse>(`${base(tenantId, journeyId)}/booking/direct-document-review`, {
    method: 'POST',
    accessToken: token(accessToken),
    headers: { 'Idempotency-Key': stableDocumentReviewKey(tenantId, journeyId, documentId) },
    body: JSON.stringify({ requirementRef, documentId, fields }),
  });
}

export async function verifyPcBookingDirect(
  tenantId: string,
  journeyId: string,
  version: number,
  accessToken?: string,
): Promise<PcDirectVerificationResponse> {
  return auditCoreRequest<PcDirectVerificationResponse>(`${base(tenantId, journeyId)}/pc-verification/verify-direct`, {
    method: 'POST',
    accessToken: token(accessToken),
    headers: {
      'Idempotency-Key': newIdempotencyKey('uc03-pc-verify-direct'),
      'If-Match': `"${version}"`,
    },
  });
}
