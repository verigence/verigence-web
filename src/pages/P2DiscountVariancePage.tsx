import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import '../styles/uc03-p2.css';
import '../styles/uc03-p2-excess-discount.css';

import PageHeader from '../components/PageHeader';
import {
  applyFilters, breakdown, dateOf, dealerOf, discountOf, EMPTY_FILTERS, excessOf, filtersFromParams, inView,
  options, outletOf, paramsFromFilters, pcOf, quickRange, sortItems, sourceOf, toCsv, totals,
  viewFromParams, type Bucket, type ExcessFilters, type SortKey, type View,
} from '../features/uc03-p2/excessDiscount/excessDiscount';
import { getDiscountVariance } from '../services/audit-core/uc03DiscountVariance';
import { useProjectContextStore } from '../store/projectContextStore';
import { useSessionStore } from '../store/sessionStore';

const PAGE_SIZES = [25, 50, 100];

/** The three lists (product owner 2026-11-06). */
const VIEWS: { view: View; label: string; amount: string; count: string; empty: string }[] = [
  { view: 'over', label: 'Over entitlement', amount: 'Excess given', count: 'Discounts over entitlement',
    empty: 'No discount given above its entitlement matches these filters.' },
  { view: 'kit', label: 'Kit given as cash', amount: 'Kit given as cash', count: 'Discounts with the kit as cash',
    empty: 'No accessories kit given as cash matches these filters.' },
  { view: 'unknown', label: 'Entitlement unknown', amount: 'Given, nothing to compare with', count: 'Discounts with no master',
    empty: 'Every discount here has a master to compare with.' },
];

function rupees(value: string | number | null | undefined, digits = 0) {
  if (value === null || value === undefined || value === '') return '—';
  const n = Number(value);
  return Number.isNaN(n) ? String(value) : `₹${n.toLocaleString('en-IN', { maximumFractionDigits: digits })}`;
}

/** "Utkal Mahindra - CDA" under "Utkal Mahindra" reads as "CDA". */
function shortOutlet(outlet: string | null, dealer?: string | null) {
  if (!outlet) return '—';
  return dealer && outlet.toLowerCase().startsWith(`${dealer.toLowerCase()} - `) ? outlet.slice(dealer.length + 3) : outlet;
}

function day(value: string | null) {
  if (!value) return '—';
  const d = new Date(`${value}T00:00:00`);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

const FILTER_LABEL: Record<keyof ExcessFilters, string> = {
  basis: 'Date', from: 'From', to: 'To', dealer: 'Dealership', outlet: 'Outlet', discount: 'Discount type', pc: 'PC',
  source: 'Given per', q: 'Search',
};

/** Excess discount (revamped 2026-11-06, IBM Carbon patterns): a filter
 *  toolbar (date, dealership, outlet, discount type, PC, source document),
 *  removable filter tags, KPI tiles and breakdowns that follow the filters, and
 *  a sortable, paged data table with Journey 360 on every row. The figures are
 *  the Excess Discount check's: a discount given above the entitlement, from
 *  the billing document (never the booking form). */
export default function P2DiscountVariancePage() {
  const tenantId = useProjectContextStore((s) => s.selectedProject?.tenantId);
  const accessToken = useSessionStore((s) => s.accessToken);
  const [params, setParams] = useSearchParams();
  const filters = filtersFromParams(params);
  const sortKey = (params.get('sort') as SortKey | null) ?? 'excess';
  const sortDir = params.get('dir') === 'asc' ? 'asc' : 'desc';
  const size = PAGE_SIZES.includes(Number(params.get('size'))) ? Number(params.get('size')) : 25;
  const page = Math.max(1, Number(params.get('page')) || 1);
  const view = viewFromParams(params);
  const meta = VIEWS.find((v) => v.view === view)!;

  const query = useQuery({
    queryKey: ['p2-discount-variance', tenantId, 'all'],
    queryFn: () => getDiscountVariance(tenantId!, { limit: 5000 }, accessToken),
    enabled: Boolean(tenantId && accessToken),
  });

  const all = useMemo(() => inView(query.data?.items ?? [], view), [query.data, view]);
  const shown = useMemo(() => applyFilters(all, filters), [all, filters]);
  const sorted = useMemo(() => sortItems(shown, sortKey, sortDir, filters.basis), [shown, sortKey, sortDir, filters.basis]);
  const pages = Math.max(1, Math.ceil(sorted.length / size));
  const current = Math.min(page, pages);
  const rows = sorted.slice((current - 1) * size, current * size);
  const t = totals(shown);

  // Each list offers what the other filters leave (an outlet follows the dealership).
  const without = (key: keyof ExcessFilters) => applyFilters(all, { ...filters, [key]: '' });
  const dealers = options(without('dealer'), dealerOf);
  const outlets = options(without('outlet'), outletOf);
  const discounts = options(without('discount'), discountOf);
  const pcs = options(without('pc'), pcOf);
  const sources = options(without('source'), sourceOf);

  const setFilters = (patch: Partial<ExcessFilters>) => {
    const next = { ...filters, ...patch };
    if (patch.dealer !== undefined && patch.dealer !== filters.dealer) next.outlet = '';
    setParams(paramsFromFilters(next, params), { replace: true });
  };
  const setParam = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    Object.entries(patch).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)));
    setParams(next, { replace: true });
  };
  const sortBy = (key: SortKey) => setParam({
    sort: key, dir: sortKey === key && sortDir === 'desc' ? 'asc' : 'desc', page: null,
  });
  const active = (Object.keys(EMPTY_FILTERS) as (keyof ExcessFilters)[])
    .filter((k) => k !== 'basis' && filters[k]);

  const exportCsv = () => {
    const blob = new Blob([toCsv(sorted, filters.basis)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `excess-discount-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const header = (key: SortKey, label: string, numeric = false) => (
    <th scope="col" className={numeric ? 'is-num' : undefined}
        aria-sort={sortKey === key ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button type="button" className={`xd-sort${sortKey === key ? ' is-sorted' : ''}`} onClick={() => sortBy(key)}>
        {label}<span aria-hidden="true">{sortKey === key ? (sortDir === 'asc' ? '▲' : '▼') : '↕'}</span>
      </button>
    </th>
  );

  return (
    <div className="p2w xd">
      <PageHeader
        eyebrow="DealGuard"
        title="Excess discount"
        description="Discounts compared line by line with their entitlement, read from the billing document (NDC / cost sheet, or invoice), never the booking form. An accessories kit given as cash, and a discount with no master to compare with, are listed apart."
      />

      {query.isLoading && <div className="xd-skeleton" aria-busy="true">Loading excess discounts…</div>}
      {query.isError && (
        <div className="xd-notification is-error" role="alert">
          The list could not be loaded. <button type="button" className="xd-link" onClick={() => void query.refetch()}>Try again</button>
        </div>
      )}

      {query.data && (
        <>
          {/* Tabs: the three lists, each with what the filters leave */}
          <div className="xd-tabs" role="tablist" aria-label="Which discounts">
            {VIEWS.map((v) => {
              const rowsIn = applyFilters(inView(query.data.items, v.view), filters);
              return (
                <button key={v.view} type="button" role="tab" aria-selected={view === v.view}
                        className={view === v.view ? 'is-selected' : undefined}
                        onClick={() => setParam({ view: v.view === 'over' ? null : v.view, page: null })}>
                  <span>{v.label}</span>
                  <small>{rowsIn.length} · {rupees(rowsIn.reduce((sum, i) => sum + excessOf(i), 0))}</small>
                </button>
              );
            })}
          </div>

          {/* Toolbar: the filters (Carbon data table toolbar + filter row) */}
          <section className="xd-toolbar" aria-label="Filters">
            <div className="xd-toolbar__row">
              <div className="xd-field xd-field--search">
                <label htmlFor="xd-q">Search</label>
                <input id="xd-q" type="search" placeholder="Customer, journey, model, PC" value={filters.q}
                       onChange={(e) => setFilters({ q: e.target.value })} />
              </div>
              <div className="xd-field">
                <span className="xd-label">Date</span>
                <div className="xd-switcher" role="group" aria-label="Date basis">
                  {(['booking', 'delivery'] as const).map((b) => (
                    <button key={b} type="button" aria-pressed={filters.basis === b}
                            className={filters.basis === b ? 'is-selected' : undefined}
                            onClick={() => setFilters({ basis: b })}>
                      {b === 'booking' ? 'Booking date' : 'Delivery date'}
                    </button>
                  ))}
                </div>
              </div>
              <div className="xd-field xd-field--date">
                <label htmlFor="xd-from">From</label>
                <input id="xd-from" type="date" value={filters.from} max={filters.to || undefined}
                       onChange={(e) => setFilters({ from: e.target.value })} />
              </div>
              <div className="xd-field xd-field--date">
                <label htmlFor="xd-to">To</label>
                <input id="xd-to" type="date" value={filters.to} min={filters.from || undefined}
                       onChange={(e) => setFilters({ to: e.target.value })} />
              </div>
              <div className="xd-quick" role="group" aria-label="Quick date range">
                {([['this-month', 'This month'], ['last-month', 'Last month'], ['last-30', 'Last 30 days']] as const).map(([k, label]) => (
                  <button key={k} type="button" className="xd-ghost" onClick={() => setFilters(quickRange(k))}>{label}</button>
                ))}
              </div>
            </div>
            <div className="xd-toolbar__row">
              <Select id="xd-dealer" label="Dealership" value={filters.dealer} values={dealers} all="All dealerships"
                      onChange={(v) => setFilters({ dealer: v })} />
              <Select id="xd-outlet" label="Outlet" value={filters.outlet} values={outlets} all="All outlets"
                      onChange={(v) => setFilters({ outlet: v })} />
              <Select id="xd-discount" label="Discount type" value={filters.discount} values={discounts} all="All discount types"
                      onChange={(v) => setFilters({ discount: v })} />
              <Select id="xd-pc" label="PC" value={filters.pc} values={pcs} all="All PCs"
                      onChange={(v) => setFilters({ pc: v })} />
              <Select id="xd-source" label="Given per" value={filters.source} values={sources} all="Any document"
                      onChange={(v) => setFilters({ source: v })} />
            </div>
            {active.length > 0 && (
              <div className="xd-tags" aria-label="Active filters">
                {active.map((k) => (
                  <span key={k} className="xd-tag">
                    {FILTER_LABEL[k]}: {k === 'from' || k === 'to' ? day(filters[k]) : filters[k]}
                    {k === 'from' || k === 'to' ? ` (${filters.basis} date)` : ''}
                    <button type="button" aria-label={`Remove ${FILTER_LABEL[k]} filter`} onClick={() => setFilters({ [k]: '' })}>×</button>
                  </span>
                ))}
                <button type="button" className="xd-link" onClick={() => setParams(paramsFromFilters({ ...EMPTY_FILTERS, basis: filters.basis }, params), { replace: true })}>
                  Clear filters
                </button>
              </div>
            )}
          </section>

          {/* KPI tiles */}
          <section className="xd-tiles" aria-label="Totals">
            <div className={`xd-tile${view === 'over' ? ' is-danger' : ''}`}><span className="xd-tile__label">{meta.amount}</span><strong>{rupees(t.excess)}</strong></div>
            <div className="xd-tile"><span className="xd-tile__label">Bookings</span><strong>{t.bookings}</strong></div>
            <div className="xd-tile"><span className="xd-tile__label">{meta.count}</span><strong>{t.discounts}</strong></div>
            <div className="xd-tile">
              <span className="xd-tile__label">Largest single amount</span>
              <strong>{t.largest ? rupees(excessOf(t.largest)) : '—'}</strong>
              {t.largest ? (
                <Link className="xd-link" to={`/p2/journeys/${t.largest.journeyId}/overview?tab=deal`}>
                  {t.largest.customer ?? t.largest.journeyReference}
                </Link>
              ) : null}
            </div>
          </section>

          {/* Breakdowns: each row applies its filter */}
          {shown.length > 0 && (
            <section className="xd-breakdowns" aria-label="Where the excess went">
              <Breakdown title="By discount type" buckets={breakdown(shown, discountOf)} selected={filters.discount}
                         onPick={(v) => setFilters({ discount: filters.discount === v ? '' : v })} />
              <Breakdown title="By dealership" buckets={breakdown(shown, dealerOf)} selected={filters.dealer}
                         onPick={(v) => setFilters({ dealer: filters.dealer === v ? '' : v })} />
              <Breakdown title="By outlet" buckets={breakdown(shown, outletOf)} selected={filters.outlet}
                         onPick={(v) => setFilters({ outlet: filters.outlet === v ? '' : v })} />
            </section>
          )}

          {/* Data table */}
          <section className="xd-table-card" aria-label="Excess discounts">
            <div className="xd-table-card__head">
              <div>
                <h2>{meta.label}</h2>
                <p>{sorted.length} of {all.length} · sorted by {sortKey === 'excess' ? 'amount' : sortKey}, {sortDir === 'desc' ? 'high to low' : 'low to high'}</p>
              </div>
              <button type="button" className="xd-button xd-button--tertiary" onClick={exportCsv} disabled={!sorted.length}>Export CSV</button>
            </div>
            {sorted.length === 0 ? (
              <div className="xd-empty">
                <strong>{meta.empty}</strong>
                {active.length ? <button type="button" className="xd-link" onClick={() => setParams(new URLSearchParams(), { replace: true })}>Clear filters</button> : null}
              </div>
            ) : (
              <div className="xd-table-wrap">
                <table className="xd-table">
                  <thead>
                    <tr>
                      {header('date', filters.basis === 'delivery' ? 'Delivery' : 'Booking')}
                      {header('customer', 'Customer')}
                      {header('dealer', 'Dealership · outlet')}
                      {header('pc', 'PC')}
                      {header('model', 'Vehicle')}
                      {header('discount', 'Discount type')}
                      {view === 'unknown' ? <th scope="col">Why there is nothing to compare with</th> : header('entitled', 'Entitled', true)}
                      {header('given', 'Given', true)}
                      {view === 'unknown' ? null : header('excess', view === 'kit' ? 'Kit as cash' : 'Excess', true)}
                      <th scope="col" aria-label="Open" />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((item) => (
                      <tr key={`${item.journeyId}-${item.discountKey}-${item.status}`}>
                        <td data-label="Date" className="xd-nowrap">{day(dateOf(item, filters.basis))}</td>
                        <td data-label="Customer">
                          <span className="xd-primary">{item.customer ?? '—'}</span>
                          <span className="xd-secondary">{item.journeyReference}</span>
                        </td>
                        <td data-label="Dealership · outlet">
                          <span className="xd-primary">{item.dealer ?? '—'}</span>
                          <span className="xd-secondary">{shortOutlet(item.outlet, item.dealer)}</span>
                        </td>
                        <td data-label="PC">{item.pc ?? '—'}</td>
                        <td data-label="Vehicle">
                          <span className="xd-primary">{item.model ?? '—'}</span>
                          {item.variant ? <span className="xd-secondary">{item.variant}</span> : null}
                        </td>
                        <td data-label="Discount type"><span className="xd-type">{discountOf(item)}</span></td>
                        {view === 'unknown'
                          ? <td data-label="Why unknown" className="xd-reason">{item.reason ?? 'The entitlement is not known.'}</td>
                          : <td data-label="Entitled" className="is-num">{rupees(item.entitled, 2)}</td>}
                        <td data-label="Given" className="is-num">
                          {rupees(item.invoice, 2)}
                          {item.givenDocument ? <span className="xd-secondary">{item.givenDocument}</span> : null}
                        </td>
                        {view === 'unknown' ? null : (
                          <td data-label={view === 'kit' ? 'Kit as cash' : 'Excess'} className={`is-num ${view === 'kit' ? 'xd-kit' : 'xd-excess'}`}>
                            {rupees(excessOf(item), 2)}
                          </td>
                        )}
                        <td className="xd-actions">
                          <Link className="xd-button xd-button--ghost" to={`/p2/journeys/${item.journeyId}/overview?tab=deal`}
                                aria-label={`Open Journey 360 for ${item.customer ?? item.journeyReference}`}>
                            Journey 360 →
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {sorted.length > 0 && (
              <div className="xd-pagination">
                <label>
                  Items per page
                  <select value={size} onChange={(e) => setParam({ size: e.target.value, page: null })}>
                    {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </label>
                <span>{(current - 1) * size + 1}–{Math.min(current * size, sorted.length)} of {sorted.length}</span>
                <span className="xd-pagination__pages">
                  <button type="button" aria-label="Previous page" disabled={current <= 1}
                          onClick={() => setParam({ page: String(current - 1) })}>‹</button>
                  <span>Page {current} of {pages}</span>
                  <button type="button" aria-label="Next page" disabled={current >= pages}
                          onClick={() => setParam({ page: String(current + 1) })}>›</button>
                </span>
              </div>
            )}
            {query.data.notYetCalculated > 0 && (
              <p className="xd-footnote">{query.data.notYetCalculated} bookings are still being calculated and are not in this list yet.</p>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function Select({ id, label, value, values, all, onChange }: {
  id: string; label: string; value: string; values: string[]; all: string; onChange: (v: string) => void;
}) {
  return (
    <div className="xd-field">
      <label htmlFor={id}>{label}</label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{all}</option>
        {values.map((v) => <option key={v} value={v}>{v}</option>)}
      </select>
    </div>
  );
}

function Breakdown({ title, buckets, selected, onPick }: {
  title: string; buckets: Bucket[]; selected: string; onPick: (v: string) => void;
}) {
  const top = buckets.slice(0, 6);
  const max = Math.max(...top.map((b) => b.excess), 1);
  return (
    <div className="xd-breakdown">
      <h3>{title}</h3>
      <ul>
        {top.map((b) => (
          <li key={b.name}>
            <button type="button" className={selected === b.name ? 'is-selected' : undefined} onClick={() => onPick(b.name)}
                    aria-pressed={selected === b.name}>
              <span className="xd-breakdown__name">{b.name}</span>
              <span className="xd-breakdown__value">{rupees(b.excess)}<small>{b.discounts} discount{b.discounts === 1 ? '' : 's'} · {b.bookings} booking{b.bookings === 1 ? '' : 's'}</small></span>
              <span className="xd-breakdown__bar" aria-hidden="true"><span style={{ width: `${(b.excess / max) * 100}%` }} /></span>
            </button>
          </li>
        ))}
      </ul>
      {buckets.length > top.length ? <p className="xd-footnote">+ {buckets.length - top.length} more: use the filter above.</p> : null}
    </div>
  );
}
