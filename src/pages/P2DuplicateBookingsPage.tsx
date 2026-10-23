import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import '../styles/uc03-p2.css';
import '../styles/uc03-p2-workspace.css';
import '../styles/uc03-p2-journey360.css';

import PageHeader from '../components/PageHeader';
import { formatDateTime, humanizeKey } from '../features/uc03-p2/workspace/p2Format';
import {
  getDuplicateBookings,
  type DuplicateBookingPair,
  type DuplicateBookingSide,
} from '../services/audit-core/uc03P2';
import { useProjectContextStore } from '../store/projectContextStore';
import { useSessionStore } from '../store/sessionStore';

function Side({ title, side }: { title: string; side: DuplicateBookingSide }) {
  return (
    <div className="j360-dup-side">
      <span className="j360-label">{title}</span>
      <strong>{side.customerName ?? '—'}</strong>
      <span className="p2w-muted">{[side.productLabel, side.journeyReference].filter(Boolean).join(' · ')}</span>
      {/* Outlet and the PC who captured it, named rather than folded into one
          line (product owner 2026-10-23). */}
      <span className="p2w-muted">
        {[side.dealerName, side.outletName].filter(Boolean).join(' · ') || 'Outlet not recorded'}
      </span>
      <span className="p2w-muted">PC: {side.pcName || 'not recorded'}</span>
      <span className="p2w-muted">{side.bookingConfirmDate ? `Booked ${side.bookingConfirmDate}` : ''}</span>
      <Link className="p2w-link" to={`/p2/journeys/${side.journeyId}/overview`}>Open Journey 360</Link>
    </div>
  );
}

/** The evidence: which field matched and what each booking carried. Without
 * it a pair could only be judged by opening both journeys. */
function MatchedOn({ pair }: { pair: DuplicateBookingPair }) {
  const fields = pair.matchedFields ?? [];
  if (!fields.length) return null;
  return (
    <div className="j360-dup-evidence">
      <span className="j360-label">Matched on</span>
      <table className="p2w-table">
        <thead>
          <tr><th>Field</th><th>Holds the booking</th><th>Believed duplicate</th></tr>
        </thead>
        <tbody>
          {fields.map((field) => (
            <tr key={field.field}>
              <td>
                {field.label}
                {field.exact ? null : <span className="p2w-muted"> (similar)</span>}
              </td>
              <td>{field.otherValue ?? '—'}</td>
              <td>{field.thisValue ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
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
            <MatchedOn pair={pair} />
          </li>
        ))}
        {!query.isLoading && !pairs.length && !query.isError ? <li className="p2w-empty p2w-empty--success">No possible duplicate bookings.</li> : null}
        {query.isLoading ? <li className="p2w-skeleton">Loading…</li> : null}
      </ul>
    </div>
  );
}
