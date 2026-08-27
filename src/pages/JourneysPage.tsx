import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';

import PageHeader from '../components/PageHeader';
import SectionCard from '../components/SectionCard';
import StatusPill from '../components/StatusPill';
import { loadJourneys } from '../services/webRepository';
import { useSessionStore } from '../store/sessionStore';

export default function JourneysPage() {
  const [params] = useSearchParams();
  const customerFilter = params.get('customer');
  const [search, setSearch] = useState('');
  const [state, setState] = useState('ALL');
  const accessToken = useSessionStore((s) => s.accessToken);
  const query = useQuery({ queryKey: ['journeys'], queryFn: () => loadJourneys({ accessToken }) });

  const items = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    return (query.data?.items || []).filter((item) => {
      if (customerFilter && item.customerId !== customerFilter) return false;
      if (state !== 'ALL' && item.auditState !== state) return false;
      if (!normalized) return true;
      return [item.customerName, item.journeyReference, item.bookingReference, item.productLabel, item.outletName]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalized));
    });
  }, [query.data, search, state, customerFilter]);

  return (
    <div className="screen-stack">
      <PageHeader
        eyebrow="Audit journeys"
        title="Journey workspace"
        description="Review each customer journey, its evidence and current audit status."
        backing={query.data?.backing}
      />
      <SectionCard>
        <div className="toolbar-row toolbar-row--wrap">
          <label className="search-box"><span>Search</span><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Customer, journey, booking, model or outlet" /></label>
          <label className="filter-select"><span>Audit state</span><select value={state} onChange={(e) => setState(e.target.value)}><option value="ALL">All</option><option value="IN_PROGRESS">In progress</option><option value="PC_SUBMITTED">PC submitted</option><option value="TL_REVIEW">TL review</option><option value="SENT_BACK">Sent back</option><option value="COMPLETED">Completed</option></select></label>
          <span className="toolbar-count">{items.length} journeys</span>
        </div>

        <div className="data-table-wrap adaptive-list__desktop">
          <table className="data-table">
            <thead><tr><th>Journey</th><th>Customer / vehicle</th><th>Outlet</th><th>Evidence</th><th>Audit</th><th>Outcome</th><th></th></tr></thead>
            <tbody>
              {items.map((journey) => (
                <tr key={journey.journeyId}>
                  <td><strong>{journey.journeyReference || 'Journey'}</strong><small>{journey.bookingReference || 'Booking reference pending'}</small></td>
                  <td><strong>{journey.customerName}</strong><small>{journey.productLabel || 'Vehicle details pending'}</small></td>
                  <td>{journey.outletName}<small>{journey.dealerName}</small></td>
                  <td><strong>{journey.evidenceCount}</strong><small>{journey.findingCount} findings</small></td>
                  <td><StatusPill value={journey.auditState} compact /></td>
                  <td><StatusPill value={journey.auditOutcome} compact /></td>
                  <td><Link className="row-action" to={`/journeys/${journey.journeyId}`}>Open</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="adaptive-list adaptive-list__mobile" aria-label="Journeys">
          {items.map((journey) => (
            <Link className="adaptive-list-card" key={journey.journeyId} to={`/journeys/${journey.journeyId}`}>
              <div className="adaptive-list-card__head">
                <div>
                  <strong>{journey.customerName}</strong>
                  <span>{journey.journeyReference || journey.bookingReference || 'Journey'}</span>
                </div>
                <StatusPill value={journey.auditState} compact />
              </div>
              <div className="adaptive-list-card__details">
                <span>Vehicle <strong>{journey.productLabel || 'Pending'}</strong></span>
                <span>Outlet <strong>{journey.outletName}</strong></span>
                <span>Evidence <strong>{journey.evidenceCount} items · {journey.findingCount} findings</strong></span>
              </div>
              <span className="adaptive-list-card__action">Open journey <span aria-hidden="true">›</span></span>
            </Link>
          ))}
          {!items.length && <div className="adaptive-list-empty">No journeys found.</div>}
        </div>
      </SectionCard>
    </div>
  );
}
