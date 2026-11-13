import { auditCoreRawRequest, auditCoreRequest } from './client';

/**
 * The dealers' DMS booking and delivery dumps (product owner 13 Nov 2026): a Team Lead or
 * Reviewer uploads each dealership's month-to-date DMS report every day; every row is matched
 * against the journeys on file, the rows not found are the missing bookings / deliveries, and the
 * journeys found are marked synced. Audit Core /p2/v1/tenants/{t}/dms-dumps.
 */

export type DmsDumpKind = 'BOOKING' | 'DELIVERY';
export type DmsRowOutcome = 'MATCHED' | 'NOT_IN_TOOL' | 'MISSING' | 'CANCELLED';

export type DmsUploadType = { key: string; label: string; kind: DmsDumpKind; frequency: 'DAILY' | 'WEEKLY' | 'MONTHLY' };

export type DmsSetup = {
  types: DmsUploadType[];
  dealers: { dealerId: string; dealerName: string }[];
  canUpload: boolean;
  today: string;
};

export type DmsDump = {
  dumpId: string;
  kind: DmsDumpKind;
  dealerId: string;
  dealerName: string | null;
  businessDate: string;
  periodMonth: string;
  fileName: string;
  format: string;
  status: 'ACTIVE' | 'SUPERSEDED';
  rows: number;
  matched: number;
  notInTool: number;
  missing: number;
  cancelled: number;
  uploadedBy: string;
  uploadedAtUtc: string;
  matchedAtUtc: string | null;
};

export type DmsDumpRow = {
  rowNo: number;
  kind: DmsDumpKind;
  outcome: DmsRowOutcome;
  matchBasis: string | null;
  dealerName: string | null;
  outletName: string | null;
  outletLabel: string | null;
  eventDate: string | null;
  bookingNumber: string | null;
  otf: string | null;
  customerName: string | null;
  mobile: string | null;
  chassis: string | null;
  invoiceNumber: string | null;
  registrationNumber: string | null;
  model: string | null;
  variant: string | null;
  stage: string | null;
  consultant: string | null;
  journeyId: string | null;
  journeyReference: string | null;
  dumpDate: string;
};

export type DmsDayCell = { status: 'UPLOADED' | 'MISSED' | 'DUE' | 'AHEAD'; dumpId?: string; rows?: number; missing?: number; notInTool?: number };
export type DmsCalendar = {
  month: string;
  today: string;
  totals: { due: number; uploaded: number; missed: number };
  dealers: { dealerId: string; dealerName: string; days: { date: string; booking: DmsDayCell; delivery: DmsDayCell }[] }[];
};

export const DMS_OUTCOME_LABELS: Record<DmsRowOutcome, { label: string; tone: 'ok' | 'warn' | 'bad' | 'open' }> = {
  MISSING: { label: 'Not in Verigence', tone: 'bad' },
  NOT_IN_TOOL: { label: 'Delivery not uploaded', tone: 'warn' },
  MATCHED: { label: 'Synced', tone: 'ok' },
  CANCELLED: { label: 'Cancelled in DMS', tone: 'open' },
};

export const DMS_MATCH_BASIS: Record<string, string> = {
  BOOKING_NUMBER: 'Booking no. / OTF',
  CHASSIS: 'Chassis',
  MOBILE: 'Mobile',
  NAME_MODEL: 'Name + model',
};

export const DATA_UPLOADS_PATH = '/p2/data-uploads';

const base = (tenantId: string) => `/p2/v1/tenants/${encodeURIComponent(tenantId)}`;

export function getDmsSetup(tenantId: string, accessToken?: string) {
  return auditCoreRequest<DmsSetup>(`${base(tenantId)}/dms-dumps/setup`, { accessToken, cache: 'no-store' });
}

export function listDmsDumps(tenantId: string, month: string, accessToken?: string, dealerId?: string) {
  const query = new URLSearchParams({ month });
  if (dealerId) query.set('dealer_id', dealerId);
  return auditCoreRequest<{ month: string; items: DmsDump[] }>(`${base(tenantId)}/dms-dumps?${query}`,
    { accessToken, cache: 'no-store' });
}

export function getDmsDump(tenantId: string, dumpId: string, accessToken?: string) {
  return auditCoreRequest<DmsDump & { items: DmsDumpRow[] }>(`${base(tenantId)}/dms-dumps/${encodeURIComponent(dumpId)}`,
    { accessToken, cache: 'no-store' });
}

export function uploadDmsDump(tenantId: string, input: { file: File; dealerId: string; businessDate: string; kind?: DmsDumpKind },
  accessToken?: string) {
  const form = new FormData();
  form.append('file', input.file);
  form.append('dealerId', input.dealerId);
  form.append('businessDate', input.businessDate);
  if (input.kind) form.append('kind', input.kind);
  return auditCoreRequest<DmsDump>(`${base(tenantId)}/dms-dumps`, { method: 'POST', body: form, accessToken });
}

export function rematchDmsDump(tenantId: string, dumpId: string, accessToken?: string) {
  return auditCoreRequest<DmsDump>(`${base(tenantId)}/dms-dumps/${encodeURIComponent(dumpId)}/rematch`,
    { method: 'POST', accessToken });
}

export async function downloadDmsReport(tenantId: string, month: string, accessToken?: string, dumpId?: string): Promise<Blob> {
  const query = new URLSearchParams({ month });
  if (dumpId) query.set('dump_id', dumpId);
  const response = await auditCoreRawRequest(`${base(tenantId)}/dms-dumps/report/file?${query}`, { accessToken });
  return response.blob();
}

export function getDmsCalendar(tenantId: string, month: string, accessToken?: string) {
  return auditCoreRequest<DmsCalendar>(`${base(tenantId)}/reports/dms-dump-calendar?month=${encodeURIComponent(month)}`,
    { accessToken, cache: 'no-store' });
}

/** The dealership a file is for, from its name ("2026-11-05_Aditya_Booking_Report.xlsx"). */
export function dealerFromFileName(name: string, dealers: { dealerId: string; dealerName: string }[]): string {
  const words = name.toLowerCase().split(/[^a-z]+/).filter((w) => w.length >= 4);
  const found = dealers.filter((d) => words.some((w) => d.dealerName.toLowerCase().includes(w)));
  return found.length === 1 ? found[0].dealerId : '';
}

/** The day a file is for, from its name (2026-11-05 / 05-11-2026), else ''. */
export function dateFromFileName(name: string): string {
  const iso = name.match(/(20\d{2})[-_.](\d{2})[-_.](\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = name.match(/(\d{2})[-_.](\d{2})[-_.](20\d{2})/);
  return dmy ? `${dmy[3]}-${dmy[2]}-${dmy[1]}` : '';
}

/** The kind a file is, from its name, else undefined (the server reads its columns anyway). */
export function kindFromFileName(name: string): DmsDumpKind | undefined {
  const lower = name.toLowerCase();
  if (lower.includes('deliver')) return 'DELIVERY';
  if (lower.includes('booking')) return 'BOOKING';
  return undefined;
}
