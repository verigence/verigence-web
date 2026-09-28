import { useDeferredValue, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import '../styles/uc03-p2.css';
import '../styles/uc03-p2-workspace.css';
import '../styles/uc03-p2-cards.css';

import PageHeader from '../components/PageHeader';
import JourneyCard from '../features/uc03-p2/bookings/JourneyCard';
import { getP2BookingsSummary, getP2Journeys } from '../services/audit-core/uc03P2';
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

/**
 * Booking & Delivery: every open journey as one card (customer, vehicle,
 * where it stands, what waits on the PC), the week and month at a glance,
 * search, and New booking. Each card opens Documents (the working screen)
 * or Journey 360 (the full picture); there is no separate Journey 360 list.
 */
export default function P2JourneyListPage() {
  const tenantId = useProjectContextStore((s) => s.selectedProject?.tenantId);
  const accessToken = useSessionStore((s) => s.accessToken);
  const [search, setSearch] = useState('');
  const [showClosed, setShowClosed] = useState(false);
  const deferredSearch = useDeferredValue(search);
  const searching = Boolean(deferredSearch.trim());
  const open = useJourneys(tenantId, accessToken, deferredSearch, 'open');
  const closed = useJourneys(tenantId, accessToken, deferredSearch, 'closed', showClosed || searching);
  // The list is what the screen is for; the summary strip follows once the
  // list has answered (either way) so the two tenant-wide reads never
  // compete for the same Audit Core worker threads and database connections
  // on a page open.
  const summary = useQuery({
    queryKey: ['p2-bookings-summary', tenantId],
    queryFn: () => getP2BookingsSummary(tenantId!, accessToken),
    enabled: Boolean(tenantId && accessToken && open.isFetched),
    staleTime: 60_000,
  });
  const s = summary.data;
  const openItems = open.data?.items ?? [];
  const closedItems = closed.data?.items ?? [];

  return (
    <div className="screen-stack p2-screen p2w">
      <PageHeader
        eyebrow="Booking & Delivery"
        title="Booking & Delivery"
        description="Every open booking and delivery. Open one to add documents, or see its Journey 360."
        actions={<Link className="p2w-button p2w-button--primary p2w-button--lg" to="/p2/journeys/new/documents">New booking</Link>}
      />

      {s ? (
        <dl className="p2w-stats" aria-label="Summary">
          <div><dt>Open bookings</dt><dd>{s.open.bookings}</dd></div>
          <div><dt>Open deliveries</dt><dd>{s.open.deliveries}</dd></div>
          <div><dt>New this week</dt><dd>{s.week.bookingsStarted}</dd></div>
          <div><dt>Completed this week</dt><dd>{s.week.bookingsCompleted + s.week.deliveriesCompleted}</dd></div>
          <div><dt>New this month</dt><dd>{s.month.bookingsStarted}</dd></div>
          <div><dt>Avg. booking time</dt><dd>{hours(s.month.avgBookingHours)}</dd></div>
        </dl>
      ) : null}

      <div className="p2w-listbar">
        <label className="p2w-search">
          <span className="p2w-visually-hidden">Search</span>
          <input type="search" value={search} onChange={(event) => setSearch(event.target.value)}
            placeholder="Search customer, vehicle, outlet or Journey ID" />
        </label>
        {open.isFetching ? <span className="p2w-muted">Loading…</span> : null}
      </div>

      {open.isError ? (
        <div className="p2w-alert p2w-alert--error" role="alert">
          <span>
            Bookings and deliveries could not be loaded.
            {open.error instanceof Error && open.error.message ? <small>{open.error.message}</small> : null}
          </span>
          <button type="button" className="p2w-link" onClick={() => void open.refetch()} disabled={open.isFetching}>
            {open.isFetching ? 'Trying…' : 'Try again'}
          </button>
        </div>
      ) : null}

      <section aria-label="Open">
        <h2 className="p2w-section-title">Open {open.isError ? null : <span className="p2w-muted">{openItems.length}</span>}</h2>
        <ul className="p2w-jgrid">
          {openItems.map((item) => <JourneyCard key={item.journey_id} item={item} />)}
          {open.isLoading ? <li className="p2w-skeleton">Loading…</li> : null}
          {!open.isLoading && !openItems.length && !open.isError ? (
            <li className="p2w-empty">
              {searching ? 'No open journeys match this search.' : 'No open bookings. Start one with New booking.'}
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
            {closedItems.map((item) => <JourneyCard key={item.journey_id} item={item} />)}
            {closed.isLoading ? <li className="p2w-skeleton">Loading…</li> : null}
            {!closed.isLoading && !closedItems.length ? <li className="p2w-empty">No closed journeys{searching ? ' match this search' : ''}.</li> : null}
          </ul>
        ) : null}
      </section>
    </div>
  );
}
