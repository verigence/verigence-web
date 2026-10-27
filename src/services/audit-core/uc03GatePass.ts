import { AuditCoreHttpError, auditCoreRequest } from './client';

/** Daily Gate Pass: the PC's photo, the day's counts and the monthly calendar (Audit Core /p2/v1 gate-passes). */

export type GatePassOutlet = {
  dealerId: string; dealerName: string; outletId: string; outletName: string;
  classification: string; isDefault: boolean;
};
/** A day a gate pass can be uploaded for; Monday's covers Sunday too (Sunday is off, 2026-10-27). */
export type GatePassDayInfo = { date: string; label: string; coversDates: string[]; dueAtUtc: string };
export type GatePassOutlets = {
  businessDate: string; outlets: GatePassOutlet[]; defaultOutletId: string | null;
  /** Today's gate pass day; none on a Sunday. */
  today?: GatePassDayInfo | null;
  /** The previous gate pass day, while it can still be uploaded. */
  previous?: GatePassDayInfo | null;
  /** Outlets whose previous day's gate pass is not finished yet. */
  previousOpenOutletIds?: string[];
  /** Mapped only to satellite outlets: the daily gate pass is for onsite outlets only. */
  satelliteOnly?: boolean;
};

export type GatePass = {
  gatePassId: string; outletId: string; outletName: string; pcName: string; businessDate: string; status: string;
  dayLabel?: string; coversDates?: string[];
  /** The photo is always kept; its quality is judged on the server (2026-10-27). */
  photoQuality?: 'GOOD' | 'BLURRED' | 'TOO_DARK' | 'WASHED_OUT'; photoQualityNote?: string | null;
  photoMode?: 'COMBINED' | 'SEPARATE';
  pages?: Array<{ pageNo: number; date: string; photoQuality: string }>;
  newDeliveries: number | null; stockTransfers: number | null; testDrives: number | null;
  otherCount: number | null; otherNote: string | null; deliveryFiles: number | null;
  divergence: 'NONE' | 'EXTRA_FILES' | 'MISSING_FILES' | null; pastDeliveryNote: string | null;
  filesHeld: boolean | null; countsSubmitted: boolean; completed: boolean;
};

export type GatePassCountsInput = {
  newDeliveries?: number; stockTransfers?: number; testDrives?: number; otherCount?: number; otherNote?: string;
  /** Sunday and Monday photographed apart: the counts of each day. */
  days?: Array<{ date: string; newDeliveries: number; stockTransfers: number; testDrives: number;
                 otherCount: number; otherNote?: string }>;
};
export type GatePassCountsResult = {
  gatePass: GatePass; divergence: 'NONE' | 'EXTRA_FILES' | 'MISSING_FILES'; declared: number; deliveryFiles: number;
  difference: number; nextStep: 'DONE' | 'EXPLAIN_EXTRA_FILES' | 'CONFIRM_FILES_HELD';
};

export type GatePassDay = {
  date: string; declared: number; uploaded: number; missing: number; gatePasses: number; open: number;
  gatePassId?: string; divergence?: string | null;
};
export type GatePassCalendar = {
  month: string; scope: 'ALL' | 'DEALER' | 'OUTLET'; outlets: GatePassOutlet[]; days: GatePassDay[];
  totals: { declared: number; uploaded: number; missing: number };
};

export type DailyTask = {
  dailyTaskId: string; category: string; taskType: string; title: string; description: string; priority: string;
  status: 'OPEN' | 'DONE'; outletId: string; outletName: string; businessDate: string; gatePassId: string | null;
  createdAtUtc: string; resolvedAtUtc: string | null; resolutionNote: string | null;
};

const base = (tenantId: string) => `/p2/v1/tenants/${encodeURIComponent(tenantId)}`;

/** The plain sentence Audit Core gave (a refused photo says what to fix), not the support wrapper. */
export function gatePassErrorText(cause: unknown, fallback: string): string {
  if (cause instanceof AuditCoreHttpError) return cause.problem?.detail || cause.problem?.title || fallback;
  return cause instanceof Error && cause.message ? cause.message : fallback;
}

export function getGatePassOutlets(tenantId: string, accessToken?: string) {
  return auditCoreRequest<GatePassOutlets>(`${base(tenantId)}/gate-passes/outlets`, { accessToken });
}

/** One photo of the gate-out register; ``date`` only when Sunday and Monday were photographed apart. */
export type GatePassPhoto = { blob: Blob; filename: string; date?: string };

export const MAX_GATE_PASS_PHOTOS = 4;

export function uploadGatePass(
  tenantId: string,
  input: { outletId: string; pcName?: string; businessDate?: string; file?: Blob; filename?: string;
           photos?: GatePassPhoto[]; separateDays?: boolean },
  accessToken?: string,
) {
  const form = new FormData();
  form.set('outletId', input.outletId);
  if (input.pcName) form.set('pcName', input.pcName);
  if (input.businessDate) form.set('businessDate', input.businessDate);
  // Up to four photos: the register can run over pages (product owner 2026-10-27).
  const photos = input.photos ?? (input.file ? [{ blob: input.file, filename: input.filename ?? 'gate-pass.jpg' }] : []);
  for (const photo of photos) {
    form.append('files', photo.blob, photo.filename);
    if (input.separateDays && photo.date) form.append('fileDates', photo.date);
  }
  return auditCoreRequest<GatePass>(`${base(tenantId)}/gate-passes`, {
    method: 'POST', accessToken, body: form, timeoutMs: 120_000,
  });
}

export function submitGatePassCounts(tenantId: string, gatePassId: string, input: GatePassCountsInput, accessToken?: string) {
  return auditCoreRequest<GatePassCountsResult>(`${base(tenantId)}/gate-passes/${encodeURIComponent(gatePassId)}/counts`, {
    method: 'POST', accessToken, body: JSON.stringify(input),
  });
}

export function answerGatePass(
  tenantId: string, gatePassId: string, answer: { pastDeliveries?: string; filesHeld?: boolean }, accessToken?: string,
) {
  return auditCoreRequest<{ gatePass: GatePass; taskRaised: boolean }>(
    `${base(tenantId)}/gate-passes/${encodeURIComponent(gatePassId)}/answer`,
    { method: 'POST', accessToken, body: JSON.stringify(answer) },
  );
}

export function getGatePassCalendar(
  tenantId: string, filter: { month: string; outletId?: string; dealerId?: string }, accessToken?: string,
) {
  const params = new URLSearchParams({ month: filter.month });
  if (filter.outletId) params.set('outletId', filter.outletId);
  else if (filter.dealerId) params.set('dealerId', filter.dealerId);
  return auditCoreRequest<GatePassCalendar>(`${base(tenantId)}/gate-passes/calendar?${params.toString()}`, { accessToken });
}

export function getGatePassImageUrl(tenantId: string, gatePassId: string, accessToken?: string, page = 1) {
  return auditCoreRequest<{ url: string; contentType: string; filename: string; page?: number; pages?: number }>(
    `${base(tenantId)}/gate-passes/${encodeURIComponent(gatePassId)}/image-url?page=${page}`, { accessToken },
  );
}

export function getDailyTasks(tenantId: string, status: 'OPEN' | 'DONE' | 'ALL', accessToken?: string) {
  return auditCoreRequest<{ items: DailyTask[] }>(`${base(tenantId)}/daily-tasks?status=${status}`, { accessToken });
}

export function resolveDailyTask(tenantId: string, dailyTaskId: string, note: string, accessToken?: string) {
  return auditCoreRequest<DailyTask>(`${base(tenantId)}/daily-tasks/${encodeURIComponent(dailyTaskId)}/resolve`, {
    method: 'POST', accessToken, body: JSON.stringify({ note }),
  });
}

/** Consolidated view across the caller's onsite outlets (TL: theirs; PM and Executive: all), 2026-10-27. */
export type GatePassSummaryFigures = {
  asPerRegister: number; updatedInTool: number; notNotifiedToPc: number; pendingDueToPc: number;
  gatePassDays: number; gatePassesFinished: number; gatePassesMissing: number;
};
export type GatePassSummaryDay = {
  date: string; label: string; status: 'NOT_UPLOADED' | 'COUNTS_PENDING' | 'ANSWER_PENDING' | 'DONE';
  asPerRegister: number | null; updatedInTool: number; notNotifiedToPc: number; pendingDueToPc: number;
  gatePassId: string | null; pcName: string | null;
  photoQuality?: 'GOOD' | 'BLURRED' | 'TOO_DARK' | 'WASHED_OUT' | null;
  pages?: number; photoMode?: 'COMBINED' | 'SEPARATE';
};
export type GatePassSummaryOutlet = GatePassSummaryFigures & {
  outletId: string; outletName: string; dealerId: string; dealerName: string; teamLeads: string[];
  uploadedBy?: string[];
  days: GatePassSummaryDay[];
};
export type GatePassSummary = {
  from: string; to: string; outlets: GatePassSummaryOutlet[]; totals: GatePassSummaryFigures; notes: string[];
};

/** "Pending due to client" is named "Not notified to PC" (2026-10-27); an Audit Core
 * built before the rename still sends pendingDueToClient, so read either. */
function withNotNotified<T extends { notNotifiedToPc?: number; pendingDueToClient?: number }>(f: T): T & { notNotifiedToPc: number } {
  return { ...f, notNotifiedToPc: f.notNotifiedToPc ?? f.pendingDueToClient ?? 0 };
}

export async function getGatePassSummary(tenantId: string, from: string, to: string, accessToken?: string): Promise<GatePassSummary> {
  const params = new URLSearchParams({ from, to });
  const raw = await auditCoreRequest<GatePassSummary>(`${base(tenantId)}/gate-passes/summary?${params.toString()}`, { accessToken });
  return {
    ...raw,
    totals: withNotNotified(raw.totals),
    outlets: raw.outlets.map((o) => ({ ...withNotNotified(o), days: o.days.map(withNotNotified) })),
  };
}
