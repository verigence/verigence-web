import { auditCoreRawRequest, auditCoreRequest } from './client';

function auth(accessToken?: string) {
  return accessToken ? { accessToken } : {};
}

export type OemMasterKind =
  | 'PRICE_LIST'
  | 'CONSUMER_SCHEME'
  | 'EXCHANGE_SCHEME'
  | 'CORPORATE_POLICY'
  | 'DISCOUNT_GRID';

/** Masters with an Excel reader have a standard template; the consumer and exchange bulletins are the OEM's own PDFs. */
export const OEM_MASTER_TEMPLATE_KINDS: OemMasterKind[] = ['PRICE_LIST', 'CORPORATE_POLICY', 'DISCOUNT_GRID'];

export const OEM_MASTER_KINDS: { kind: OemMasterKind; label: string; accept: string; hint: string }[] = [
  {
    kind: 'PRICE_LIST',
    label: 'Price list',
    accept: '.xlsx',
    hint: 'The OEM consolidated list, or the dealer\'s per-model price sheets (PV/CV and EV layouts). A file with only the changed models still makes a complete version.',
  },
  {
    kind: 'CONSUMER_SCHEME',
    label: 'Consumer scheme bulletin',
    accept: '.pdf',
    hint: 'Cash discount + accessories / extended-warranty offers per model.',
  },
  {
    kind: 'EXCHANGE_SCHEME',
    label: 'Exchange / scrappage ready reckoner',
    accept: '.pdf',
    hint: 'Exchange, scrappage and welcome bonus — the total offer to the customer.',
  },
  {
    kind: 'CORPORATE_POLICY',
    label: 'Corporate privilege policy',
    accept: '.xlsx',
    hint: 'Privilege matrix per category × brand, plus the corporate customer list.',
  },
  {
    kind: 'DISCOUNT_GRID',
    label: 'Dealer discount grid',
    accept: '.xlsx',
    hint: 'Per model: booking protection days, agreed buffer, insurance OD % (a maximum for now), out-of-territory addition; plus the policy parameters.',
  },
];

export interface OemMasterUploadPreview {
  uploadId: string | null;
  tenantId: string;
  oemCode: string;
  masterKind: OemMasterKind;
  /** Null while the file was only checked and carries no date: the person types it before publishing. */
  effectiveFrom: string | null;
  /** ADMIN when entered, else SHEET or FILENAME: where the applied date came from. */
  effectiveFromSource?: string;
  sourceFilename: string;
  sourceSha256: string;
  status: string;
  rowCounts: Record<string, unknown>;
  warnings: string[];
  errors: string[];
  unresolved: string[];
  sample: Record<string, unknown>[];
  priceListVersionId: string | null;
  discountSchemeSummary: Record<string, unknown>;
}

export interface OemMasterUploadRow {
  uploadId: string;
  masterKind: OemMasterKind;
  effectiveFrom: string;
  sourceFilename: string;
  sourceSha256: string;
  status: string;
  rowCounts: Record<string, unknown>;
  uploadedAtUtc: string;
  publishedAtUtc: string | null;
}

function uploadForm(
  tenantId: string,
  masterKind: OemMasterKind,
  effectiveFrom: string,
  file: File,
): FormData {
  const body = new FormData();
  body.append('tenantId', tenantId);
  body.append('masterKind', masterKind);
  if (effectiveFrom) body.append('effectiveFrom', effectiveFrom);
  body.append('file', file);
  return body;
}

export function previewOemMaster(
  tenantId: string,
  masterKind: OemMasterKind,
  effectiveFrom: string,
  file: File,
  accessToken?: string,
) {
  return auditCoreRequest<OemMasterUploadPreview>('/v1/admin/oem-masters/uploads?dryRun=true', {
    method: 'POST',
    body: uploadForm(tenantId, masterKind, effectiveFrom, file),
    ...auth(accessToken),
  });
}

export function publishOemMaster(
  tenantId: string,
  masterKind: OemMasterKind,
  effectiveFrom: string,
  file: File,
  accessToken?: string,
) {
  return auditCoreRequest<OemMasterUploadPreview>('/v1/admin/oem-masters/uploads?dryRun=false', {
    method: 'POST',
    body: uploadForm(tenantId, masterKind, effectiveFrom, file),
    ...auth(accessToken),
  });
}

export function listOemMasterUploads(tenantId: string, accessToken?: string) {
  return auditCoreRequest<OemMasterUploadRow[]>(
    `/v1/admin/oem-masters/uploads?tenantId=${encodeURIComponent(tenantId)}`,
    auth(accessToken),
  );
}

export function getOemMasterUpload(uploadId: string, tenantId: string, accessToken?: string) {
  return auditCoreRequest<OemMasterUploadPreview>(
    `/v1/admin/oem-masters/uploads/${uploadId}?tenantId=${encodeURIComponent(tenantId)}`,
    auth(accessToken),
  );
}

/** The standard Excel template for a master, as the server built it. */
export async function downloadOemMasterTemplate(
  tenantId: string,
  masterKind: OemMasterKind,
  accessToken?: string,
): Promise<{ blob: Blob; filename: string }> {
  const response = await auditCoreRawRequest(
    `/v1/admin/oem-masters/templates/${masterKind}?tenantId=${encodeURIComponent(tenantId)}`,
    auth(accessToken),
  );
  const disposition = response.headers.get('content-disposition') ?? '';
  const named = /filename="?([^";]+)"?/i.exec(disposition);
  return { blob: await response.blob(), filename: named?.[1] ?? `${masterKind.toLowerCase()}-template.xlsx` };
}

/** Saves a downloaded file through the browser. */
export function saveDownloadedFile(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
