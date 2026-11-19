import { auditCoreRawRequest, auditCoreRequest } from './client';

/**
 * The dealers' DMS booking and delivery dumps (product owner 13 Nov 2026): a Team Lead or
 * Reviewer uploads each dealership's month-to-date DMS report every day; every row is matched
 * against the journeys on file, the rows not found are the missing bookings / deliveries, and the
 * journeys found are marked synced. Audit Core /p2/v1/tenants/{t}/dms-dumps.
 */

export type DmsDumpKind = 'BOOKING' | 'DELIVERY';
// NOT_IN_DMS: not a dump row -- a delivery Journey of the days a delivery dump covers that the
// dump does not carry (product owner 17 Nov 2026); its date is Verigence's delivery day.
export type DmsRowOutcome = 'MATCHED' | 'NOT_IN_TOOL' | 'MISSING' | 'CANCELLED' | 'NOT_IN_DMS';

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
  rowNo: number | null;
  datedBy?: string;
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
  /** Delivery dump rows: the Deal Type rule's Inscope / Outscope (2026-11-19); null = pending. */
  dealType?: string | null;
  dealTypeBasis?: string | null;
};

/** The Deal Type in words, for a delivery dump row (2026-11-19). */
export function dealTypeLabel(value: string | null | undefined): { label: string; tone: 'ok' | 'warn' | 'bad' } {
  if (value === 'INSCOPE') return { label: 'Inscope', tone: 'ok' };
  if (value === 'OUTSCOPE') return { label: 'Outscope', tone: 'warn' };
  if (value === 'MR' || value === 'LEASE' || value === 'BULK') return { label: value === 'MR' ? 'MR' : value === 'LEASE' ? 'Lease' : 'Bulk', tone: 'ok' };
  return { label: 'Scope pending', tone: 'bad' };
}

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
  NOT_IN_DMS: { label: 'In Verigence, not in dump', tone: 'warn' },
};

export const DMS_MATCH_BASIS: Record<string, string> = {
  BOOKING_NUMBER: 'Booking no. / OTF',
  CHASSIS: 'Chassis',
  MOBILE: 'Mobile',
  NAME_DATE: 'Name + booking date',
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

/** The variance workbook of one day's uploads (``day``, YYYY-MM-DD), one upload, or the month. */
export async function downloadDmsReport(tenantId: string, month: string, accessToken?: string, dumpId?: string,
  day?: string): Promise<Blob> {
  const query = new URLSearchParams({ month });
  if (dumpId) query.set('dump_id', dumpId);
  if (day) query.set('day', day);
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

/**
 * The DMS dumps outlet wise (product owner 16 Nov 2026), month to date as at a day, against
 * Verigence and the gate register. The DMS keeps some outlets under another's location (Utkal's
 * ANANDAPUR under KEONJHAR; every Aditya outlet but JAJPUR under CUTTACK): those outlets carry
 * their own Verigence figures and the location's row compares the DMS with their total.
 * Audit Core /p2/v1/tenants/{t}/dms-dumps/outlet-report and /outlet-map.
 */
export type DmsOutletFigures = Partial<Record<
  | 'bookingDms' | 'bookingSynced' | 'bookingNotInVerigence' | 'bookingCancelled'
  | 'deliveryDump' | 'deliverySynced' | 'deliveryNotUploaded' | 'deliveryNotInVerigence'
  | 'bookingInVerigence' | 'bookingDatedByUpload' | 'deliveryInVerigence' | 'deliveryDatedWithoutGatePass'
  | 'deliveryNotInDms' | 'inscope' | 'outscope' | 'otherDealType'
  | 'dealTypePending' | 'gateRegister' | 'notIntimated' | 'pendingWithPc' | 'registersMissed' | 'countsPending'
  | 'bookingGap' | 'deliveryGap', number>>;

export type DmsOutletLocation = {
  dmsOutletId: string;
  name: string;
  outlets: { outletId: string; outletName: string; figures: DmsOutletFigures }[];
  figures: DmsOutletFigures;
};

export type DmsOutletReport = {
  date: string;
  month: string;
  today: string;
  figures: DmsOutletFigures;
  dealers: {
    dealerId: string;
    dealerName: string;
    bookingDumpDate: string | null;
    deliveryDumpDate: string | null;
    bookingsTo: string;
    deliveriesTo: string;
    locations: DmsOutletLocation[];
    unmapped: { label: string; figures: DmsOutletFigures }[];
    figures: DmsOutletFigures;
  }[];
};

export type DmsOutletMap = {
  canEdit: boolean;
  dealers: {
    dealerId: string;
    dealerName: string;
    outlets: { outletId: string; outletName: string; dmsOutletId: string; labels: string[]; catchAll: boolean }[];
    labelsSeen: { label: string; rows: number; outletName: string | null; dmsLocation: string | null }[];
  }[];
};

export function getDmsOutletReport(tenantId: string, date: string, accessToken?: string) {
  return auditCoreRequest<DmsOutletReport>(`${base(tenantId)}/dms-dumps/outlet-report?date=${encodeURIComponent(date)}`,
    { accessToken, cache: 'no-store' });
}

export async function downloadDmsOutletReport(tenantId: string, date: string, accessToken?: string): Promise<Blob> {
  const response = await auditCoreRawRequest(`${base(tenantId)}/dms-dumps/outlet-report/file?date=${encodeURIComponent(date)}`,
    { accessToken });
  return response.blob();
}

export function getDmsOutletMap(tenantId: string, accessToken?: string) {
  return auditCoreRequest<DmsOutletMap>(`${base(tenantId)}/dms-dumps/outlet-map`, { accessToken, cache: 'no-store' });
}

export function saveDmsOutletMap(tenantId: string, outletId: string,
  input: { dmsOutletId: string; labels: string[]; catchAll: boolean }, accessToken?: string) {
  return auditCoreRequest<{ outletId: string; dmsOutletId: string; labels: string[]; catchAll: boolean }>(
    `${base(tenantId)}/dms-dumps/outlet-map/${encodeURIComponent(outletId)}`,
    { method: 'PUT', body: JSON.stringify(input), accessToken });
}
