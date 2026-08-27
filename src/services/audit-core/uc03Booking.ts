import { auditCoreRequest } from './client';
import {
  prepareBookingDocumentUploadContext,
  rememberDirectBookingUpload,
} from './uc03PcBookingDocuments';
import {
  getPcBookingDocumentContent,
  getPcBookingExtractionReview,
  uploadPcBookingDocument,
} from '../di/bookingDocuments';

export interface BookingStageView {
  businessStatus: string | null;
  closureDisposition?: string | null;
  auditState: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETE';
  auditStatus: 'NOT_EVALUATED' | 'NO_FLAGS' | 'FLAGS_RAISED';
  closeReasonCode?: string | null;
  closureRemarks?: string | null;
}

export interface BookingDocumentView {
  requirementKey: string;
  documentTypeKey: string;
  requirementLevel: 'REQUIRED' | 'CONDITIONAL' | 'OPTIONAL';
  requirementStatus: string;
  applicabilityState: 'APPLICABLE' | 'NOT_APPLICABLE' | 'UNRESOLVED';
  applicabilityReason: string | null;
  answer: 'YES' | 'NO' | 'NA' | 'UNANSWERED';
  evidenceId: string | null;
  processingStatus: string | null;
  verificationStatus: string | null;
  updatedAtUtc: string | null;
}

export interface EvidenceRegion {
  type: string;
  coordinateSystem: string;
  box: [number, number, number, number];
}

export interface ExtractionProposalView {
  proposalId: string;
  fieldKey: string;
  sourceEvidenceId: string;
  sourceFactId: string;
  sourceFactVersion: number;
  sourceDocumentTypeKey: string | null;
  valueSource: string | null;
  proposedValue: unknown;
  confidence: number | null;
  pageNo?: number | null;
  evidenceRegion?: EvidenceRegion | null;
  status: 'PENDING' | 'ACCEPTED' | 'CORRECTED' | 'REJECTED' | 'SUPERSEDED';
  acceptedValue: unknown;
  canAccept: boolean;
  owningDomainKey: string | null;
  owningRecordReference: string | null;
  version: number;
}

export interface BookingFlagView {
  flagId: string;
  category: string | null;
  severity: string;
  status: string;
  title: string;
  description: string | null;
  originKind: 'MACHINE' | 'HUMAN' | null;
  originActorId: string | null;
  originRole: string | null;
  ruleKey: string | null;
  blockingCompletion: boolean;
  createdAtUtc: string;
  updatedAtUtc: string;
}

export interface BookingCompletionView {
  ready: boolean;
  blockers: Array<{ code: string; label: string }>;
  documentCount?: number;
  addressedDocumentCount?: number;
  pendingProposalCount?: number;
  blockingFlagCount?: number;
}

export interface BookingWorkspace {
  journeyId: string;
  bookingStage: BookingStageView;
  capture: Record<string, unknown>;
  documents: BookingDocumentView[];
  proposals: ExtractionProposalView[];
  flags: BookingFlagView[];
  completion: BookingCompletionView;
  processingSummary?: {
    pendingCount: number;
    failedCount: number;
    readyProposalCount: number;
  };
  flagSummary?: { openCount: number; totalCount: number };
  permittedActions: string[];
  aggregateVersion: number;
  operatingRole: string;
}

export interface BookingCommandResult {
  journeyId: string;
  businessStatus: string;
  closureDisposition: string | null;
  auditState: string;
  auditStatus: string;
  aggregateVersion: number;
}

export interface ProcessingStatus {
  version: number;
  pendingCount: number;
  readyProposalCount: number;
  failedCount: number;
  documents: BookingDocumentView[];
  userMessage: string | null;
}

export interface EvidenceReviewContent {
  blob: Blob;
  mimeType: string;
}

export interface EvidenceFactView {
  evidenceFactId: string;
  fieldKey: string;
  valueType: string;
  value: unknown;
  normalizedValue: string | null;
  confidenceScore: number | null;
  verificationStatus: string | null;
  pageNo: number | null;
  evidenceRegion: EvidenceRegion | null;
  fetchedAtUtc: string;
}

const processingByJourney = new Map<string, ProcessingStatus>();

function processingKey(tenantId: string, journeyId: string): string {
  return `${tenantId}:${journeyId}`;
}

export function rememberBookingWorkspace(
  tenantId: string,
  journeyId: string,
  workspace: BookingWorkspace,
): void {
  const summary = workspace.processingSummary;
  const failedCount = summary?.failedCount ?? 0;
  processingByJourney.set(processingKey(tenantId, journeyId), {
    version: workspace.aggregateVersion,
    pendingCount: summary?.pendingCount ?? 0,
    readyProposalCount: summary?.readyProposalCount ?? 0,
    failedCount,
    documents: workspace.documents,
    userMessage: failedCount > 0
      ? 'One or more documents need attention. Retry processing or upload a clearer document.'
      : null,
  });
}

function token(accessToken?: string): string {
  const value = accessToken?.trim();
  if (!value) throw new Error('A Security human access token is required.');
  return value;
}

function commandHeaders(idempotencyKey: string, version: number): HeadersInit {
  return {
    'Idempotency-Key': idempotencyKey,
    'If-Match': `"${version}"`,
  };
}

function base(tenantId: string, journeyId: string): string {
  return `/v1/tenants/${encodeURIComponent(tenantId)}/journeys/${encodeURIComponent(journeyId)}`;
}

function matchingRequirementKey(candidate: string, requested: string): boolean {
  if (candidate === requested) return true;
  const paymentKeys = new Set(['booking_payment_receipt', 'minimum_booking_payment_proof']);
  return paymentKeys.has(candidate) && paymentKeys.has(requested);
}

export function newIdempotencyKey(prefix: string): string {
  const random = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${random}`;
}

export function stableUploadKey(journeyId: string, requirementKey: string, file: File): string {
  const fingerprint = `${journeyId}:${requirementKey}:${file.name}:${file.size}:${file.lastModified}`;
  const storageKey = `uc03-upload:${fingerprint}`;
  const existing = sessionStorage.getItem(storageKey);
  if (existing) return existing;
  const created = newIdempotencyKey('uc03-booking-upload');
  sessionStorage.setItem(storageKey, created);
  return created;
}

export async function getBookingWorkspace(
  tenantId: string,
  journeyId: string,
  accessToken?: string,
): Promise<BookingWorkspace> {
  const workspace = await auditCoreRequest<BookingWorkspace>(`${base(tenantId, journeyId)}/uc03-workspace`, {
    accessToken: token(accessToken),
    cache: 'no-store',
  });
  rememberBookingWorkspace(tenantId, journeyId, workspace);
  return workspace;
}

export async function getBookingEvidenceReviewContent(
  tenantId: string,
  journeyId: string,
  evidenceId: string,
  accessToken?: string,
): Promise<EvidenceReviewContent> {
  const context = await prepareBookingDocumentUploadContext(tenantId, journeyId, accessToken);
  return getPcBookingDocumentContent(
    tenantId,
    context.externalContextRef,
    evidenceId,
    token(accessToken),
  );
}

export async function getBookingEvidenceFacts(
  tenantId: string,
  journeyId: string,
  evidenceId: string,
  accessToken?: string,
): Promise<EvidenceFactView[]> {
  const context = await prepareBookingDocumentUploadContext(tenantId, journeyId, accessToken);
  const review = await getPcBookingExtractionReview(
    tenantId,
    context.externalContextRef,
    evidenceId,
    token(accessToken),
  );
  const fetchedAtUtc = new Date().toISOString();
  return review.facts.map((fact) => ({
    evidenceFactId: fact.sourceFactRef,
    fieldKey: fact.fieldKey,
    valueType: typeof fact.normalizedValue,
    value: fact.normalizedValue ?? fact.rawValue,
    normalizedValue: typeof fact.normalizedValue === 'string' ? fact.normalizedValue : null,
    // Confidence is intentionally suppressed from the legacy adapter. The direct
    // Review flow still retains DI confidence for Audit Core persistence.
    confidenceScore: null,
    verificationStatus: null,
    pageNo: fact.pageNo,
    evidenceRegion: fact.evidenceRegion as EvidenceRegion | null,
    fetchedAtUtc,
  }));
}

export async function startBooking(
  tenantId: string,
  journeyId: string,
  version: number,
  accessToken?: string,
): Promise<BookingCommandResult> {
  return auditCoreRequest(`${base(tenantId, journeyId)}/booking/start`, {
    method: 'POST',
    accessToken: token(accessToken),
    headers: commandHeaders(newIdempotencyKey('uc03-booking-start'), version),
  });
}

export async function captureBookingValue(
  tenantId: string,
  journeyId: string,
  fieldKey: string,
  value: unknown,
  version: number,
  accessToken?: string,
): Promise<{ aggregateVersion: number }> {
  return auditCoreRequest(`${base(tenantId, journeyId)}/capture/${encodeURIComponent(fieldKey)}`, {
    method: 'PUT',
    accessToken: token(accessToken),
    headers: commandHeaders(newIdempotencyKey(`uc03-capture-${fieldKey.toLowerCase()}`), version),
    body: JSON.stringify({ value }),
  });
}

export async function uploadBookingDocument(
  tenantId: string,
  journeyId: string,
  requirementKey: string,
  file: File,
  accessToken?: string,
): Promise<{ evidenceId: string; processingStatus: string }> {
  let context = await prepareBookingDocumentUploadContext(tenantId, journeyId, accessToken);
  let requirement = context.requirements.find((item) =>
    matchingRequirementKey(item.requirementKey, requirementKey));

  // Conditional requirements (GST/Corporate/Trade-In) can become applicable only
  // after Step 2 is saved. Refresh the one reusable context on that boundary rather
  // than failing or forcing every upload to re-prepare it.
  if (!requirement) {
    context = await prepareBookingDocumentUploadContext(tenantId, journeyId, accessToken, true);
    requirement = context.requirements.find((item) =>
      matchingRequirementKey(item.requirementKey, requirementKey));
  }
  if (!requirement) {
    throw new Error('This Booking document requirement is not configured or currently applicable.');
  }

  const result = await uploadPcBookingDocument(
    tenantId,
    context.externalContextRef,
    requirement.requirementRef,
    requirement.documentTypeKey,
    file,
    token(accessToken),
  );
  rememberDirectBookingUpload(
    tenantId,
    journeyId,
    requirement.requirementRef,
    result.documentId,
    requirement.repeatable,
    {
      contentUrl: result.contentUrl ?? null,
      contentUrlExpiresAtUtc: result.contentUrlExpiresAtUtc ?? null,
      mimeType: result.mimeType ?? null,
    },
  );
  return {
    evidenceId: result.documentId,
    processingStatus: result.processingStatus || 'PROCESSING',
  };
}

export async function assessBookingDocument(
  tenantId: string,
  journeyId: string,
  requirementKey: string,
  answer: 'YES' | 'NO' | 'NA' | 'UNANSWERED',
  version: number,
  accessToken?: string,
  evidenceId?: string | null,
  remarks?: string,
): Promise<{ aggregateVersion: number }> {
  return auditCoreRequest(
    `${base(tenantId, journeyId)}/stages/BOOKING/documents/${encodeURIComponent(requirementKey)}`,
    {
      method: 'PUT',
      accessToken: token(accessToken),
      headers: commandHeaders(newIdempotencyKey(`uc03-doc-${requirementKey.toLowerCase()}`), version),
      body: JSON.stringify({ answer, evidenceId: evidenceId || null, remarks: remarks || null }),
    },
  );
}

// Retained only for compatibility with older callers while the PC path is
// migrated. Direct DI extraction is asynchronous and Audit Core is not refreshed.
export async function refreshBookingExtraction(
  tenantId: string,
  journeyId: string,
  accessToken?: string,
): Promise<{ aggregateVersion: number; refreshedDocuments: number; createdProposals: number; failedDocuments: number }> {
  const workspace = await getBookingWorkspace(tenantId, journeyId, accessToken);
  return {
    aggregateVersion: workspace.aggregateVersion,
    refreshedDocuments: 0,
    createdProposals: 0,
    failedDocuments: 0,
  };
}

export async function getBookingProcessingStatus(
  tenantId: string,
  journeyId: string,
  accessToken?: string,
): Promise<ProcessingStatus> {
  const key = processingKey(tenantId, journeyId);
  const known = processingByJourney.get(key);
  if (known && known.pendingCount === 0) return known;
  const result = await auditCoreRequest<ProcessingStatus>(`${base(tenantId, journeyId)}/processing-status`, {
    accessToken: token(accessToken),
    cache: 'no-store',
  });
  processingByJourney.set(key, result);
  return result;
}

export async function decideExtractionProposal(
  tenantId: string,
  journeyId: string,
  proposalId: string,
  mode: 'accept' | 'correct',
  version: number,
  accessToken?: string,
  acceptedValue?: unknown,
): Promise<{ aggregateVersion: number }> {
  return auditCoreRequest(
    `${base(tenantId, journeyId)}/extraction-proposals/${encodeURIComponent(proposalId)}/${mode}`,
    {
      method: 'POST',
      accessToken: token(accessToken),
      headers: commandHeaders(newIdempotencyKey(`uc03-proposal-${mode}`), version),
      body: JSON.stringify({ acceptedValue: mode === 'correct' ? acceptedValue : null }),
    },
  );
}

export async function createBookingFlag(
  tenantId: string,
  journeyId: string,
  version: number,
  payload: { category: string; severity: string; summary: string; remarks?: string },
  accessToken?: string,
): Promise<{ aggregateVersion: number }> {
  return auditCoreRequest(`${base(tenantId, journeyId)}/flags`, {
    method: 'POST',
    accessToken: token(accessToken),
    headers: commandHeaders(newIdempotencyKey('uc03-booking-flag'), version),
    body: JSON.stringify({ ...payload, evidenceIds: [] }),
  });
}

export async function concludeBooking(
  tenantId: string,
  journeyId: string,
  action: 'close-ready' | 'close-no-delivery' | 'cancel' | 'mark-duplicate',
  version: number,
  accessToken?: string,
  closeReasonCode?: string,
  remarks?: string,
): Promise<BookingCommandResult> {
  const body = action === 'close-ready'
    ? undefined
    : action === 'mark-duplicate'
      ? JSON.stringify({ remarks: remarks || null })
      : JSON.stringify({ closeReasonCode, remarks: remarks || null });
  return auditCoreRequest(`${base(tenantId, journeyId)}/booking/${action}`, {
    method: 'POST',
    accessToken: token(accessToken),
    headers: commandHeaders(newIdempotencyKey(`uc03-booking-${action}`), version),
    body,
  });
}
