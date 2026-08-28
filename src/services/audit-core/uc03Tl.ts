import { auditCoreRequest } from './client';

export type TlBusinessStage = 'BOOKING_SUBMITTED' | 'DELIVERY_IN_PROGRESS' | 'DELIVERY_COMPLETED';

export interface TlSupervisoryCase {
  journeyId: string;
  bookingReference: string | null;
  customerDisplayName: string;
  customerMobileLast4: string | null;
  productLabel: string | null;
  dealerId: string;
  dealerName: string;
  outletId: string;
  outletName: string;
  bookingBusinessStatus: string | null;
  bookingBusinessDate: string | null;
  bookingSubmittedAtUtc: string | null;
  pcVerificationStatus: string | null;
  deliveryBusinessStatus: string | null;
  deliveryBusinessDate: string | null;
  responsiblePcActorId: string | null;
  openFlagCount: number;
  highestOpenSeverity: string | null;
  latestActivityAtUtc: string;
}

export interface TlSupervisoryCasePage {
  items: TlSupervisoryCase[];
  totalCount: number;
  limit: number;
  offset: number;
}

function accessTokenRequired(accessToken?: string): string {
  const token = accessToken?.trim();
  if (!token) throw new Error('A Security human access token is required.');
  return token;
}

export async function listTlSupervisoryCasePage(
  tenantId: string,
  offset: number,
  accessToken?: string,
): Promise<TlSupervisoryCasePage> {
  const search = new URLSearchParams({ limit: '200', offset: String(offset) });
  return auditCoreRequest<TlSupervisoryCasePage>(
    `/v1/tenants/${encodeURIComponent(tenantId)}/uc03/tl/cases?${search.toString()}`,
    {
      accessToken: accessTokenRequired(accessToken),
      cache: 'no-store',
    },
  );
}

/**
 * TL dashboards reconcile overall, Outlet and PC counts in Web, so they need the
 * complete submitted/progressed case set rather than only the visible table page.
 */
export async function listAllTlSupervisoryCases(
  tenantId: string,
  accessToken?: string,
): Promise<TlSupervisoryCase[]> {
  const items: TlSupervisoryCase[] = [];
  let offset = 0;
  let expectedTotal: number | null = null;

  while (expectedTotal === null || offset < expectedTotal) {
    const page = await listTlSupervisoryCasePage(tenantId, offset, accessToken);
    expectedTotal = page.totalCount;
    items.push(...page.items);
    if (page.items.length === 0) break;
    offset += page.items.length;
  }

  return items;
}

export function tlBusinessStage(item: TlSupervisoryCase): TlBusinessStage {
  const delivery = (item.deliveryBusinessStatus || '').trim().toUpperCase();
  if (
    delivery.includes('DELIVERED')
    || delivery.includes('COMPLETED')
    || delivery.includes('COMPLETE')
    || delivery.includes('CLOSED')
  ) {
    return 'DELIVERY_COMPLETED';
  }
  if (delivery && !delivery.includes('NOT_STARTED')) return 'DELIVERY_IN_PROGRESS';
  return 'BOOKING_SUBMITTED';
}

export function tlPcLabel(actorId: string | null): string {
  if (!actorId) return 'PC not recorded';
  const compact = actorId.replace(/[^a-zA-Z0-9]/g, '');
  if (compact.length <= 8) return `PC ${compact}`;
  return `PC ••••${compact.slice(-6)}`;
}
