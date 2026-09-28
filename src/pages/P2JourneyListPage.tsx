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
function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function firstName(displayName: string, email: string): string {
  const source = (displayName || email.split('@')[0] || '').replace(/[._-]+/g, ' ').trim();
  return source.split(/\s+/)[0] || 'there';
}

export default function P2JourneyListPage() {
  const project = useProjectContextStore((s) => s.selectedProject);
  const tenantId = project?.tenantId;
  const role = project?.operatingRole;
  const accessToken = useSessionStore((s) => s.accessToken);
  const displayName = useSessionStore((s) => s.displayName);
  const email = useSessionStore((s) => s.email);
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
  const needCount = ranked.filter(({ priority }) => priority === 'overdue' || priority === 'action').length;
  const overdueCount = ranked.filter(({ priority }) => priority === 'overdue').length;
  const subClauses = [
    overdueCount ? `${overdueCount} overdue` : null,
    s?.tasks?.open ? `${s.tasks.open} open task${s.tasks.open === 1 ? '' : 's'}` : null,
  ].filter(Boolean);

  return (
    <div className="screen-stack p2-screen p2w">
      <PageHeader
        eyebrow="Booking & Delivery"
        title="Booking & Delivery"
        description="Every open journey, most urgent first. Each row says what it needs next."
      />

      <section className="p2w-hero" aria-labelledby="p2w-hero-title">
        <div className="p2w-hero__top">
          <p className="p2w-hero__greet">{greeting()}, {firstName(displayName, email)}</p>
          <Link className="p2w-hero__capture" to="/p2/journeys/new/documents">
            <span aria-hidden="true">＋</span>
            <span>Capture new booking</span>
          </Link>
        </div>
        <h2 id="p2w-hero-title" className="p2w-hero__headline">
          {open.isLoading ? 'Loading your work…'
            : needCount ? <>{`${needCount} thing${needCount === 1 ? '' : 's'} `}<b>need{needCount === 1 ? 's' : ''} you</b>{' right now'}</>
              : <b>You&rsquo;re all caught up</b>}
        </h2>
        <p className="p2w-hero__sub">
          {open.isLoading ? 'Counting bookings and deliveries…'
            : subClauses.length ? subClauses.join(' · ')
              : 'Nothing needs your attention right now. New bookings and deliveries will show up here.'}
        </p>
        <div className="p2w-hero__kpis" aria-label="Summary">
          <div className="p2w-kpi"><b>{s ? s.open.bookings : '—'}</b><span>Bookings open</span></div>
          <div className="p2w-kpi"><b>{s ? s.open.deliveries : '—'}</b><span>Deliveries open</span></div>
          <div className="p2w-kpi"><b>{s ? s.closed?.bookings ?? '—' : '—'}</b><span>Bookings closed</span></div>
          <div className="p2w-kpi"><b>{s ? s.closed?.deliveries ?? '—' : '—'}</b><span>Deliveries closed</span></div>
          <Link className={`p2w-kpi${s?.tasks?.open ? ' p2w-kpi--flag' : ''}`} to="/p2/tasks"><b>{s ? s.tasks?.open ?? '—' : '—'}</b><span>Tasks open</span></Link>
        </div>
      </section>

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
        <h2 className="p2w-section-title">
          Open {open.isError ? null : <span className="p2w-muted">{visible.length}</span>}
        </h2>
        {visible.length ? (
          <table className={`p2w-jtable${role !== 'PC' ? ' has-where' : ''}`}>
            <thead><tr><th className="col-customer">Customer</th><th className="col-price">Price variance</th><th className="col-stage">Stage</th><th className="col-next">Next</th><th className="col-when">Dates</th>{role !== 'PC' ? <th className="col-where">Dealer · Outlet · PC</th> : null}<th className="col-act"><span className="p2w-visually-hidden">Actions</span></th></tr></thead>
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
            <thead><tr><th className="col-customer">Customer</th><th className="col-price">Price variance</th><th className="col-stage">Stage</th><th className="col-next">Next</th><th className="col-when">Dates</th>{role !== 'PC' ? <th className="col-where">Dealer · Outlet · PC</th> : null}<th className="col-act"><span className="p2w-visually-hidden">Actions</span></th></tr></thead>
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
