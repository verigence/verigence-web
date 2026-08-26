import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

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
import {
  listReviewPending,
  type ReviewPendingItem,
} from '../services/audit-core/uc03PcVerification';
import { useProjectContextStore } from '../store/projectContextStore';
import { useSessionStore } from '../store/sessionStore';

const roleLabels: Record<OperatingRole, string> = {
  PC: 'Process Coordinator',
  TL: 'Team Lead',
  PM: 'Project Manager',
  CRM: 'CRM',
  EXECUTIVE: 'Executive',
};

type LandingView = Uc03WorkType | 'REVIEW_PENDING';

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
          <Link className="uc03-c1-secondary" to={`/bookings/${item.journeyId}`}>
            {item.booking.businessStatus ? 'Open Booking' : 'Start Booking'}
          </Link>
          {deliveryEligible && (
            <Link className="uc03-c1-secondary" to={`/deliveries/${item.journeyId}`}>
              {item.delivery.businessStatus ? 'Open Delivery' : 'Start Delivery'}
            </Link>
          )}
          {(item.booking.businessStatus || item.delivery.businessStatus || item.totalFlagCount > 0) && (
            <Link className="uc03-c1-secondary" to={`/audit/${item.journeyId}`}>
              Audit &amp; History
            </Link>
          )}
        </div>
      </footer>
    </article>
  );
}

function ReviewPendingCard({ item, timezoneName }: { item: ReviewPendingItem; timezoneName: string }) {
  return (
    <article className="uc03-work-card">
      <header className="uc03-work-card__header">
        <div>
          <span className="uc03-work-card__reference">{item.bookingReference || 'Booking reference pending'}</span>
          <h3>{item.customerDisplayName}</h3>
          <p>{item.productLabel || 'Vehicle details pending'}</p>
        </div>
        <div className="uc03-work-card__flags">
          <StatusPill value="PENDING" compact />
          <span>PC verification</span>
        </div>
      </header>

      <div className="uc03-work-card__location">
        <span>{item.dealerName}</span><span aria-hidden="true">·</span><span>{item.outletName}</span>
      </div>

      <div className="uc03-work-card__stages">
        <div className="uc03-stage-block">
          <span>Booking status</span>
          <strong>{friendlyStatus(item.bookingBusinessStatus)}</strong>
        </div>
        <div className="uc03-stage-block">
          <span>PC verification</span>
          <strong>Review Pending</strong>
          <div className="uc03-stage-block__audit"><StatusPill value="PENDING" compact /></div>
        </div>
      </div>

      <footer className="uc03-work-card__footer">
        <div>
          <span>Capture submitted {activityLabel(item.captureCompletedAtUtc, timezoneName)}</span>
          <span>DI readiness is checked only when Review is opened.</span>
        </div>
        <div className="uc03-work-card__actions">
          <Link className="uc03-c1-primary" to={`/bookings/${item.journeyId}/review`}>Review Documents</Link>
          <Link className="uc03-c1-secondary" to={`/bookings/${item.journeyId}`}>Open Booking</Link>
        </div>
      </footer>
    </article>
  );
}

export default function DashboardPage() {
  const project = useProjectContextStore((state) => state.selectedProject);
  const accessToken = useSessionStore((state) => state.accessToken);
  const [view, setView] = useState<LandingView>('ALL');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [cursor, setCursor] = useState<string>();
  const [previousCursors, setPreviousCursors] = useState<Array<string | undefined>>([]);

  const pcView = project?.operatingRole === 'PC';
  const workType: Uc03WorkType = view === 'REVIEW_PENDING' ? 'ALL' : view;

  useEffect(() => {
    setCursor(undefined);
    setPreviousCursors([]);
  }, [project?.tenantId, view, fromDate, toDate]);

  const metricsQuery = useQuery({
    queryKey: ['uc03-landing-metrics', project?.tenantId],
    queryFn: () => getUc03LandingMetrics(project!.tenantId, accessToken),
    enabled: Boolean(project?.tenantId && accessToken),
    retry: 1,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const reviewPendingQuery = useQuery({
    queryKey: ['uc03-review-pending', project?.tenantId],
    queryFn: () => listReviewPending(project!.tenantId, accessToken),
    enabled: Boolean(pcView && project?.tenantId && accessToken),
    retry: 1,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });

  const workQuery = useQuery({
    queryKey: ['uc03-work-items', project?.tenantId, workType, fromDate, toDate, cursor],
    queryFn: () => listUc03WorkItems(
      project!.tenantId,
      {
        workType,
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
        cursor,
      },
      accessToken,
    ),
    enabled: Boolean(project?.tenantId && accessToken && view !== 'REVIEW_PENDING'),
    retry: 1,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  if (!project) return null;

  const metrics = metricsQuery.data;
  const metricCards = [
    { label: 'Bookings In Progress', value: metrics ? String(metrics.bookingsInProgress) : '—', detail: 'Current authorized Project scope' },
    ...(pcView ? [{
      label: 'Review Pending',
      value: reviewPendingQuery.data ? String(reviewPendingQuery.data.totalCount) : reviewPendingQuery.isError ? '!' : '—',
      detail: 'Booking capture submitted; PC document verification pending',
    }] : []),
    { label: 'Delivery In Progress', value: metrics ? String(metrics.deliveryInProgress) : '—', detail: 'Current authorized Project scope' },
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
  const timezoneName = project.timezoneName || 'UTC';

  return (
    <div className="screen-stack uc03-landing">
      <PageHeader
        eyebrow={`${roleLabels[project.operatingRole]} · ${project.projectCode}`}
        title={project.projectName}
        description="Booking and Delivery work for your current Project and authorized business scope."
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
            <span>Current Project</span>
            <h2 id="uc03-work-list-title">{view === 'REVIEW_PENDING' ? 'Review Pending' : 'Latest Bookings & Deliveries'}</h2>
            <p>{view === 'REVIEW_PENDING'
              ? 'Bookings where PC capture is submitted and document verification is still pending.'
              : 'Latest meaningful activity first. Up to 10 transactions are loaded at a time.'}</p>
          </div>
        </header>

        <div className="uc03-work-filters">
          <div className="uc03-work-filter-tabs" role="group" aria-label="Transaction type">
            {([
              ['ALL', 'All'],
              ['BOOKING', 'Bookings'],
              ...(pcView ? [['REVIEW_PENDING', `Review Pending${reviewPendingQuery.data ? ` (${reviewPendingQuery.data.totalCount})` : ''}`]] : []),
              ['DELIVERY', 'Deliveries'],
            ] as Array<[LandingView, string]>).map(([value, label]) => (
              <button
                type="button"
                key={value}
                className={view === value ? 'is-active' : ''}
                aria-pressed={view === value}
                onClick={() => setView(value)}
              >
                {label}
              </button>
            ))}
          </div>

          {view !== 'REVIEW_PENDING' && (
            <>
              <label>
                <span>From date</span>
                <input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} />
              </label>
              <label>
                <span>To date</span>
                <input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} />
              </label>
              {(fromDate || toDate) && (
                <button
                  type="button"
                  className="uc03-clear-filter"
                  onClick={() => { setFromDate(''); setToDate(''); }}
                >
                  Clear dates
                </button>
              )}
            </>
          )}
        </div>

        {view === 'REVIEW_PENDING' ? (
          <>
            {reviewPendingQuery.isError && (
              <section className="dashboard-load-state" role="alert">
                <div className="dashboard-load-state__mark" aria-hidden="true">!</div>
                <div className="dashboard-load-state__copy">
                  <strong>We couldn't load Review Pending.</strong>
                  <p>Please try again. No DI readiness check was made.</p>
                </div>
                <button type="button" className="user-menu-button" onClick={() => reviewPendingQuery.refetch()}>Try Again</button>
              </section>
            )}
            {reviewPendingQuery.isPending && <div className="uc03-work-loading" role="status">Loading Review Pending…</div>}
            {reviewPendingQuery.data && (
              <div className="uc03-work-cards">
                {reviewPendingQuery.data.items.map((item) => (
                  <ReviewPendingCard key={item.journeyId} item={item} timezoneName={timezoneName} />
                ))}
                {reviewPendingQuery.data.items.length === 0 && (
                  <div className="uc03-work-empty">
                    <strong>No PC reviews pending.</strong>
                    <p>Submitted Bookings will appear here until PC document verification is completed.</p>
                  </div>
                )}
              </div>
            )}
          </>
        ) : (
          <>
            {invalidDateRange && (
              <p className="uc03-filter-error" role="alert">From date must be on or before To date.</p>
            )}

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
                      <p>Try a different transaction type or date range.</p>
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
          </>
        )}
      </section>
    </div>
  );
}
