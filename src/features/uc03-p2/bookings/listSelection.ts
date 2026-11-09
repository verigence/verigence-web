import type { P2JourneyKind, P2JourneyView } from '../../../services/audit-core/uc03P2';
import { monthLabel } from '../../../services/audit-core/uc03ProjectTracker';

/**
 * What a click on a row of the TL's Outlet-wise or PC-wise panel does: pick
 * that Outlet or PC and show its complete list (the All tab), not just the
 * part of it that sits in the tab that happened to be open (product owner
 * 2026-10-23). Clicking the picked row again clears the pick and leaves the
 * tab as it is.
 */
export function panelSelection(
  pickedKey: string,
  clickedKey: string,
  view: P2JourneyView,
): { key: string; view: P2JourneyView } {
  if (!clickedKey || clickedKey === pickedKey) return { key: '', view };
  return { key: clickedKey, view: 'all' };
}

type OutletOfDealer = { outlet_id: string; dealer_id?: string | null };

/**
 * The Outlets offered once a Dealership is picked (product owner 2026-11-09):
 * only that Dealership's own. Every Outlet with no Dealership picked, and every
 * Outlet when the Outlets do not say their Dealership (an older Audit Core).
 */
export function outletsOfDealer<T extends OutletOfDealer>(outlets: T[], dealerId: string): T[] {
  if (!dealerId || !outlets.some((o) => o.dealer_id)) return outlets;
  return outlets.filter((o) => o.dealer_id === dealerId);
}

/** The picked Outlet once the Dealership changes: kept while it belongs to it, cleared otherwise. */
export function outletAfterDealerChange(outletId: string, dealerId: string, outlets: OutletOfDealer[]): string {
  if (!outletId || !dealerId) return outletId;
  return outletsOfDealer(outlets, dealerId).some((o) => o.outlet_id === outletId) ? outletId : '';
}

/** The Dealership once an Outlet is picked: the Outlet's own when another one was picked. */
export function dealerAfterOutletPick(dealerId: string, outletId: string, outlets: OutletOfDealer[]): string {
  if (!dealerId || !outletId) return dealerId;
  const owner = outlets.find((o) => o.outlet_id === outletId)?.dealer_id;
  return owner && owner !== dealerId ? owner : dealerId;
}

/**
 * What Bookings only / Deliveries only keep (2026-11-09), by the month figures' own dates:
 * a booking by its booking date, a delivery by its delivery date (started or delivered).
 */
export function kindHint(kind: P2JourneyKind, month: string): string {
  if (kind === 'booking') {
    return month ? `Bookings only: booking date in ${monthLabel(month)}.` : 'Bookings only: every booking.';
  }
  return month
    ? `Deliveries only: delivery date (started or delivered) in ${monthLabel(month)}.`
    : 'Deliveries only: delivery started or delivered.';
}
