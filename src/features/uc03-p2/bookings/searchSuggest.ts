import type { P2JourneySuggestion } from '../../../services/audit-core/uc03P2';
import { customerLabel, fullDate } from './JourneyRow';

/**
 * Search as you type on the supervisor's journey list (product owner
 * 2026-11-09): after a few characters the matching bookings and deliveries
 * show under the search box; Enter or "Show all results" applies the search to
 * the list. Audit Core journeys:suggest matches exactly as the list does.
 */

/** How long typing must pause before suggestions are asked for. */
export const SUGGEST_DEBOUNCE_MS = 250;
export const SUGGEST_LIMIT = 8;

const MOBILE_CHARACTERS = /^[0-9+\-\s().]+$/;

/** Two characters, or three digits when the text is only a number (Audit Core suggestion_ready). */
export function suggestionReady(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed && MOBILE_CHARACTERS.test(trimmed)) return trimmed.replace(/\D/g, '').length >= 3;
  return trimmed.length >= 2;
}

/**
 * The highlighted option after a key press. The options are the suggestions
 * and, last, "Show all results"; -1 is none (typing in the box). Down from the
 * last wraps to the first and Up from the first wraps to the last, as Carbon's
 * combobox does.
 */
export function moveActive(active: number, key: 'ArrowDown' | 'ArrowUp', optionCount: number): number {
  if (optionCount <= 0) return -1;
  if (key === 'ArrowDown') return active + 1 >= optionCount ? 0 : active + 1;
  return active <= 0 ? optionCount - 1 : active - 1;
}

/** What one suggestion shows: the customer, Booking / Delivery with its date, and who / where. */
export function suggestionText(item: P2JourneySuggestion): { name: string; known: boolean; kind: string; meta: string[] } {
  const customer = customerLabel(item.customerName);
  const date = fullDate(item.date);
  const kind = item.kind === 'DELIVERY'
    ? (date ? `Delivery · ${date}` : 'Delivery')
    : (date ? `Booking · ${date}` : 'Booking');
  const place = [item.dealerName, item.outletName].filter(Boolean).join(' / ');
  return {
    name: customer.text,
    known: customer.known,
    kind,
    meta: [item.mobileMasked ?? 'Mobile not known', place || 'Outlet not recorded', item.pcName ? `PC ${item.pcName}` : 'PC not recorded'],
  };
}
