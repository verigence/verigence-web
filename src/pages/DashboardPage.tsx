import { useEffect, useMemo, useRef, useState } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

import { verigenceLockup } from '../assets/verigenceLockup';
import StatusPill from '../components/StatusPill';
import {
  getUc03LandingMetrics,
  listUc03WorkItems,
  type Uc03WorkItem,
  type Uc03WorkType,
} from '../services/audit-core/uc03';
import { useProjectContextStore } from '../store/projectContextStore';
import { useSessionStore } from '../store/sessionStore';
import CreateBookingPage from './CreateBookingPage';

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

function greetingForTime(timezoneName: string): string {
  try {
    const hourText = new Intl.DateTimeFormat('en-GB', {
      timeZone: timezoneName,
      hour: '2-digit',
      hourCycle: 'h23',
    }).format(new Date());
    const hour = Number.parseInt(hourText, 10);
    if (hour < 12) return 'Good Morning';
    if (hour < 17) return 'Good Afternoon';
    return 'Good Evening';
  } catch {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good Morning';
    if (hour < 17) return 'Good Afternoon';
    return 'Good Evening';
  }
}

function firstNameFromDisplayName(displayName: string): string {
  const firstPart = displayName.trim().split(/[\s._-]+/).find(Boolean) || '';
  if (!firstPart) return '';
  return firstPart.charAt(0).toUpperCase() + firstPart.slice(1);
}

function auditStageSummary(item: Uc03WorkItem['booking']): string {
  const state = friendlyStatus(item.auditState);
  if (item.auditStatus === 'FLAGS_RAISED') return `${state} · Flags Raised`;
  if (item.auditStatus === 'NO_FLAGS') return `${state} · No Flags`;
  return `${state} · Not Evaluated`;
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
  greeting: string;
  dealershipName: string;
  outletName: string;
  showCaptureAction: boolean;
};

function DashboardHero({ greeting, dealershipName, outletName, showCaptureAction }: DashboardHeroProps) {
  return (
    <section className="uc03-dashboard-hero uc03-dashboard-hero--greeting" aria-labelledby="uc03-dashboard-hero-title">
      <div className="uc03-dashboard-hero__copy">
        <span className="uc03-dashboard-hero__greeting">{greeting}</span>
        <h1 id="uc03-dashboard-hero-title">{dealershipName}</h1>
        <p>{outletName}</p>
      </div>

      <div className="uc03-dashboard-hero__brand" aria-hidden="true">
        <img src={verigenceLockup} alt="" />
      </div>

      {showCaptureAction && (
        <Link className="uc03-landing__capture-action uc03-landing__capture-action--centered" to="/dashboard?action=create-booking">
          <span aria-hidden="true">＋</span>
          <span>Capture New Booking</span>
        </Link>
      )}
    </section>
  );
}

function WorkItemCard({ item, timezoneName }: { item: Uc03WorkItem; timezoneName: string }) {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const bookingStatus = item.booking.businessStatus;
  const bookingPath = `/bookings/${item.journeyId}`;
  const deliveryEligible = Boolean(
    item.delivery.businessStatus
      || bookingStatus === 'BOOKING_STARTED'
      || bookingStatus === 'BOOKING_IN_PROGRESS'
      || bookingStatus === 'BOOKING_CLOSED',
  );
  const auditAvailable = Boolean(item.booking.businessStatus || item.delivery.businessStatus || item.totalFlagCount > 0);
  const hasSecondaryActions = deliveryEligible || auditAvailable;

  return (
    <article
      className={`uc03-work-card uc03-work-card--interactive${expanded ? ' is-expanded' : ' is-compact'}`}
      role="link"
      tabIndex={0}
      aria-label={`Open Booking for ${item.customerDisplayName}`}
      onClick={(event) => {
        const target = event.target as HTMLElement;
        if (target.closest('a, button')) return;
        navigate(bookingPath);
      }}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === 'Enter') {
          event.preventDefault();
          navigate(bookingPath);
        }
      }}
    >
      <header className="uc03-work-card__header">
        <div className="uc03-work-card__identity">
          <span className="uc03-work-card__reference">{item.bookingReference || 'Booking reference pending'}</span>
          <h3>{item.customerDisplayName}</h3>
          <p>{item.productLabel || 'Vehicle details pending'}</p>
        </div>
        <div className="uc03-work-card__summary">
          <span className="uc03-work-card__status-label">Booking</span>
          <strong>{friendlyStatus(item.booking.businessStatus)}</strong>
          <span className={`uc03-work-card__audit-state${item.booking.auditStatus === 'FLAGS_RAISED' ? ' is-attention' : ''}`}>
            Audit {auditStageSummary(item.booking)}
          </span>
        </div>
      </header>

      <div className="uc03-work-card__location">
        <span>{item.dealerName}</span><span aria-hidden="true">·</span><span>{item.outletName}</span>
        {item.customerMobileLast4 && <span>Mobile •••• {item.customerMobileLast4}</span>}
      </div>

      {expanded && (
        <div className="uc03-work-card__expanded-content">
          <div className="uc03-work-card__stages">
            <StageBlock label="Booking" item={item.booking} />
            <StageBlock label="Delivery" item={item.delivery} />
          </div>
          <div className="uc03-work-card__expanded-meta">
            <span>Latest activity {activityLabel(item.latestActivityAtUtc, timezoneName)}</span>
            {item.totalFlagCount > 0 && (
              <span>{item.totalFlagCount} Audit Flag{item.totalFlagCount === 1 ? '' : 's'} Raised</span>
            )}
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
        <div className="uc03-work-card__activity">
          {!expanded && <span>Latest activity {activityLabel(item.latestActivityAtUtc, timezoneName)}</span>}
          <span className="uc03-work-card__primary-hint">Open Booking <span aria-hidden="true">→</span></span>
        </div>

        <div className="uc03-work-card__controls">
          <button
            type="button"
            className="uc03-work-card__details-button"
            aria-expanded={expanded}
            onClick={(event) => {
              event.stopPropagation();
              setExpanded((current) => !current);
              setMoreOpen(false);
            }}
          >
            {expanded ? 'Hide details' : 'View details'}
          </button>

          {hasSecondaryActions && (
            <>
              <div className="uc03-work-card__actions uc03-work-card__actions--desktop">
                {deliveryEligible && (
                  <Link className="uc03-c1-secondary" to={`/deliveries/${item.journeyId}`}>
                    {item.delivery.businessStatus ? 'Delivery' : 'Start Delivery'}
                  </Link>
                )}
                {auditAvailable && (
                  <Link className="uc03-c1-secondary" to={`/audit/${item.journeyId}`}>Audit Review</Link>
                )}
              </div>

              <div className="uc03-work-card__mobile-more">
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
                  <span>More</span><strong aria-hidden="true">•••</strong>
                </button>
                {moreOpen && (
                  <div className="uc03-work-card__more-menu" role="menu">
                    {deliveryEligible && (
                      <Link role="menuitem" to={`/deliveries/${item.journeyId}`}>
                        {item.delivery.businessStatus ? 'Open Delivery' : 'Start Delivery'}
                      </Link>
                    )}
                    {auditAvailable && <Link role="menuitem" to={`/audit/${item.journeyId}`}>Audit Review</Link>}
                  </div>
                )}
              </div>
            </>
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
  const displayName = useSessionStore((state) => state.displayName);
  const [workType, setWorkType] = useState<Uc03WorkType>('ALL');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  const selectedOutlet = project?.scope.outlets.find((outlet) => outlet.outletId === outletId);
  const pcContextReady = project?.operatingRole !== 'PC' || Boolean(outletId);

  const metricsQuery = useQuery({
    queryKey: ['uc03-landing-metrics', project?.tenantId, outletId],
    queryFn: () => getUc03LandingMetrics(project!.tenantId, outletId || undefined, accessToken),
    enabled: Boolean(project?.tenantId && accessToken && pcContextReady),
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
    enabled: Boolean(project?.tenantId && accessToken && pcContextReady),
    retry: 1,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const workItems = useMemo(
    () => workQuery.data?.pages.flatMap((page) => page.items) ?? [],
    [workQuery.data],
  );
  const timezoneName = workQuery.data?.pages[0]?.filters.timezoneName || project?.timezoneName || 'UTC';

  useEffect(() => {
    const node = loadMoreRef.current;
    if (!node || !workQuery.hasNextPage) return undefined;

    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting && !workQuery.isFetchingNextPage) {
        void workQuery.fetchNextPage();
      }
    }, { rootMargin: '240px 0px' });

    observer.observe(node);
    return () => observer.disconnect();
  }, [workQuery.fetchNextPage, workQuery.hasNextPage, workQuery.isFetchingNextPage]);

  if (!project) return null;
  if (searchParams.get('action') === 'create-booking' && project.operatingRole === 'PC') {
    return <CreateBookingPage />;
  }

  const metrics = metricsQuery.data;
  const isPc = project.operatingRole === 'PC';
  const pcFirstName = firstNameFromDisplayName(displayName);
  const timeGreeting = greetingForTime(project.timezoneName || timezoneName);
  const greeting = pcFirstName ? `${timeGreeting}, ${pcFirstName}` : timeGreeting;
  const dealershipName = isPc && selectedOutlet ? selectedOutlet.dealerName : project.projectName;
  const outletName = isPc && selectedOutlet
    ? selectedOutlet.outletName
    : 'Booking and Delivery work for your current authorized business scope.';
  const activeDateFilterCount = Number(Boolean(fromDate)) + Number(Boolean(toDate));

  const selectWork = (nextWorkType: Uc03WorkType) => {
    setWorkType(nextWorkType);
    window.requestAnimationFrame(() => {
      document.getElementById('uc03-work-list-title')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  const invalidDateRange = Boolean(fromDate && toDate && fromDate > toDate);

  return (
    <div className="screen-stack uc03-landing uc03-landing--phase2 uc03-landing--approved">
      <DashboardHero
        greeting={greeting}
        dealershipName={dealershipName}
        outletName={outletName}
        showCaptureAction={isPc}
      />

      {metricsQuery.isError ? (
        <section className="dashboard-load-state" role="alert">
          <div className="dashboard-load-state__mark" aria-hidden="true">!</div>
          <div className="dashboard-load-state__copy">
            <strong>We couldn't load the work summary.</strong>
            <p>Please try again. Your recent work list is kept separate from this summary.</p>
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
            detail="Cases needing review"
            attention={Boolean(metrics?.needsAttention)}
          />
          <LandingMetric
            label="Audit Status"
            value={typeof metrics?.auditInProgress === 'number' ? String(metrics.auditInProgress) : '—'}
            detail="In progress"
          />
        </div>
      )}

      <section className="uc03-work-list" aria-labelledby="uc03-work-list-title">
        <header className="uc03-work-list__heading uc03-work-list__heading--approved">
          <div>
            <span>Latest Bookings &amp; Deliveries</span>
            <h2 id="uc03-work-list-title">Recent Work</h2>
          </div>
          <button
            type="button"
            className={`uc03-filter-toggle${filtersOpen || activeDateFilterCount ? ' is-active' : ''}`}
            aria-expanded={filtersOpen}
            onClick={() => setFiltersOpen((current) => !current)}
          >
            Filters{activeDateFilterCount > 0 ? ` (${activeDateFilterCount})` : ''}
          </button>
        </header>

        <div className="uc03-work-filter-tabs uc03-work-filter-tabs--approved" role="group" aria-label="Transaction type">
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

        {(filtersOpen || activeDateFilterCount > 0) && (
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
              {workItems.map((item) => (
                <WorkItemCard key={item.journeyId} item={item} timezoneName={timezoneName} />
              ))}
              {workItems.length === 0 && (
                <div className="uc03-work-empty">
                  <strong>No matching Booking or Delivery work.</strong>
                  <p>Capture a new Booking to begin.</p>
                </div>
              )}
            </div>

            {workItems.length > 0 && (
              <div className="uc03-lazy-load" aria-live="polite">
                <span>{workItems.length} transaction{workItems.length === 1 ? '' : 's'} loaded</span>
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
      </section>
    </div>
  );
}
