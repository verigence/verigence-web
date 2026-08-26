import { auditCoreRequest } from './client';
import { newIdempotencyKey } from './uc03Booking';
import {
  latestBookingDocumentDecisionVersion,
  locallyUploadedDocumentIds,
  prepareBookingDocumentUploadContext,
} from './uc03PcBookingDocuments';
import { listPcBookingDocuments, type PcBookingDocumentStatus } from '../di/bookingDocuments';

export interface BookingReferenceOption {
  code: string;
  label: string;
}

export interface BookingPriceListOption {
  priceListId: string;
  code: string;
  name: string;
  effectiveVersionId: string;
}

export interface BookingOptionalEvidence {
  requirementKey: string;
  documentTypeKey: string;
  evidenceId: string | null;
  processingStatus: string | null;
}

export interface BookingDetailsOptions {
  effectiveOn: string;
  priceLists: BookingPriceListOption[];
  customerTypes: BookingReferenceOption[];
  dealTypes: BookingReferenceOption[];
  dealSources: BookingReferenceOption[];
  leadSources: BookingReferenceOption[];
  registrationStates: BookingReferenceOption[];
  territoryCategories: BookingReferenceOption[];
  districts: BookingReferenceOption[];
  registrationTypes: BookingReferenceOption[];
  registrationCategories: BookingReferenceOption[];
}

export interface BookingDetailsView {
  aggregateVersion: number;
  priceListId: string | null;
  customerType: string | null;
  dealType: string | null;
  dealSource: string | null;
  leadSource: string | null;
  registrationState: string | null;
  territoryCategorization: string | null;
  districtName: string | null;
  registrationType: string | null;
  registrationCategory: string | null;
  outrightPurchase: boolean | null;
  tradeIn: boolean | null;
  gstBenefit: boolean | null;
  corporateIdAvailable: boolean | null;
  optionalEvidence: BookingOptionalEvidence[];
}

export interface BookingDetailsPayload {
  priceListId: string | null;
  customerType: string;
  dealType: string;
  dealSource: string;
  leadSource: string;
  registrationState: string;
  territoryCategorization: string;
  districtName: string;
  registrationType: string;
  registrationCategory: string;
  outrightPurchase: boolean;
  tradeIn: boolean;
  gstBenefit: boolean;
  corporateIdAvailable: boolean | null;
}

export interface BookingDetailsSaveResult {
  journeyId: string;
  aggregateVersion: number;
  optionalEvidence: BookingOptionalEvidence[];
}

export interface BookingReviewDocument {
  // Compatibility name retained for the existing page. On the direct-DI PC path
  // this is the DI documentId, not an Audit Core evidence UUID.
  evidenceId: string;
  requirementRef?: string;
  requirementKey: string | null;
  documentTypeKey: string | null;
  processingStatus: string | null;
  verificationStatus: string | null;
  captureEligibleFieldKeys?: string[];
  registeredAtUtc?: string | null;
  repeatable?: boolean;
}

export interface BookingReviewStartResult {
  journeyId: string;
  aggregateVersion: number;
  raisedObservationIds: string[];
  documents: BookingReviewDocument[];
}

export interface BookingReviewApprovalResult {
  evidenceId: string;
  aggregateVersion: number;
  verificationStatus: string;
}

function token(accessToken?: string): string {
  const value = accessToken?.trim();
  if (!value) throw new Error('A Security human access token is required.');
  return value;
}

function base(tenantId: string, journeyId: string): string {
  return `/v1/tenants/${encodeURIComponent(tenantId)}/journeys/${encodeURIComponent(journeyId)}/booking/details`;
}

function commandHeaders(prefix: string, version: number): HeadersInit {
  return {
    'Idempotency-Key': newIdempotencyKey(prefix),
    'If-Match': `"${version}"`,
  };
}

function newest(documents: PcBookingDocumentStatus[]): PcBookingDocumentStatus | undefined {
  return [...documents].sort((a, b) => {
    const time = Date.parse(b.registeredAtUtc) - Date.parse(a.registeredAtUtc);
    return time || b.documentId.localeCompare(a.documentId);
  })[0];
}

export async function getBookingDetails(
  tenantId: string,
  journeyId: string,
  accessToken?: string,
): Promise<BookingDetailsView> {
  return auditCoreRequest<BookingDetailsView>(base(tenantId, journeyId), {
    accessToken: token(accessToken),
    cache: 'no-store',
  });
}

export async function getBookingDetailsOptions(
  tenantId: string,
  journeyId: string,
  accessToken?: string,
): Promise<BookingDetailsOptions> {
  return auditCoreRequest<BookingDetailsOptions>(`${base(tenantId, journeyId)}/options`, {
    accessToken: token(accessToken),
    cache: 'no-store',
  });
}

export async function saveBookingDetails(
  tenantId: string,
  journeyId: string,
  payload: BookingDetailsPayload,
  version: number,
  accessToken?: string,
): Promise<BookingDetailsSaveResult> {
  return auditCoreRequest<BookingDetailsSaveResult>(base(tenantId, journeyId), {
    method: 'PUT',
    accessToken: token(accessToken),
    headers: commandHeaders('uc03-booking-details', version),
    body: JSON.stringify(payload),
  });
}

export async function startBookingDetailsReview(
  tenantId: string,
  journeyId: string,
  version: number,
  accessToken?: string,
): Promise<BookingReviewStartResult> {
  const review = await auditCoreRequest<BookingReviewStartResult>(`${base(tenantId, journeyId)}/review`, {
    method: 'POST',
    accessToken: token(accessToken),
    headers: commandHeaders('uc03-booking-review-start', version),
  });

  // The business review transition remains Audit Core-owned. The document list is
  // DI-owned on this PC path so no extraction/status copy is needed in Core.
  try {
    const context = await prepareBookingDocumentUploadContext(tenantId, journeyId, accessToken);
    const list = await listPcBookingDocuments(
      tenantId,
      context.externalContextRef,
      token(accessToken),
    );
    const documents: BookingReviewDocument[] = [];

    for (const requirement of context.requirements) {
      const directIds = new Set(locallyUploadedDocumentIds(
        tenantId,
        journeyId,
        requirement.requirementRef,
      ));
      const matches = list.documents.filter((document) =>
        document.requirementRef === requirement.requirementRef
        && document.uploadStatus.toUpperCase() !== 'REJECTED');

      // A freshly accepted upload can be visible before the list read catches up.
      // Preserve that documentId without fabricating processing/extraction state.
      for (const documentId of directIds) {
        if (!matches.some((item) => item.documentId === documentId)) {
          matches.push({
            documentId,
            requirementRef: requirement.requirementRef,
            documentTypeKey: requirement.documentTypeKey,
            uploadStatus: 'ACCEPTED',
            processingStatus: 'PROCESSING',
            registeredAtUtc: new Date().toISOString(),
          });
        }
      }

      const latest = newest(matches);
      const selected = requirement.repeatable
        ? [...matches].sort((a, b) => Date.parse(a.registeredAtUtc) - Date.parse(b.registeredAtUtc))
        : (latest ? [latest] : []);
      for (const document of selected) {
        documents.push({
          evidenceId: document.documentId,
          requirementRef: requirement.requirementRef,
          requirementKey: requirement.requirementKey,
          documentTypeKey: document.documentTypeKey || requirement.documentTypeKey,
          processingStatus: document.processingStatus,
          verificationStatus: null,
          captureEligibleFieldKeys: requirement.captureEligibleFieldKeys,
          registeredAtUtc: document.registeredAtUtc,
          repeatable: requirement.repeatable,
        });
      }
    }

    return { ...review, documents };
  } catch {
    // DI read failure must not block the PC from entering the review step. Do not
    // fall back to Audit Core's old extraction/proposal copy, because that would
    // silently reintroduce the deprecated data path.
    return { ...review, documents: [] };
  }
}

export async function approveBookingReviewDocument(
  tenantId: string,
  journeyId: string,
  evidenceId: string,
  version: number,
  _accessToken?: string,
): Promise<BookingReviewApprovalResult> {
  // The direct-DI review panel persists one Audit Core batch before invoking this
  // compatibility hook. There is deliberately no DI verification/proxy call here.
  return {
    evidenceId,
    aggregateVersion: latestBookingDocumentDecisionVersion(tenantId, journeyId, version),
    verificationStatus: 'REVIEWED',
  };
}
