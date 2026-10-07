import { auditCoreRequest } from './client';

function auth(accessToken?: string) {
  return accessToken ? { accessToken } : {};
}

export type OemMasterKind =
  | 'PRICE_LIST'
  | 'CONSUMER_SCHEME'
  | 'EXCHANGE_SCHEME'
  | 'CORPORATE_POLICY'
  | 'DISCOUNT_GRID';

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
  effectiveFrom: string;
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
