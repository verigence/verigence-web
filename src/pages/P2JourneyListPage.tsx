import { useDeferredValue, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import '../styles/uc03-p2.css';
import '../styles/uc03-p2-workspace.css';

import PageHeader from '../components/PageHeader';
import { formatInr, humanizeKey } from '../features/uc03-p2/workspace/p2Format';
import { getP2Journeys, type P2JourneyListItem } from '../services/audit-core/uc03P2';
import { useProjectContextStore } from '../store/projectContextStore';
import { useSessionStore } from '../store/sessionStore';

const STAGE_LABEL: Record<string, string> = {
  BOOKING_DOCUMENT_UPLOAD: 'Booking · documents',
  BOOKING_VERIFY_DOCUMENTS: 'Booking · verify',
  BOOKING_COMPLETE: 'Booking complete',
  DELIVERY_DOCUMENT_UPLOAD: 'Delivery · documents',
  DELIVERY_VERIFY_DOCUMENTS: 'Delivery · verify',
  DELIVERY_COMPLETE: 'Delivered',
};

function stageTone(item: P2JourneyListItem): string {
  if (item.current_stage.endsWith('COMPLETE')) return 'success';
  if (item.current_stage.includes('VERIFY')) return 'warning';
  return 'progress';
}

/** One list, two purposes: open a booking's documents, or its Journey 360. */
export default function P2JourneyListPage({ mode }: { mode: 'bookings' | 'journey360' }) {
  const tenantId = useProjectContextStore((s) => s.selectedProject?.tenantId);
  const accessToken = useSessionStore((s) => s.accessToken);
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const query = useQuery({
    queryKey: ['p2-journeys', tenantId, deferredSearch],
    queryFn: () => getP2Journeys(tenantId!, accessToken, deferredSearch),
    enabled: Boolean(tenantId && accessToken),
    staleTime: 15_000,
  });
  const items = query.data?.items ?? [];
  const bookings = mode === 'bookings';

  return (
    <div className="screen-stack p2-screen p2w">
      <PageHeader
        eyebrow={bookings ? 'Bookings' : 'Journey 360'}
        title={bookings ? 'Bookings' : 'Journey 360'}
        description={bookings
          ? 'Start a new booking or open one to add and check documents.'
          : 'Find a customer journey to see its complete picture.'}
        actions={bookings ? (
          <Link className="p2w-button p2w-button--primary p2w-button--lg" to="/p2/journeys/new/documents">
            New booking
          </Link>
        ) : undefined}
      />

      <div className="p2w-listbar">
        <label className="p2w-search">
          <span className="p2w-visually-hidden">Search</span>
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search customer, vehicle, outlet or Journey ID"
          />
        </label>
        <span className="p2w-muted">{query.isFetching ? 'Refreshing…' : `${items.length} journeys`}</span>
      </div>

      {query.isError ? (
        <div className="p2w-alert p2w-alert--error" role="alert">
          Journeys could not be loaded. {query.error instanceof Error ? query.error.message : ''}
          <button type="button" className="p2w-link" onClick={() => void query.refetch()}>Try again</button>
        </div>
      ) : null}

      <ul className="p2w-journeys">
        {items.map((item) => {
          const to = bookings ? `/p2/journeys/${item.journey_id}/documents` : `/p2/journeys/${item.journey_id}/overview`;
          const needsAction = item.open_tasks + item.open_findings;
          return (
            <li key={item.journey_id}>
              <Link className="p2w-journey" to={to}>
                <div className="p2w-journey__who">
                  <strong>{item.customer_name}</strong>
                  <span>{item.vehicle || 'Vehicle not identified yet'}</span>
                  <span className="p2w-muted">{item.outlet_name}</span>
                </div>
                <div className="p2w-journey__facts">
                  <span className={`p2w-chip p2w-chip--${stageTone(item)}`}>
                    {STAGE_LABEL[item.current_stage] ?? humanizeKey(item.current_stage)}
                  </span>
                  <span>{formatInr(item.booking_receipt_total)} of {formatInr(item.booking_minimum_amount)}</span>
                  <span>{item.documents} documents</span>
                  {needsAction ? (
                    <span className={item.overdue_tasks ? 'p2w-tone p2w-tone--danger' : 'p2w-tone p2w-tone--warning'}>
                      {needsAction} to do{item.overdue_tasks ? ` · ${item.overdue_tasks} overdue` : ''}
                    </span>
                  ) : <span className="p2w-tone p2w-tone--success">Nothing pending</span>}
                </div>
                <span className="p2w-doc__chevron" aria-hidden="true">›</span>
              </Link>
            </li>
          );
        })}
        {!query.isLoading && !items.length ? (
          <li className="p2w-empty">
            {bookings ? 'No bookings yet for this dealership. Start one with New booking.' : 'No journeys match this search.'}
          </li>
        ) : null}
      </ul>
    </div>
  );
}
