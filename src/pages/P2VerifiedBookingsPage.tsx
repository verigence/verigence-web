import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import '../styles/uc03-p2.css';
import '../styles/uc03-p2-workspace.css';
import '../styles/uc03-p2-data-uploads.css';
import '../styles/uc03-p2-verified.css';

import PageHeader from '../components/PageHeader';
import {
  RESULT_LABEL,
  checkVerifiedBookingsNow,
  fieldLabel,
  listVerifiedBookings,
  shown,
  type VerifiedBooking,
  type VerifiedResult,
} from '../services/audit-core/uc03VerifiedBookings';
import { useProjectContextStore } from '../store/projectContextStore';
import { useSessionStore } from '../store/sessionStore';

const TRIGGER: Record<string, string> = {
  DAILY: 'nightly check', DEPLOY: 'after a deploy', ON_DEMAND: 'checked on request', MARKED: 'when verified',
};
const TAG: Record<VerifiedResult, string> = {
  MATCHES: 'p2du-tag p2du-tag--ok', CHANGED: 'p2du-tag p2du-tag--bad',
  PAPERS_CHANGED: 'p2du-tag p2du-tag--warn', ERROR: 'p2du-tag p2du-tag--bad',
};

function rupees(value: string | null): string {
  if (value === null || value === undefined) return '—';
  const n = Number(value);
  return Number.isFinite(n) ? `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}` : value;
}

function when(value: string | null | undefined): string {
  return value ? new Date(value).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
}

function Changes({ item }: { item: VerifiedBooking }) {
  const check = item.lastCheck;
  if (!check) return <span className="p2w-muted">Not compared yet</span>;
  if (check.result === 'ERROR') return <span className="p2w-muted">{check.error}</span>;
  if (!check.changes.length) return <span className="p2w-muted">Same as verified</span>;
  return (
    <ul className="vb-changes">
      {check.changes.slice(0, 6).map((c) => (
        <li key={c.field}><span>{fieldLabel(c.field)}</span> <s>{shown(c.verified)}</s> → <strong>{shown(c.now)}</strong></li>
      ))}
      {check.changes.length > 6 ? <li className="p2w-muted">and {check.changes.length - 6} more</li> : null}
    </ul>
  );
}

/**
 * Verified bookings (product owner 2026-11-17): the bookings a Team Lead or Reviewer
 * checked against their papers, and whether the system still shows them the same.
 * "Changed by the system" on the same papers means a change to Verigence moved a
 * figure: it is reported here (it does not hold the change back).
 */
export default function P2VerifiedBookingsPage() {
  const project = useProjectContextStore((s) => s.selectedProject);
  const accessToken = useSessionStore((s) => s.accessToken);
  const tenantId = project?.tenantId;
  const [notice, setNotice] = useState<string>();
  const list = useQuery({
    queryKey: ['p2-verified-bookings', tenantId],
    queryFn: () => listVerifiedBookings(tenantId as string, accessToken),
    enabled: Boolean(tenantId && accessToken),
  });
  const check = useMutation({
    mutationFn: () => checkVerifiedBookingsNow(tenantId as string, accessToken),
    onSuccess: () => setNotice('The comparison has started; it takes a minute or two. Refresh to see the result.'),
  });
  const counts = list.data?.counts;

  return (
    <div className="screen-stack p2-screen p2w vb">
      <PageHeader
        eyebrow="DealGuard"
        title="Verified bookings"
        description="Bookings checked against their papers by a Team Lead or Reviewer, compared every night and after each change to the system."
        actions={list.data?.canCheck ? (
          <button type="button" className="p2w-button p2w-button--secondary" disabled={check.isPending}
            onClick={() => check.mutate()}>{check.isPending ? 'Starting…' : 'Compare now'}</button>
        ) : undefined}
      />
      {!tenantId || !accessToken ? (
        <div className="p2w-alert p2w-alert--error" role="alert">Select a project to continue.</div>
      ) : list.isError ? (
        <div className="p2w-alert p2w-alert--error" role="alert">
          {list.error instanceof Error && list.error.message ? list.error.message : 'The list could not be loaded.'}
        </div>
      ) : (
        <>
          {notice ? <div className="p2w-alert p2w-alert--success" role="status">{notice}</div> : null}
          {counts ? (
            <div className="p2du-tiles">
              <div className="p2du-tile"><span>Verified bookings</span><strong>{list.data?.items.length ?? 0}</strong><small>marked from Journey 360</small></div>
              <div className="p2du-tile p2du-tile--ok"><span>Matches</span><strong>{counts.MATCHES}</strong><small>shows the figures as verified</small></div>
              <div className="p2du-tile p2du-tile--bad"><span>Changed by the system</span><strong>{counts.CHANGED + counts.ERROR}</strong><small>same papers, figures moved</small></div>
              <div className="p2du-tile p2du-tile--warn"><span>Papers changed</span><strong>{counts.PAPERS_CHANGED}</strong><small>verify these again</small></div>
            </div>
          ) : null}
          {list.isLoading ? <div className="p2w-skeleton" aria-busy="true">Loading…</div> : null}
          {list.data && !list.data.items.length ? (
            <div className="p2w-empty">
              No booking is verified yet. Open a booking in Journey 360, check its Deal, payments and Audit Summary
              against the papers, and choose <strong>Mark as verified</strong>.
            </div>
          ) : null}
          {list.data?.items.length ? (
            <div className="p2du-scroll">
              <table className="p2du-table p2du-table--stack">
                <thead>
                  <tr>
                    <th>Booking</th><th>Dealership</th><th>Verified</th><th className="num">Payable</th>
                    <th className="num">Received</th><th>Now</th><th>What moved</th>
                  </tr>
                </thead>
                <tbody>
                  {list.data.items.map((item) => (
                    <tr key={item.journeyId}>
                      <td data-label="Booking">
                        <Link className="p2w-link" to={`/p2/journeys/${item.journeyId}/overview`}>{item.reference}</Link>
                        <br /><small className="p2w-muted">{item.customer ?? ''}</small>
                      </td>
                      <td data-label="Dealership">{item.dealer}<br /><small className="p2w-muted">{item.outlet}</small></td>
                      <td data-label="Verified">
                        {item.verifiedBy}<br /><small className="p2w-muted">{when(item.verifiedAt)}</small>
                      </td>
                      <td data-label="Payable" className="num">{rupees(item.payable)}</td>
                      <td data-label="Received" className="num">{rupees(item.received)}</td>
                      <td data-label="Now">
                        {item.lastCheck ? <span className={TAG[item.lastCheck.result]}>{RESULT_LABEL[item.lastCheck.result]}</span> : '—'}
                        {item.lastCheck ? <><br /><small className="p2w-muted">{when(item.lastCheck.at)} · {TRIGGER[item.lastCheck.trigger] ?? item.lastCheck.trigger}</small></> : null}
                      </td>
                      <td data-label="What moved"><Changes item={item} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
