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
  aggregateVersion: number;
  operatingRole: string;
  capture: {
    CUSTOMER_NAME: string | null;
  };
  bookingStage: {
    businessStatus: string | null;
    closureDisposition: string | null;
    auditState: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETE';
    auditStatus: 'NOT_EVALUATED' | 'NO_FLAGS' | 'FLAGS_RAISED';
    closeReasonCode: string | null;
    closureRemarks: string | null;
  };
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
