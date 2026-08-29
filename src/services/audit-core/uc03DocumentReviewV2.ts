import { auditCoreRawRequest, auditCoreRequest } from './client';

export type ReviewState = 'READY' | 'NEEDS_REVIEW';
export type ComparisonState = 'MATCH' | 'MISMATCH' | 'SINGLE_SOURCE' | 'NOT_AVAILABLE';

export interface ReviewV2Field {
  fieldKey: string;
  value: unknown;
  confidenceScore: number | null;
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
  fieldKey: string;
  value: unknown;
  confidenceScore: number | null;
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
  fieldKey: string;
  value: unknown;
  confidenceScore: number | null;
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

export interface BookingReviewV2 {
  journeyId: string;
  phase: 'BOOKING';
  captureSubmitted: boolean;
  pcVerificationStatus: string;
  processingPending: boolean;
  needsReviewCount: number;
  attributes: ReviewV2Attribute[];
  unmappedFields: ReviewV2UnmappedField[];
  documents: ReviewV2Document[];
  missingDeclarations: ReviewV2MissingDeclaration[];
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
