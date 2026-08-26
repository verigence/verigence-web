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

const contextCache = new Map<string, Promise<BookingDocumentUploadContext>>();
const directUploadIds = new Map<string, Map<string, string[]>>();
const latestDecisionVersions = new Map<string, number>();

function token(accessToken?: string): string {
  const value = accessToken?.trim();
  if (!value) throw new Error('A Security human access token is required.');
  return value;
}

function key(tenantId: string, journeyId: string): string {
  return `${tenantId}:${journeyId}`;
}

function newIdempotencyKey(prefix: string): string {
  const random = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${random}`;
}

function contextPath(tenantId: string, journeyId: string): string {
  return `/v1/tenants/${encodeURIComponent(tenantId)}/journeys/${encodeURIComponent(journeyId)}`
    + '/booking/document-upload-context';
}

export function clearBookingDocumentUploadContext(tenantId: string, journeyId: string): void {
  contextCache.delete(key(tenantId, journeyId));
}

export function rememberDirectBookingUpload(
  tenantId: string,
  journeyId: string,
  requirementRef: string,
  documentId: string,
): void {
  const journeyKey = key(tenantId, journeyId);
  const byRequirement = directUploadIds.get(journeyKey) ?? new Map<string, string[]>();
  const current = byRequirement.get(requirementRef) ?? [];
  if (!current.includes(documentId)) byRequirement.set(requirementRef, [...current, documentId]);
  directUploadIds.set(journeyKey, byRequirement);
}

export function locallyUploadedDocumentIds(
  tenantId: string,
  journeyId: string,
  requirementRef: string,
): string[] {
  return directUploadIds.get(key(tenantId, journeyId))?.get(requirementRef) ?? [];
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
