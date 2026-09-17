import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

import PageHeader from '../components/PageHeader';
import {
  getDuplicateBookings,
  type DuplicateBookingPair,
  type DuplicateBookingSide,
} from '../services/audit-core/uc03DuplicateBookings';
import { useProjectContextStore } from '../store/projectContextStore';
import { useSessionStore } from '../store/sessionStore';
import '../styles/uc03-duplicate-bookings.css';

function friendly(value?: string | null): string {
  if (!value) return '—';
  return value.toLowerCase().split('_').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
}

function formatDate(value: string | null): string {
  if (!value) return 'Not yet paid';
  return new Date(value).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

// A pair's two sides render identically -- only which one is "the
// duplicate" vs "holds the booking" differs, and that's already conveyed
// by the panel's own heading, not by any different layout.
function SidePanel({ side, role: panelRole }: { side: DuplicateBookingSide; role: 'duplicate' | 'holder' }) {
  return (
    <div className={`dbk-side dbk-side--${panelRole}`}>
      <span className="dbk-side__label">{panelRole === 'holder' ? 'Holds the booking' : 'Believed duplicate'}</span>
      <strong className="dbk-side__customer">{side.customerName || 'Customer'}</strong>
      <span className="dbk-side__dealer">{side.dealerName || '—'}{side.outletName ? ` · ${side.outletName}` : ''}</span>
      <span className="dbk-side__product">{side.productLabel || 'Vehicle not yet identified'}</span>
      <span className="dbk-side__ref">{side.bookingReference || side.journeyReference || '—'}</span>
      <span className="dbk-side__paid">
        {side.bookingConfirmDate ? `Min. booking amount paid ${formatDate(side.bookingConfirmDate)}` : 'Minimum booking amount not yet paid'}
      </span>
      {side.journeyId && (
        <Link className="dbk-side__open" to={`/journeys/${side.journeyId}/overview`}>Open journey →</Link>
      )}
    </div>
  );
}

function ConfidenceBadge({ pair }: { pair: DuplicateBookingPair }) {
  const label = pair.matchConfidenceLabel || 'LOW';
  return (
    <span className={`dbk-confidence dbk-confidence--${label.toLowerCase()}`}>
      {friendly(label)}
      {pair.matchConfidencePercent != null && <span className="dbk-confidence__pct">{pair.matchConfidencePercent}%</span>}
    </span>
  );
}

export default function DuplicateBookingsPage() {
  const project = useProjectContextStore((state) => state.selectedProject);
  const accessToken = useSessionStore((state) => state.accessToken);
  const [includeClosed, setIncludeClosed] = useState(false);

  const enabled = Boolean(project?.tenantId && accessToken);
  const query = useQuery({
    queryKey: ['uc03-duplicate-bookings', project?.tenantId, includeClosed],
    queryFn: () => getDuplicateBookings(project!.tenantId, accessToken, includeClosed),
    enabled,
  });

  if (!project) return null;
  const pairs = query.data?.pairs ?? [];

  return (
    <div className="screen-stack dbk">
      <PageHeader
        eyebrow="Assurance"
        title="Duplicate Bookings"
        description="Every pairing the system believes is the same customer booked twice — dealer, outlet and vehicle on both sides, side by side, so it's clear at a glance which one actually holds the booking."
      />

      <label className="dbk-toggle">
        <input type="checkbox" checked={includeClosed} onChange={(e) => setIncludeClosed(e.target.checked)} />
        Show resolved pairings too
      </label>

      {query.isError && (
        <div className="dbk-banner dbk-banner--err" role="alert">
          Duplicate bookings could not be loaded. <button type="button" onClick={() => void query.refetch()}>Try again</button>
        </div>
      )}

      {query.isPending && <div className="dbk-empty">Loading…</div>}

      {query.data && pairs.length === 0 && (
        <div className="dbk-empty">
          {includeClosed ? 'No duplicate bookings have ever been raised in your scope.' : 'No open duplicate bookings right now. Nice — you’re clear.'}
        </div>
      )}

      <ul className="dbk-list">
        {pairs.map((pair) => (
          <li key={pair.findingId} className={`dbk-pair dbk-pair--${pair.status.toLowerCase()}`}>
            <div className="dbk-pair__head">
              <span className="dbk-pair__basis">{pair.matchBasisLabel || friendly(pair.matchBasis)} match</span>
              <ConfidenceBadge pair={pair} />
              {pair.status !== 'OPEN' && pair.status !== 'ACKNOWLEDGED' && (
                <span className="dbk-pair__status">{friendly(pair.status)}</span>
              )}
              <span className="dbk-pair__date">Raised {formatDate(pair.raisedAtUtc)}</span>
            </div>
            <div className="dbk-pair__sides">
              <SidePanel side={pair.holder} role="holder" />
              <span className="dbk-pair__vs" aria-hidden>vs</span>
              <SidePanel side={pair.duplicate} role="duplicate" />
            </div>
            <p className="dbk-pair__hint">
              Decide (Confirm Breach / Mark False Positive / Take Action) on the Task Queue — this page is for comparing both sides, not for acting on the finding.
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
