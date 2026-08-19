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
        eyebrow="Process Consultant · Customer context"
        title="Customers"
        description="Find the customer context that already exists. The audit journey starts from source evidence and existing customer references—not re-keyed KYC data."
        backing={query.data?.backing}
      />
      <SectionCard>
        <div className="toolbar-row">
          <label className="search-box">
            <span>Search</span>
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name, mobile last 4, email reference or DMS reference" />
          </label>
          <span className="toolbar-count">{filtered.length} customers</span>
        </div>
        <div className="data-table-wrap">
          <table className="data-table">
            <thead><tr><th>Customer</th><th>Reference</th><th>Contact evidence</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {filtered.map((customer) => (
                <tr key={customer.customerId}>
                  <td><strong>{customer.displayName}</strong><small>{customer.customerId}</small></td>
                  <td>{customer.externalCustomerRef || '—'}</td>
                  <td><span>•••• {customer.mobileLast4 || '—'}</span><small>{customer.emailReference || 'No email reference'}</small></td>
                  <td><StatusPill value={customer.status} compact /></td>
                  <td><Link className="text-link" to={`/journeys?customer=${customer.customerId}`}>View journeys</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}
