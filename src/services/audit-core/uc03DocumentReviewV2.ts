import { auditCoreRawRequest, auditCoreRequest } from './client';

type ReviewState = 'READY' | 'NEEDS_REVIEW';
type ComparisonState = 'MATCH' | 'MISMATCH' | 'SINGLE_SOURCE' | 'NOT_AVAILABLE';

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

interface ReviewV2Attribute {
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

interface ReviewV2UnmappedField {
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

interface ReviewV2MissingDeclaration {
  conditionKey: string;
  requirementKey: string;
  label: string;
  applicable: boolean;
  documentAvailable: boolean | null;
}



export interface FieldCorrectionResult {
  documentId: string;
  fieldKey: string;
  // true: applied immediately (<90% confidence), nothing pending -- no
  // finding, no task. false: a FIELD_CORRECTION_REVIEW task was raised on
  // the Task Queue instead (taskId set); the value isn't written until a
  // Team Lead completes it there.
  applied: boolean;
  taskId: string | null;
}

/**
 * One endpoint, one shape, for correcting a single DI-extracted field --
 * behavior branches server-side on confidenceScore (see uc03_document_
 * field_corrections.py's module docstring):
 *   <90% (or missing): applied immediately, no finding or task raised --
 *          nothing left pending, just the module's own audit-trail record.
 *   >=90%: NOT applied yet -- a Team-Lead-owned Task Queue item is raised
 *          instead; remarks are required in this case (validated
 *          server-side too). This is a Task Queue item, not a
 *          rule-classified audit finding.
 */
export interface FieldCorrectionCommand {
  stage: 'BOOKING' | 'DELIVERY';
  documentId: string;
  documentTypeKey: string;
  fieldKey: string;
  canonicalFieldId: string;
  sourceFactVersion: number;
  confidenceScore: number | null;
  evidenceId: string | null;
  originalValue: unknown;
  newValue: unknown;
  remarks?: string;
}

interface BookingReviewV2 {
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

interface DeliveryReviewV2 {
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

// Direct instruction (2026-09-26): Review gets the same GET unification
// Capture already has -- one HTTP call, one shared backend DI context,
// both stages tagged in the one response, replacing what used to be two
// separate calls (GET .../booking/review and GET .../delivery/review --
// the latter had 404'd unconditionally for every Journey; see
// uc03_document_review_v2.py's UnifiedReviewV2Response for the full story).
export interface UnifiedReviewV2 {
  journeyId: string;
  booking: BookingReviewV2;
  delivery: DeliveryReviewV2;
}





export interface AuditSourceComparisonV2 {
  journeyId: string;
  deliverySubmitted: boolean;
  processingPending: boolean;
  attributes: ReviewV2Attribute[];
  unmappedFields: ReviewV2UnmappedField[];
  documents: ReviewV2Document[];
}


function token(accessToken?: string): string {
  const value = accessToken?.trim();
  if (!value) throw new Error('A Security human access token is required.');
  return value;
}


export async function getUnifiedReviewV2(
  tenantId: string,
  journeyId: string,
  accessToken?: string,
): Promise<UnifiedReviewV2> {
  return auditCoreRequest<UnifiedReviewV2>(
    `/v2/tenants/${encodeURIComponent(tenantId)}/journeys/${encodeURIComponent(journeyId)}/uc03/documents/review`,
    {
      accessToken: token(accessToken),
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

function idempotencyKey(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Correct one DI-extracted field's value from the Journey Documents page.
 * Deliberately does NOT go through the stage-wide Review Confirm endpoints
 * (confirmBookingReviewV2 / confirmDeliveryReviewV2) -- those exist for a
 * different, one-time job (PENDING -> VERIFIED for the whole stage) and
 * would either mis-flip that status off a single field or, once already
 * VERIFIED, reject every later correction outright. This call is always
 * repeatable, per field, per document; see the backend module's docstring
 * for the full reasoning. Server-side behavior branches on confidenceScore
 * -- see FieldCorrectionCommand's own doc comment.
 */
export async function submitFieldCorrection(
  tenantId: string,
  journeyId: string,
  command: FieldCorrectionCommand,
  accessToken?: string,
): Promise<FieldCorrectionResult> {
  return auditCoreRequest<FieldCorrectionResult>(
    `/v2/tenants/${encodeURIComponent(tenantId)}/journeys/${encodeURIComponent(journeyId)}/uc03/documents/${encodeURIComponent(command.documentId)}/field-corrections`,
    {
      method: 'POST',
      accessToken: token(accessToken),
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey(),
      },
      body: JSON.stringify(command),
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
