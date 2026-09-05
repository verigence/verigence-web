import { useEffect, useMemo, useRef, useState } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

import {
  effectiveStageStatus,
  overviewOpenState,
  reviewPendingOverviewOpenState,
  type OverviewTarget,
} from '../features/uc03/overviewOpen';
import {
  getUc03LandingMetrics,
  listUc03WorkItems,
  type Uc03StageSummary,
  type Uc03WorkItem,
  type Uc03WorkType,
} from '../services/audit-core/uc03';
import { getBookingDetailsV2 } from '../services/audit-core/uc03BookingV2';
import {
  listReviewPending,
  type ReviewPendingItem,
} from '../services/audit-core/uc03PcVerification';
import { enrichUc03WorkItems } from '../services/audit-core/uc03WorkItemEnrichment';
import { useProjectContextStore } from '../store/projectContextStore';
import { useSessionStore } from '../store/sessionStore';

type LandingView = Uc03WorkType | 'REVIEW_PENDING' | 'FLAGS';
type PcBookingStatus = 'BOOKING_IN_PROGRESS' | 'BOOKING_COMPLETED' | 'BOOKING_UPDATE_REQUIRED';

function friendlyStatus(value?: string | null, fallback = 'Not Started'): string {
  if (!value) return fallback;
  return value
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function yesNo(value?: boolean | null): string {
  if (value === null || value === undefined) return 'Not captured';
  return value ? 'Yes' : 'No';
}

function statusTone(value?: string | null): string {
  const normalized = (value || '').toUpperCase();
  if (normalized.includes('UPDATE_REQUIRED') || normalized.includes('ATTENTION') || normalized.includes('FAILED') || normalized.includes('ERROR') || normalized.includes('REJECT')) return 'is-attention';
  if (normalized.includes('COMPLETE') || normalized.includes('CLOSED') || normalized.includes('DELIVERED')) return 'is-complete';
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

function businessDateLabel(value?: string | null): string {
  if (!value) return 'Not captured';
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    timeZone: 'UTC',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
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

function StageBlock({ label, item }: { label: string; item: Uc03StageSummary }) {
  const stageKind = label === 'Delivery' ? 'DELIVERY' : 'BOOKING';
  return (
    <div className="uc03-stage-block">
      <span>{label}</span>
      <strong>{friendlyStatus(effectiveStageStatus(item, stageKind))}</strong>
      <VerificationBadge stage={item} />
      {item.businessDate && <small>{businessDateLabel(item.businessDate)}</small>}
    </div>
  );
}

function pcBookingStatus(item: Uc03WorkItem): PcBookingStatus {
  const nextAction = item.nextActionCode?.trim().toUpperCase();
  if (nextAction === 'UPDATE_BOOKING' || nextAction === 'BOOKING_UPDATE_REQUIRED') {
    return 'BOOKING_UPDATE_REQUIRED';
  }
  if (item.booking.captureCompletedAtUtc || item.booking.businessStatus === 'BOOKING_CLOSED') {
    return 'BOOKING_COMPLETED';
  }
  return 'BOOKING_IN_PROGRESS';
}

function pcBookingCaptureNote(item: Uc03WorkItem): string {
  const status = pcBookingStatus(item);
  if (status === 'BOOKING_UPDATE_REQUIRED') return 'Additional Booking information is required';
  if (status === 'BOOKING_COMPLETED') return 'Mandatory Booking documents received';
  if (item.processingDocumentCount > 0) {
    return `${item.processingDocumentCount} document${item.processingDocumentCount === 1 ? '' : 's'} processing`;
  }
  return 'Mandatory Booking documents incomplete';
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
  secondaryActionLabel?: string;
  secondaryPath?: string;
  secondaryTarget?: OverviewTarget;
};

function workPresentation(
  item: Uc03WorkItem,
  isPc: boolean,
  flagsView: boolean,
): WorkPresentation {
  const bookingPath = `/v2/bookings/${item.journeyId}`;
  const deliveryPath = `/v2/deliveries/${item.journeyId}`;
  const auditPath = `/audit/${item.journeyId}`;
  const hasDelivery = Boolean(item.delivery.businessStatus);

  if (isPc) {
    if (flagsView && item.openFlagCount > 0) {
      return {
        workLabel: hasDelivery ? 'Delivery' : 'Booking',
        nextStep: `Review ${item.openFlagCount} observation${item.openFlagCount === 1 ? '' : 's'}`,
        primaryActionLabel: 'Review Observations',
        primaryPath: auditPath,
        target: 'AUDIT',
      };
    }

    if (hasDelivery) {
      return {
        workLabel: 'Delivery',
        nextStep: 'Continue Delivery',
        primaryActionLabel: 'Continue Delivery',
        primaryPath: deliveryPath,
        target: 'DELIVERY',
      };
    }

    const bookingStatus = pcBookingStatus(item);
    if (bookingStatus === 'BOOKING_UPDATE_REQUIRED') {
      return {
        workLabel: 'Booking',
        nextStep: 'Update Booking · Capture Delivery',
        primaryActionLabel: 'Update Booking',
        primaryPath: bookingPath,
        target: 'BOOKING',
        secondaryActionLabel: 'Capture Delivery',
        secondaryPath: deliveryPath,
        secondaryTarget: 'DELIVERY',
      };
    }

    if (bookingStatus === 'BOOKING_COMPLETED') {
      return {
        workLabel: 'Booking',
        nextStep: 'Capture Delivery',
        primaryActionLabel: 'Capture Delivery',
        primaryPath: deliveryPath,
        target: 'DELIVERY',
      };
    }

    return {
      workLabel: 'Booking',
      nextStep: 'Continue Booking',
      primaryActionLabel: 'Continue Booking',
      primaryPath: bookingPath,
      target: 'BOOKING',
    };
  }

  if (item.openFlagCount > 0) {
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

  if (item.booking.businessStatus === 'BOOKING_CLOSED' || item.booking.captureCompletedAtUtc) {
    return {
      workLabel: 'Booking',
      nextStep: 'Capture Delivery',
      primaryActionLabel: 'Capture Delivery',
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

function WorkItemRow({
  item,
  timezoneName,
  isPc,
  flagsView,
  productLabelOverride,
}: {
  item: Uc03WorkItem;
  timezoneName: string;
  isPc: boolean;
  flagsView: boolean;
  productLabelOverride?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const project = useProjectContextStore((state) => state.selectedProject);
  const accessToken = useSessionStore((state) => state.accessToken);
  const bookingPath = `/v2/bookings/${item.journeyId}`;
  const deliveryPath = `/v2/deliveries/${item.journeyId}`;
  const auditPath = `/audit/${item.journeyId}`;
  const presentation = workPresentation(item, isPc, flagsView);
  const isDeliveryWork = presentation.workLabel === 'Delivery';
  const primaryStage = isDeliveryWork ? item.delivery : item.booking;
  const primaryStageKind = isDeliveryWork ? 'DELIVERY' : 'BOOKING';
  const pcStatus = isPc && !isDeliveryWork ? pcBookingStatus(item) : null;
  const effectiveStatus = pcStatus || effectiveStageStatus(primaryStage, primaryStageKind);
  const workStatus = friendlyStatus(effectiveStatus);
  const workStatusTone = statusTone(effectiveStatus);
  const absoluteActivity = activityLabel(item.latestActivityAtUtc, timezoneName);
  const relativeActivity = activityRelativeLabel(item.latestActivityAtUtc);
  const updateRequired = pcStatus === 'BOOKING_UPDATE_REQUIRED';
  const showAttention = updateRequired || (!isPc && item.openFlagCount > 0) || (isPc && flagsView && item.openFlagCount > 0);
  const severityClass = showAttention && item.highestOpenSeverity
    ? ` is-severity-${item.highestOpenSeverity.toLowerCase()}`
    : '';
  const deliveryEligible = Boolean(item.delivery.businessStatus || item.booking.captureCompletedAtUtc || item.booking.businessStatus === 'BOOKING_CLOSED');
  const auditAvailable = Boolean(item.booking.businessStatus || item.delivery.businessStatus);
  const productLabel = productLabelOverride || item.productLabel || 'Vehicle not captured';
  const bookingDetailsQuery = useQuery({
    queryKey: ['uc03-work-item-booking-details', project?.tenantId, item.journeyId],
    queryFn: () => getBookingDetailsV2(project!.tenantId, item.journeyId, accessToken),
    enabled: Boolean(expanded && project?.tenantId && accessToken),
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const bookingDetails = bookingDetailsQuery.data;

  return (
    <article className={`uc03-work-row-v2${expanded ? ' is-expanded' : ''}${showAttention ? ' has-attention' : ''}${severityClass}`}>
      <div className="uc03-work-row-v2__cell uc03-work-row-v2__customer">
        <strong>{item.customerDisplayName}</strong>
        <span>{item.bookingReference || 'Booking reference not captured'}</span>
        {item.customerMobileLast4 && <small>Mobile •••• {item.customerMobileLast4}</small>}
      </div>

      <div className="uc03-work-row-v2__cell uc03-work-row-v2__vehicle">
        <strong>{productLabel}</strong>
        <small>{presentation.workLabel} journey</small>
      </div>

      <div className="uc03-work-row-v2__cell uc03-work-row-v2__dates">
        <div>
          <span>Booking date</span>
          <strong>{businessDateLabel(item.booking.businessDate)}</strong>
        </div>
        {item.delivery.businessDate && (
          <div>
            <span>Delivery date</span>
            <strong>{businessDateLabel(item.delivery.businessDate)}</strong>
          </div>
        )}
        <small title={absoluteActivity}>Last activity · {relativeActivity}</small>
      </div>

      <div className="uc03-work-row-v2__cell uc03-work-row-v2__status">
        <strong className={`uc03-work-status-pill ${workStatusTone}`}>{workStatus}</strong>
        {isPc && !isDeliveryWork && <small>{pcBookingCaptureNote(item)}</small>}
        {!isPc && <VerificationBadge stage={primaryStage} />}
        {item.openFlagCount > 0 && <small>{item.openFlagCount} open observation{item.openFlagCount === 1 ? '' : 's'}</small>}
      </div>

      <div className="uc03-work-row-v2__cell uc03-work-row-v2__actions">
        <div className="uc03-work-row-v2__action-buttons">
          <Link
            className="uc03-work-card__primary-action"
            to={presentation.primaryPath}
            state={overviewOpenState(item, presentation.target)}
          >
            {presentation.primaryActionLabel}
          </Link>
          {presentation.secondaryActionLabel && presentation.secondaryPath && presentation.secondaryTarget && (
            <Link
              className="uc03-work-card__secondary-action"
              to={presentation.secondaryPath}
              state={overviewOpenState(item, presentation.secondaryTarget)}
            >
              {presentation.secondaryActionLabel}
            </Link>
          )}
        </div>
        <button
          type="button"
          className="uc03-work-row-v2__details-button"
          aria-expanded={expanded}
          onClick={() => setExpanded((current) => !current)}
        >
          {expanded ? 'Hide Details' : 'View Details'}
        </button>
      </div>

      {expanded && (
        <div className="uc03-work-row-v2__details">
          {bookingDetailsQuery.isPending && (
            <div><span>Captured Booking details</span><strong>Loading…</strong></div>
          )}
          {bookingDetailsQuery.isError && (
            <div><span>Captured Booking details</span><strong>Could not load</strong></div>
          )}
          {bookingDetails && (
            <>
              <div><span>Vehicle</span><strong>{productLabel}</strong></div>
              <div><span>Customer type</span><strong>{friendlyStatus(bookingDetails.customerType, 'Not captured')}</strong></div>
              <div><span>Deal type</span><strong>{friendlyStatus(bookingDetails.dealType, 'Not captured')}</strong></div>
              <div><span>Deal source</span><strong>{friendlyStatus(bookingDetails.dealSource, 'Not captured')}</strong></div>
              <div><span>Lead source</span><strong>{friendlyStatus(bookingDetails.leadSource, 'Not captured')}</strong></div>
              <div><span>Registration state</span><strong>{friendlyStatus(bookingDetails.registrationState, 'Not captured')}</strong></div>
              <div><span>Registration type</span><strong>{friendlyStatus(bookingDetails.registrationType, 'Not captured')}</strong></div>
              <div><span>Registration category</span><strong>{friendlyStatus(bookingDetails.registrationCategory, 'Not captured')}</strong></div>
              <div><span>Territory</span><strong>{friendlyStatus(bookingDetails.territoryCategorization, 'Not captured')}</strong></div>
              <div><span>District</span><strong>{friendlyStatus(bookingDetails.districtName, 'Not captured')}</strong></div>
              <div><span>Outright purchase</span><strong>{yesNo(bookingDetails.outrightPurchase)}</strong></div>
              <div><span>Trade-In</span><strong>{yesNo(bookingDetails.tradeIn)}</strong></div>
              <div><span>GST benefit</span><strong>{yesNo(bookingDetails.gstBenefit)}</strong></div>
            </>
          )}
          {isPc && updateRequired && (
            <p>Booking requires additional information. Update Booking remains available while Delivery can continue unless a specific business rule blocks it.</p>
          )}
          {!isPc && (
            <div className="uc03-work-row-v2__stages">
              <StageBlock label="Booking" item={item.booking} />
              <StageBlock label="Delivery" item={item.delivery} />
            </div>
          )}
          <div className="uc03-work-row-v2__detail-links">
            {presentation.primaryPath !== bookingPath && (
              <Link to={bookingPath} state={overviewOpenState(item, 'BOOKING')}>Open Booking</Link>
            )}
            {deliveryEligible && presentation.primaryPath !== deliveryPath && presentation.secondaryPath !== deliveryPath && (
              <Link to={deliveryPath} state={overviewOpenState(item, 'DELIVERY')}>
                {item.delivery.businessStatus ? 'Open Delivery' : 'Capture Delivery'}
              </Link>
            )}
            {auditAvailable && presentation.primaryPath !== auditPath && (
              <Link to={auditPath} state={overviewOpenState(item, 'AUDIT')}>
                {isPc ? 'Raise Observation' : 'Audit Review'}
              </Link>
            )}
          </div>
        </div>
      )}
    </article>
  );
}

function ReviewPendingCard({ item, timezoneName }: { item: ReviewPendingItem; timezoneName: string }) {
  const absoluteActivity = activityLabel(item.latestActivityAtUtc, timezoneName);
  const relativeActivity = activityRelativeLabel(item.latestActivityAtUtc);
  const ageTone = (() => {
    const date = new Date(item.latestActivityAtUtc);
    if (Number.isNaN(date.getTime())) return 'is-age-neutral';
    const elapsedHours = Math.max(0, Date.now() - date.getTime()) / 3_600_000;
    if (elapsedHours >= 48) return 'is-age-critical';
    if (elapsedHours >= 24) return 'is-age-warning';
    return 'is-age-fresh';
  })();
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
          <strong>Review Booking</strong>
          <small>TL review pending</small>
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
          Review Booking
        </Link>
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
  const [enrichedProductLabels, setEnrichedProductLabels] = useState<Record<string, string>>({});
  const enrichmentRequestedRef = useRef<Set<string>>(new Set());
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  const selectedOutlet = project?.scope.outlets.find((outlet) => outlet.outletId === outletId);
  const pcContextReady = project?.operatingRole !== 'PC' || Boolean(outletId);
  const isPc = project?.operatingRole === 'PC';
  const isTl = project?.operatingRole === 'TL';
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
    enabled: Boolean(isTl && view === 'REVIEW_PENDING' && project?.tenantId && accessToken && pcContextReady),
    retry: 1,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
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

  const reviewPendingItems = useMemo(() => reviewPendingQuery.data?.items ?? [], [reviewPendingQuery.data?.items]);
  const workItems = useMemo(
    () => workQuery.data?.pages.flatMap((page) => page.items) ?? [],
    [workQuery.data],
  );
  const displayedWorkItems = useMemo(() => {
    let items = workItems;
    if (isPc && view === 'BOOKING') {
      items = items.filter((item) => !item.delivery.businessStatus);
    } else if (isPc && view === 'FLAGS') {
      items = items.filter((item) => item.openFlagCount > 0);
    }

    return [...items].sort((left, right) => {
      const leftTime = new Date(left.latestActivityAtUtc).getTime();
      const rightTime = new Date(right.latestActivityAtUtc).getTime();
      if (Number.isNaN(leftTime) || Number.isNaN(rightTime)) return 0;
      return leftTime - rightTime;
    });
  }, [isPc, view, workItems]);
  const timezoneName = workQuery.data?.pages[0]?.filters.timezoneName || project?.timezoneName || 'UTC';

  useEffect(() => {
    if (!isPc || !project?.tenantId || !accessToken || workItems.length === 0) return;
    const missing = workItems
      .filter((item) => !item.productLabel && !enrichedProductLabels[item.journeyId] && !enrichmentRequestedRef.current.has(item.journeyId))
      .slice(0, 10);
    if (missing.length === 0) return;

    missing.forEach((item) => enrichmentRequestedRef.current.add(item.journeyId));
    void enrichUc03WorkItems(
      project.tenantId,
      missing.map((item) => item.journeyId),
      accessToken,
    ).then((response) => {
      if (response.items.length === 0) return;
      setEnrichedProductLabels((current) => {
        const next = { ...current };
        response.items.forEach((item) => {
          if (item.productLabel) next[item.journeyId] = item.productLabel;
        });
        return next;
      });
    }).catch(() => {
      // Post-paint enrichment must never replace or delay the already-visible Work Queue.
    });
  }, [accessToken, enrichedProductLabels, isPc, project?.tenantId, workItems]);

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
  const bookingMetricValue = metrics ? String(metrics.bookingsInProgress) : '—';
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
  const queueTitle = view === 'REVIEW_PENDING' ? 'Review Pending' : view === 'FLAGS' ? 'Observations' : 'Work Queue';
  const queueNote = view === 'REVIEW_PENDING'
    ? `${reviewPendingCount} Booking review${reviewPendingCount === 1 ? '' : 's'} pending`
    : view === 'FLAGS'
      ? `${displayedWorkItems.length} loaded with open observations`
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
            <p>The Work Queue remains available while summary counts recover.</p>
          </div>
          <button type="button" className="user-menu-button" onClick={() => metricsQuery.refetch()}>Try Again</button>
        </section>
      ) : (
        <div className="uc03-landing-metrics" aria-label="Current work summary">
          <LandingMetric
            label="Bookings"
            value={bookingMetricValue}
            detail={isPc ? 'Capture in progress' : 'In progress'}
            actionLabel="View"
            onSelect={() => selectWork('BOOKING')}
          />
          <LandingMetric
            label="Deliveries"
            value={metrics ? String(metrics.deliveryInProgress) : '—'}
            detail={isPc ? 'Capture in progress' : 'In progress'}
            actionLabel="View"
            onSelect={() => selectWork('DELIVERY')}
          />
          {isPc ? (
            <LandingMetric
              label="Observations"
              value={metrics ? String(metrics.auditFlags) : '—'}
              detail="Open items"
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
          {isTl && (
            <LandingMetric
              label="Review Pending"
              value={view === 'REVIEW_PENDING' && reviewPendingQuery.data ? String(reviewPendingCount) : '—'}
              detail="TL review queue"
              actionLabel="Review"
              onSelect={() => selectWork('REVIEW_PENDING')}
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
            ...(isTl ? [['REVIEW_PENDING', 'Review Pending']] : []),
            ['DELIVERY', 'Deliveries'],
            ...(isPc ? [['FLAGS', `Observations${metrics ? ` (${metrics.auditFlags})` : ''}`]] : []),
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
                  <p>Please try again.</p>
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
                    <strong>No TL reviews pending.</strong>
                    <p>Bookings requiring TL review will appear here.</p>
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
                <div className="uc03-work-cards uc03-work-cards--v2">
                  {displayedWorkItems.length > 0 && (
                    <div className="uc03-work-table-head uc03-work-table-head--v2" aria-hidden="true">
                      <span>Customer</span>
                      <span>Vehicle</span>
                      <span>Dates</span>
                      <span>Status</span>
                      <span>Next Action</span>
                    </div>
                  )}
                  {displayedWorkItems.map((item) => (
                    <WorkItemRow
                      key={item.journeyId}
                      item={item}
                      timezoneName={timezoneName}
                      isPc={isPc}
                      flagsView={view === 'FLAGS'}
                      productLabelOverride={enrichedProductLabels[item.journeyId]}
                    />
                  ))}
                  {displayedWorkItems.length === 0 && (
                    <div className="uc03-work-empty">
                      <strong>{view === 'FLAGS' ? 'No open observations in the loaded work.' : 'No matching Booking or Delivery work.'}</strong>
                      <p>{view === 'FLAGS' ? 'Open observations remain separate from the Booking or Delivery business status.' : 'Capture a new Booking to begin.'}</p>
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
