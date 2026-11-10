import { useEffect } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import '../styles/insights.css';

import PageHeader from '../components/PageHeader';
import { dateTimeLabel, dayLabel, quickRange, shortOutlet, type QuickRange } from '../features/insights/insightFormat';
import { Notes } from '../features/insights/InsightParts';
import { ANALYTICS_REPORTS, reportFromParam } from '../features/insights/reportCatalog';
import CatchmentReport from '../features/insights/reports/CatchmentReport';
import DiscountReport from '../features/insights/reports/DiscountReport';
import FinanceReport from '../features/insights/reports/FinanceReport';
import InsuranceReport from '../features/insights/reports/InsuranceReport';
import PaymentsReport from '../features/insights/reports/PaymentsReport';
import PenetrationReport from '../features/insights/reports/PenetrationReport';
import SalesReport from '../features/insights/reports/SalesReport';
import ScrappageReport from '../features/insights/reports/ScrappageReport';
import { AuditCoreHttpError } from '../services/audit-core/client';
import {
  getInsight, INSIGHT_REPORTS, type InsightByReport, type InsightReport,
} from '../services/audit-core/uc03Insights';
import { useProjectContextStore } from '../store/projectContextStore';
import { useSessionStore } from '../store/sessionStore';

const QUICK: { key: QuickRange; label: string }[] = [
  { key: 'this-month', label: 'This month' },
  { key: 'last-month', label: 'Last month' },
  { key: 'all', label: 'All dates' },
];

function Report({ report, data }: { report: InsightReport; data: InsightByReport[InsightReport] }) {
  switch (report) {
    case 'sales': return <SalesReport data={data as InsightByReport['sales']} />;
    case 'discounts': return <DiscountReport data={data as InsightByReport['discounts']} />;
    case 'penetration': return <PenetrationReport data={data as InsightByReport['penetration']} />;
    case 'insurance': return <InsuranceReport data={data as InsightByReport['insurance']} />;
    case 'finance': return <FinanceReport data={data as InsightByReport['finance']} />;
    case 'scrappage': return <ScrappageReport data={data as InsightByReport['scrappage']} />;
    case 'payments': return <PaymentsReport data={data as InsightByReport['payments']} />;
    default: return <CatchmentReport data={data as InsightByReport['catchment']} />;
  }
}

/** Analytics (rebuilt 2026-11-10, IBM Carbon patterns): eight reports read live from the
 *  bookings and deliveries, one row of filters above everything they scope (dealership,
 *  outlet, booking dates), tiles, ranked bars and sortable tables. For a Team Lead,
 *  Project Manager or Executive, over the outlets they are mapped to. */
export default function AnalyticsPage() {
  const tenantId = useProjectContextStore((state) => state.selectedProject?.tenantId);
  const serviceAudit = useProjectContextStore((state) => state.selectedProject?.auditType === 'SERVICE');
  const accessToken = useSessionStore((state) => state.accessToken);
  const [params, setParams] = useSearchParams();
  const report = reportFromParam(params.get('report'));
  const meta = ANALYTICS_REPORTS[report];
  const filters = {
    dealerId: params.get('dealer') ?? '', outletId: params.get('outlet') ?? '',
    from: params.get('from') ?? '', to: params.get('to') ?? '',
  };

  const query = useQuery({
    queryKey: ['p2-insight', tenantId, report, filters.dealerId, filters.outletId, filters.from, filters.to],
    queryFn: () => getInsight(tenantId!, report, filters, accessToken ?? undefined),
    enabled: Boolean(tenantId && accessToken && !serviceAudit),
    staleTime: 60_000,
    // While a filter or a report changes, the figures on screen stay until the new ones arrive.
    placeholderData: keepPreviousData,
    retry: (failures, error) => !(error instanceof AuditCoreHttpError && [401, 403, 404, 422].includes(error.status)) && failures < 1,
  });
  const data = query.data && query.data.report === report ? query.data : undefined;
  const scope = query.data?.scope;
  const dealers = scope?.dealers ?? [];
  const outlets = dealers.filter((dealer) => !filters.dealerId || dealer.dealerId === filters.dealerId)
    .flatMap((dealer) => dealer.outlets.map((outlet) => ({ ...outlet, dealer: dealer.dealer })));

  const set = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    Object.entries(patch).forEach(([key, value]) => (value ? next.set(key, value) : next.delete(key)));
    setParams(next, { replace: true });
  };

  // An outlet that is not the reader's (an old link): drop the filter and show their own.
  const outletNotFound = query.error instanceof AuditCoreHttpError && query.error.status === 404 && Boolean(filters.outletId);
  useEffect(() => {
    if (outletNotFound) set({ outlet: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outletNotFound]);

  const reportLink = (key: InsightReport) => {
    const next = new URLSearchParams(params);
    if (key === 'sales') next.delete('report');
    else next.set('report', key);
    return `/analytics${next.toString() ? `?${next.toString()}` : ''}`;
  };
  const activeQuick = QUICK.find((quick) => {
    const range = quickRange(quick.key);
    return range.from === filters.from && range.to === filters.to;
  })?.key;
  const forbidden = query.error instanceof AuditCoreHttpError && query.error.status === 403;

  return (
    <div className="ins">
      <PageHeader eyebrow="Analytics" title={meta.title} description={meta.description} />

      <nav className="ins-tabs" aria-label="Analytics reports">
        {INSIGHT_REPORTS.map((key) => (
          <Link key={key} to={reportLink(key)} replace aria-current={key === report ? 'page' : undefined}
                className={key === report ? 'is-selected' : undefined}>
            {ANALYTICS_REPORTS[key].label}
          </Link>
        ))}
      </nav>

      {!tenantId ? (
        <div className="ins-notification">Choose a Project to open its reports.</div>
      ) : serviceAudit ? (
        <div className="ins-notification">These reports cover vehicle sales. This Project is a service audit and has none.</div>
      ) : (
        <>
          <section className="ins-toolbar" aria-label="Filters">
            <div className="ins-field">
              <label htmlFor="ins-dealer">Dealership</label>
              <select id="ins-dealer" value={filters.dealerId} onChange={(event) => set({ dealer: event.target.value || null, outlet: null })}>
                <option value="">All dealerships</option>
                {dealers.map((dealer) => <option key={dealer.dealerId} value={dealer.dealerId}>{dealer.dealer}</option>)}
              </select>
            </div>
            <div className="ins-field">
              <label htmlFor="ins-outlet">Outlet</label>
              <select id="ins-outlet" value={filters.outletId} onChange={(event) => set({ outlet: event.target.value || null })}>
                <option value="">All outlets</option>
                {outlets.map((outlet) => (
                  <option key={outlet.outletId} value={outlet.outletId}>
                    {filters.dealerId ? shortOutlet(outlet.outlet, outlet.dealer) : outlet.outlet}
                  </option>
                ))}
              </select>
            </div>
            <div className="ins-field ins-field--date">
              <label htmlFor="ins-from">Booked from</label>
              <input id="ins-from" type="date" value={filters.from} max={filters.to || undefined}
                     onChange={(event) => set({ from: event.target.value || null })} />
            </div>
            <div className="ins-field ins-field--date">
              <label htmlFor="ins-to">Booked to</label>
              <input id="ins-to" type="date" value={filters.to} min={filters.from || undefined}
                     onChange={(event) => set({ to: event.target.value || null })} />
            </div>
            <div className="ins-quick" role="group" aria-label="Quick date range">
              {QUICK.map((quick) => (
                <button key={quick.key} type="button" aria-pressed={activeQuick === quick.key}
                        className={activeQuick === quick.key ? 'is-selected' : undefined}
                        onClick={() => { const range = quickRange(quick.key); set({ from: range.from || null, to: range.to || null }); }}>
                  {quick.label}
                </button>
              ))}
            </div>
          </section>

          {query.isError && !outletNotFound ? (
            <div className="ins-notification is-error" role="alert">
              {forbidden
                ? 'These reports are for Team Leads, Project Managers and Executives.'
                : <>The report could not be loaded. <button type="button" className="ins-link" onClick={() => void query.refetch()}>Try again</button></>}
            </div>
          ) : null}

          {!data && query.isFetching ? <div className="ins-skeleton" aria-busy="true">Loading the report…</div> : null}

          {data ? (
            <div className={`ins-body${query.isFetching ? ' is-refreshing' : ''}`} aria-busy={query.isFetching}>
              <p className="ins-asof">
                Read from the bookings and deliveries as they stand{dateTimeLabel(data.asOfUtc) ? `, ${dateTimeLabel(data.asOfUtc)}` : ''}.
                {data.period.first ? ` Bookings from ${dayLabel(data.period.first)} to ${dayLabel(data.period.last)}.` : ' No booking matches these filters.'}
                {data.scope.projectWide ? '' : ' Your outlets only.'}
              </p>
              <Report report={report} data={data} />
              <Notes notes={data.notes} />
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
