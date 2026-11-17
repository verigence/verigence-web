import { auditCoreRawRequest, auditCoreRequest } from './client';

/**
 * The dealers' monthly extended warranty (EW) and RSA dumps (product owner 17 Nov 2026): each
 * dealership's Mahindra scheme register for a month (.xlsx, .xls or .csv). Every registration is
 * matched to a journey of the dealership (chassis, DMS customer id, registration number) and set
 * against what Verigence shows the customer was charged for: in sync; in the dump but not bought
 * as per Verigence; bought as per Verigence but not in the dump; in the dump but not in Verigence.
 * Audit Core /p2/v1/tenants/{t}/scheme-dumps.
 */

export type SchemeKind = 'EW' | 'RSA';
export type SchemeOutcome = 'IN_SYNC' | 'NOT_BOUGHT' | 'NOT_IN_DUMP' | 'NOT_IN_VERIGENCE' | 'SERVICE_ONLY' | 'CANCELLED';

export type SchemeSetup = {
  types: { key: SchemeKind; label: string; frequency: string }[];
  dealers: { dealerId: string; dealerName: string }[];
  canUpload: boolean;
  today: string;
};

export type SchemeDump = {
  dumpId: string;
  kind: SchemeKind;
  kindLabel: string;
  dealerId: string;
  dealerName: string | null;
  periodMonth: string;
  fileName: string;
  format: string | null;
  status: 'ACTIVE' | 'SUPERSEDED';
  rows: number;
  duplicates: number;
  sales: number;
  service: number;
  cancelled: number;
  matched: number;
  locations: string[];
  unmappedLocations: string[];
  uploadedBy: string;
  uploadedAtUtc: string;
  matchedAtUtc: string | null;
};

/** A registration in a dump, with the journey it was matched to and what Verigence shows. */
export type SchemeRow = {
  dealerId: string;
  dealerName: string;
  kind: SchemeKind;
  outcome: SchemeOutcome;
  schemeNumber: string | null;
  schemeDate: string | null;
  scheme: string | null;
  customerCode: string | null;
  customerName: string | null;
  chassis: string | null;
  registrationNumber: string | null;
  model: string | null;
  channel: 'SALES' | 'SERVICE' | 'UNKNOWN';
  channelLabel: string;
  category: string | null;
  foc: boolean;
  schemeStatus: string | null;
  cancelled: boolean;
  cancelledOn: string | null;
  schemeAmount: number | null;
  taxAmount: number | null;
  location: string | null;
  journeyId: string | null;
  journeyReference: string | null;
  journeyCustomer: string | null;
  outletName: string | null;
  matchBasis: string | null;
  matchBasisLabel: string | null;
  severalJourneys: boolean;
  /** Found through the customer the insurance or DMS delivery dump names for the same chassis. */
  viaOtherDump: boolean;
  verigenceSold: boolean;
  verigenceReason: string | null;
  papersOnFile: boolean;
  focCharged: boolean;
};

/** A journey Verigence shows as charged whose vehicle no current dump carries. */
export type SchemeJourney = {
  dealerId: string;
  dealerName: string;
  kind: SchemeKind;
  outcome: 'NOT_IN_DUMP';
  journeyId: string;
  journeyReference: string | null;
  journeyCustomer: string | null;
  outletName: string | null;
  model: string | null;
  chassis: string | null;
  journeyDate: string;
  verigenceReason: string | null;
  cancelledInDump: boolean;
  cancelledOn: string | null;
  monthEnd: boolean;
};

export type SchemeDealerStats = {
  dealerId: string;
  dealerName: string;
  uploaded: boolean;
  /** The outlets the month's dumps cover; null for the whole dealership. */
  coverage: string[] | null;
  rows: number;
  sales: number;
  service: number;
  cancelled: number;
  matched: number;
  inSync: number;
  notBought: number;
  papersPending: number;
  notInDump: number;
  notInVerigence: number;
  serviceOnly: number;
};

export type SchemeReport = {
  month: string;
  kind: SchemeKind;
  kindLabel: string;
  checkedAtUtc: string | null;
  dealers: SchemeDealerStats[];
  inSync: SchemeRow[];
  notBought: SchemeRow[];
  notInDump: SchemeJourney[];
  notInVerigence: SchemeRow[];
  serviceOnly: SchemeRow[];
  cancelled: SchemeRow[];
};

const base = (tenantId: string) => `/p2/v1/tenants/${encodeURIComponent(tenantId)}`;

export function getSchemeSetup(tenantId: string, accessToken?: string) {
  return auditCoreRequest<SchemeSetup>(`${base(tenantId)}/scheme-dumps/setup`, { accessToken, cache: 'no-store' });
}

export function listSchemeDumps(tenantId: string, month: string, accessToken?: string) {
  return auditCoreRequest<{ month: string; uploads: SchemeDump[] }>(
    `${base(tenantId)}/scheme-dumps?month=${encodeURIComponent(month)}`, { accessToken, cache: 'no-store' });
}

/** The type (EW or RSA) is read from the file's own columns; pass it only to insist on one. */
export function uploadSchemeDump(tenantId: string, input: { file: File; dealerId: string; kind?: SchemeKind },
  accessToken?: string) {
  const form = new FormData();
  form.append('file', input.file);
  form.append('dealerId', input.dealerId);
  if (input.kind) form.append('kind', input.kind);
  return auditCoreRequest<SchemeDump>(`${base(tenantId)}/scheme-dumps`, { method: 'POST', body: form, accessToken });
}

export function getSchemeReport(tenantId: string, month: string, kind: SchemeKind, accessToken?: string) {
  return auditCoreRequest<SchemeReport>(
    `${base(tenantId)}/scheme-dumps/report?month=${encodeURIComponent(month)}&kind=${kind}`, { accessToken, cache: 'no-store' });
}

/** Match the month's dumps to the journeys as they stand now and decide again what Verigence shows. */
export function recheckSchemeDumps(tenantId: string, input: { month: string; dealerId?: string }, accessToken?: string) {
  return auditCoreRequest<{ month: string; dealers: number; dumps: number; journeys: number }>(
    `${base(tenantId)}/scheme-dumps/recheck`, { method: 'POST', body: JSON.stringify(input), accessToken });
}

export async function downloadSchemeReport(tenantId: string, month: string, accessToken?: string): Promise<Blob> {
  const response = await auditCoreRawRequest(`${base(tenantId)}/scheme-dumps/report/file?month=${encodeURIComponent(month)}`,
    { accessToken });
  return response.blob();
}
