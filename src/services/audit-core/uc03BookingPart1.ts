import { auditCoreRequest } from './client';
import {
  locallyUploadedDocumentIds,
  prepareBookingDocumentUploadContext,
} from './uc03PcBookingDocuments';

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

function base(tenantId: string, journeyId: string): string {
  return `/v1/tenants/${encodeURIComponent(tenantId)}/journeys/${encodeURIComponent(journeyId)}`;
}

function paymentKey(value: string): boolean {
  return value === 'booking_payment_receipt' || value === 'minimum_booking_payment_proof';
}

function sameRequirement(candidate: string, requested: string): boolean {
  return candidate === requested || (paymentKey(candidate) && paymentKey(requested));
}

function withMandatorySummary(view: BookingPart1View, requirements: Part1Requirement[]): BookingPart1View {
  const booking = requirements.find((item) => item.kind === 'BOOKING_DOCKET')?.evidence.length ?? 0;
  const pan = requirements.find((item) => item.kind === 'PAN')?.evidence.length ?? 0;
  const aadhaar = requirements.find((item) => item.kind === 'AADHAAR')?.evidence.length ?? 0;
  const receipts = requirements.find((item) => item.kind === 'BOOKING_PAYMENT_RECEIPT')?.evidence.length ?? 0;
  return {
    ...view,
    requirements,
    mandatoryEvidence: {
      bookingDocketComplete: booking > 0,
      kycComplete: pan > 0 || aadhaar > 0,
      kycBothProvided: pan > 0 && aadhaar > 0,
      paymentReceiptComplete: receipts > 0,
      paymentReceiptCount: receipts,
      part1EvidenceComplete: booking > 0 && (pan > 0 || aadhaar > 0) && receipts > 0,
    },
  };
}

export async function getBookingPart1(
  tenantId: string,
  journeyId: string,
  accessToken?: string,
): Promise<BookingPart1View> {
  const view = await auditCoreRequest<BookingPart1View>(`${base(tenantId, journeyId)}/booking/part1`, {
    accessToken: token(accessToken),
    cache: 'no-store',
  });

  // DI -> Audit Core linkage is intentionally asynchronous. Immediately after a
  // successful direct upload, preserve the PC's visible Uploaded state using only
  // the documentId already returned by DI; no additional DB write or status poll is
  // introduced here. Once the callback lands, the normal Audit Core evidence row
  // naturally replaces this in-memory bridge.
  try {
    const context = await prepareBookingDocumentUploadContext(tenantId, journeyId, accessToken);
    const now = new Date().toISOString();
    const requirements = view.requirements.map((requirement) => {
      const slot = context.requirements.find((item) => sameRequirement(item.requirementKey, requirement.requirementKey));
      if (!slot) return requirement;
      const existing = new Set(requirement.evidence.map((item) => item.evidenceId));
      const local = locallyUploadedDocumentIds(tenantId, journeyId, slot.requirementRef)
        .filter((documentId) => !existing.has(documentId))
        .map((documentId) => ({
          evidenceId: documentId,
          documentTypeKey: slot.documentTypeKey,
          processingStatus: null,
          verificationStatus: null,
          linkedAtUtc: now,
        }));
      return local.length ? { ...requirement, evidence: [...requirement.evidence, ...local] } : requirement;
    });
    return withMandatorySummary(view, requirements);
  } catch {
    return view;
  }
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
