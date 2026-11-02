import { auditCoreRequest } from './client';

/**
 * Missing documents of the journeys that have deliveries, day by day (product
 * owner 2026-11-02). A PC sees their mapped outlets; a TL, PM or Executive the
 * whole Project. Audit Core GET /p2/v1/tenants/{tenantId}/missing-documents.
 */

export type MissingDocumentCount = { name: string; requirementKey: string; count: number };

export type MissingDocumentsJourney = {
  journeyId: string;
  reference: string;
  customer: string;
  dealerId: string;
  dealerName: string | null;
  outletId: string;
  outletName: string | null;
  pcName: string | null;
  /** GATE_PASS: the delivery date on the vehicle gate pass; UPLOAD: the day the first delivery document was uploaded. */
  basis: 'GATE_PASS' | 'UPLOAD';
  uploadDay: string;
  documents: string[];
  requirementKeys: string[];
};

export type MissingDocumentsDay = { date: string; label: string; journeys: MissingDocumentsJourney[] };

export type MissingDocumentsArea = {
  dealerId: string; dealerName: string | null; outletId?: string; outletName?: string | null;
  journeys: number; documents: number;
};

export type MissingDocumentsReport = {
  from: string;
  to: string;
  scope: 'ALL' | 'DEALER' | 'OUTLET';
  totals: { journeys: number; documents: number };
  byDocument: MissingDocumentCount[];
  byDealer: MissingDocumentsArea[];
  byOutlet: MissingDocumentsArea[];
  days: MissingDocumentsDay[];
  outlets: Array<{ dealerId: string; dealerName: string; outletId: string; outletName: string }>;
  notes?: string[];
};

export type MissingDocumentsQuery = { from?: string; to?: string; outletId?: string; dealerId?: string };

export function getMissingDocuments(tenantId: string, query: MissingDocumentsQuery, accessToken?: string) {
  const params = new URLSearchParams();
  if (query.from) params.set('from', query.from);
  if (query.to) params.set('to', query.to);
  if (query.outletId) params.set('outletId', query.outletId);
  if (query.dealerId) params.set('dealerId', query.dealerId);
  const search = params.toString() ? `?${params.toString()}` : '';
  return auditCoreRequest<MissingDocumentsReport>(
    `/p2/v1/tenants/${encodeURIComponent(tenantId)}/missing-documents${search}`,
    { accessToken, cache: 'no-store' },
  );
}

/** The IST day ``days - 1`` days before today, so "Last 7 days" includes today. */
export function periodStart(days: number, now: Date = new Date()): string {
  const ist = new Date(now.getTime() + 330 * 60_000);
  ist.setUTCDate(ist.getUTCDate() - (days - 1));
  return ist.toISOString().slice(0, 10);
}

/**
 * The days narrowed to the journeys still missing ``requirementKey`` (each
 * journey then lists only that document); days left empty are dropped. No key:
 * the days as they are.
 */
export function filterDaysByDocument(days: MissingDocumentsDay[], requirementKey: string | null): MissingDocumentsDay[] {
  if (!requirementKey) return days;
  return days
    .map((day) => ({
      ...day,
      journeys: day.journeys.flatMap((journey) => {
        const at = journey.requirementKeys.indexOf(requirementKey);
        return at < 0 ? [] : [{ ...journey, documents: [journey.documents[at]], requirementKeys: [requirementKey] }];
      }),
    }))
    .filter((day) => day.journeys.length > 0);
}
