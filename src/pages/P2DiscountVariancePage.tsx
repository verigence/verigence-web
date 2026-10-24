import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import '../styles/uc03-p2.css';
import '../styles/uc03-p2-discount-variance.css';

import PageHeader from '../components/PageHeader';
import SectionCard from '../components/SectionCard';
import {
  getDiscountVariance,
  type DiscountVarianceItem,
  type DiscountVarianceStatus,
} from '../services/audit-core/uc03DiscountVariance';
import { useProjectContextStore } from '../store/projectContextStore';
import { useSessionStore } from '../store/sessionStore';

type Filter = 'ALL' | DiscountVarianceStatus;

const STATUS_LABEL: Record<DiscountVarianceStatus, string> = {
  OVER_ENTITLEMENT: 'Given more than entitled',
  UNDER_ENTITLEMENT: 'Given less than entitled',
  ENTITLEMENT_UNKNOWN: 'Entitlement not known',
};

function money(value: string | null | undefined) {
  if (value === null || value === undefined || value === '') return '—';
  const n = Number(value);
  return Number.isNaN(n) ? value : n.toLocaleString('en-IN', { maximumFractionDigits: 0 });
}

function signed(value: string | null) {
  if (value === null) return '—';
  const n = Number(value);
  if (Number.isNaN(n)) return value;
  return `${n > 0 ? '+' : ''}${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

function rowClass(item: DiscountVarianceItem) {
  if (item.status === 'OVER_ENTITLEMENT') return 'is-over';
  if (item.status === 'ENTITLEMENT_UNKNOWN') return 'is-unknown';
  return undefined;
}

export default function P2DiscountVariancePage() {
  const tenantId = useProjectContextStore((s) => s.selectedProject?.tenantId);
  const accessToken = useSessionStore((s) => s.accessToken);
  const [filter, setFilter] = useState<Filter>('ALL');

  const query = useQuery({
    queryKey: ['p2-discount-variance', tenantId],
    queryFn: () => getDiscountVariance(tenantId!, { limit: 1000 }, accessToken),
    enabled: Boolean(tenantId && accessToken),
  });

  const items = useMemo(() => {
    const all = query.data?.items ?? [];
    return filter === 'ALL' ? all : all.filter((i) => i.status === filter);
  }, [query.data, filter]);

  const counts = query.data?.counts;

  return (
    <div className="p2w">
      <PageHeader
        eyebrow="DealGuard"
        title="Discount variance"
        description="Discounts on the invoice that are not what the booking was entitled to. Only the invoice is counted, never the booking form. A booking with no invoice, or an invoice that gave no price, is not tallied."
      />

      <SectionCard title="What differs">
        {query.isLoading && <p className="p2w-muted">Reading…</p>}
        {query.isError && <p className="p2w-danger">That could not be read. Reload the page.</p>}
        {query.data && counts && (
          <>
            <div className="p2w-dv__tiles">
              <button type="button" className={`p2w-dv__tile${filter === 'ALL' ? ' is-active' : ''}`}
                      onClick={() => setFilter('ALL')}>
                <span className="p2w-dv__count">{counts.total}</span>
                <span>Discounts differing</span>
                <small>on {counts.journeys} bookings</small>
              </button>
              <button type="button"
                      className={`p2w-dv__tile is-worst${filter === 'OVER_ENTITLEMENT' ? ' is-active' : ''}`}
                      onClick={() => setFilter('OVER_ENTITLEMENT')}>
                <span className="p2w-dv__count">{counts.over}</span>
                <span>{STATUS_LABEL.OVER_ENTITLEMENT}</span>
              </button>
              <button type="button"
                      className={`p2w-dv__tile${filter === 'UNDER_ENTITLEMENT' ? ' is-active' : ''}`}
                      onClick={() => setFilter('UNDER_ENTITLEMENT')}>
                <span className="p2w-dv__count">{counts.under}</span>
                <span>{STATUS_LABEL.UNDER_ENTITLEMENT}</span>
              </button>
              <button type="button"
                      className={`p2w-dv__tile${filter === 'ENTITLEMENT_UNKNOWN' ? ' is-active' : ''}`}
                      onClick={() => setFilter('ENTITLEMENT_UNKNOWN')}>
                <span className="p2w-dv__count">{counts.unknown}</span>
                <span>{STATUS_LABEL.ENTITLEMENT_UNKNOWN}</span>
                <small>on the invoice, nothing to compare with</small>
              </button>
            </div>
            {query.data.notYetCalculated > 0 && (
              <p className="p2w-muted">
                {query.data.notYetCalculated} bookings are still being calculated; this list grows as they finish.
              </p>
            )}
          </>
        )}
      </SectionCard>

      <SectionCard title={filter === 'ALL' ? 'Every discount that differs' : STATUS_LABEL[filter]}>
        {query.data && items.length === 0 && <p className="p2w-muted">Nothing differs here.</p>}
        {items.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table className="p2w-table p2w-dv__list">
              <thead>
                <tr>
                  <th>Discount</th><th>Customer</th><th>Car model</th><th>PC</th><th>Outlet</th>
                  <th style={{ textAlign: 'right' }}>Entitled</th>
                  <th style={{ textAlign: 'right' }}>On the invoice</th>
                  <th style={{ textAlign: 'right' }}>Variance</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={`${item.journeyId}-${item.discountKey}`} className={rowClass(item)}>
                    <td>
                      <strong>{item.discount ?? item.discountKey}</strong>
                      <div className="p2w-muted">{STATUS_LABEL[item.status]}</div>
                    </td>
                    <td>
                      <Link to={`/p2/journeys/${item.journeyId}`}>{item.customer}</Link>
                      <div className="p2w-muted">{item.journeyReference}</div>
                    </td>
                    <td>
                      {item.model ?? <span className="p2w-muted">—</span>}
                      {item.variant && <div className="p2w-muted">{item.variant}</div>}
                    </td>
                    <td>{item.pc ?? <span className="p2w-muted">—</span>}</td>
                    <td>{item.outlet ?? <span className="p2w-muted">—</span>}</td>
                    <td className="is-num">{money(item.entitled)}</td>
                    <td className="is-num">{money(item.invoice)}</td>
                    <td className={`is-num ${item.status === 'OVER_ENTITLEMENT' ? 'p2w-dv__over' : item.status === 'UNDER_ENTITLEMENT' ? 'p2w-dv__under' : ''}`}>
                      {signed(item.variance)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
