import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

import PageHeader from '../components/PageHeader';
import SectionCard from '../components/SectionCard';
import StatusPill from '../components/StatusPill';
import { loadCustomers } from '../services/webRepository';
import { useSessionStore } from '../store/sessionStore';

export default function CustomersPage() {
  const [search, setSearch] = useState('');
  const accessToken = useSessionStore((state) => state.accessToken);
  const query = useQuery({ queryKey: ['customers'], queryFn: () => loadCustomers({ accessToken }) });
  const filtered = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    if (!normalized) return query.data?.items || [];
    return (query.data?.items || []).filter((item) =>
      [item.displayName, item.mobileLast4, item.emailReference, item.externalCustomerRef]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalized)),
    );
  }, [query.data, search]);

  return (
    <div className="screen-stack">
      <PageHeader
        eyebrow="Customer context"
        title="Customers"
        description="Find an existing customer and continue to their audit journeys."
        backing={query.data?.backing}
      />
      <SectionCard>
        <div className="toolbar-row">
          <label className="search-box">
            <span>Search</span>
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name, mobile, email or customer reference" />
          </label>
          <span className="toolbar-count">{filtered.length} customers</span>
        </div>

        <div className="data-table-wrap adaptive-list__desktop">
          <table className="data-table">
            <thead><tr><th>Customer</th><th>Reference</th><th>Contact</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {filtered.map((customer) => (
                <tr key={customer.customerId}>
                  <td><strong>{customer.displayName}</strong></td>
                  <td>{customer.externalCustomerRef || '—'}</td>
                  <td><span>•••• {customer.mobileLast4 || '—'}</span><small>{customer.emailReference || 'No email reference'}</small></td>
                  <td><StatusPill value={customer.status} compact /></td>
                  <td><Link className="text-link" to={`/journeys?customer=${customer.customerId}`}>View journeys</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="adaptive-list adaptive-list__mobile" aria-label="Customers">
          {filtered.map((customer) => (
            <Link className="adaptive-list-card" key={customer.customerId} to={`/journeys?customer=${customer.customerId}`}>
              <div className="adaptive-list-card__head">
                <div>
                  <strong>{customer.displayName}</strong>
                  <span>{customer.externalCustomerRef || 'Customer'}</span>
                </div>
                <StatusPill value={customer.status} compact />
              </div>
              <div className="adaptive-list-card__details">
                <span>Mobile <strong>•••• {customer.mobileLast4 || '—'}</strong></span>
                {customer.emailReference && <span>Email <strong>{customer.emailReference}</strong></span>}
              </div>
              <span className="adaptive-list-card__action">View journeys <span aria-hidden="true">›</span></span>
            </Link>
          ))}
          {!filtered.length && <div className="adaptive-list-empty">No customers found.</div>}
        </div>
      </SectionCard>
    </div>
  );
}
