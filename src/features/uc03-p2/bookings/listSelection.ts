import type { P2JourneyView } from '../../../services/audit-core/uc03P2';

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
