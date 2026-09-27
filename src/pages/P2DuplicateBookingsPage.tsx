import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import '../styles/uc03-p2.css';
import '../styles/uc03-p2-workspace.css';
import '../styles/uc03-p2-journey360.css';

import PageHeader from '../components/PageHeader';
import { formatDateTime, humanizeKey } from '../features/uc03-p2/workspace/p2Format';
import { getDuplicateBookings, type DuplicateBookingSide } from '../services/audit-core/uc03P2';
import { useProjectContextStore } from '../store/projectContextStore';
import { useSessionStore } from '../store/sessionStore';

function Side({ title, side }: { title: string; side: DuplicateBookingSide }) {
  return (
    <div className="j360-dup-side">
      <span className="j360-label">{title}</span>
      <strong>{side.customerName ?? '—'}</strong>
      <span className="p2w-muted">{[side.productLabel, side.outletName, side.journeyReference].filter(Boolean).join(' · ')}</span>
      <span className="p2w-muted">{side.bookingConfirmDate ? `Booked ${side.bookingConfirmDate}` : ''}</span>
      <Link className="p2w-link" to={`/p2/journeys/${side.journeyId}/overview`}>Open Journey 360</Link>
    </div>
  );
}

/** Tenant-wide possible duplicate bookings, most serious first. */
export default function P2DuplicateBookingsPage() {
  const tenantId = useProjectContextStore((s) => s.selectedProject?.tenantId);
  const accessToken = useSessionStore((s) => s.accessToken);
  const [includeClosed, setIncludeClosed] = useState(false);
  const query = useQuery({
    queryKey: ['p2-duplicates', tenantId, includeClosed],
    queryFn: () => getDuplicateBookings(tenantId!, accessToken, includeClosed),
    enabled: Boolean(tenantId && accessToken),
    staleTime: 30_000,
  });
  const pairs = query.data?.pairs ?? [];
  return (
    <div className="screen-stack p2-screen p2w j360">
      <PageHeader eyebrow="Audit" title="Duplicate bookings"
        description="Bookings whose customer matches another booking by PAN, Aadhaar, name, mobile or address. Confirm a genuine repeat customer or stop the duplicate." />
      <div className="p2w-listbar">
        <label className="p2w-check"><input type="checkbox" checked={includeClosed} onChange={(e) => setIncludeClosed(e.target.checked)} /> Include resolved</label>
        <span className="p2w-muted">{query.isFetching ? 'Refreshing…' : `${pairs.length} pairs`}</span>
      </div>
      {query.isError ? (
        <div className="p2w-alert p2w-alert--error" role="alert">
          Duplicate bookings could not be loaded. <button type="button" className="p2w-link" onClick={() => void query.refetch()}>Try again</button>
        </div>
      ) : null}
      <ul className="j360-stack j360-dups">
        {pairs.map((pair) => (
          <li key={pair.findingId} className="j360-card">
            <header className="j360-docs__head">
              <span className={`p2w-chip p2w-chip--${pair.severity === 'CRITICAL' ? 'danger' : pair.severity === 'LOW' ? 'neutral' : 'warning'}`}>
                {pair.matchBasisLabel ?? humanizeKey(pair.matchBasis ?? 'match')}{pair.matchConfidencePercent ? ` · ${pair.matchConfidencePercent}%` : ''}
              </span>
              <span className="p2w-muted">Raised {formatDateTime(pair.raisedAtUtc)} · {humanizeKey(pair.status)}</span>
            </header>
            <div className="j360-dup-pair">
              <Side title="Holds the booking" side={pair.holder} />
              <Side title="Believed duplicate" side={pair.duplicate} />
            </div>
          </li>
        ))}
        {!query.isLoading && !pairs.length && !query.isError ? <li className="p2w-empty p2w-empty--success">No possible duplicate bookings.</li> : null}
        {query.isLoading ? <li className="p2w-skeleton">Loading…</li> : null}
      </ul>
    </div>
  );
}
