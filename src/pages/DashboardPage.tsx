import { useEffect, useMemo, useRef, useState } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';

import {
  effectiveStageStatus,
  overviewOpenState,
  reviewPendingOverviewOpenState,
  stageReviewPending,
  type OverviewTarget,
} from '../features/uc03/overviewOpen';
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

type LandingView = Uc03WorkType | 'REVIEW_PENDING' | 'FLAGS';

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
  if (stage.pcVerificationStatus) return stage.pcVerificationStatus === 'VERIFIED';
  return stage.auditState === 'COMPLETE';
}

function VerificationBadge({ stage }: { stage: Uc03StageSummary }) {
  const verified = isVerified(stage);
  const pending = stage.pcVerificationStatus === 'PENDING';
  return (
    <span className={`uc03-verification-badge${verified ? ' is-verified' : ' is-not-verified'}`}>
      {verified ? 'Verified' : pending ? 'Review Pending' : 'Not Verified'}
    </span>
  );
}

function StageBlock({
  label,
  item,
  showVerification = true,
}: {
  label: string;
  item: Uc03StageSummary;
  showVerification?: boolean;
}) {
  const stageKind = label === 'Delivery' ? 'DELIVERY' : 'BOOKING';
  return (
    <div className="uc03-stage-block">
      <span>{label}</span>
      <strong>{friendlyStatus(effectiveStageStatus(item, stageKind))}</strong>
      {showVerification && <VerificationBadge stage={item} />}
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
        <div className="uc03-dashboard-hero__capture-actions" aria-label="Booking capture">
          <Link className="uc03-landing__capture-action uc03-landing__capture-action--workqueue" to="/v2/bookings/new">
            <span aria-hidden="true">＋</span>
            <span>Capture New Booking</span>
          </Link>
        </div>
      )}
    </section>
  );
}

type WorkPresentation = {
  workLabel: 'Booking' | 'Delivery';
  nextStep: string;
  primaryActionLabel: string;
  primaryPath: string;
  target: OverviewTarget;
};

function workPresentation(
  item: Uc03WorkItem,
  isPc: boolean,
  reviewPending: boolean,
  flagsView: boolean,
): WorkPresentation {
  const bookingPath = `/v2/bookings/${item.journeyId}`;
  const bookingReviewPath = `/v2/bookings/${item.journeyId}/review`;
  const deliveryPath = `/v2/deliveries/${item.journeyId}`;
  const deliveryReviewPath = `/v2/deliveries/${item.journeyId}/review`;
  const auditPath = `/audit/${item.journeyId}`;
  const hasDelivery = Boolean(item.delivery.businessStatus);
  const bookingStatus = item.booking.businessStatus;
  const bookingReviewPending = stageReviewPending(item.booking) || reviewPending;
  const deliveryReviewPending = stageReviewPending(item.delivery);

  if (isPc && flagsView && item.openFlagCount > 0) {
    return {
      workLabel: hasDelivery ? 'Delivery' : 'Booking',
      nextStep: `Review ${item.openFlagCount} flag${item.openFlagCount === 1 ? '' : 's'}`,
      primaryActionLabel: 'Review Flags',
      primaryPath: auditPath,
      target: 'AUDIT',
    };
  }

  if (isPc && deliveryReviewPending) {
    return {
      workLabel: 'Delivery',
      nextStep: 'Review delivery documents',
      primaryActionLabel: 'Review Delivery',
      primaryPath: deliveryReviewPath,
      target: 'DELIVERY_REVIEW',
    };
  }

  if (isPc && bookingReviewPending) {
    return {
      workLabel: 'Booking',
      nextStep: 'Review documents',
      primaryActionLabel: 'Review Documents',
      primaryPath: bookingReviewPath,
      target: 'BOOKING_REVIEW',
    };
  }

  if (!isPc && item.openFlagCount > 0) {
    return {
      workLabel: hasDelivery ? 'Delivery' : 'Booking',
      nextStep: `Review ${item.openFlagCount} audit flag${item.openFlagCount === 1 ? '' : 's'}`,
      primaryActionLabel: 'Review Flags',
      primaryPath: auditPath,
      target: 'AUDIT',
    };
  }

  if (hasDelivery) {
    return {
      workLabel: 'Delivery',
      nextStep: 'Continue delivery work',
      primaryActionLabel: 'Continue Delivery',
      primaryPath: deliveryPath,
      target: 'DELIVERY',
    };
  }

  if (
    bookingStatus === 'BOOKING_CLOSED'
    || (Boolean(item.booking.captureCompletedAtUtc) && item.booking.pcVerificationStatus === 'VERIFIED')
  ) {
    return {
      workLabel: 'Booking',
      nextStep: 'Start delivery',
      primaryActionLabel: 'Start Delivery',
      primaryPath: deliveryPath,
      target: 'DELIVERY',
    };
  }

  return {
    workLabel: 'Booking',
    nextStep: 'Continue booking',
    primaryActionLabel: 'Continue Booking',
    primaryPath: bookingPath,
    target: 'BOOKING',
  };
}

function WorkItemCard({
  item,
  timezoneName,
  isPc,
  reviewPending,
  flagsView,
}: {
  item: Uc03WorkItem;
  timezoneName: string;
  isPc: boolean;
  reviewPending: boolean;
  flagsView: boolean;
}) {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const bookingStatus = item.booking.businessStatus;
  const bookingPath = `/v2/bookings/${item.journeyId}`;
  const deliveryPath = `/v2/deliveries/${item.journeyId}`;
  const auditPath = `/audit/${item.journeyId}`;
  const deliveryEligible = Boolean(
    item.delivery.businessStatus
      || item.booking.captureCompletedAtUtc
      || bookingStatus === 'BOOKING_STARTED'
      || bookingStatus === 'BOOKING_IN_PROGRESS'
      || bookingStatus === 'BOOKING_CLOSED',
  );
  const auditAvailable = Boolean(item.booking.businessStatus || item.delivery.businessStatus);
  const presentation = workPresentation(item, isPc, reviewPending, flagsView);
  const isDeliveryWork = presentation.workLabel === 'Delivery';
  const primaryStage = isDeliveryWork ? item.delivery : item.booking;
  const primaryStageKind = isDeliveryWork ? 'DELIVERY' : 'BOOKING';
  const primaryReviewPending = stageReviewPending(primaryStage)
    || (presentation.target === 'BOOKING_REVIEW' && reviewPending);
  const effectiveStatus = effectiveStageStatus(primaryStage, primaryStageKind);
  const workStatus = primaryReviewPending
    ? `${friendlyStatus(effectiveStatus)} · Review Pending`
    : friendlyStatus(effectiveStatus);
  const workStatusTone = primaryReviewPending ? 'is-review' : statusTone(effectiveStatus);
  const ageTone = activityAgeTone(item.latestActivityAtUtc);
  const absoluteActivity = activityLabel(item.latestActivityAtUtc, timezoneName);
  const relativeActivity = activityRelativeLabel(item.latestActivityAtUtc);
  const severityClass = item.openFlagCount > 0 && item.highestOpenSeverity
    ? ` is-severity-${item.highestOpenSeverity.toLowerCase()}`
    : '';
  const isReviewWork = presentation.target === 'BOOKING_REVIEW' || presentation.target === 'DELIVERY_REVIEW';

  return (
    <article
      className={`uc03-work-card uc03-work-card--interactive${expanded ? ' is-expanded' : ' is-compact'}${item.openFlagCount > 0 ? ' has-attention' : ''}${severityClass}`}
      role="link"
      tabIndex={0}
      aria-label={`${presentation.primaryActionLabel} for ${item.customerDisplayName}`}
      onClick={(event) => {
        const target = event.target as HTMLElement;
        if (target.closest('a, button')) return;
        navigate(presentation.primaryPath, { state: overviewOpenState(item, presentation.target) });
      }}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === 'Enter') {
          event.preventDefault();
          navigate(presentation.primaryPath, { state: overviewOpenState(item, presentation.target) });
        }
      }}
    >
      <header className="uc03-work-card__header">
        <div className="uc03-work-card__identity">
          <h3>{item.customerDisplayName}</h3>
          <div className="uc03-work-card__identity-meta">
            <span className="uc03-work-card__type-label">{isReviewWork ? `${presentation.workLabel} Review` : presentation.workLabel}</span>
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
          {!isPc && <VerificationBadge stage={primaryStage} />}
        </div>
      </header>

      <div className={`uc03-work-card__age ${ageTone}`} title={absoluteActivity}>
        <strong>{relativeActivity}</strong>
        <span>since activity</span>
      </div>

      {expanded && (
        <div className="uc03-work-card__expanded-content">
          <div className="uc03-work-card__stages">
            <StageBlock label="Booking" item={item.booking} showVerification={!isPc} />
            <StageBlock label="Delivery" item={item.delivery} showVerification={!isPc} />
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
        <Link
          className="uc03-work-card__primary-action"
          to={presentation.primaryPath}
          state={overviewOpenState(item, presentation.target)}
        >
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
                <Link role="menuitem" to={bookingPath} state={overviewOpenState(item, 'BOOKING')}>Open Booking</Link>
              )}
              {deliveryEligible && presentation.primaryPath !== deliveryPath && (
                <Link role="menuitem" to={deliveryPath} state={overviewOpenState(item, 'DELIVERY')}>
                  {item.delivery.businessStatus ? 'Open Delivery' : 'Start Delivery'}
                </Link>
              )}
              {auditAvailable && presentation.primaryPath !== auditPath && (
                <Link role="menuitem" to={auditPath} state={overviewOpenState(item, 'AUDIT')}>
                  {isPc ? (item.openFlagCount > 0 ? 'Review / Raise Flag' : 'Raise Flag') : 'Audit Review'}
                </Link>
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
          <strong className="uc03-work-status-pill is-review">Booking Completed · Review Pending</strong>
        </div>
      </header>
      <div className={`uc03-work-card__age ${ageTone}`} title={absoluteActivity}>
        <strong>{relativeActivity}</strong>
        <span>since activity</span>
      </div>
      <footer className="uc03-work-card__footer">
        <Link
          className="uc03-work-card__primary-action"
          to={`/v2/bookings/${item.journeyId}/review`}
          state={reviewPendingOverviewOpenState(item)}
        >
          Review Documents
        </Link>
        <div className="uc03-work-card__expanded-meta">
          <span>{item.dealerName}<span aria-hidden="true"> · </span>{item.outletName}</span>
        </div>
      </footer>
    </article>
  );
}

export default function DashboardPage() {
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
  const workType: Uc03WorkType = view === 'REVIEW_PENDING' || view === 'FLAGS' ? 'ALL' : view;

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

  const reviewPendingItems = useMemo(() => {
    const items = reviewPendingQuery.data?.items ?? [];
    if (!isPc || !selectedOutlet) return items;
    return items.filter((item) => (
      item.dealerName === selectedOutlet.dealerName
      && item.outletName === selectedOutlet.outletName
    ));
  }, [isPc, reviewPendingQuery.data?.items, selectedOutlet]);

  const reviewPendingIds = useMemo(
    () => new Set(reviewPendingItems.map((item) => item.journeyId)),
    [reviewPendingItems],
  );

  const workItems = useMemo(
    () => workQuery.data?.pages.flatMap((page) => page.items) ?? [],
    [workQuery.data],
  );
  const displayedWorkItems = useMemo(() => {
    let items = workItems;
    if (isPc && view === 'BOOKING') {
      items = items.filter((item) => !reviewPendingIds.has(item.journeyId) && !stageReviewPending(item.booking) && !item.delivery.businessStatus);
    } else if (isPc && view === 'FLAGS') {
      items = items.filter((item) => item.openFlagCount > 0);
    }

    return [...items].sort((left, right) => {
      const leftTime = new Date(left.latestActivityAtUtc).getTime();
      const rightTime = new Date(right.latestActivityAtUtc).getTime();
      if (Number.isNaN(leftTime) || Number.isNaN(rightTime)) return 0;
      return leftTime - rightTime;
    });
  }, [isPc, reviewPendingIds, view, workItems]);
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

  const metrics = metricsQuery.data;
  const reviewPendingCount = reviewPendingItems.length;
  const pcBookingsToComplete = metrics
    ? Math.max(0, metrics.bookingsInProgress - reviewPendingCount - metrics.deliveryInProgress)
    : 0;
  const bookingMetricValue = metrics
    ? isPc
      ? reviewPendingQuery.data ? String(pcBookingsToComplete) : '—'
      : String(metrics.bookingsInProgress)
    : '—';
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
  const queueTitle = view === 'REVIEW_PENDING' ? 'Review Pending' : view === 'FLAGS' ? 'Flags' : 'Work Queue';
  const queueNote = view === 'REVIEW_PENDING'
    ? `${reviewPendingCount} Booking review${reviewPendingCount === 1 ? '' : 's'} pending`
    : view === 'FLAGS'
      ? `${displayedWorkItems.length} loaded with open flags`
      : `${displayedWorkItems.length} loaded · oldest loaded activity first`;

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
            value={bookingMetricValue}
            detail={isPc ? 'Capture to complete' : 'In progress'}
            actionLabel="View"
            onSelect={() => selectWork('BOOKING')}
          />
          {isPc && (
            <LandingMetric
              label="Review Pending"
              value={reviewPendingQuery.data ? String(reviewPendingCount) : reviewPendingQuery.isError ? '!' : '—'}
              detail="Documents to review"
              actionLabel="Review"
              attention={Boolean(reviewPendingCount)}
              onSelect={() => selectWork('REVIEW_PENDING')}
            />
          )}
          <LandingMetric
            label="Deliveries"
            value={metrics ? String(metrics.deliveryInProgress) : '—'}
            detail={isPc ? 'Capture in progress' : 'In progress'}
            actionLabel="View"
            onSelect={() => selectWork('DELIVERY')}
          />
          {isPc ? (
            <LandingMetric
              label="Flags"
              value={metrics ? String(metrics.auditFlags) : '—'}
              detail="Open observations"
              actionLabel="View"
              attention={Boolean(metrics?.auditFlags)}
              onSelect={() => selectWork('FLAGS')}
            />
          ) : (
            <LandingMetric
              label="Attention"
              value={metrics ? String(metrics.needsAttention) : '—'}
              detail="Needs review"
              attention={Boolean(metrics?.needsAttention)}
            />
          )}
        </div>
      )}

      <section className="uc03-work-list" aria-labelledby="uc03-work-list-title">
        <header className="uc03-work-list__heading uc03-work-list__heading--approved">
          <div>
            <h2 id="uc03-work-list-title">{queueTitle}</h2>
            <p className="uc03-work-list__queue-note">{queueNote}</p>
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
            ...(isPc ? [['REVIEW_PENDING', `Review Pending${reviewPendingQuery.data ? ` (${reviewPendingCount})` : ''}`]] : []),
            ['DELIVERY', 'Deliveries'],
            ...(isPc ? [['FLAGS', `Flags${metrics ? ` (${metrics.auditFlags})` : ''}`]] : []),
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
                {reviewPendingItems.length > 0 && (
                  <div className="uc03-work-table-head" aria-hidden="true">
                    <span>Work Item</span><span>Next Step</span><span>Status</span><span>Age</span><span>Action</span>
                  </div>
                )}
                {reviewPendingItems.map((item) => (
                  <ReviewPendingCard key={item.journeyId} item={item} timezoneName={project.timezoneName || 'UTC'} />
                ))}
                {reviewPendingItems.length === 0 && (
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
                    <WorkItemCard
                      key={item.journeyId}
                      item={item}
                      timezoneName={timezoneName}
                      isPc={isPc}
                      reviewPending={reviewPendingIds.has(item.journeyId)}
                      flagsView={view === 'FLAGS'}
                    />
                  ))}
                  {displayedWorkItems.length === 0 && (
                    <div className="uc03-work-empty">
                      <strong>{view === 'FLAGS' ? 'No open flags in the loaded work.' : 'No matching Booking or Delivery work.'}</strong>
                      <p>{view === 'FLAGS' ? 'Open flags will remain visible without changing the Booking or Delivery next step.' : 'Capture a new Booking to begin.'}</p>
                    </div>
                  )}
                </div>

                {workItems.length > 0 && (
                  <div className="uc03-lazy-load" aria-live="polite">
                    <span>{displayedWorkItems.length} transaction{displayedWorkItems.length === 1 ? '' : 's'} shown</span>
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