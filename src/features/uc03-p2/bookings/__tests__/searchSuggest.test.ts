/**
 * Search as you type and Bookings only / Deliveries only on the supervisor's
 * journey list (product owner 2026-11-09).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { journeyFilterParams, type P2JourneySuggestion } from '../../../../services/audit-core/uc03P2';
import { kindHint } from '../listSelection';
import { moveActive, SUGGEST_DEBOUNCE_MS, SUGGEST_LIMIT, suggestionReady, suggestionText } from '../searchSuggest';

const suggestion: P2JourneySuggestion = {
  journeyId: 'j1', journeyReference: 'VJ2611-0001', customerName: 'Sunita Rao', mobileMasked: '******3210',
  dealerName: 'Utkal Motors', outletName: 'Cuttack', pcName: 'Ravi', vehicle: 'XUV700',
  kind: 'DELIVERY', date: '2026-09-25',
};

describe('when suggestions are asked for', () => {
  it('waits for two characters, or three digits of a number', () => {
    expect(['s', 'su', '98', '987', '+91', '+919', ' a ', 'a1'].map(suggestionReady))
      .toEqual([false, true, false, true, false, true, false, true]);
  });

  it('asks after a 250 ms pause, for at most 8', () => {
    expect(SUGGEST_DEBOUNCE_MS).toBe(250);
    expect(SUGGEST_LIMIT).toBe(8);
  });
});

describe('keyboard', () => {
  it('moves down and up through the matches and "Show all results", wrapping', () => {
    expect(moveActive(-1, 'ArrowDown', 3)).toBe(0);
    expect(moveActive(2, 'ArrowDown', 3)).toBe(0);
    expect(moveActive(-1, 'ArrowUp', 3)).toBe(2);
    expect(moveActive(0, 'ArrowUp', 3)).toBe(2);
    expect(moveActive(1, 'ArrowUp', 3)).toBe(0);
    expect(moveActive(0, 'ArrowDown', 0)).toBe(-1);
  });

  it('Enter opens the highlighted journey in Journey 360, else applies the search; Escape closes', () => {
    const source = readFileSync(join(__dirname, '..', 'JourneySearchCombobox.tsx'), 'utf8');
    expect(source).toContain('navigate(`/p2/journeys/${item.journeyId}/overview`)');
    expect(source).toContain("else { setOpen(false); onApply(value); }");
    expect(source).toContain("event.key === 'Escape'");
    expect(source).toContain('role="combobox"');
    expect(source).toContain('role="listbox"');
    expect(source).toContain('Show all results for');
  });
});

describe('what a suggestion shows', () => {
  it('customer, delivery or booking with its date, masked mobile, dealership / outlet and PC', () => {
    expect(suggestionText(suggestion)).toEqual({
      name: 'Sunita Rao', known: true, kind: 'Delivery · 25 Sep 2026',
      meta: ['******3210', 'Utkal Motors / Cuttack', 'PC Ravi'],
    });
    expect(suggestionText({ ...suggestion, kind: 'BOOKING', date: '2026-09-10' }).kind).toBe('Booking · 10 Sep 2026');
  });

  it('says what is not known instead of leaving gaps', () => {
    const text = suggestionText({
      ...suggestion, customerName: '7c9e6679-7425-40de-944b-e07fc1f90ae7', mobileMasked: null,
      dealerName: null, outletName: null, pcName: null, date: null,
    });
    expect(text).toEqual({
      name: 'Customer not named yet', known: false, kind: 'Delivery',
      meta: ['Mobile not known', 'Outlet not recorded', 'PC not recorded'],
    });
  });
});

describe('Bookings only / Deliveries only', () => {
  it('is sent to the list, counts and suggestions as kind', () => {
    expect(journeyFilterParams({ kind: 'delivery' }).get('kind')).toBe('delivery');
    expect(journeyFilterParams({ kind: 'booking' }).get('kind')).toBe('booking');
    expect(journeyFilterParams({ kind: '' }).has('kind')).toBe(false);
  });

  it('says which dates it reads', () => {
    expect(kindHint('booking', '2026-11')).toBe('Bookings only: booking date in November 2026.');
    expect(kindHint('delivery', '2026-11')).toBe('Deliveries only: delivery date (started or delivered) in November 2026.');
    expect(kindHint('delivery', '')).toBe('Deliveries only: delivery started or delivered.');
  });

  it('is one filter beside the tabs, offered to supervisors', () => {
    const source = readFileSync(join(__dirname, '..', 'JourneyListTabs.tsx'), 'utf8');
    expect(source).toContain('<option value="booking">Bookings only</option>');
    expect(source).toContain('<option value="delivery">Deliveries only</option>');
  });
});
