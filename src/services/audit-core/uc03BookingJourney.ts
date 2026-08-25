import { auditCoreRequest } from './client';
import { newIdempotencyKey } from './uc03Booking';

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
  evidenceId: string;
  requirementKey: string | null;
  documentTypeKey: string | null;
  processingStatus: string | null;
  verificationStatus: string | null;
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
  return auditCoreRequest<BookingReviewStartResult>(`${base(tenantId, journeyId)}/review`, {
    method: 'POST',
    accessToken: token(accessToken),
    headers: commandHeaders('uc03-booking-review-start', version),
  });
}

export async function approveBookingReviewDocument(
  tenantId: string,
  journeyId: string,
  evidenceId: string,
  version: number,
  accessToken?: string,
): Promise<BookingReviewApprovalResult> {
  return auditCoreRequest<BookingReviewApprovalResult>(
    `${base(tenantId, journeyId)}/review/${encodeURIComponent(evidenceId)}/approve-editable`,
    {
      method: 'POST',
      accessToken: token(accessToken),
      headers: commandHeaders('uc03-booking-review-approve', version),
    },
  );
}