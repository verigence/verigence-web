import { auditCoreRequest } from './client';

export interface Part1EvidenceItem {
  // During Booking Capture this is Audit Core's evidence linkage identifier.
  // DI document identifiers are required only by the separate upload/review paths
  // and must not be resolved just to open Step 1.
  evidenceId: string;
  documentTypeKey: string;
  processingStatus: string | null;
  verificationStatus: string | null;
  linkedAtUtc: string;
}

export interface Part1Requirement {
  kind: 'BOOKING_DOCKET' | 'PAN' | 'AADHAAR' | 'BOOKING_PAYMENT_RECEIPT';
  requirementKey: string;
  documentTypeKey: string;
  requirementLevel: string;
  requirementStatus: string;
  evidence: Part1EvidenceItem[];
}

export interface Part1ProductMasterMatch {
  status: 'PENDING_EXTRACTION' | 'PENDING_BOOKING_DATE' | 'NO_EFFECTIVE_MASTER' | 'MATCHED' | 'AMBIGUOUS' | 'NO_MATCH';
  extractedModel: string | null;
  extractedVariant: string | null;
  modelId: string | null;
  modelName: string | null;
  variantId: string | null;
  variantName: string | null;
  masterVersionIds: string[];
  message: string;
}

export interface BookingPart1View {
  journeyId: string;
  requirements: Part1Requirement[];
  mandatoryEvidence: {
    bookingDocketComplete: boolean;
    kycComplete: boolean;
    kycBothProvided: boolean;
    paymentReceiptComplete: boolean;
    paymentReceiptCount: number;
    part1EvidenceComplete: boolean;
  };
  productMaster: Part1ProductMasterMatch;
}

function token(accessToken?: string): string {
  const value = accessToken?.trim();
  if (!value) throw new Error('A Security human access token is required.');
  return value;
}

function base(tenantId: string, journeyId: string): string {
  return `/v1/tenants/${encodeURIComponent(tenantId)}/journeys/${encodeURIComponent(journeyId)}`;
}

export async function getBookingPart1(
  tenantId: string,
  journeyId: string,
  accessToken?: string,
): Promise<BookingPart1View> {
  // Booking open is an Audit Core read only. Do not prepare DI storage context here.
  // DI context is intentionally lazy and is prepared by uploadBookingDocument only
  // when the PC actually chooses a file to upload.
  return auditCoreRequest<BookingPart1View>(`${base(tenantId, journeyId)}/booking/part1`, {
    accessToken: token(accessToken),
    cache: 'no-store',
  });
}

export async function refreshPart1Evidence(
  tenantId: string,
  journeyId: string,
  evidenceId: string,
  accessToken?: string,
): Promise<void> {
  await auditCoreRequest(
    `${base(tenantId, journeyId)}/booking/evidence/${encodeURIComponent(evidenceId)}/refresh`,
    { method: 'POST', accessToken: token(accessToken) },
  );
}
