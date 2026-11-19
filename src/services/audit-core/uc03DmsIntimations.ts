import { auditCoreRawRequest, auditCoreRequest } from './client';
import type { DmsDumpKind } from './uc03DmsDumps';

/**
 * The PCs say which DMS bookings and deliveries were intimated to them (product owner
 * 18 Nov 2026): after a dump is uploaded every PC is alerted, opens Booking / Delivery
 * Intimation, finds the rows of their DMS locations and marks the ones intimated to them.
 * The Reviewer and above see who has marked how many (on demand) and generate the DMS
 * report in Reports. Audit Core /p2/v1/tenants/{t}/dms-intimations and /dms-reports.
 */

export type IntimationView = 'new' | 'open' | 'month';
export type IntimationState = 'IN_VERIGENCE' | 'INTIMATED' | 'OPEN';

export type IntimationDealer = {
  dealerId: string;
  dealerName: string;
  groups: string[];
  groupOutlets: string[];
  booking: { dumpDate: string | null; previousDumpDate: string | null };
  delivery: { dumpDate: string | null; previousDumpDate: string | null };
};

export type IntimationSetup = { dealers: IntimationDealer[]; canMark: boolean; canSeeCounter: boolean; today: string };

export type IntimationItem = {
  dumpId: string;
  rowNo: number;
  kind: DmsDumpKind;
  eventDate: string | null;
  customerName: string | null;
  mobile: string | null;
  otf: string | null;
  bookingNumber: string | null;
  chassis: string | null;
  invoiceNumber: string | null;
  registrationNumber: string | null;
  model: string | null;
  variant: string | null;
  stage: string | null;
  consultant: string | null;
  location: string | null;
  outcome: string;
  state: IntimationState;
  bookingOnFile: boolean;
  journeyId: string | null;
  journeyReference: string | null;
  mark: { byName: string; atUtc: string; mine: boolean } | null;
  /** An earlier row of the month not yet marked, carried into this dump (2026-11-19). */
  carried?: boolean;
  /** The Journey's outlet and uploader; the PC is linked only to their own outlets' Journeys (2026-11-19). */
  journeyOutlet?: string | null;
  journeyUploadedBy?: string | null;
  canOpenJourney?: boolean;
  /** Delivery rows: Inscope / Outscope by the Deal Type rule (2026-11-19). */
  dealType?: string | null;
  dealTypeBasis?: string | null;
};

export type IntimationList = {
  kind: DmsDumpKind;
  dealerId: string | null;
  dealerName?: string;
  view?: IntimationView;
  dump: { dumpId: string; dumpDate: string; previousDumpDate: string | null } | null;
  counts: Record<IntimationView, number>;
  newStates?: Record<IntimationState, number>;
  items: IntimationItem[];
  truncated?: boolean;
};

export type IntimationCounter = {
  kind: DmsDumpKind;
  dealers: {
    dealerId: string;
    dealerName: string;
    dumpDate: string | null;
    previousDumpDate: string | null;
    totals: { rows: number; inVerigence: number; intimated: number; open: number; newRows: number; newOpen: number };
    pcs: { actorId: string; name: string; outlets: string[]; marked: number; markedNew: number; lastAtUtc: string | null }[];
    openByLocation: { location: string; open: number }[];
  }[];
};

export type DmsReportSummary = {
  reportId: string;
  date: string;
  generatedBy: string;
  generatedAtUtc?: string;
  figures: Record<string, number>;
  statementLines?: string[];
};

export type DmsReport = DmsReportSummary & {
  month: string;
  statementLines: string[];
  dealers: {
    dealerId: string;
    dealerName: string;
    bookingDumpDate: string | null;
    deliveryDumpDate: string | null;
    figures: Record<string, number>;
  }[];
  rows: { kind: DmsDumpKind; dealerName: string; location: string | null; customerName: string | null;
    intimation: string; markedBy: string | null; inVerigence: string }[];
};

const base = (tenantId: string) => `/p2/v1/tenants/${encodeURIComponent(tenantId)}`;

export function getIntimationSetup(tenantId: string, accessToken?: string) {
  return auditCoreRequest<IntimationSetup>(`${base(tenantId)}/dms-intimations/setup`, { accessToken, cache: 'no-store' });
}

export function listIntimations(tenantId: string, params: { kind: DmsDumpKind; dealerId?: string; view: IntimationView; q?: string },
  accessToken?: string) {
  const query = new URLSearchParams({ kind: params.kind, view: params.view });
  if (params.dealerId) query.set('dealerId', params.dealerId);
  if (params.q?.trim()) query.set('q', params.q.trim());
  return auditCoreRequest<IntimationList>(`${base(tenantId)}/dms-intimations?${query}`, { accessToken, cache: 'no-store' });
}

export function claimIntimation(tenantId: string, item: { dumpId: string; rowNo: number }, accessToken?: string) {
  return auditCoreRequest<{ state: IntimationState }>(`${base(tenantId)}/dms-intimations/claim`, {
    method: 'POST', accessToken, body: JSON.stringify({ dumpId: item.dumpId, rowNo: item.rowNo }),
  });
}

export function withdrawIntimation(tenantId: string, item: { dumpId: string; rowNo: number }, accessToken?: string) {
  return auditCoreRequest<{ state: IntimationState }>(`${base(tenantId)}/dms-intimations/withdraw`, {
    method: 'POST', accessToken, body: JSON.stringify({ dumpId: item.dumpId, rowNo: item.rowNo }),
  });
}

export function getIntimationCounter(tenantId: string, kind: DmsDumpKind, accessToken?: string, dealerId?: string) {
  const query = new URLSearchParams({ kind });
  if (dealerId) query.set('dealerId', dealerId);
  return auditCoreRequest<IntimationCounter>(`${base(tenantId)}/dms-intimations/counter?${query}`, { accessToken, cache: 'no-store' });
}

export function generateDmsReport(tenantId: string, date: string | undefined, accessToken?: string) {
  return auditCoreRequest<DmsReportSummary>(`${base(tenantId)}/dms-reports`, {
    method: 'POST', accessToken, body: JSON.stringify(date ? { date } : {}),
  });
}

export function listDmsReports(tenantId: string, month: string, accessToken?: string) {
  return auditCoreRequest<{ month: string; items: DmsReportSummary[] }>(
    `${base(tenantId)}/dms-reports?month=${encodeURIComponent(month)}`, { accessToken, cache: 'no-store' });
}

export function getDmsReport(tenantId: string, reportId: string, accessToken?: string) {
  return auditCoreRequest<DmsReport>(`${base(tenantId)}/dms-reports/${encodeURIComponent(reportId)}`, { accessToken });
}

export async function downloadGeneratedDmsReport(tenantId: string, reportId: string, accessToken?: string): Promise<Blob> {
  const response = await auditCoreRawRequest(`${base(tenantId)}/dms-reports/${encodeURIComponent(reportId)}/file`, { accessToken });
  return response.blob();
}

/** What a row needs from the PC, in words. */
export const INTIMATION_STATE_LABELS: Record<IntimationState, { label: string; tone: 'ok' | 'warn' | 'bad' }> = {
  IN_VERIGENCE: { label: 'In Verigence', tone: 'ok' },
  INTIMATED: { label: 'Intimated', tone: 'warn' },
  OPEN: { label: 'Not marked', tone: 'bad' },
};
