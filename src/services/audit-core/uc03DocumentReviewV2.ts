import { auditCoreRawRequest, auditCoreRequest } from './client';

export type ReviewState = 'READY' | 'NEEDS_REVIEW';
export type ComparisonState = 'MATCH' | 'MISMATCH' | 'SINGLE_SOURCE' | 'NOT_AVAILABLE';
export type ReviewDecisionValue = 'ACCEPTED' | 'REJECTED';
export type ReviewDecisionKind = 'ATTRIBUTE' | 'RAW_FIELD';

export interface ReviewV2Field {
  canonicalFieldId: string;
  fieldKey: string;
  value: unknown;
  confidenceScore: number | null;
  sourceFactVersion: number;
  reviewState: ReviewState;
  source: 'DI';
  pageNo: number | null;
  evidenceRegion: Record<string, unknown> | null;
}

export interface ReviewV2Document {
  documentId: string;
  evidenceId: string | null;
  requirementKey: string | null;
  label: string;
  documentTypeKey: string | null;
  originalFilename: string;
  contentUrl: string | null;
  processingStatus: string;
  extractionState: 'PENDING' | 'READY' | 'FAILED';
  fields: ReviewV2Field[];
}

export interface ReviewV2SourceValue {
  canonicalFieldId: string;
  fieldKey: string;
  value: unknown;
  confidenceScore: number | null;
  sourceFactVersion: number;
  reviewState: ReviewState;
  documentId: string;
  evidenceId: string | null;
  documentTypeKey: string | null;
  documentLabel: string;
  originalFilename: string;
  contentUrl: string | null;
  pageNo: number | null;
  evidenceRegion: Record<string, unknown> | null;
}

export interface ReviewV2Attribute {
  attributeKey: string;
  excelFieldNo: number | null;
  label: string;
  mappingStatus: 'SUPPORTED' | 'PROVISIONAL';
  operationalField: string | null;
  resolvedValue: unknown;
  confidenceScore: number | null;
  reviewState: ReviewState;
  comparisonState: ComparisonState;
  resolvedSource: ReviewV2SourceValue | null;
  sources: ReviewV2SourceValue[];
}

export interface ReviewV2UnmappedField {
  canonicalFieldId: string;
  fieldKey: string;
  value: unknown;
  confidenceScore: number | null;
  sourceFactVersion: number;
  documentId: string;
  documentTypeKey: string | null;
  documentLabel: string;
  originalFilename: string;
  pageNo: number | null;
  evidenceRegion: Record<string, unknown> | null;
}

export interface ReviewV2MissingDeclaration {
  conditionKey: string;
  requirementKey: string;
  label: string;
  applicable: boolean;
  documentAvailable: boolean | null;
}

export interface ReviewFieldCorrection {
  documentId: string;
  canonicalFieldId: string;
  fieldKey: string;
  sourceFactVersion: number;
  effectiveValue: unknown;
}

export interface BookingReviewV2 {
  journeyId: string;
  phase: 'BOOKING';
  captureSubmitted: boolean;
  pcVerificationStatus: string;
  aggregateVersion: number;
  processingPending: boolean;
  needsReviewCount: number;
  attributes: ReviewV2Attribute[];
  unmappedFields: ReviewV2UnmappedField[];
  documents: ReviewV2Document[];
  missingDeclarations: ReviewV2MissingDeclaration[];
}

export interface DeliveryReviewV2 {
  journeyId: string;
  phase: 'DELIVERY';
  captureSubmitted: boolean;
  pcVerificationStatus: string;
  aggregateVersion: number;
  processingPending: boolean;
  needsReviewCount: number;
  attributes: ReviewV2Attribute[];
  unmappedFields: ReviewV2UnmappedField[];
  documents: ReviewV2Document[];
}

export interface BookingReviewDecision {
  reviewKey: string;
  reviewKind: ReviewDecisionKind;
  decision: ReviewDecisionValue;
  sourceSetRef: string;
  sourceDocumentId: string;
  sourceCanonicalFieldId: string | null;
  sourceFieldKey: string;
  sourceFactVersion: number;
  decidedByActorId: string;
}

export interface BookingReviewDecisionsResponse {
  journeyId: string;
  decisions: BookingReviewDecision[];
}

export interface BookingReviewV2ConfirmResponse {
  journeyId: string;
  pcVerificationStatus: 'VERIFIED';
  aggregateVersion: number;
  resolvedAttributeCount: number;
  appliedAttributes: string[];
  conflictAttributes: string[];
  rejectedAttributes?: string[];
}

export interface DeliveryReviewV2ConfirmResponse {
  journeyId: string;
  pcVerificationStatus: 'VERIFIED';
  aggregateVersion: number;
  storedFieldCount: number;
}

export interface AuditSourceComparisonV2 {
  journeyId: string;
  deliverySubmitted: boolean;
  processingPending: boolean;
  attributes: ReviewV2Attribute[];
  unmappedFields: ReviewV2UnmappedField[];
  documents: ReviewV2Document[];
}

const RECEIPT_DOCUMENT_TYPE = 'dealer_receipt';

function token(accessToken?: string): string {
  const value = accessToken?.trim();
  if (!value) throw new Error('A Security human access token is required.');
  return value;
}

/**
 * Legacy display helper retained for callers that still want receipt-scoped labels.
 * Do not use this for Review persistence: changing fieldKey destroys the exact DI fact
 * identity required by correction and provenance contracts.
 */
export function scopeRepeatedReceiptReviewFields(review: BookingReviewV2): BookingReviewV2 {
  const receiptDocumentIds = [...new Set(
    review.unmappedFields
      .filter((field) => (
        field.documentTypeKey?.trim().toLowerCase() === RECEIPT_DOCUMENT_TYPE
        && field.value !== null
        && field.value !== undefined
        && field.value !== ''
      ))
      .map((field) => field.documentId),
  )].sort();

  if (receiptDocumentIds.length === 0) return review;

  const ordinalByDocumentId = new Map(
    receiptDocumentIds.map((documentId, index) => [documentId, index + 1] as const),
  );
  return {
    ...review,
    unmappedFields: review.unmappedFields.map((field) => {
      if (field.documentTypeKey?.trim().toLowerCase() !== RECEIPT_DOCUMENT_TYPE) return field;
      const ordinal = ordinalByDocumentId.get(field.documentId);
      if (!ordinal) return field;
      return {
        ...field,
        fieldKey: `receipt_${ordinal}_${field.fieldKey}`,
      };
    }),
  };
}

export async function getBookingReviewV2(
  tenantId: string,
  journeyId: string,
  accessToken?: string,
): Promise<BookingReviewV2> {
  return auditCoreRequest<BookingReviewV2>(
    `/v2/tenants/${encodeURIComponent(tenantId)}/journeys/${encodeURIComponent(journeyId)}/booking/review`,
    {
      accessToken: token(accessToken),
      cache: 'no-store',
    },
  );
}

export async function getBookingReviewDecisionsV2(
  tenantId: string,
  journeyId: string,
  accessToken?: string,
): Promise<BookingReviewDecisionsResponse> {
  return auditCoreRequest<BookingReviewDecisionsResponse>(
    `/v2/tenants/${encodeURIComponent(tenantId)}/journeys/${encodeURIComponent(journeyId)}/booking/review/decisions`,
    {
      accessToken: token(accessToken),
      cache: 'no-store',
    },
  );
}

export async function setBookingReviewDecisionV2(
  tenantId: string,
  journeyId: string,
  reviewKey: string,
  decision: ReviewDecisionValue,
  accessToken?: string,
): Promise<BookingReviewDecision> {
  return auditCoreRequest<BookingReviewDecision>(
    `/v2/tenants/${encodeURIComponent(tenantId)}/journeys/${encodeURIComponent(journeyId)}/booking/review/decision`,
    {
      method: 'POST',
      accessToken: token(accessToken),
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reviewKey, decision }),
      cache: 'no-store',
    },
  );
}

export async function confirmBookingReviewV2(
  tenantId: string,
  journeyId: string,
  aggregateVersion: number,
  corrections: ReviewFieldCorrection[] = [],
  accessToken?: string,
): Promise<BookingReviewV2ConfirmResponse> {
  return auditCoreRequest<BookingReviewV2ConfirmResponse>(
    `/v2/tenants/${encodeURIComponent(tenantId)}/journeys/${encodeURIComponent(journeyId)}/booking/review/confirm`,
    {
      method: 'POST',
      accessToken: token(accessToken),
      headers: {
        'Content-Type': 'application/json',
        'If-Match': `"${aggregateVersion}"`,
        'Idempotency-Key': `booking-review-${journeyId}-${aggregateVersion}`,
      },
      body: JSON.stringify({ corrections }),
      cache: 'no-store',
    },
  );
}

export async function getDeliveryReviewV2(
  tenantId: string,
  journeyId: string,
  accessToken?: string,
): Promise<DeliveryReviewV2> {
  return auditCoreRequest<DeliveryReviewV2>(
    `/v2/tenants/${encodeURIComponent(tenantId)}/journeys/${encodeURIComponent(journeyId)}/delivery/review`,
    {
      accessToken: token(accessToken),
      cache: 'no-store',
    },
  );
}

export async function confirmDeliveryReviewV2(
  tenantId: string,
  journeyId: string,
  aggregateVersion: number,
  corrections: ReviewFieldCorrection[] = [],
  accessToken?: string,
): Promise<DeliveryReviewV2ConfirmResponse> {
  return auditCoreRequest<DeliveryReviewV2ConfirmResponse>(
    `/v2/tenants/${encodeURIComponent(tenantId)}/journeys/${encodeURIComponent(journeyId)}/delivery/review/confirm`,
    {
      method: 'POST',
      accessToken: token(accessToken),
      headers: {
        'Content-Type': 'application/json',
        'If-Match': `"${aggregateVersion}"`,
        'Idempotency-Key': `delivery-review-${journeyId}-${aggregateVersion}`,
      },
      body: JSON.stringify({ corrections }),
      cache: 'no-store',
    },
  );
}

export async function getAuditSourceComparisonV2(
  tenantId: string,
  journeyId: string,
  accessToken?: string,
): Promise<AuditSourceComparisonV2> {
  return auditCoreRequest<AuditSourceComparisonV2>(
    `/v2/tenants/${encodeURIComponent(tenantId)}/journeys/${encodeURIComponent(journeyId)}/audit/source-comparison`,
    {
      accessToken: token(accessToken),
      cache: 'no-store',
    },
  );
}

export async function getReviewDocumentContentV2(
  tenantId: string,
  journeyId: string,
  documentId: string,
  accessToken?: string,
): Promise<{ blob: Blob; contentType: string }> {
  const response = await auditCoreRawRequest(
    `/v2/tenants/${encodeURIComponent(tenantId)}/journeys/${encodeURIComponent(journeyId)}/review/documents/${encodeURIComponent(documentId)}/content`,
    {
      accessToken: token(accessToken),
      cache: 'no-store',
    },
  );
  return {
    blob: await response.blob(),
    contentType: response.headers.get('content-type') || 'application/octet-stream',
  };
}
