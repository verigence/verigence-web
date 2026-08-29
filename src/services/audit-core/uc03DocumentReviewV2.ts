import { auditCoreRequest } from './client';

export interface ReviewV2Field {
  fieldKey: string;
  value: unknown;
  reviewState: 'READY' | 'NEEDS_REVIEW';
  source: 'DI';
  pageNo: number | null;
  evidenceRegion: Record<string, unknown> | null;
}

export interface ReviewV2Document {
  documentId: string;
  requirementKey: string | null;
  label: string;
  documentTypeKey: string | null;
  originalFilename: string;
  contentUrl: string | null;
  processingStatus: string;
  extractionState: 'PENDING' | 'READY' | 'FAILED';
  fields: ReviewV2Field[];
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
  documents: ReviewV2Document[];
  missingDeclarations: ReviewV2MissingDeclaration[];
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
