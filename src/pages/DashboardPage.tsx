import { useEffect, useMemo, useRef, useState } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

import {
  getUc03LandingMetrics,
  listUc03WorkItems,
  type Uc03StageSummary,
  type Uc03WorkItem,
  type Uc03WorkType,
} from '../services/audit-core/uc03';
import {
  listReviewPending,
  type ReviewPendingItem,
} from '../services/audit-core/uc03PcVerification';
import { useProjectContextStore } from '../store/projectContextStore';
import { useSessionStore } from '../store/sessionStore';
import CreateBookingPage from './CreateBookingPage';

type LandingView = Uc03WorkType | 'REVIEW_PENDING';

function friendlyStatus(value?: string | null, fallback = 'Not Started'): string {
  if (!value) return fallback;
  return value
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function statusTone(value?: string | null): string {
  const normalized = (value || '').toUpperCase();
  if (normalized.includes('COMPLETE') || normalized.includes('CLOSED') || normalized.includes('DELIVERED')) return 'is-complete';
  if (normalized.includes('ATTENTION') || normalized.includes('FAILED') || normalized.includes('ERROR') || normalized.includes('REJECT')) return 'is-attention';
  if (normalized.includes('REVIEW') || normalized.includes('VERIFY') || normalized.includes('VALIDAT')) return 'is-review';
  if (normalized.includes('PENDING') || normalized.includes('DOCUMENT') || normalized.includes('DOC')) return 'is-pending';
  if (normalized.includes('STARTED') || normalized.includes('IN_PROGRESS') || normalized.includes('PROCESSING') || normalized.includes('ACTIVE')) return 'is-progress';
  return 'is-neutral';
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

function activityRelativeLabel(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return 'Unknown age';
  const elapsedMs = Math.max(0, Date.now() - date.getTime());
  const minutes = Math.floor(elapsedMs / 60_000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  return `${weeks}w ago`;
}

function activityAgeTone(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return 'is-age-neutral';
  const elapsedHours = Math.max(0, Date.now() - date.getTime()) / 3_600_000;
  if (elapsedHours >= 48) return 'is-age-critical';
  if (elapsedHours >= 24) return 'is-age-warning';
  return 'is-age-fresh';
}

function isVerified(stage: Uc03StageSummary): boolean {
  return stage.auditState === 'COMPLETE';
}

function VerificationBadge({ stage }: { stage: Uc03StageSummary }) {
  const verified = isVerified(stage);
  return (
    <span className={`uc03-verification-badge${verified ? ' is-verified' : ' is-not-verified'}`}>
      {verified ? 'Verified' : 'Not Verified'}
    </span>
  );
}

function StageBlock({ label, item }: { label: string; item: Uc03StageSummary }) {
  return (
    <div className="uc03-stage-block">
      <span>{label}</span>
      <strong>{friendlyStatus(item.businessStatus)}</strong>
      <VerificationBadge stage={item} />
      {item.businessDate && <small>{item.businessDate}</small>}
    </div>
  );
}

type LandingMetricProps = {
  label: string;
  value: string;
  detail: string;
  actionLabel?: string;
  attention?: boolean;
  onSelect?: () => void;
};

function LandingMetric({ label, value, detail, actionLabel, attention, onSelect }: LandingMetricProps) {
  const content = (
    <>
      <span className="uc03-landing-metric__label">{label}</span>
      <strong className="uc03-landing-metric__value">{value}</strong>
      <span className="uc03-landing-metric__detail">{detail}</span>
      {actionLabel && (
        <span className="uc03-landing-metric__action">
          {actionLabel}<span aria-hidden="true">→</span>
        </span>
      )}
    </>
  );

  if (onSelect) {
    return (
      <button type="button" className="uc03-landing-metric is-action" onClick={onSelect}>
        {content}
      </button>
    );
  }

  return <article className={`uc03-landing-metric${attention ? ' is-attention' : ''}`}>{content}</article>;
}

type DashboardHeroProps = {
  dealershipName: string;
  outletName: string;
  showCaptureAction: boolean;
};

function DashboardHero({ dealershipName, outletName, showCaptureAction }: DashboardHeroProps) {
  return (
    <section className="uc03-dashboard-hero uc03-dashboard-hero--workqueue" aria-labelledby="uc03-dashboard-hero-title">
      <div className="uc03-dashboard-hero__copy">
        <h1 id="uc03-dashboard-hero-title">Work Queue</h1>
        <p>{dealershipName}<span aria-hidden="true"> · </span>{outletName}</p>
      </div>

      {showCaptureAction && (
        <Link className="uc03-landing__capture-action uc03-landing__capture-action--workqueue" to="/dashboard?action=create-booking">
          <span aria-hidden="true">＋</span>
          <span>Capture New Booking</span>
        </Link>
      )}
    </section>
  );
}

type WorkPresentation = {
  workLabel: 'Booking' | 'Delivery';
  nextStep: string;
  primaryActionLabel: string;
  primaryPath: string;
};

function workPresentation(item: Uc03WorkItem): WorkPresentation {
  const bookingPath = `/bookings/${item.journeyId}`;
  const deliveryPath = `/deliveries/${item.journeyId}`;
  const auditPath = `/audit/${item.journeyId}`;
  const hasDelivery = Boolean(item.delivery.businessStatus);
  const bookingStatus = item.booking.businessStatus;

  if (item.openFlagCount > 0) {
    return {
      workLabel: hasDelivery ? 'Delivery' : 'Booking',
      nextStep: `Review ${item.openFlagCount} audit flag${item.openFlagCount === 1 ? '' : 's'}`,
      primaryActionLabel: 'Review Flags',
      primaryPath: auditPath,
    };
  }

  if (hasDelivery) {
    return {
      workLabel: 'Delivery',
      nextStep: 'Continue delivery work',
      primaryActionLabel: 'Continue Delivery',
      primaryPath: deliveryPath,
    };
  }

  if (bookingStatus === 'BOOKING_CLOSED') {
    return {
      workLabel: 'Booking',
      nextStep: 'Start delivery',
      primaryActionLabel: 'Start Delivery',
      primaryPath: deliveryPath,
    };
  }

  return {
    workLabel: 'Booking',
    nextStep: 'Continue booking',
    primaryActionLabel: 'Continue Booking',
    primaryPath: bookingPath,
  };
}

function WorkItemCard({ item, timezoneName }: { item: Uc03WorkItem; timezoneName: string }) {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const bookingStatus = item.booking.businessStatus;
  const bookingPath = `/bookings/${item.journeyId}`;
  const deliveryPath = `/deliveries/${item.journeyId}`;
  const auditPath = `/audit/${item.journeyId}`;
  const deliveryEligible = Boolean(
    item.delivery.businessStatus
      || bookingStatus === 'BOOKING_STARTED'
      || bookingStatus === 'BOOKING_IN_PROGRESS'
      || bookingStatus === 'BOOKING_CLOSED',
  );
  const auditAvailable = Boolean(item.booking.businessStatus || item.delivery.businessStatus);
  const presentation = workPresentation(item);
  const isDeliveryWork = presentation.workLabel === 'Delivery';
  const primaryStage = isDeliveryWork ? item.delivery : item.booking;
  const workStatus = friendlyStatus(primaryStage.businessStatus);
  const workStatusTone = statusTone(primaryStage.businessStatus);
  const ageTone = activityAgeTone(item.latestActivityAtUtc);
  const absoluteActivity = activityLabel(item.latestActivityAtUtc, timezoneName);
  const relativeActivity = activityRelativeLabel(item.latestActivityAtUtc);
  const severityClass = item.openFlagCount > 0 && item.highestOpenSeverity
    ? ` is-severity-${item.highestOpenSeverity.toLowerCase()}`
    : '';

  return (
    <article
      className={`uc03-work-card uc03-work-card--interactive${expanded ? ' is-expanded' : ' is-compact'}${item.openFlagCount > 0 ? ' has-attention' : ''}${severityClass}`}
      role="link"
      tabIndex={0}
      aria-label={`${presentation.primaryActionLabel} for ${item.customerDisplayName}`}
      onClick={(event) => {
        const target = event.target as HTMLElement;
        if (target.closest('a, button')) return;
        navigate(presentation.primaryPath);
      }}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === 'Enter') {
          event.preventDefault();
          navigate(presentation.primaryPath);
        }
      }}
    >
      <header className="uc03-work-card__header">
        <div className="uc03-work-card__identity">
          <h3>{item.customerDisplayName}</h3>
          <div className="uc03-work-card__identity-meta">
            <span className="uc03-work-card__type-label">{presentation.workLabel}</span>
            {item.bookingReference && <span>{item.bookingReference}</span>}
          </div>
          <p>{item.productLabel || 'Vehicle not captured'}</p>
        </div>

        <div className="uc03-work-card__next-step">
          <span>Next step</span>
          <strong>{presentation.nextStep}</strong>
          {item.openFlagCount > 0 && (
            <small>
              {item.highestOpenSeverity ? `${friendlyStatus(item.highestOpenSeverity)} severity · ` : ''}
              {item.openFlagCount} open flag{item.openFlagCount === 1 ? '' : 's'}
            </small>
          )}
        </div>

        <div className="uc03-work-card__summary uc03-work-card__summary--simple">
          <strong className={`uc03-work-status-pill ${workStatusTone}`}>{workStatus}</strong>
          <VerificationBadge stage={primaryStage} />
        </div>
      </header>

      <div className={`uc03-work-card__age ${ageTone}`} title={absoluteActivity}>
        <strong>{relativeActivity}</strong>
        <span>since activity</span>
      </div>

      {expanded && (
        <div className="uc03-work-card__expanded-content">
          <div className="uc03-work-card__stages">
            <StageBlock label="Booking" item={item.booking} />
            <StageBlock label="Delivery" item={item.delivery} />
          </div>
          <div className="uc03-work-card__expanded-meta">
            <span>Last activity {absoluteActivity}</span>
            <span>{item.dealerName}<span aria-hidden="true"> · </span>{item.outletName}</span>
            {item.customerMobileLast4 && <span>Mobile •••• {item.customerMobileLast4}</span>}
            {item.processingDocumentCount > 0 && (
              <span>{item.processingDocumentCount} document{item.processingDocumentCount === 1 ? '' : 's'} processing</span>
            )}
            {item.proposalReadyCount > 0 && (
              <span>{item.proposalReadyCount} extracted proposal{item.proposalReadyCount === 1 ? '' : 's'} ready</span>
            )}
          </div>
        </div>
      )}

      <footer className="uc03-work-card__footer">
        <Link className="uc03-work-card__primary-action" to={presentation.primaryPath}>
          {presentation.primaryActionLabel}
        </Link>

        <div className="uc03-work-card__more">
          <button
            type="button"
            className="uc03-work-card__more-button"
            aria-expanded={moreOpen}
            aria-label={`More actions for ${item.customerDisplayName}`}
            onClick={(event) => {
              event.stopPropagation();
              setMoreOpen((current) => !current);
            }}
          >
            <span aria-hidden="true">•••</span>
          </button>

          {moreOpen && (
            <div className="uc03-work-card__more-menu" role="menu">
              <button
                type="button"
                role="menuitem"
                onClick={(event) => {
                  event.stopPropagation();
                  setExpanded((current) => !current);
                  setMoreOpen(false);
                }}
              >
                {expanded ? 'Hide details' : 'View details'}
              </button>
              {presentation.primaryPath !== bookingPath && (
                <Link role="menuitem" to={bookingPath}>Open Booking</Link>
              )}
              {deliveryEligible && presentation.primaryPath !== deliveryPath && (
                <Link role="menuitem" to={deliveryPath}>
                  {item.delivery.businessStatus ? 'Open Delivery' : 'Start Delivery'}
                </Link>
              )}
              {auditAvailable && presentation.primaryPath !== auditPath && (
                <Link role="menuitem" to={auditPath}>Audit Review</Link>
              )}
            </div>
          )}
        </div>
      </footer>
    </article>
  );
}

function ReviewPendingCard({ item, timezoneName }: { item: ReviewPendingItem; timezoneName: string }) {
  const absoluteActivity = activityLabel(item.latestActivityAtUtc, timezoneName);
  const relativeActivity = activityRelativeLabel(item.latestActivityAtUtc);
  const ageTone = activityAgeTone(item.latestActivityAtUtc);
  return (
    <article className="uc03-work-card uc03-work-card--interactive is-compact">
      <header className="uc03-work-card__header">
        <div className="uc03-work-card__identity">
          <h3>{item.customerDisplayName}</h3>
          <div className="uc03-work-card__identity-meta">
            <span className="uc03-work-card__type-label">Booking Review</span>
            {item.bookingReference && <span>{item.bookingReference}</span>}
          </div>
          <p>{item.productLabel || 'Vehicle not captured'}</p>
        </div>
        <div className="uc03-work-card__next-step">
          <span>Next step</span>
          <strong>Review documents</strong>
          <small>PC verification pending</small>
        </div>
        <div className="uc03-work-card__summary uc03-work-card__summary--simple">
          <strong className="uc03-work-status-pill is-review">Review Pending</strong>
          <span className="uc03-verification-badge is-not-verified">Not Verified</span>
        </div>
      </header>
      <div className={`uc03-work-card__age ${ageTone}`} title={absoluteActivity}>
        <strong>{relativeActivity}</strong>
        <span>since activity</span>
      </div>
      <footer className="uc03-work-card__footer">
        <Link className="uc03-work-card__primary-action" to={`/bookings/${item.journeyId}/review`}>Review Documents</Link>
        <div className="uc03-work-card__expanded-meta">
          <span>{item.dealerName}<span aria-hidden="true"> · </span>{item.outletName}</span>
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
  const [view, setView] = useState<LandingView>('ALL');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  const selectedOutlet = project?.scope.outlets.find((outlet) => outlet.outletId === outletId);
  const pcContextReady = project?.operatingRole !== 'PC' || Boolean(outletId);
  const isPc = project?.operatingRole === 'PC';
  const workType: Uc03WorkType = view === 'REVIEW_PENDING' ? 'ALL' : view;

  const metricsQuery = useQuery({
    queryKey: ['uc03-landing-metrics', project?.tenantId, outletId],
    queryFn: () => getUc03LandingMetrics(project!.tenantId, outletId || undefined, accessToken),
    enabled: Boolean(project?.tenantId && accessToken && pcContextReady),
    retry: 1,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const reviewPendingQuery = useQuery({
    queryKey: ['uc03-review-pending', project?.tenantId],
    queryFn: () => listReviewPending(project!.tenantId, accessToken),
    enabled: Boolean(isPc && project?.tenantId && accessToken && pcContextReady),
    retry: 1,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });

  const workQuery = useInfiniteQuery({
    queryKey: ['uc03-work-items', project?.tenantId, outletId, workType, fromDate, toDate],
    initialPageParam: '',
    queryFn: ({ pageParam }) => listUc03WorkItems(
      project!.tenantId,
      {
        workType,
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
        outletId: outletId || undefined,
        cursor: pageParam || undefined,
      },
      accessToken,
    ),
    getNextPageParam: (lastPage) => lastPage.nextCursor || undefined,
    enabled: Boolean(project?.tenantId && accessToken && pcContextReady && view !== 'REVIEW_PENDING'),
    retry: 1,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const workItems = useMemo(
    () => workQuery.data?.pages.flatMap((page) => page.items) ?? [],
    [workQuery.data],
  );
  const displayedWorkItems = useMemo(
    () => [...workItems].sort((left, right) => {
      const leftTime = new Date(left.latestActivityAtUtc).getTime();
      const rightTime = new Date(right.latestActivityAtUtc).getTime();
      if (Number.isNaN(leftTime) || Number.isNaN(rightTime)) return 0;
      return leftTime - rightTime;
    }),
    [workItems],
  );
  const timezoneName = workQuery.data?.pages[0]?.filters.timezoneName || project?.timezoneName || 'UTC';

  useEffect(() => {
    if (view === 'REVIEW_PENDING') return undefined;
    const node = loadMoreRef.current;
    if (!node || !workQuery.hasNextPage) return undefined;

    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting && !workQuery.isFetchingNextPage) {
        void workQuery.fetchNextPage();
      }
    }, { rootMargin: '240px 0px' });

    observer.observe(node);
    return () => observer.disconnect();
  }, [view, workQuery.fetchNextPage, workQuery.hasNextPage, workQuery.isFetchingNextPage]);

  if (!project) return null;
  if (searchParams.get('action') === 'create-booking' && project.operatingRole === 'PC') {
    return <CreateBookingPage />;
  }

  const metrics = metricsQuery.data;
  const dealershipName = isPc && selectedOutlet ? selectedOutlet.dealerName : 'Authorized Workspace';
  const outletName = isPc && selectedOutlet
    ? selectedOutlet.outletName
    : 'Booking and Delivery work for your current authorized business scope.';
  const activeDateFilterCount = Number(Boolean(fromDate)) + Number(Boolean(toDate));

  const selectWork = (nextView: LandingView) => {
    setView(nextView);
    window.requestAnimationFrame(() => {
      document.getElementById('uc03-work-list-title')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  const invalidDateRange = Boolean(fromDate && toDate && fromDate > toDate);

  return (
    <div className="screen-stack uc03-landing uc03-landing--phase2 uc03-landing--approved uc03-landing--verification-simple uc03-landing--workqueue">
      <DashboardHero
        dealershipName={dealershipName}
        outletName={outletName}
        showCaptureAction={isPc}
      />

      {metricsQuery.isError ? (
        <section className="dashboard-load-state" role="alert">
          <div className="dashboard-load-state__mark" aria-hidden="true">!</div>
          <div className="dashboard-load-state__copy">
            <strong>We couldn't load the work summary.</strong>
            <p>Please try again. Your work queue is kept separate from this summary.</p>
          </div>
          <button type="button" className="user-menu-button" onClick={() => metricsQuery.refetch()}>Try Again</button>
        </section>
      ) : (
        <div className="uc03-landing-metrics" aria-label="Current work summary">
          <LandingMetric
            label="Bookings"
            value={metrics ? String(metrics.bookingsInProgress) : '—'}
            detail="In progress"
            actionLabel="View"
            onSelect={() => selectWork('BOOKING')}
          />
          {isPc && (
            <LandingMetric
              label="Review Pending"
              value={reviewPendingQuery.data ? String(reviewPendingQuery.data.totalCount) : reviewPendingQuery.isError ? '!' : '—'}
              detail="PC verification"
              actionLabel="Review"
              attention={Boolean(reviewPendingQuery.data?.totalCount)}
              onSelect={() => selectWork('REVIEW_PENDING')}
            />
          )}
          <LandingMetric
            label="Deliveries"
            value={metrics ? String(metrics.deliveryInProgress) : '—'}
            detail="In progress"
            actionLabel="View"
            onSelect={() => selectWork('DELIVERY')}
          />
          <LandingMetric
            label="Attention"
            value={metrics ? String(metrics.needsAttention) : '—'}
            detail="Needs review"
            attention={Boolean(metrics?.needsAttention)}
          />
        </div>
      )}

      <section className="uc03-work-list" aria-labelledby="uc03-work-list-title">
        <header className="uc03-work-list__heading uc03-work-list__heading--approved">
          <div>
            <h2 id="uc03-work-list-title">{view === 'REVIEW_PENDING' ? 'Review Pending' : 'Work Queue'}</h2>
            <p className="uc03-work-list__queue-note">
              {view === 'REVIEW_PENDING'
                ? `${reviewPendingQuery.data?.totalCount ?? 0} Booking review${reviewPendingQuery.data?.totalCount === 1 ? '' : 's'} pending`
                : `${displayedWorkItems.length} loaded · oldest loaded activity first`}
            </p>
          </div>
          {view !== 'REVIEW_PENDING' && (
            <button
              type="button"
              className={`uc03-filter-toggle${filtersOpen || activeDateFilterCount ? ' is-active' : ''}`}
              aria-expanded={filtersOpen}
              onClick={() => setFiltersOpen((current) => !current)}
            >
              Filters{activeDateFilterCount > 0 ? ` (${activeDateFilterCount})` : ''}
            </button>
          )}
        </header>

        <div className="uc03-work-filter-tabs uc03-work-filter-tabs--approved" role="group" aria-label="Transaction type">
          {([
            ['ALL', 'All'],
            ['BOOKING', 'Bookings'],
            ...(isPc ? [['REVIEW_PENDING', `Review Pending${reviewPendingQuery.data ? ` (${reviewPendingQuery.data.totalCount})` : ''}`]] : []),
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

        {view !== 'REVIEW_PENDING' && (filtersOpen || activeDateFilterCount > 0) && (
          <div className="uc03-work-filters uc03-work-filters--approved">
            <div className="uc03-date-range" role="group" aria-label="Date range">
              <label>
                <span>From</span>
                <input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} />
              </label>
              <span className="uc03-date-range__separator" aria-hidden="true">→</span>
              <label>
                <span>To</span>
                <input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} />
              </label>
            </div>

            {(fromDate || toDate) && (
              <button type="button" className="uc03-clear-filter" onClick={() => { setFromDate(''); setToDate(''); }}>
                Clear dates
              </button>
            )}
          </div>
        )}

        {view === 'REVIEW_PENDING' ? (
          <>
            {reviewPendingQuery.isError && (
              <section className="dashboard-load-state" role="alert">
                <div className="dashboard-load-state__mark" aria-hidden="true">!</div>
                <div className="dashboard-load-state__copy">
                  <strong>We couldn't load Review Pending.</strong>
                  <p>Please try again. No Document Intelligence readiness check was made.</p>
                </div>
                <button type="button" className="user-menu-button" onClick={() => reviewPendingQuery.refetch()}>Try Again</button>
              </section>
            )}
            {reviewPendingQuery.isPending && <div className="uc03-work-loading" role="status">Loading Review Pending…</div>}
            {reviewPendingQuery.data && (
              <div className="uc03-work-cards">
                {reviewPendingQuery.data.items.length > 0 && (
                  <div className="uc03-work-table-head" aria-hidden="true">
                    <span>Work Item</span><span>Next Step</span><span>Status</span><span>Age</span><span>Action</span>
                  </div>
                )}
                {reviewPendingQuery.data.items.map((item) => (
                  <ReviewPendingCard key={item.journeyId} item={item} timezoneName={project.timezoneName || 'UTC'} />
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
                  {displayedWorkItems.length > 0 && (
                    <div className="uc03-work-table-head" aria-hidden="true">
                      <span>Work Item</span>
                      <span>Next Step</span>
                      <span>Status</span>
                      <span>Age</span>
                      <span>Action</span>
                    </div>
                  )}
                  {displayedWorkItems.map((item) => (
                    <WorkItemCard key={item.journeyId} item={item} timezoneName={timezoneName} />
                  ))}
                  {displayedWorkItems.length === 0 && (
                    <div className="uc03-work-empty">
                      <strong>No matching Booking or Delivery work.</strong>
                      <p>Capture a new Booking to begin.</p>
                    </div>
                  )}
                </div>

                {displayedWorkItems.length > 0 && (
                  <div className="uc03-lazy-load" aria-live="polite">
                    <span>{displayedWorkItems.length} transaction{displayedWorkItems.length === 1 ? '' : 's'} loaded</span>
                    {workQuery.hasNextPage ? (
                      <button
                        type="button"
                        onClick={() => void workQuery.fetchNextPage()}
                        disabled={workQuery.isFetchingNextPage}
                      >
                        {workQuery.isFetchingNextPage ? 'Loading more…' : 'Load more'}
                      </button>
                    ) : (
                      <span>You're up to date.</span>
                    )}
                    <div ref={loadMoreRef} className="uc03-lazy-load__sentinel" aria-hidden="true" />
                  </div>
                )}
              </>
            )}
          </>
        )}
      </section>
    </div>
  );
}
