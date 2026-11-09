import { useEffect, useId, useState, type KeyboardEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';

import { getP2JourneySuggestions, type P2JourneyFilters } from '../../../services/audit-core/uc03P2';
import { moveActive, SUGGEST_DEBOUNCE_MS, SUGGEST_LIMIT, suggestionReady, suggestionText } from './searchSuggest';

type Props = {
  tenantId: string | undefined;
  accessToken: string | undefined;
  /** The list's own filters (Dealership, outlet, PC, month, Booking / Delivery): suggestions follow them. */
  filters: P2JourneyFilters;
  /** The text in the box. */
  value: string;
  onValueChange: (value: string) => void;
  /** Enter or "Show all results": the list shows every match. */
  onApply: (value: string) => void;
  placeholder: string;
  /** Said when nothing matches under a month filter ("in Nov 2026"). */
  scopeNote?: string;
};

/**
 * The supervisor's search box with suggestions (product owner 2026-11-09):
 * Carbon's combobox pattern -- a search input with a listbox under it. Up and
 * Down move through the matches, Enter opens the highlighted journey in
 * Journey 360 (or, with none highlighted, applies the search to the list),
 * Escape closes the list.
 */
export default function JourneySearchCombobox({
  tenantId, accessToken, filters, value, onValueChange, onApply, placeholder, scopeNote,
}: Props) {
  const navigate = useNavigate();
  const id = useId();
  const listId = `${id}-list`;
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), SUGGEST_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [value]);

  const ready = suggestionReady(debounced);
  const suggestions = useQuery({
    queryKey: ['p2-journey-suggest', tenantId, debounced.trim(), filters],
    queryFn: () => getP2JourneySuggestions(tenantId!, accessToken, { ...filters, search: debounced }, SUGGEST_LIMIT),
    enabled: Boolean(tenantId && accessToken && open && ready),
    staleTime: 15_000,
    placeholderData: (previous) => previous,
  });
  const items = ready ? suggestions.data?.items ?? [] : [];
  // The options: each match, then "Show all results".
  const optionCount = items.length + 1;
  const showList = open && suggestionReady(value);
  // A new search or other filters: nothing highlighted (the filters object is new on every render).
  const filtersKey = JSON.stringify(filters);
  useEffect(() => { setActive(-1); }, [debounced, filtersKey]);

  const choose = (index: number) => {
    const item = items[index];
    setOpen(false);
    if (item) navigate(`/p2/journeys/${item.journeyId}/overview`);
    else onApply(value);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) { setOpen(true); return; }
      setActive((current) => moveActive(current, event.key as 'ArrowDown' | 'ArrowUp', optionCount));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (showList && active >= 0) choose(active);
      else { setOpen(false); onApply(value); }
    } else if (event.key === 'Escape') {
      if (open) { event.preventDefault(); setOpen(false); setActive(-1); }
    }
  };

  const optionId = (index: number) => `${listId}-${index}`;
  const waiting = suggestions.isFetching && !suggestions.data;

  return (
    <div className="p2w-search p2w-suggest">
      <label htmlFor={`${id}-input`} className="p2w-visually-hidden">Search</label>
      <input
        id={`${id}-input`}
        type="search"
        role="combobox"
        autoComplete="off"
        aria-autocomplete="list"
        aria-expanded={showList}
        aria-controls={listId}
        aria-activedescendant={showList && active >= 0 ? optionId(active) : undefined}
        value={value}
        placeholder={placeholder}
        onChange={(event) => {
          onValueChange(event.target.value);
          setOpen(true);
          // An emptied box shows the whole list again.
          if (!event.target.value.trim()) onApply('');
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
      />
      {showList ? (
        // Clicking in the list must not blur the box first (that would close it).
        <ul id={listId} role="listbox" aria-label="Matching bookings and deliveries" className="p2w-suggest__list"
          onMouseDown={(event) => event.preventDefault()}>
          {items.map((item, index) => {
            const text = suggestionText(item);
            return (
              <li key={item.journeyId} id={optionId(index)} role="option" aria-selected={active === index}
                className={`p2w-suggest__option${active === index ? ' is-active' : ''}`}
                onMouseEnter={() => setActive(index)} onClick={() => choose(index)}>
                <span className="p2w-suggest__head">
                  <strong className={text.known ? '' : 'is-unknown'}>{text.name}</strong>
                  <span className={`p2w-suggest__kind p2w-suggest__kind--${item.kind === 'DELIVERY' ? 'delivery' : 'booking'}`}>{text.kind}</span>
                </span>
                <span className="p2w-suggest__meta">{text.meta.join(' · ')}</span>
              </li>
            );
          })}
          {!items.length ? (
            <li className="p2w-suggest__status" aria-live="polite">
              {waiting || !ready ? 'Searching…'
                : suggestions.isError ? 'Matches could not be loaded. Press Enter to search the list.'
                  : `No matching bookings or deliveries${scopeNote ? ` ${scopeNote}` : ''}.`}
            </li>
          ) : null}
          <li id={optionId(items.length)} role="option" aria-selected={active === items.length}
            className={`p2w-suggest__option p2w-suggest__all${active === items.length ? ' is-active' : ''}`}
            onMouseEnter={() => setActive(items.length)} onClick={() => choose(items.length)}>
            Show all results for “{value.trim()}”
          </li>
        </ul>
      ) : null}
    </div>
  );
}
