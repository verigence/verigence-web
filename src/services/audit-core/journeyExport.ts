import { auditCoreRequest } from './client';

/** Journey export to Excel for TL and above (Audit Core uc03_p2_journey_export, 2026-11-06). */
export type JourneyExportScope = {
  role: 'TL' | 'PM' | 'EXECUTIVE';
  maxRangeDays: number;
  outlets: Array<{ dealerId: string; dealerName: string; outletId: string; outletName: string }>;
};

export type JourneyExportDateBasis = 'BOOKING' | 'DELIVERY' | 'UPLOADED';

export type JourneyExportRequest = {
  dateBasis: JourneyExportDateBasis;
  dateFrom?: string;
  dateTo?: string;
  dealerId?: string;
  outletId?: string;
};

export type JourneyExport = {
  exportId: string;
  status: 'PENDING' | 'RUNNING' | 'READY' | 'FAILED';
  filters: JourneyExportRequest;
  fileName: string;
  total: number | null;
  done: number;
  rows: number | null;
  sizeBytes: number | null;
  error: string | null;
  requestedAtUtc: string | null;
  finishedAtUtc: string | null;
};

const base = (tenantId: string) => `/p2/v1/tenants/${encodeURIComponent(tenantId)}/reports/journey-exports`;

export function getJourneyExportScope(tenantId: string, accessToken?: string) {
  return auditCoreRequest<JourneyExportScope>(`${base(tenantId)}/scope`, { accessToken });
}

export function getJourneyExports(tenantId: string, accessToken?: string) {
  return auditCoreRequest<{ exports: JourneyExport[] }>(base(tenantId), { accessToken });
}

export function requestJourneyExport(tenantId: string, request: JourneyExportRequest, accessToken?: string) {
  return auditCoreRequest<JourneyExport>(base(tenantId), { method: 'POST', accessToken, body: JSON.stringify(request) });
}

export function getJourneyExportFileLink(tenantId: string, exportId: string, accessToken?: string) {
  return auditCoreRequest<{ url: string; fileName: string; expiresInSeconds: number }>(
    `${base(tenantId)}/${encodeURIComponent(exportId)}/file`, { accessToken },
  );
}

/** The range check Audit Core applies, said before the request is sent. */
export function rangeProblem(from: string, to: string, maxDays: number): string | undefined {
  if (!from && !to) return undefined;
  if (!from || !to) return 'Choose both dates, or clear both for every date.';
  const days = (Date.parse(to) - Date.parse(from)) / 86_400_000;
  if (Number.isNaN(days)) return 'Choose valid dates.';
  if (days < 0) return 'The end date is before the start date.';
  if (days > maxDays) return `Choose at most ${maxDays} days at a time.`;
  return undefined;
}
