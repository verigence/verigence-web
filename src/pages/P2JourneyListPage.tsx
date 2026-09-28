import { useDeferredValue, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import '../styles/uc03-p2.css';
import '../styles/uc03-p2-workspace.css';

import PageHeader from '../components/PageHeader';
import JourneyStageLines from '../features/uc03-p2/bookings/JourneyStageLines';
import { formatInr } from '../features/uc03-p2/workspace/p2Format';
import { getP2BookingsSummary, getP2Journeys, type P2JourneyListItem } from '../services/audit-core/uc03P2';
import { useProjectContextStore } from '../store/projectContextStore';
import { useSessionStore } from '../store/sessionStore';

function shortDate(value?: string | null): string | null {
  if (!value) return null;
  const date = new Date(value.length === 10 ? `${value}T00:00:00` : value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
}

function hours(value?: number | null): string {
  if (value === null || value === undefined) return '—';
  return value >= 48 ? `${(value / 24).toFixed(1)} days` : `${value.toFixed(1)} h`;
}

function JourneyRow({ item, supervisor }: { item: P2JourneyListItem; supervisor: boolean }) {
  const delivered = Boolean(item.delivery_completed_at);
  return (
    <li className={`p2w-journey${item.closed ? ' is-closed' : ''}`}>
      <Link className="p2w-journey__open" to={`/p2/journeys/${item.journey_id}/overview`} aria-label={`Open Journey 360 for ${item.customer_name}`}>
        <div className="p2w-journey__who">
          <strong>{item.customer_name}</strong>
          <span>{item.vehicle || 'Vehicle not identified yet'}</span>
          <span className="p2w-muted">{[item.journey_reference, item.outlet_name].filter(Boolean).join(' · ')}</span>
        </div>
        <JourneyStageLines stage={item.current_stage} cancelled={item.cancelled} delivered={delivered} />
        <dl className="p2w-journey__dates">
          <div><dt>Booking confirmed</dt><dd>{shortDate(item.booking_confirm_date) ?? '—'}</dd></div>
          <div>
            <dt>{delivered ? 'Delivered' : 'Delivery due'}</dt>
            <dd>{shortDate(item.delivery_completed_at ?? item.planned_delivery_at) ?? '—'}</dd>
          </div>
          <div><dt>Booking amount</dt><dd>{formatInr(item.booking_receipt_total)}{item.booking_minimum_amount ? ` of ${formatInr(item.booking_minimum_amount)}` : ''}</dd></div>
        </dl>
      </Link>
      <div className="p2w-journey__side">
        <div className="p2w-journey__tasks" aria-label="Open tasks by role">
          <span className={item.pc_open_tasks ? 'p2w-chip p2w-chip--warning' : 'p2w-chip p2w-chip--success'}>PC {item.pc_open_tasks ?? 0}</span>
          <span className={item.tl_open_tasks ? 'p2w-chip p2w-chip--warning' : 'p2w-chip p2w-chip--success'}>TL {item.tl_open_tasks ?? 0}</span>
          {item.overdue_tasks ? <span className="p2w-chip p2w-chip--danger">{item.overdue_tasks} overdue</span> : null}
        </div>
        <div className="p2w-journey__actions">
          {!item.closed ? (
            <Link className="p2w-button p2w-button--secondary" to={`/p2/journeys/${item.journey_id}/documents`}>Documents</Link>
          ) : null}
          {supervisor ? (
            <Link className="p2w-button p2w-button--ghost" to={`/p2/journeys/${item.journey_id}/compliance-report`}>Compliance report</Link>
          ) : null}
        </div>
      </div>
    </li>
  );
}

function useJourneys(tenantId: string | undefined, accessToken: string | undefined, search: string, state: 'open' | 'closed', enabled = true) {
  return useQuery({
    queryKey: ['p2-journeys', tenantId, search, state],
    queryFn: () => getP2Journeys(tenantId!, accessToken, search, state, state === 'open' ? 150 : 50),
    enabled: Boolean(enabled && tenantId && accessToken),
    staleTime: 15_000,
  });
}

/** Bookings and Journey 360: what matters now, open journeys first, closed ones below. */
export default function P2JourneyListPage({ mode }: { mode: 'bookings' | 'journey360' }) {
  const tenantId = useProjectContextStore((s) => s.selectedProject?.tenantId);
  const role = useProjectContextStore((s) => s.selectedProject?.operatingRole);
  const accessToken = useSessionStore((s) => s.accessToken);
  const supervisor = role === 'TL' || role === 'PM';
  const [search, setSearch] = useState('');
  const [showClosed, setShowClosed] = useState(false);
  const deferredSearch = useDeferredValue(search);
  const open = useJourneys(tenantId, accessToken, deferredSearch, 'open');
  const closed = useJourneys(tenantId, accessToken, deferredSearch, 'closed', showClosed || Boolean(deferredSearch));
  const summary = useQuery({
    queryKey: ['p2-bookings-summary', tenantId],
    queryFn: () => getP2BookingsSummary(tenantId!, accessToken),
    enabled: Boolean(tenantId && accessToken),
    staleTime: 60_000,
  });
  const bookings = mode === 'bookings';
  const s = summary.data;
  const openItems = open.data?.items ?? [];
  const closedItems = closed.data?.items ?? [];

  return (
    <div className="screen-stack p2-screen p2w">
      <PageHeader
        eyebrow={bookings ? 'Bookings' : 'Journey 360'}
        title={bookings ? 'Bookings' : 'Journey 360'}
        description={bookings
          ? 'Open bookings first. Open one to see its Journey 360, or add documents.'
          : 'Find a customer journey to see its complete picture.'}
        actions={bookings ? (
          <Link className="p2w-button p2w-button--primary p2w-button--lg" to="/p2/journeys/new/documents">New booking</Link>
        ) : undefined}
      />

      {s ? (
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

      <div className="p2w-listbar">
        <label className="p2w-search">
          <span className="p2w-visually-hidden">Search</span>
          <input type="search" value={search} onChange={(event) => setSearch(event.target.value)}
            placeholder="Search customer, vehicle, outlet or Journey ID" />
        </label>
        <span className="p2w-muted">{open.isFetching ? 'Refreshing…' : `${openItems.length} open`}</span>
      </div>

      {open.isError ? (
        <div className="p2w-alert p2w-alert--error" role="alert">
          Journeys could not be loaded. {open.error instanceof Error ? open.error.message : ''}
          <button type="button" className="p2w-link" onClick={() => void open.refetch()}>Try again</button>
        </div>
      ) : null}

      <section aria-label="Open">
        <h2 className="p2w-section-title">Open <span className="p2w-muted">{openItems.length}</span></h2>
        <ul className="p2w-journeys">
          {openItems.map((item) => <JourneyRow key={item.journey_id} item={item} supervisor={supervisor} />)}
          {open.isLoading ? <li className="p2w-skeleton">Loading…</li> : null}
          {!open.isLoading && !openItems.length && !open.isError ? (
            <li className="p2w-empty">{deferredSearch ? 'No open journeys match this search.' : 'No open bookings. Start one with New booking.'}</li>
          ) : null}
        </ul>
      </section>

      <section aria-label="Closed">
        <h2 className="p2w-section-title">
          <button type="button" className="p2w-link" aria-expanded={showClosed || Boolean(deferredSearch)}
            onClick={() => setShowClosed((v) => !v)}>
            {showClosed || deferredSearch ? '▾' : '▸'} Closed — delivered or cancelled
          </button>
          {closed.data ? <span className="p2w-muted">{closedItems.length}{closedItems.length === 50 ? '+' : ''}</span> : null}
        </h2>
        {showClosed || deferredSearch ? (
          <ul className="p2w-journeys">
            {closedItems.map((item) => <JourneyRow key={item.journey_id} item={item} supervisor={supervisor} />)}
            {closed.isLoading ? <li className="p2w-skeleton">Loading…</li> : null}
            {!closed.isLoading && !closedItems.length ? <li className="p2w-empty">No closed journeys{deferredSearch ? ' match this search' : ''}.</li> : null}
          </ul>
        ) : null}
      </section>
    </div>
  );
}
