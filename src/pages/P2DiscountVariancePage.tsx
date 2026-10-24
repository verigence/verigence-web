import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import '../styles/uc03-p2.css';
import '../styles/uc03-p2-discount-variance.css';

import PageHeader from '../components/PageHeader';
import SectionCard from '../components/SectionCard';
import { getDiscountVariance, type DiscountVarianceItem } from '../services/audit-core/uc03DiscountVariance';
import { useProjectContextStore } from '../store/projectContextStore';
import { useSessionStore } from '../store/sessionStore';

type Facet = 'discount' | 'outlet' | 'pc';
interface Pick { facet: Facet; value: string }

const FACETS: { facet: Facet; title: string; of: (i: DiscountVarianceItem) => string }[] = [
  { facet: 'discount', title: 'By discount category', of: (i) => i.discount ?? i.discountKey },
  { facet: 'outlet', title: 'By outlet', of: (i) => i.outlet ?? 'Outlet not recorded' },
  { facet: 'pc', title: 'By PC', of: (i) => i.pc ?? 'PC not recorded' },
];

function rupees(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === '') return '—';
  const n = Number(value);
  return Number.isNaN(n) ? String(value) : `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

function ranked(items: DiscountVarianceItem[], of: (i: DiscountVarianceItem) => string) {
  const totals = new Map<string, { excess: number; discounts: number }>();
  for (const item of items) {
    const key = of(item);
    const entry = totals.get(key) ?? { excess: 0, discounts: 0 };
    entry.excess += Number(item.variance);
    entry.discounts += 1;
    totals.set(key, entry);
  }
  return [...totals.entries()].map(([name, v]) => ({ name, ...v })).sort((a, b) => b.excess - a.excess);
}

/** Excess discount: what the invoice gave above the entitlement, per booking
 *  that has an invoice. Never the booking form's figure. */
export default function P2DiscountVariancePage() {
  const tenantId = useProjectContextStore((s) => s.selectedProject?.tenantId);
  const accessToken = useSessionStore((s) => s.accessToken);
  const [pick, setPick] = useState<Pick | null>(null);

  const query = useQuery({
    queryKey: ['p2-discount-variance', tenantId],
    queryFn: () => getDiscountVariance(tenantId!, { limit: 1000 }, accessToken),
    enabled: Boolean(tenantId && accessToken),
  });

  const excess = useMemo(
    () => (query.data?.items ?? [])
      .filter((i) => i.status === 'OVER_ENTITLEMENT' && i.variance !== null)
      .sort((a, b) => Number(b.variance) - Number(a.variance)),
    [query.data],
  );
  const shown = useMemo(() => {
    if (!pick) return excess;
    const of = FACETS.find((f) => f.facet === pick.facet)!.of;
    return excess.filter((i) => of(i) === pick.value);
  }, [excess, pick]);

  const totalExcess = excess.reduce((sum, i) => sum + Number(i.variance), 0);
  const bookings = new Set(excess.map((i) => i.journeyId)).size;
  const counts = query.data?.counts;

  return (
    <div className="p2w">
      <PageHeader
        eyebrow="DealGuard"
        title="Excess discount"
        description="Discounts on the invoice that are more than the booking was entitled to. Only bookings with an invoice whose vehicle price was read are counted, and the figures are the invoice's, never the booking form's."
      />

      {query.isLoading && <p className="p2w-muted">Reading…</p>}
      {query.isError && <p className="p2w-danger">That could not be read. Reload the page.</p>}

      {query.data && (
        <>
          <SectionCard title="Where excess discount was given">
            <div className="p2w-dv__tiles">
              <div className="p2w-dv__tile is-worst">
                <span className="p2w-dv__count">{rupees(totalExcess)}</span>
                <span>Excess given in total</span>
              </div>
              <div className="p2w-dv__tile">
                <span className="p2w-dv__count">{bookings}</span>
                <span>Bookings with excess</span>
              </div>
              <div className="p2w-dv__tile">
                <span className="p2w-dv__count">{excess.length}</span>
                <span>Discounts over entitlement</span>
              </div>
            </div>
            {excess.length > 0 && (
              <div className="p2w-dv__facets">
                {FACETS.map(({ facet, title, of }) => (
                  <div key={facet} className="p2w-dv__facet">
                    <h4>{title}</h4>
                    <ul>
                      {ranked(excess, of).slice(0, 8).map((row) => {
                        const active = pick?.facet === facet && pick.value === row.name;
                        return (
                          <li key={row.name}>
                            <button type="button" className={active ? 'is-active' : undefined}
                                    onClick={() => setPick(active ? null : { facet, value: row.name })}>
                              <span>{row.name}</span>
                              <span>{rupees(row.excess)} · {row.discounts}</span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>

          <SectionCard title={pick ? `Excess discount · ${pick.value}` : 'Every excess discount, largest first'}>
            {pick && (
              <p><button type="button" className="p2w-link" onClick={() => setPick(null)}>Show all</button></p>
            )}
            {shown.length === 0 && <p className="p2w-muted">No excess discount on any invoice.</p>}
            {shown.length > 0 && (
              <div style={{ overflowX: 'auto' }}>
                <table className="p2w-table p2w-dv__list">
                  <thead>
                    <tr>
                      <th>Discount</th><th>Customer</th><th>Car model</th><th>PC</th><th>Outlet</th>
                      <th style={{ textAlign: 'right' }}>Entitled</th>
                      <th style={{ textAlign: 'right' }}>On the invoice</th>
                      <th style={{ textAlign: 'right' }}>Excess</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((item) => (
                      <tr key={`${item.journeyId}-${item.discountKey}`}>
                        <td><strong>{item.discount ?? item.discountKey}</strong></td>
                        <td>
                          <Link to={`/p2/journeys/${item.journeyId}/overview`}>{item.customer}</Link>
                          <div className="p2w-muted">{item.journeyReference}</div>
                        </td>
                        <td>
                          {item.model ?? <span className="p2w-muted">—</span>}
                          {item.variant && <div className="p2w-muted">{item.variant}</div>}
                        </td>
                        <td>{item.pc ?? <span className="p2w-muted">—</span>}</td>
                        <td>{item.outlet ?? <span className="p2w-muted">—</span>}</td>
                        <td className="is-num">{rupees(item.entitled)}</td>
                        <td className="is-num">{rupees(item.invoice)}</td>
                        <td className="is-num p2w-dv__over">{rupees(item.variance)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {counts && (counts.unknown > 0 || counts.under > 0) && (
              <p className="p2w-muted">
                Not shown: {counts.unknown} discounts on invoices with no entitlement to compare against, and{' '}
                {counts.under} given below entitlement.
              </p>
            )}
            {query.data.notYetCalculated > 0 && (
              <p className="p2w-muted">{query.data.notYetCalculated} bookings are still being calculated.</p>
            )}
          </SectionCard>
        </>
      )}
    </div>
  );
}
