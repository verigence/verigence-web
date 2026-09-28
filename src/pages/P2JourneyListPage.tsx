import { useDeferredValue, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import '../styles/uc03-p2.css';
import '../styles/uc03-p2-workspace.css';
import '../styles/uc03-p2-cards.css';

import PageHeader from '../components/PageHeader';
import JourneyCard from '../features/uc03-p2/bookings/JourneyCard';
import { getP2BookingsSummary, getP2Journeys, type P2JourneyListItem } from '../services/audit-core/uc03P2';
import { useProjectContextStore } from '../store/projectContextStore';
import { useSessionStore } from '../store/sessionStore';

function hours(value?: number | null): string {
  if (value === null || value === undefined) return '—';
  return value >= 48 ? `${(value / 24).toFixed(1)} days` : `${value.toFixed(1)} h`;
}

function useJourneys(tenantId: string | undefined, accessToken: string | undefined, search: string, state: 'open' | 'closed', enabled = true) {
  return useQuery({
    queryKey: ['p2-journeys', tenantId, search, state],
    queryFn: () => getP2Journeys(tenantId!, accessToken, search, state, state === 'open' ? 150 : 50),
    enabled: Boolean(enabled && tenantId && accessToken),
    staleTime: 15_000,
  });
}

type Filter = 'all' | 'mine' | 'overdue';

/**
 * Two screens on the same data, each with its own job:
 * - Booking & Delivery: the operational list -- what is open now, the week
 *   and month at a glance, one card per journey with its progress and open
 *   work, and New booking.
 * - Journey 360: find a customer journey; the search leads and the cards
 *   are its results.
 */
export default function P2JourneyListPage({ mode }: { mode: 'bookings' | 'journey360' }) {
  const tenantId = useProjectContextStore((s) => s.selectedProject?.tenantId);
  const role = useProjectContextStore((s) => s.selectedProject?.operatingRole);
  const accessToken = useSessionStore((s) => s.accessToken);
  const supervisor = role === 'TL' || role === 'PM';
  const bookings = mode === 'bookings';
  const [search, setSearch] = useState('');
  const [showClosed, setShowClosed] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const deferredSearch = useDeferredValue(search);
  const searching = Boolean(deferredSearch.trim());
  const open = useJourneys(tenantId, accessToken, deferredSearch, 'open');
  const closed = useJourneys(tenantId, accessToken, deferredSearch, 'closed', showClosed || searching);
  // The list is what the screen is for; the summary tiles follow once the
  // list has answered (either way) so the two tenant-wide reads never
  // compete for the same Audit Core worker threads and database connections
  // on a page open. Journey 360 is a search screen and has no tiles.
  const summary = useQuery({
    queryKey: ['p2-bookings-summary', tenantId],
    queryFn: () => getP2BookingsSummary(tenantId!, accessToken),
    enabled: Boolean(bookings && tenantId && accessToken && open.isFetched),
    staleTime: 60_000,
  });
  const s = summary.data;
  const openItems = open.data?.items ?? [];
  const closedItems = closed.data?.items ?? [];

  const mine = (item: P2JourneyListItem) => (supervisor ? (item.tl_open_tasks ?? 0) > 0 : (item.pc_open_tasks ?? 0) > 0);
  const counts = useMemo(() => ({
    all: openItems.length,
    mine: openItems.filter(mine).length,
    overdue: openItems.filter((item) => (item.overdue_tasks ?? 0) > 0).length,
  }), [openItems, supervisor]); // eslint-disable-line react-hooks/exhaustive-deps
  const visible = filter === 'mine' ? openItems.filter(mine)
    : filter === 'overdue' ? openItems.filter((item) => (item.overdue_tasks ?? 0) > 0)
      : openItems;

  const searchBox = (
    <label className="p2w-search">
      <span className="p2w-visually-hidden">Search</span>
      <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} autoFocus={!bookings}
        placeholder="Search customer, vehicle, outlet or Journey ID" />
    </label>
  );

  const errorAlert = open.isError ? (
    <div className="p2w-alert p2w-alert--error" role="alert">
      <span>
        {bookings ? 'Bookings and deliveries could not be loaded.' : 'Journeys could not be loaded.'}
        {open.error instanceof Error && open.error.message ? <small>{open.error.message}</small> : null}
      </span>
      <button type="button" className="p2w-link" onClick={() => void open.refetch()} disabled={open.isFetching}>
        {open.isFetching ? 'Trying…' : 'Try again'}
      </button>
    </div>
  ) : null;

  return (
    <div className="screen-stack p2-screen p2w">
      <PageHeader
        eyebrow={bookings ? 'Booking & Delivery' : 'Journey 360'}
        title={bookings ? 'Booking & Delivery' : 'Journey 360'}
        description={bookings
          ? 'Every open booking and delivery at a glance. Open one to add documents or see its Journey 360.'
          : 'Find a customer journey to see its complete picture.'}
        actions={bookings ? (
          <Link className="p2w-button p2w-button--primary p2w-button--lg" to="/p2/journeys/new/documents">New booking</Link>
        ) : undefined}
      />

      {bookings && s ? (
        <section className="p2w-summary" aria-label="Summary">
          <div className="p2w-summary__group">
            <h2>Open now</h2>
            <dl>
              <div><dt>Bookings</dt><dd>{s.open.bookings}</dd></div>
              <div><dt>Deliveries</dt><dd>{s.open.deliveries}</dd></div>
            </dl>
          </div>
          <div className="p2w-summary__group">
            <h2>This week</h2>
            <dl>
              <div><dt>New bookings</dt><dd>{s.week.bookingsStarted}</dd></div>
              <div><dt>Bookings completed</dt><dd>{s.week.bookingsCompleted}</dd></div>
              <div><dt>Deliveries completed</dt><dd>{s.week.deliveriesCompleted}</dd></div>
            </dl>
          </div>
          <div className="p2w-summary__group">
            <h2>This month</h2>
            <dl>
              <div><dt>New bookings</dt><dd>{s.month.bookingsStarted}</dd></div>
              <div><dt>Bookings completed</dt><dd>{s.month.bookingsCompleted}</dd></div>
              <div><dt>Deliveries completed</dt><dd>{s.month.deliveriesCompleted}</dd></div>
              <div><dt>Avg. booking time</dt><dd>{hours(s.month.avgBookingHours)}</dd></div>
              <div><dt>Avg. delivery time</dt><dd>{hours(s.month.avgDeliveryHours)}</dd></div>
            </dl>
          </div>
        </section>
      ) : null}

      {bookings ? (
        <div className="p2w-listbar">
          {searchBox}
          <span className="p2w-muted">{open.isFetching ? 'Loading…' : open.isError ? '' : `${openItems.length} open`}</span>
        </div>
      ) : (
        <section className="p2w-hero-search" aria-label="Find a journey">
          {searchBox}
          <p>{searching
            ? (open.isFetching || closed.isFetching ? 'Searching…' : `${openItems.length + closedItems.length} journeys match`)
            : 'Type a customer name, vehicle, outlet or Journey ID. Open and recently closed journeys are shown below.'}</p>
        </section>
      )}

      {errorAlert}

      <section aria-label="Open">
        <div className="p2w-filters-row" role="group" aria-label="Show">
          {([['all', 'All open'], ['mine', supervisor ? 'Needs TL action' : 'Needs my action'], ['overdue', 'Overdue']] as Array<[Filter, string]>).map(([key, label]) => (
            <button key={key} type="button" className={`p2w-chipbtn${filter === key ? ' is-active' : ''}`}
              aria-pressed={filter === key} onClick={() => setFilter(key)}>
              {label}<b>{counts[key]}</b>
            </button>
          ))}
        </div>
        <ul className="p2w-jgrid">
          {visible.map((item) => <JourneyCard key={item.journey_id} item={item} supervisor={supervisor} mode={mode} />)}
          {open.isLoading ? <li className="p2w-skeleton">Loading…</li> : null}
          {!open.isLoading && !visible.length && !open.isError ? (
            <li className="p2w-empty">
              {searching ? 'No open journeys match this search.'
                : filter !== 'all' ? 'Nothing here right now.'
                  : bookings ? 'No open bookings. Start one with New booking.' : 'No open journeys.'}
            </li>
          ) : null}
        </ul>
      </section>

      <section aria-label="Closed">
        <h2 className="p2w-section-title">
          <button type="button" className="p2w-link" aria-expanded={showClosed || searching}
            onClick={() => setShowClosed((v) => !v)}>
            {showClosed || searching ? '▾' : '▸'} Closed — delivered or cancelled
          </button>
          {closed.data ? <span className="p2w-muted">{closedItems.length}{closedItems.length === 50 ? '+' : ''}</span> : null}
        </h2>
        {showClosed || searching ? (
          <ul className="p2w-jgrid">
            {closedItems.map((item) => <JourneyCard key={item.journey_id} item={item} supervisor={supervisor} mode={mode} />)}
            {closed.isLoading ? <li className="p2w-skeleton">Loading…</li> : null}
            {!closed.isLoading && !closedItems.length ? <li className="p2w-empty">No closed journeys{searching ? ' match this search' : ''}.</li> : null}
          </ul>
        ) : null}
      </section>
    </div>
  );
}
