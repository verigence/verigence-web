import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import '../styles/uc03-p2.css';
import '../styles/uc03-p2-workspace.css';
import '../styles/uc03-p2-cards.css';

import PageHeader from '../components/PageHeader';
import JourneyRow, { nextAction, type Priority } from '../features/uc03-p2/bookings/JourneyRow';
import { getP2BookingsSummary, getP2Journeys, type P2JourneyListItem } from '../services/audit-core/uc03P2';
import { useProjectContextStore } from '../store/projectContextStore';
import { useSessionStore } from '../store/sessionStore';

const RANK: Record<Priority, number> = { overdue: 0, action: 1, waiting: 2, ok: 3, closed: 4 };

function useJourneys(tenantId: string | undefined, accessToken: string | undefined, search: string, state: 'open' | 'closed', enabled = true) {
  return useQuery({
    queryKey: ['p2-journeys', tenantId, search, state],
    queryFn: () => getP2Journeys(tenantId!, accessToken, search, state, state === 'open' ? 150 : 50),
    enabled: Boolean(enabled && tenantId && accessToken),
    staleTime: 15_000,
  });
}

/**
 * Booking & Delivery: every open journey as one row, most urgent first,
 * each saying what it needs next. The row's Actions menu opens Complete
 * journey (the documents workspace), Journey 360, or the tasks for your
 * role. Fifty bookings a week stay one screen.
 */
export default function P2JourneyListPage() {
  const tenantId = useProjectContextStore((s) => s.selectedProject?.tenantId);
  const role = useProjectContextStore((s) => s.selectedProject?.operatingRole);
  const accessToken = useSessionStore((s) => s.accessToken);
  const [search, setSearch] = useState('');
  const [showClosed, setShowClosed] = useState(false);
  const deferredSearch = useDeferredValue(search);
  useEffect(() => {
    const close = (event: MouseEvent) => {
      document.querySelectorAll<HTMLDetailsElement>('details.p2w-menu[open]').forEach((menu) => {
        if (!menu.contains(event.target as Node)) menu.removeAttribute('open');
      });
    };
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, []);
  const searching = Boolean(deferredSearch.trim());
  const open = useJourneys(tenantId, accessToken, deferredSearch, 'open');
  const closed = useJourneys(tenantId, accessToken, deferredSearch, 'closed', showClosed || searching);
  // The list is what the screen is for; the five numbers follow once it has
  // answered so the two tenant-wide reads never compete for Audit Core.
  const summary = useQuery({
    queryKey: ['p2-bookings-summary', tenantId],
    queryFn: () => getP2BookingsSummary(tenantId!, accessToken),
    enabled: Boolean(tenantId && accessToken && open.isFetched),
    staleTime: 60_000,
  });
  const s = summary.data;

  const ranked = useMemo(() => {
    const items = (open.data?.items ?? []).map((item) => ({ item, priority: nextAction(item, role).priority }));
    items.sort((a, b) => RANK[a.priority] - RANK[b.priority]);
    return items;
  }, [open.data, role]);
  const visible: P2JourneyListItem[] = ranked.map(({ item }) => item);
  const closedItems = closed.data?.items ?? [];

  return (
    <div className="screen-stack p2-screen p2w">
      <PageHeader
        eyebrow="Booking & Delivery"
        title="Booking & Delivery"
        description="Every open journey, most urgent first. Each card says what it needs next."
        actions={<Link className="p2w-button p2w-button--primary p2w-button--lg" to="/p2/journeys/new/documents">New booking</Link>}
      />

      <div className="p2w-listbar">
        <label className="p2w-search">
          <span className="p2w-visually-hidden">Search</span>
          <input type="search" value={search} onChange={(event) => setSearch(event.target.value)}
            placeholder="Search customer, vehicle, outlet or Journey ID" />
        </label>
        {open.isFetching ? <span className="p2w-muted">Loading…</span> : null}
      </div>

      {s ? (
        <dl className="p2w-stats" aria-label="Summary">
          <div><dt>Bookings open</dt><dd>{s.open.bookings}</dd></div>
          <div><dt>Deliveries open</dt><dd>{s.open.deliveries}</dd></div>
          <div><dt>Bookings closed</dt><dd>{s.closed?.bookings ?? '—'}</dd></div>
          <div><dt>Deliveries closed</dt><dd>{s.closed?.deliveries ?? '—'}</dd></div>
          <div className="is-tasks"><dt>Tasks open</dt><dd>{s.tasks?.open ?? '—'}</dd></div>
        </dl>
      ) : null}

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
        <h2 className="p2w-section-title">
          Open {open.isError ? null : <span className="p2w-muted">{visible.length}</span>}
        </h2>
        {visible.length ? (
          <table className={`p2w-jtable${role !== 'PC' ? ' has-where' : ''}`}>
            <thead><tr><th className="col-customer">Customer</th><th className="col-price">Price</th><th className="col-stage">Stage</th><th className="col-next">Next</th><th className="col-when">Dates</th>{role !== 'PC' ? <th className="col-where">Dealer · Outlet · PC</th> : null}<th className="col-act"><span className="p2w-visually-hidden">Actions</span></th></tr></thead>
            <tbody>
              {visible.map((item) => <JourneyRow key={item.journey_id} item={item} role={role} />)}
            </tbody>
          </table>
        ) : null}
        {open.isLoading ? <div className="p2w-skeleton">Loading…</div> : null}
        {!open.isLoading && !visible.length && !open.isError ? (
          <p className="p2w-empty">
            {searching ? 'No open journeys match this search.' : 'No open bookings. Start one with New booking.'}
          </p>
        ) : null}
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
          <>
            {closedItems.length ? (
              <table className={`p2w-jtable${role !== 'PC' ? ' has-where' : ''}`}>
            <thead><tr><th className="col-customer">Customer</th><th className="col-price">Price</th><th className="col-stage">Stage</th><th className="col-next">Next</th><th className="col-when">Dates</th>{role !== 'PC' ? <th className="col-where">Dealer · Outlet · PC</th> : null}<th className="col-act"><span className="p2w-visually-hidden">Actions</span></th></tr></thead>
            <tbody>
                  {closedItems.map((item) => <JourneyRow key={item.journey_id} item={item} role={role} />)}
                </tbody>
              </table>
            ) : null}
            {closed.isLoading ? <div className="p2w-skeleton">Loading…</div> : null}
            {!closed.isLoading && !closedItems.length ? <p className="p2w-empty">No closed journeys{searching ? ' match this search' : ''}.</p> : null}
          </>
        ) : null}
      </section>
    </div>
  );
}
