import { auditCoreRawRequest, auditCoreRequest } from './client';

/**
 * The dealers' monthly insurance dumps and the OD discount grid (product owner 16 Nov 2026):
 * each dealership's Mahindra "Policy Details Report" for a month (.xlsx or .csv); the month's
 * grid of agreed OD discount (per segment for 1 year and 3+3, plus model additions), keyed in or
 * uploaded as Excel; and two reports -- policies over the agreed OD discount, and journeys
 * Verigence shows as Self insurance while the dealership's dump carries the policy.
 * Audit Core /p2/v1/tenants/{t}/insurance-dumps.
 */

export type Tenure = '1Y' | '3+3';

export type InsuranceSetup = {
  dealers: { dealerId: string; dealerName: string }[];
  canUpload: boolean;
  canEditGrid: boolean;
  segments: { code: string; label: string }[];
  tenures: { code: Tenure; label: string }[];
  today: string;
};

export type InsuranceDump = {
  dumpId: string;
  dealerId: string;
  dealerName: string | null;
  periodMonth: string;
  fileName: string;
  status: 'ACTIVE' | 'SUPERSEDED';
  rows: number;
  duplicates: number;
  matched: number;
  uploadedBy: string;
  uploadedAtUtc: string;
};

export type OdGrid = {
  month: string;
  dealerId: string | null;
  segments: { segment: string; tenure: Tenure; pct: number }[];
  models: { model: string; tenure: Tenure | null; pct: number }[];
  updatedAtUtc: string | null;
  dealersWithOwnGrid: string[];
  previousMonth: string | null;
};

type PolicyRow = {
  dealerId: string;
  dealerName: string;
  policyNumber: string;
  policyDate: string | null;
  insurer: string | null;
  insuredName: string | null;
  vin: string | null;
  model: string | null;
  variant: string | null;
  segment: string | null;
  planType: string | null;
  tenure: Tenure | null;
  odDiscount: number | null;
  netOdPremium: number | null;
  journeyId: string | null;
  journeyReference: string | null;
  matchBasis: string | null;
};

export type InsuranceReport = {
  month: string;
  gridSet: boolean;
  dealers: { dealerId: string; dealerName: string; policies: number; over: number; within: number; noLimit: number;
    matched: number; selfButDealer: number }[];
  odOverLimit: (PolicyRow & { segmentLimit: number | null; modelExtra: number | null; allowed: number; excess: number })[];
  noLimit: (PolicyRow & { reason: string })[];
  selfButDealer: (PolicyRow & { journeyCustomer: string | null; decidedBy: string | null; decidedByLabel: string | null })[];
};

const base = (tenantId: string) => `/p2/v1/tenants/${encodeURIComponent(tenantId)}`;

export function getInsuranceSetup(tenantId: string, accessToken?: string) {
  return auditCoreRequest<InsuranceSetup>(`${base(tenantId)}/insurance-dumps/setup`, { accessToken, cache: 'no-store' });
}

export function listInsuranceDumps(tenantId: string, month: string, accessToken?: string) {
  return auditCoreRequest<{ month: string; uploads: InsuranceDump[] }>(
    `${base(tenantId)}/insurance-dumps?month=${encodeURIComponent(month)}`, { accessToken, cache: 'no-store' });
}

export function uploadInsuranceDump(tenantId: string, input: { file: File; dealerId: string }, accessToken?: string) {
  const form = new FormData();
  form.append('file', input.file);
  form.append('dealerId', input.dealerId);
  return auditCoreRequest<InsuranceDump>(`${base(tenantId)}/insurance-dumps`, { method: 'POST', body: form, accessToken });
}

export function getOdGrid(tenantId: string, month: string, dealerId: string | null, accessToken?: string) {
  const q = `month=${encodeURIComponent(month)}${dealerId ? `&dealerId=${encodeURIComponent(dealerId)}` : ''}`;
  return auditCoreRequest<OdGrid>(`${base(tenantId)}/insurance-dumps/od-grid?${q}`, { accessToken, cache: 'no-store' });
}

export function saveOdGrid(tenantId: string, input: {
  month: string;
  dealerId: string | null;
  segments: { segment: string; tenure: Tenure; pct: number | string | null }[];
  models: { model: string; tenure: Tenure | null; pct: number | string | null }[];
}, accessToken?: string) {
  return auditCoreRequest<OdGrid>(`${base(tenantId)}/insurance-dumps/od-grid`,
    { method: 'PUT', body: JSON.stringify(input), accessToken });
}

export function uploadOdGrid(tenantId: string, input: { file: File; month: string; dealerId: string | null },
  accessToken?: string) {
  const form = new FormData();
  form.append('file', input.file);
  form.append('month', input.month);
  if (input.dealerId) form.append('dealerId', input.dealerId);
  return auditCoreRequest<OdGrid>(`${base(tenantId)}/insurance-dumps/od-grid/file`, { method: 'POST', body: form, accessToken });
}

export async function downloadOdGridTemplate(tenantId: string, month: string, dealerId: string | null, accessToken?: string) {
  const q = `month=${encodeURIComponent(month)}${dealerId ? `&dealerId=${encodeURIComponent(dealerId)}` : ''}`;
  const response = await auditCoreRawRequest(`${base(tenantId)}/insurance-dumps/od-grid/template?${q}`, { accessToken });
  return response.blob();
}

export function getInsuranceReport(tenantId: string, month: string, accessToken?: string) {
  return auditCoreRequest<InsuranceReport>(`${base(tenantId)}/insurance-dumps/report?month=${encodeURIComponent(month)}`,
    { accessToken, cache: 'no-store' });
}

export async function downloadInsuranceReport(tenantId: string, month: string, accessToken?: string) {
  const response = await auditCoreRawRequest(`${base(tenantId)}/insurance-dumps/report/file?month=${encodeURIComponent(month)}`,
    { accessToken });
  return response.blob();
}
