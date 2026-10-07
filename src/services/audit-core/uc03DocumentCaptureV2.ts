
export type CaptureV2Applicability = 'APPLICABLE' | 'NOT_APPLICABLE' | 'UNRESOLVED';

interface CaptureV2Declaration {
  conditionKey: string;
  applicable: boolean;
  documentAvailable: boolean | null;
  source: 'PC' | 'DOCUMENT';
}

export interface CaptureV2Document {
  documentId: string;
  clientUploadId: string;
  state: string;
  classifiedDocumentTypeKey: string | null;
  originalFilename: string;
  contentUrl: string | null;
  processingStatus: string | null;
}

interface CaptureV2Requirement {
  requirementKey: string;
  label: string;
  documentTypeKey: string;
  requirementLevel: 'REQUIRED' | 'CONDITIONAL' | 'OPTIONAL' | string;
  conditionKey: string | null;
  applicabilityState: CaptureV2Applicability;
  state: string;
  document: CaptureV2Document | null;
  canView: boolean;
  canDelete: boolean;
  needsDecision: boolean;
  blocksContinue: boolean;
}

export interface BookingCaptureV2 {
  journeyId: string;
  externalContextRef: string;
  phase: 'BOOKING';
  requirements: CaptureV2Requirement[];
  uploads: CaptureV2Document[];
  declarations: CaptureV2Declaration[];
  canContinue: boolean;
}





