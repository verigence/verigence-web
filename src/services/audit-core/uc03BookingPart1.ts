import { auditCoreRequest } from './client';

export interface Part1EvidenceItem {
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

export async function getBookingPart1(
  tenantId: string,
  journeyId: string,
  accessToken?: string,
): Promise<BookingPart1View> {
  return auditCoreRequest<BookingPart1View>(
    `/v1/tenants/${encodeURIComponent(tenantId)}/journeys/${encodeURIComponent(journeyId)}/booking/part1`,
    { accessToken: token(accessToken), cache: 'no-store' },
  );
}
