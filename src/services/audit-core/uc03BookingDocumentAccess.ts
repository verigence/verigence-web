import { getPcBookingDocumentContent } from '../di/bookingDocuments';
import { prepareBookingDocumentUploadContext } from './uc03PcBookingDocuments';

export interface BookingDocumentAccess {
  url: string;
  mimeType: string;
  expiresInSeconds: number;
}

function token(accessToken?: string): string {
  const value = accessToken?.trim();
  if (!value) throw new Error('A Security human access token is required.');
  return value;
}

export async function getBookingDocumentAccess(
  tenantId: string,
  journeyId: string,
  evidenceId: string,
  accessToken?: string,
): Promise<BookingDocumentAccess> {
  const context = await prepareBookingDocumentUploadContext(tenantId, journeyId, accessToken);
  const access = await getPcBookingDocumentContent(
    tenantId,
    context.externalContextRef,
    evidenceId,
    token(accessToken),
  );
  return {
    url: access.url,
    mimeType: access.mimeType,
    expiresInSeconds: access.expiresInSeconds,
  };
}
