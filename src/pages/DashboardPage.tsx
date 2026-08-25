import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';

import MetricCard from '../components/MetricCard';
import PageHeader from '../components/PageHeader';
import StatusPill from '../components/StatusPill';
import type { OperatingRole } from '../domain/models';
import {
  getUc03LandingMetrics,
  listUc03WorkItems,
  type Uc03WorkItem,
  type Uc03WorkType,
} from '../services/audit-core/uc03';
import { useProjectContextStore } from '../store/projectContextStore';
import { useSessionStore } from '../store/sessionStore';
import CreateBookingPage from './CreateBookingPage';

const roleLabels: Record<OperatingRole, string> = {
  PC: 'Process Coordinator',
  TL: 'Team Lead',
  PM: 'Project Manager',
  CRM: 'CRM',
  EXECUTIVE: 'Executive',
};

function friendlyStatus(value?: string | null, fallback = 'Not Started'): string {
  if (!value) return fallback;
  return value
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function activityLabel(timestamp: string, timezoneName: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return 'Activity time unavailable';
  return new Intl.DateTimeFormat(undefined, {
    timeZone: timezoneName,
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function StageBlock({ label, item }: { label: string; item: Uc03WorkItem['booking'] }) {
  return (
    <div className="uc03-stage-block">
      <span>{label}</span>
      <strong>{friendlyStatus(item.businessStatus)}</strong>
      <div className="uc03-stage-block__audit">
        <StatusPill value={item.auditState} compact />
        <StatusPill value={item.auditStatus} compact />
      </div>
      {item.businessDate && <small>{item.businessDate}</small>}
    </div>
  );
}

function WorkItemCard({ item, timezoneName }: { item: Uc03WorkItem; timezoneName: string }) {
  const bookingStatus = item.booking.businessStatus;
  const deliveryEligible = Boolean(
    item.delivery.businessStatus
      || bookingStatus === 'BOOKING_STARTED'
      || bookingStatus === 'BOOKING_IN_PROGRESS'
      || bookingStatus === 'BOOKING_CLOSED',
  );

  return (
    <article className="uc03-work-card">
      <header className="uc03-work-card__header">
        <div>
          <span className="uc03-work-card__reference">{item.bookingReference || 'Booking reference pending'}</span>
          <h3>{item.customerDisplayName}</h3>
          <p>{item.productLabel || 'Vehicle details pending'}</p>
        </div>
        <div className="uc03-work-card__flags" aria-label={`${item.openFlagCount} open Audit Flags`}>
          <strong>{item.openFlagCount}</strong>
          <span>open / {item.totalFlagCount} total flags</span>
          {item.highestOpenSeverity && <StatusPill value={item.highestOpenSeverity} compact />}
        </div>
      </header>

      <div className="uc03-work-card__location">
        <span>{item.dealerName}</span><span aria-hidden="true">·</span><span>{item.outletName}</span>
        {item.customerMobileLast4 && <span>Mobile •••• {item.customerMobileLast4}</span>}
      </div>

      <div className="uc03-work-card__stages">
        <StageBlock label="Booking" item={item.booking} />
        <StageBlock label="Delivery" item={item.delivery} />
      </div>

      <footer className="uc03-work-card__footer">
        <div>
          <span>Latest activity {activityLabel(item.latestActivityAtUtc, timezoneName)}</span>
          {item.processingDocumentCount > 0 && (
            <span>{item.processingDocumentCount} document{item.processingDocumentCount === 1 ? '' : 's'} processing</span>
          )}
        </div>
        <div className="uc03-work-card__actions">
          <Link className="uc03-c1-secondary" to={`/bookings/${item.journeyId}`}>Open Booking</Link>
          {deliveryEligible && (
            <Link className="uc03-c1-secondary" to={`/deliveries/${item.journeyId}`}>
              {item.delivery.businessStatus ? 'Open Delivery' : 'Start Delivery'}
            </Link>
          )}
          {(item.booking.businessStatus || item.delivery.businessStatus || item.totalFlagCount > 0) && (
            <Link className="uc03-c1-secondary" to={`/audit/${item.journeyId}`}>Audit &amp; History</Link>
          )}
        </div>
      </footer>
    </article>
  );
}

export default function DashboardPage() {
  const [searchParams] = useSearchParams();
  const project = useProjectContextStore((state) => state.selectedProject);
  const accessToken = useSessionStore((state) => state.accessToken);
  const outletId = useSessionStore((state) => state.outletId);
  const [workType, setWorkType] = useState<Uc03WorkType>('ALL');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [cursor, setCursor] = useState<string>();
  const [previousCursors, setPreviousCursors] = useState<Array<string | undefined>>([]);

  const selectedOutlet = project?.scope.outlets.find((outlet) => outlet.outletId === outletId);
  const pcContextReady = project?.operatingRole !== 'PC' || Boolean(outletId);

  useEffect(() => {
    setCursor(undefined);
    setPreviousCursors([]);
  }, [project?.tenantId, outletId, workType, fromDate, toDate]);

  const metricsQuery = useQuery({
    queryKey: ['uc03-landing-metrics', project?.tenantId, outletId],
    queryFn: () => getUc03LandingMetrics(project!.tenantId, outletId || undefined, accessToken),
    enabled: Boolean(project?.tenantId && accessToken && pcContextReady),
    retry: 1,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const workQuery = useQuery({
    queryKey: ['uc03-work-items', project?.tenantId, outletId, workType, fromDate, toDate, cursor],
    queryFn: () => listUc03WorkItems(
      project!.tenantId,
      {
        workType,
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
        outletId: outletId || undefined,
        cursor,
      },
      accessToken,
    ),
    enabled: Boolean(project?.tenantId && accessToken && pcContextReady),
    retry: 1,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  if (!project) return null;
  if (searchParams.get('action') === 'create-booking' && project.operatingRole === 'PC') {
    return <CreateBookingPage />;
  }

  const metrics = metricsQuery.data;
  const scopeDetail = selectedOutlet
    ? `${selectedOutlet.dealerName} · ${selectedOutlet.outletName}`
    : 'Current authorized Project scope';
  const metricCards = [
    { label: 'Bookings In Progress', value: metrics ? String(metrics.bookingsInProgress) : '—', detail: scopeDetail },
    { label: 'Delivery In Progress', value: metrics ? String(metrics.deliveryInProgress) : '—', detail: scopeDetail },
    { label: 'Needs Attention', value: metrics ? String(metrics.needsAttention) : '—', detail: 'Cases with an open or acknowledged Audit Flag' },
    { label: 'Audit Flags', value: metrics ? String(metrics.auditFlags) : '—', detail: 'Open and acknowledged flags in your scope' },
  ];

  const handleNext = () => {
    const next = workQuery.data?.nextCursor;
    if (!next) return;
    setPreviousCursors((history) => [...history, cursor]);
    setCursor(next);
  };

  const handlePrevious = () => {
    setPreviousCursors((history) => {
      if (history.length === 0) return history;
      const prior = history[history.length - 1];
      setCursor(prior);
      return history.slice(0, -1);
    });
  };

  const invalidDateRange = Boolean(fromDate && toDate && fromDate > toDate);

  return (
    <div className="screen-stack uc03-landing">
      <PageHeader
        eyebrow={roleLabels[project.operatingRole]}
        title={project.projectName}
        description={selectedOutlet
          ? `Booking and Delivery work for ${selectedOutlet.dealerName} · ${selectedOutlet.outletName}.`
          : 'Booking and Delivery work for your current Project and authorized business scope.'}
        actions={project.operatingRole === 'PC' ? (
          <Link className="uc03-landing__capture-action" to="/dashboard?action=create-booking">
            Capture New Booking
          </Link>
        ) : undefined}
      />

      {metricsQuery.isError ? (
        <section className="dashboard-load-state" role="alert">
          <div className="dashboard-load-state__mark" aria-hidden="true">!</div>
          <div className="dashboard-load-state__copy">
            <strong>We couldn't load the Project summary.</strong>
            <p>Please try again. Your work list is kept separate from this summary.</p>
          </div>
          <button type="button" className="user-menu-button" onClick={() => metricsQuery.refetch()}>Try Again</button>
        </section>
      ) : (
        <div className="metric-grid">
          {metricCards.map((metric) => <MetricCard key={metric.label} metric={metric} />)}
        </div>
      )}

      <section className="uc03-work-list" aria-labelledby="uc03-work-list-title">
        <header className="uc03-work-list__heading">
          <div>
            <span>{selectedOutlet ? 'Current Outlet' : 'Current Project'}</span>
            <h2 id="uc03-work-list-title">Latest Bookings &amp; Deliveries</h2>
            <p>Latest meaningful activity first. Up to 10 transactions are loaded at a time.</p>
          </div>
        </header>

        <div className="uc03-work-filters">
          <div className="uc03-work-filter-tabs" role="group" aria-label="Transaction type">
            {(['ALL', 'BOOKING', 'DELIVERY'] as const).map((value) => (
              <button
                type="button"
                key={value}
                className={workType === value ? 'is-active' : ''}
                aria-pressed={workType === value}
                onClick={() => setWorkType(value)}
              >
                {value === 'ALL' ? 'All' : value === 'BOOKING' ? 'Bookings' : 'Deliveries'}
              </button>
            ))}
          </div>
          <label>
            <span>From date</span>
            <input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} />
          </label>
          <label>
            <span>To date</span>
            <input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} />
          </label>
          {(fromDate || toDate) && (
            <button type="button" className="uc03-clear-filter" onClick={() => { setFromDate(''); setToDate(''); }}>
              Clear dates
            </button>
          )}
        </div>

        {invalidDateRange && <p className="uc03-filter-error" role="alert">From date must be on or before To date.</p>}

        {!invalidDateRange && workQuery.isError && (
          <section className="dashboard-load-state" role="alert">
            <div className="dashboard-load-state__mark" aria-hidden="true">!</div>
            <div className="dashboard-load-state__copy">
              <strong>We couldn't load your Booking and Delivery work.</strong>
              <p>Please try again. If the problem continues, contact your Verigence administrator.</p>
            </div>
            <button type="button" className="user-menu-button" onClick={() => workQuery.refetch()}>Try Again</button>
          </section>
        )}

        {!invalidDateRange && workQuery.isPending && (
          <div className="uc03-work-loading" role="status">Loading Booking and Delivery work…</div>
        )}

        {!invalidDateRange && workQuery.data && (
          <>
            <div className="uc03-work-cards">
              {workQuery.data.items.map((item) => (
                <WorkItemCard key={item.journeyId} item={item} timezoneName={workQuery.data.filters.timezoneName} />
              ))}
              {workQuery.data.items.length === 0 && (
                <div className="uc03-work-empty">
                  <strong>No matching Booking or Delivery work.</strong>
                  <p>Create a Booking to begin a new Journey.</p>
                </div>
              )}
            </div>

            <div className="uc03-pagination" aria-label="Work list pages">
              <button type="button" onClick={handlePrevious} disabled={previousCursors.length === 0 || workQuery.isFetching}>
                Previous
              </button>
              <span>{workQuery.data.pageSize} transaction{workQuery.data.pageSize === 1 ? '' : 's'} on this page</span>
              <button type="button" onClick={handleNext} disabled={!workQuery.data.nextCursor || workQuery.isFetching}>
                Next
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
