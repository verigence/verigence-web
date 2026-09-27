import { useDeferredValue, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import '../styles/uc03-p2.css';

import PageHeader from '../components/PageHeader';
import SectionCard from '../components/SectionCard';
import StatusPill from '../components/StatusPill';
import { getP2Journeys } from '../services/audit-core/uc03P2';
import { useProjectContextStore } from '../store/projectContextStore';
import { useSessionStore } from '../store/sessionStore';

function money(value?: string | null) {
  if (!value) return '—';
  const amount = Number(value);
  if (Number.isNaN(amount)) return value;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
}

export default function P2WorkQueuePage() {
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

  return (
    <div className="screen-stack p2-screen">
      <PageHeader
        eyebrow="Phase 2"
        title="Capture"
        description="Start with a journey, upload documents, and follow them through classification, extraction, processing, rules and tasks."
      />

      <SectionCard>
        <div className="p2-pipeline" aria-label="Phase 2 processing flow">
          <span>Capture</span><b>→</b><span>Classify</span><b>→</b><span>Extract</span><b>→</b><span>Process</span><b>→</b><span>Rules</span><b>→</b><span>Audit</span><b>→</b><span>Tasks</span>
        </div>
        <div className="p2-toolbar">
          <label className="p2-search">
            <span>Search journeys</span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Customer, dealer, vehicle or Journey ID"
              type="search"
            />
          </label>
          <div className="p2-toolbar__meta">
            {query.isFetching ? 'Refreshing…' : `${query.data?.items.length ?? 0} journeys`}
          </div>
        </div>

        {query.isError ? (
          <div className="form-alert form-alert--error">
            {query.error instanceof Error ? query.error.message : 'Phase 2 journeys could not be loaded.'}
          </div>
        ) : null}

        <div className="p2-table-wrap">
          <table className="p2-table">
            <thead>
              <tr>
                <th>Customer / Vehicle</th>
                <th>Stage</th>
                <th>Booking</th>
                <th>Delivery</th>
                <th>Documents</th>
                <th>Tasks</th>
                <th>Findings</th>
                <th aria-label="Action" />
              </tr>
            </thead>
            <tbody>
              {(query.data?.items ?? []).map((item) => (
                <tr key={item.journey_id}>
                  <td>
                    <strong>{item.customer_name}</strong>
                    <small>{item.vehicle || 'Vehicle not resolved'}</small>
                    <small>{item.dealer_name} · {item.outlet_name}</small>
                  </td>
                  <td><StatusPill value={item.current_stage} compact /></td>
                  <td>
                    <strong>{money(item.booking_receipt_total)}</strong>
                    <small>
                      Minimum {money(item.booking_minimum_amount)}
                      {item.manual_verification_pending_count > 0
                        ? ` · ${item.manual_verification_pending_count} verification pending`
                        : ''}
                    </small>
                  </td>
                  <td><StatusPill value={item.delivery_completion_state} compact /></td>
                  <td>{item.documents}</td>
                  <td>
                    <strong>{item.open_tasks}</strong>
                    {item.overdue_tasks > 0 ? <small className="p2-attention">{item.overdue_tasks} overdue</small> : null}
                  </td>
                  <td>{item.open_findings}</td>
                  <td className="p2-table__action">
                    <div className="p2-row-actions">
                      <Link className="p2-primary-link" to={`/p2/journeys/${item.journey_id}/documents`}>
                        Upload
                      </Link>
                      <Link className="text-link" to={`/p2/journeys/${item.journey_id}/overview`}>
                        Journey 360
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
              {!query.isLoading && (query.data?.items.length ?? 0) === 0 ? (
                <tr><td colSpan={8} className="p2-empty">No journeys match the current search.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}
