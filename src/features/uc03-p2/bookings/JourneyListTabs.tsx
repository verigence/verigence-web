import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';

import JourneyRow from './JourneyRow';
import { panelSelection } from './listSelection';
import {
  getP2JourneyCounts,
  getP2JourneyPage,
  type P2JourneyBreakdownRow,
  type P2JourneyCounts,
  type P2JourneyFilters,
  type P2JourneySort,
  type P2JourneyView,
} from '../../../services/audit-core/uc03P2';

/**
 * The journey list, split into tabs and paged on the server (50 at a time):
 * about 1,200 journeys a month no longer load into the browser at once
 * (product owner 2026-10-20). A PC works their own outlets, action first; a
 * TL / PM works exceptions first, with every outlet's and PC's open,
 * overdue and high-risk counts one click from the list.
 */
const PC_TABS: { view: P2JourneyView; label: string; hint: string }[] = [
  { view: 'needs_action', label: 'Needs my action', hint: 'Open journeys with a PC task, oldest due first.' },
  { view: 'processing', label: 'Processing', hint: 'Pages still being read or retried: nothing for you to do yet.' },
  { view: 'with_tl', label: 'With TL', hint: 'Waiting on a TL decision.' },
  { view: 'closed', label: 'Closed', hint: 'Delivered or cancelled.' },
  { view: 'all', label: 'All', hint: 'Every journey in your outlets.' },
];
const TL_TABS: { view: P2JourneyView; label: string; hint: string }[] = [
  { view: 'needs_tl', label: 'Needs TL decision', hint: 'Open journeys with a TL / PM task, oldest due first.' },
  { view: 'high_risk', label: 'High risk', hint: 'An open Critical or High finding: duplicate, price variance, dates.' },
  { view: 'overdue', label: 'Overdue', hint: 'A task past its due time.' },
  { view: 'stuck', label: 'Stuck', hint: 'A page failed to process or a scan was rejected and not re-uploaded.' },
  { view: 'all', label: 'All', hint: 'Every journey in your scope.' },
  { view: 'closed', label: 'Closed', hint: 'Delivered or cancelled.' },
];

/** The last twelve months, newest first, as YYYY-MM. */
function recentMonths(): { value: string; label: string }[] {
  const now = new Date();
  return Array.from({ length: 12 }, (_, i) => {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    return { value, label: date.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }) };
  });
}

type Props = {
  tenantId: string | undefined;
  accessToken: string | undefined;
  role: string | undefined;
  /** Counts for the page header ("n things need you"). */
  onCounts?: (counts: P2JourneyCounts | undefined) => void;
};

export default function JourneyListTabs({ tenantId, accessToken, role, onCounts }: Props) {
  const supervisor = role === 'TL' || role === 'PM' || role === 'EXECUTIVE';
  const tabs = supervisor ? TL_TABS : PC_TABS;
  const [view, setView] = useState<P2JourneyView>(tabs[0].view);
  const [search, setSearch] = useState('');
  const [month, setMonth] = useState('');
  const [outletId, setOutletId] = useState('');
  const [pcActorId, setPcActorId] = useState('');
  // A TL / PM reads the list Outlet by Outlet unless they ask for the most
  // urgent first (product owner 2026-10-23); a PC keeps the tab's own order.
  const [sort, setSort] = useState<P2JourneySort>(supervisor ? 'outlet' : 'priority');
  const deferredSearch = useDeferredValue(search);
  const months = useMemo(recentMonths, []);
  const monthApplies = view === 'closed' || view === 'all';
  const filters: P2JourneyFilters = {
    search: deferredSearch,
    month: monthApplies ? month : '',
    outletId,
    pcActorId,
  };
  const enabled = Boolean(tenantId && accessToken);

  // The summary cards, the Outlet-wise / PC-wise panels and the filter
  // choices are the whole picture and never change with the filters; the
  // filters narrow the tabs' counts and the list only (product owner
  // 2026-10-20: "the filter should be only for the list").
  const overview = useQuery({
    queryKey: ['p2-journey-counts', tenantId, 'overview', supervisor],
    queryFn: () => getP2JourneyCounts(tenantId!, accessToken, { search: '', month: '', outletId: '', pcActorId: '' }, supervisor),
    enabled,
    staleTime: 15_000,
  });
  const counts = useQuery({
    queryKey: ['p2-journey-counts', tenantId, filters, false],
    queryFn: () => getP2JourneyCounts(tenantId!, accessToken, filters, false),
    enabled,
    staleTime: 15_000,
  });
  useEffect(() => { onCounts?.(overview.data?.counts); }, [overview.data, onCounts]);

  const list = useInfiniteQuery({
    queryKey: ['p2-journey-page', tenantId, view, filters, sort],
    queryFn: ({ pageParam }) => getP2JourneyPage(tenantId!, accessToken, view, filters, pageParam, 50, sort),
    initialPageParam: 0,
    getNextPageParam: (last) => last.nextOffset ?? undefined,
    enabled,
    staleTime: 15_000,
  });
  const items = useMemo(() => (list.data?.pages ?? []).flatMap((page) => page.items), [list.data]);
  const c = counts.data?.counts;
  const all = overview.data?.counts;
  const tab = tabs.find((t) => t.view === view) ?? tabs[0];
  const filtered = Boolean(search.trim() || (monthApplies && month) || outletId || pcActorId);

  useEffect(() => {
    const close = (event: MouseEvent) => {
      document.querySelectorAll<HTMLDetailsElement>('details.p2w-menu[open]').forEach((menu) => {
        if (!menu.contains(event.target as Node)) menu.removeAttribute('open');
      });
    };
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, []);

  const clear = () => { setSearch(''); setMonth(''); setOutletId(''); setPcActorId(''); };
  // A click on an Outlet-wise / PC-wise row shows that Outlet's or PC's complete list.
  const pickOutlet = (key: string) => {
    const next = panelSelection(outletId, key, view);
    setOutletId(next.key);
    setView(next.view);
  };
  const pickPc = (key: string) => {
    const next = panelSelection(pcActorId, key, view);
    setPcActorId(next.key);
    setView(next.view);
  };

  return (
    <div className="p2w-jtabs">
      {supervisor && all ? (
        <section className="uc03-tl-metrics" aria-label="Summary">
          <Metric label="All journeys" value={all.all} detail={`${all.open} open`} />
          <Metric label="Bookings open" value={all.booking_open} detail="Booking documents and checks" />
          <Metric label="Deliveries open" value={all.delivery_open} detail="Delivery work underway" />
          <Metric label="Closed" value={all.closed} detail="Delivered or cancelled" />
          <Metric label="Needs TL decision" value={all.needs_tl} detail={`${all.overdue} overdue · ${all.high_risk} high risk`} />
        </section>
      ) : null}
      {supervisor && overview.data?.byOutlet ? (
        <div className="uc03-tl-breakdown-grid">
          <BreakdownPanel
            title="Outlet-wise"
            rows={overview.data.byOutlet.map((o) => ({ key: o.outlet_id, label: o.outlet_name ?? o.outlet_code ?? 'Outlet',
              secondary: o.outlet_code ?? undefined, ...o }))}
            selectedKey={outletId}
            onSelect={pickOutlet}
          />
          <BreakdownPanel
            title="PC-wise"
            rows={(overview.data.byPc ?? []).map((p) => ({ key: p.pc_actor_id ?? '', label: p.pc_name || 'PC not recorded', ...p }))}
            selectedKey={pcActorId}
            onSelect={pickPc}
          />
        </div>
      ) : null}

      <div className="p2w-jtabs__bar" role="tablist" aria-label="Journeys">
        {tabs.map((t) => (
          <button
            key={t.view}
            type="button"
            role="tab"
            aria-selected={view === t.view}
            className={view === t.view ? 'is-active' : undefined}
            onClick={() => setView(t.view)}
          >
            {t.label}
            <b>{c ? c[t.view as keyof P2JourneyCounts] ?? 0 : '—'}</b>
          </button>
        ))}
      </div>

      <div className="p2w-listbar p2w-jtabs__filters">
        <label className="p2w-search">
          <span className="p2w-visually-hidden">Search</span>
          <input type="search" value={search} onChange={(event) => setSearch(event.target.value)}
            placeholder="Customer, mobile last 4, vehicle, outlet or Journey ID" />
        </label>
        {monthApplies ? (
          <label className="p2w-jtabs__select">
            <span>Started in</span>
            <select value={month} onChange={(event) => setMonth(event.target.value)}>
              <option value="">Any month</option>
              {months.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </label>
        ) : null}
        {supervisor ? (
          <>
            <label className="p2w-jtabs__select">
              <span>Outlet</span>
              <select value={outletId} onChange={(event) => setOutletId(event.target.value)}>
                <option value="">All outlets</option>
                {(overview.data?.byOutlet ?? []).map((o) => (
                  <option key={o.outlet_id} value={o.outlet_id}>{o.outlet_name ?? o.outlet_code ?? 'Outlet'}</option>
                ))}
              </select>
            </label>
            <label className="p2w-jtabs__select">
              <span>PC</span>
              <select value={pcActorId} onChange={(event) => setPcActorId(event.target.value)}>
                <option value="">All PCs</option>
                {(overview.data?.byPc ?? []).filter((p) => p.pc_actor_id).map((p) => (
                  <option key={p.pc_actor_id!} value={p.pc_actor_id!}>{p.pc_name || 'PC not named'}</option>
                ))}
              </select>
            </label>
          </>
        ) : null}
        {supervisor ? (
          <label className="p2w-jtabs__select">
            <span>Sort</span>
            <select value={sort} onChange={(event) => setSort(event.target.value as P2JourneySort)}>
              <option value="outlet">By outlet</option>
              <option value="priority">Most urgent first</option>
            </select>
          </label>
        ) : null}
        {filtered ? <button type="button" className="p2w-link" onClick={clear}>Clear filters</button> : null}
        {list.isFetching && !list.isFetchingNextPage ? <span className="p2w-muted">Loading…</span> : null}
      </div>

      <p className="p2w-muted p2w-jtabs__hint">{tab.hint}</p>

      {list.isError ? (
        <div className="p2w-alert p2w-alert--error" role="alert">
          <span>
            Journeys could not be loaded.
            {list.error instanceof Error && list.error.message ? <small>{list.error.message}</small> : null}
          </span>
          <button type="button" className="p2w-link" onClick={() => void list.refetch()} disabled={list.isFetching}>
            {list.isFetching ? 'Trying…' : 'Try again'}
          </button>
        </div>
      ) : null}

      {items.length ? (
        <table className="p2w-jtable">
          <thead><tr><th className="col-customer">Customer</th><th className="col-price">Price variance</th><th className="col-stage">{role === 'PC' ? 'Stage' : 'PC · Outlet'}</th><th className="col-next">Open tasks</th><th className="col-when">Deal period</th><th className="col-journey">Audit record</th><th className="col-act"><span className="p2w-visually-hidden">Actions</span></th></tr></thead>
          <tbody>
            {items.map((item) => <JourneyRow key={item.journey_id} item={item} role={role} />)}
          </tbody>
        </table>
      ) : null}
      {list.isLoading ? <div className="p2w-skeleton">Loading…</div> : null}
      {!list.isLoading && !items.length && !list.isError ? (
        <p className="p2w-empty">{filtered ? 'No journeys in this tab match these filters.' : 'Nothing here right now.'}</p>
      ) : null}

      {items.length ? (
        <div className="p2w-jtabs__more">
          <span className="p2w-muted">
            Showing {items.length}{c ? ` of ${c[view as keyof P2JourneyCounts] ?? items.length}` : ''}
          </span>
          {list.hasNextPage ? (
            <button type="button" className="p2w-button p2w-button--secondary" onClick={() => void list.fetchNextPage()}
              disabled={list.isFetchingNextPage}>
              {list.isFetchingNextPage ? 'Loading…' : 'Load 50 more'}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function Metric({ label, value, detail }: { label: string; value: number; detail: string }) {
  return (
    <article className="uc03-tl-metric">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}

type BreakdownRow = P2JourneyBreakdownRow & { key: string; label: string; secondary?: string };

/** Outlet-wise / PC-wise: every journey, split Booking / Delivery / Closed; a
 * click filters the list below (the TL overview's own panels). */
function BreakdownPanel({ title, rows, selectedKey, onSelect }: {
  title: string; rows: BreakdownRow[]; selectedKey: string; onSelect: (key: string) => void;
}) {
  return (
    <section className="uc03-tl-panel">
      <header className="uc03-tl-panel__header">
        <div>
          <h2>{title}</h2>
          <p>Click a row to see its complete list below.</p>
        </div>
        {selectedKey && <button type="button" onClick={() => onSelect('')}>Clear</button>}
      </header>
      <div className="uc03-tl-breakdown">
        {rows.map((row) => (
          <button
            type="button"
            key={row.key || row.label}
            className={selectedKey && selectedKey === row.key ? 'is-selected' : ''}
            disabled={!row.key}
            onClick={() => onSelect(selectedKey === row.key ? '' : row.key)}
          >
            <span className="uc03-tl-breakdown__identity">
              <strong>{row.label}</strong>
              {row.secondary && <small>{row.secondary}</small>}
            </span>
            <span className="uc03-tl-breakdown__total">{row.total}</span>
            <span className="uc03-tl-breakdown__mix">
              <small title="Bookings open">B {row.booking_open}</small>
              <small title="Deliveries open">D {row.delivery_open}</small>
              <small title="Closed">✓ {row.closed}</small>
              {row.overdue ? <small className="is-overdue" title="Overdue">! {row.overdue}</small> : null}
            </span>
          </button>
        ))}
        {rows.length === 0 && <p className="uc03-tl-empty-inline">No journeys in this scope.</p>}
      </div>
    </section>
  );
}
