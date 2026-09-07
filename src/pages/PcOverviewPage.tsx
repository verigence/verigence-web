import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

import { effectiveStageStatus, overviewOpenState, type OverviewTarget } from '../features/uc03/overviewOpen';
import {
  getUc03LandingMetrics,
  getUc03PcStats,
  listUc03WorkItems,
  type Uc03WorkItem,
} from '../services/audit-core/uc03';
import { enrichUc03WorkItems } from '../services/audit-core/uc03WorkItemEnrichment';
import { useProjectContextStore } from '../store/projectContextStore';
import { useSessionStore } from '../store/sessionStore';

/*
 * Redesigned Process Coordinator dashboard — see
 * docs/uc-003-booking-delivery-audit/pc-overview-redesign/.
 * Runs entirely on the existing /uc03 endpoints. The only thing it cannot
 * source today is the weekly/monthly "completed" performance strip, which
 * needs GET /uc03/pc-stats (audit-core) — tracked in the folder README.
 */

// Web-UI configuration (no backend). A booking / delivery with no activity for
// longer than this is surfaced to the PC as needing a nudge.
const STALE_BOOKING_DAYS = 7;
const STALE_DELIVERY_DAYS = 5;

const MAX_CARDS = 4;

// Where each hero KPI tile deep-links — the legacy work queue, filtered.
const QUEUE = '/dashboard?legacyDashboard=1';

// Reasons a journey needs the PC, in priority order.
//
// Booking and delivery run the same shape: capture documents -> the machine
// reads the fields -> the PC manually verifies the low-confidence ones and
// submits. VERIFY_BOOKING / VERIFY_DELIVERY are that manual-verification step
// for each stage (pcVerificationStatus === 'PENDING' after capture).
//
// NOTE — "sent back by the Team Lead" is NOT a reason here yet: audit-core does
// not surface it on Uc03WorkItem. `nextActionCode` is always null today, and the
// TL send-back only sets journeys.audit_state = 'SENT_BACK', which the work-items
// payload does not return. Until then a sent-back booking still surfaces here —
// as FLAGGED (the send-back usually raises findings) or, failing that, as STALE.
type Reason = 'FLAGGED' | 'VERIFY_BOOKING' | 'VERIFY_DELIVERY' | 'DELIVERY' | 'STALE';

interface Candidate {
  item: Uc03WorkItem;
  reason: Reason;
  ageMs: number;
  staleDays: number;
}

// Stage codes: journey_stage_states.stage_code = BOOKING | DELIVERY | POST_DELIVERY.
// Uc03WorkItem exposes `booking` and `delivery` as Uc03StageSummary.
// business_status vocabulary (auditcore.business_status_codes + uc03_booking_commands):
//   BOOKING : BOOKING_STARTED · BOOKING_IN_PROGRESS · BOOKING_CLOSED
//             · BOOKING_CANCELLED · DUPLICATE_BOOKING
//             ("no delivery" is BOOKING_CLOSED with closure_disposition = NO_DELIVERY)
//   DELIVERY: DELIVERY_STARTED · DELIVERY_IN_PROGRESS · DELIVERY_COMPLETED
const BOOKING_DONE_STATUSES = new Set([
  'BOOKING_CLOSED',
  'BOOKING_CANCELLED',
  'DUPLICATE_BOOKING',
]);
const DELIVERY_DONE_STATUSES = new Set(['DELIVERY_COMPLETED']);

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function firstName(displayName: string, email: string): string {
  const source = (displayName || email.split('@')[0] || '').replace(/[._-]+/g, ' ').trim();
  const token = source.split(' ')[0] || 'there';
  return token.charAt(0).toUpperCase() + token.slice(1);
}

function ageLabel(fromIso: string): string {
  const then = new Date(fromIso).getTime();
  if (Number.isNaN(then)) return 'a while ago';
  const minutes = Math.max(0, Math.floor((Date.now() - then) / 60_000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 14) return `${days}d ago`;
  return `${Math.floor(days / 7)}w ago`;
}

function daysSince(fromIso: string): number {
  const then = new Date(fromIso).getTime();
  if (Number.isNaN(then)) return 0;
  return Math.floor((Date.now() - then) / 86_400_000);
}

function deliveryStarted(item: Uc03WorkItem): boolean {
  return Boolean(item.delivery.businessStatus);
}

function deliveryDone(item: Uc03WorkItem): boolean {
  const status = (effectiveStageStatus(item.delivery, 'DELIVERY') || '').toUpperCase();
  return DELIVERY_DONE_STATUSES.has(status);
}

function bookingCompleted(item: Uc03WorkItem): boolean {
  // effectiveStageStatus() already synthesises BOOKING_COMPLETED from
  // captureCompletedAtUtc when the stage is not in a terminal state.
  const status = (effectiveStageStatus(item.booking, 'BOOKING') || '').toUpperCase();
  return status === 'BOOKING_COMPLETED' || BOOKING_DONE_STATUSES.has(status);
}

// A stage whose documents are captured but the PC has not yet confirmed the
// values the machine read off them (any field below the 90% confidence bar
// needs a manual check). Same rule for booking and delivery.
function bookingManualVerification(item: Uc03WorkItem): boolean {
  return Boolean(item.booking.captureCompletedAtUtc)
    && item.booking.pcVerificationStatus === 'PENDING';
}

function deliveryManualVerification(item: Uc03WorkItem): boolean {
  return Boolean(item.delivery.captureCompletedAtUtc)
    && item.delivery.pcVerificationStatus === 'PENDING';
}

function needsManualVerification(item: Uc03WorkItem): boolean {
  return bookingManualVerification(item) || deliveryManualVerification(item);
}

// Two phases, three steps each — Booking and Delivery both run
// Docs → Verify (skipped through if nothing is below 90%) → Done.
//   0 Booking · Docs      3 Delivery · Docs
//   1 Booking · Verify    4 Delivery · Verify
//   2 Booking · Done      5 Delivered
function journeyStep(item: Uc03WorkItem): { index: number; pct: number } {
  if (deliveryDone(item)) return { index: 5, pct: 100 };
  if (deliveryManualVerification(item)) return { index: 4, pct: 76 };
  if (deliveryStarted(item)) return { index: 3, pct: 58 };
  if (bookingManualVerification(item)) return { index: 1, pct: 25 };
  if (bookingCompleted(item)) return { index: 2, pct: 42 };
  return { index: 0, pct: item.processingDocumentCount > 0 ? 16 : 8 };
}

const RAIL_PHASES: { caption: string; steps: string[] }[] = [
  { caption: 'Booking', steps: ['Docs', 'Verify', 'Done'] },
  { caption: 'Delivery', steps: ['Docs', 'Verify', 'Done'] },
];

function classifyCandidate(item: Uc03WorkItem): Candidate | null {
  const ageMs = Math.max(0, Date.now() - new Date(item.latestActivityAtUtc).getTime());
  const staleDays = daysSince(item.latestActivityAtUtc);

  if (item.openFlagCount > 0) return { item, reason: 'FLAGGED', ageMs, staleDays };
  if (deliveryManualVerification(item)) return { item, reason: 'VERIFY_DELIVERY', ageMs, staleDays };
  if (bookingManualVerification(item) && !deliveryStarted(item)) {
    return { item, reason: 'VERIFY_BOOKING', ageMs, staleDays };
  }
  if (deliveryStarted(item) && !deliveryDone(item)) {
    if (staleDays >= STALE_DELIVERY_DAYS) return { item, reason: 'STALE', ageMs, staleDays };
    return { item, reason: 'DELIVERY', ageMs, staleDays };
  }
  // Booking not yet done and no delivery started, untouched for too long.
  if (!deliveryStarted(item) && !bookingCompleted(item) && staleDays >= STALE_BOOKING_DAYS) {
    return { item, reason: 'STALE', ageMs, staleDays };
  }
  return null;
}

const REASON_ORDER: Record<Reason, number> = {
  FLAGGED: 0,
  VERIFY_DELIVERY: 1,
  VERIFY_BOOKING: 1,
  DELIVERY: 2,
  STALE: 3,
};

interface CardPresentation {
  ask: string;
  chip: string;
  chipHot: boolean;
  actionLabel: string;
  to: string;
  target: OverviewTarget;
}

function presentCard(candidate: Candidate): CardPresentation {
  const { item, reason, staleDays } = candidate;
  const bookingPath = `/v2/bookings/${item.journeyId}`;
  const deliveryPath = `/v2/deliveries/${item.journeyId}`;
  const auditPath = `/audit/${item.journeyId}`;

  if (reason === 'FLAGGED') {
    const n = item.openFlagCount;
    return {
      ask: `${n} observation${n === 1 ? '' : 's'} raised on this journey. Review and resolve what is needed.`,
      chip: `${n} open`,
      chipHot: true,
      actionLabel: 'Review observations',
      to: auditPath,
      target: 'AUDIT',
    };
  }
  if (reason === 'VERIFY_BOOKING') {
    return {
      ask: 'Booking documents are in. Verify the values read off them, then submit for review.',
      chip: `Ready ${ageLabel(item.latestActivityAtUtc)}`,
      chipHot: false,
      actionLabel: 'Verify & submit',
      to: `${bookingPath}/review`,
      target: 'BOOKING_REVIEW',
    };
  }
  if (reason === 'VERIFY_DELIVERY') {
    return {
      ask: 'Delivery documents are in. Verify the values read off them, then submit for review.',
      chip: `Ready ${ageLabel(item.latestActivityAtUtc)}`,
      chipHot: false,
      actionLabel: 'Verify & submit',
      to: `${deliveryPath}/review`,
      target: 'DELIVERY_REVIEW',
    };
  }
  if (reason === 'DELIVERY') {
    return {
      ask: 'Delivery is in progress. Add the remaining photos and documents to complete it.',
      chip: `In delivery · ${ageLabel(item.latestActivityAtUtc)}`,
      chipHot: false,
      actionLabel: 'Continue delivery',
      to: deliveryPath,
      target: 'DELIVERY',
    };
  }
  const started = deliveryStarted(item);
  return {
    ask: `No action for ${staleDays} days. Check with the customer or move the ${started ? 'delivery' : 'booking'} forward.`,
    chip: `No action · ${staleDays}d`,
    chipHot: true,
    actionLabel: started ? 'Open delivery' : 'Open booking',
    to: started ? deliveryPath : bookingPath,
    target: started ? 'DELIVERY' : 'BOOKING',
  };
}

function JourneyRail({ step }: { step: { index: number; pct: number } }) {
  return (
    <div className="pcov-track">
      <div className="pcov-rail">
        <i style={{ width: `${step.pct}%` }} />
        <em className="pcov-rail__mid" aria-hidden="true" />
      </div>
      <div className="pcov-steps">
        {RAIL_PHASES.map((phase, phaseIndex) => (
          <div className="pcov-steps__phase" key={phase.caption}>
            <b>{phase.caption}</b>
            <div>
              {phase.steps.map((label, s) => {
                const globalIndex = phaseIndex * 3 + s;
                return (
                  <span key={label} className={globalIndex === step.index ? 'is-now' : undefined}>
                    {label}
                  </span>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function localIsoDate(value: Date): string {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}

function statsRange(period: 'week' | 'month'): { from: string; to: string } {
  const now = new Date();
  const start = new Date(now);
  if (period === 'week') {
    start.setDate(now.getDate() - 6);
  } else {
    start.setDate(1);
  }
  return { from: localIsoDate(start), to: localIsoDate(now) };
}

function WorkCard({
  candidate,
  productLabel,
}: {
  candidate: Candidate;
  productLabel: string;
}) {
  const { item } = candidate;
  const step = journeyStep(item);
  const presentation = presentCard(candidate);
  return (
    <article className="pcov-card">
      <div className="pcov-card__veh">{productLabel}</div>
      <div className="pcov-card__cust">
        <b>{item.customerDisplayName}</b>
        {item.bookingReference ? ` · ${item.bookingReference}` : ''}
      </div>
      <JourneyRail step={step} />
      <p className="pcov-card__ask">{presentation.ask}</p>
      <div className="pcov-card__foot">
        <span className={`pcov-chip ${presentation.chipHot ? 'pcov-chip--hot' : 'pcov-chip--soft'}`}>
          {presentation.chip}
        </span>
        <Link
          className="pcov-card__go"
          to={presentation.to}
          state={overviewOpenState(item, presentation.target)}
        >
          {presentation.actionLabel}
          <span aria-hidden="true">→</span>
        </Link>
      </div>
    </article>
  );
}

export default function PcOverviewPage() {
  const project = useProjectContextStore((state) => state.selectedProject);
  const accessToken = useSessionStore((state) => state.accessToken);
  const outletId = useSessionStore((state) => state.outletId);
  const displayName = useSessionStore((state) => state.displayName);
  const email = useSessionStore((state) => state.email);

  const [enrichedLabels, setEnrichedLabels] = useState<Record<string, string>>({});
  const enrichmentRequested = useRef<Set<string>>(new Set());
  const [statsPeriod, setStatsPeriod] = useState<'week' | 'month'>('week');

  const contextReady = Boolean(project?.tenantId && accessToken && (project?.operatingRole !== 'PC' || outletId));

  const metricsQuery = useQuery({
    queryKey: ['pcov-landing-metrics', project?.tenantId, outletId],
    queryFn: () => getUc03LandingMetrics(project!.tenantId, outletId || undefined, accessToken),
    enabled: contextReady,
    retry: 1,
  });

  const workQuery = useQuery({
    queryKey: ['pcov-work-items', project?.tenantId, outletId],
    queryFn: () => listUc03WorkItems(
      project!.tenantId,
      { workType: 'ALL', outletId: outletId || undefined },
      accessToken,
    ),
    enabled: contextReady,
    retry: 1,
  });

  // Performance strip — secondary signal, never blocks the dashboard.
  const statsQuery = useQuery({
    queryKey: ['pcov-pc-stats', project?.tenantId, outletId, statsPeriod],
    queryFn: () => getUc03PcStats(
      project!.tenantId,
      statsRange(statsPeriod),
      outletId || undefined,
      accessToken,
    ),
    enabled: contextReady,
    retry: 1,
  });

  const workItems = useMemo(() => workQuery.data?.items ?? [], [workQuery.data]);

  const candidates = useMemo(() => {
    const list: Candidate[] = [];
    for (const item of workItems) {
      const candidate = classifyCandidate(item);
      if (candidate) list.push(candidate);
    }
    return list.sort((left, right) => {
      const order = REASON_ORDER[left.reason] - REASON_ORDER[right.reason];
      if (order !== 0) return order;
      return right.ageMs - left.ageMs;
    });
  }, [workItems]);

  const shownCandidates = candidates.slice(0, MAX_CARDS);

  useEffect(() => {
    if (!project?.tenantId || !accessToken) return;
    const missing = shownCandidates
      .map((candidate) => candidate.item)
      .filter((item) => !item.productLabel
        && !enrichedLabels[item.journeyId]
        && !enrichmentRequested.current.has(item.journeyId));
    if (missing.length === 0) return;
    missing.forEach((item) => enrichmentRequested.current.add(item.journeyId));
    void enrichUc03WorkItems(project.tenantId, missing.map((item) => item.journeyId), accessToken)
      .then((response) => {
        if (response.items.length === 0) return;
        setEnrichedLabels((current) => {
          const next = { ...current };
          for (const entry of response.items) {
            if (entry.productLabel) next[entry.journeyId] = entry.productLabel;
          }
          return next;
        });
      })
      .catch(() => {
        // Enrichment is post-paint decoration; never block the dashboard on it.
      });
  }, [accessToken, enrichedLabels, project?.tenantId, shownCandidates]);

  if (!project) return null;

  const selectedOutlet = project.scope.outlets.find((outlet) => outlet.outletId === outletId);
  const dealerName = selectedOutlet?.dealerName || 'Your dealership';
  const outletName = selectedOutlet?.outletName || 'your outlet';

  const metrics = metricsQuery.data;
  const bookingsInProgress = metrics?.bookingsInProgress ?? 0;
  const deliveriesInProgress = metrics?.deliveryInProgress ?? 0;
  const openFlags = metrics?.auditFlags ?? 0;
  const journeysInProgress = bookingsInProgress + deliveriesInProgress;

  // "Manual verification required" — journeys where booking *or* delivery
  // documents are captured but the PC has not yet confirmed the extracted
  // values. Counted straight off the work items so it is exact (not capped by
  // the "do these next" list, which prioritises flagged journeys first).
  const manualVerificationCount = workItems.filter(needsManualVerification).length;

  const stats = statsQuery.data;

  const flaggedCount = candidates.filter((candidate) => candidate.reason === 'FLAGGED').length;
  const verifyCount = candidates.filter(
    (candidate) => candidate.reason === 'VERIFY_BOOKING' || candidate.reason === 'VERIFY_DELIVERY',
  ).length;
  const staleCount = candidates.filter((candidate) => candidate.reason === 'STALE').length;

  const needCount = candidates.length;
  const loading = workQuery.isPending || metricsQuery.isPending;
  const hasAnyWork = workItems.length > 0 || journeysInProgress > 0;

  const subClauses: string[] = [];
  if (flaggedCount > 0) subClauses.push(`${flaggedCount} with open observations`);
  if (verifyCount > 0) subClauses.push(`${verifyCount} to verify and submit`);
  if (staleCount > 0) subClauses.push(`${staleCount} with no action for ${STALE_BOOKING_DAYS}+ days`);

  const headline = needCount > 0
    ? <>{`${needCount} thing${needCount === 1 ? '' : 's'} `}<b>need{needCount === 1 ? 's' : ''} you</b>{' right now'}</>
    : <><b>You&rsquo;re all caught up</b></>;

  const captureLink = (
    <Link className="pcov-capture" to="/v2/bookings/new">
      <span className="pcov-capture__plus" aria-hidden="true">＋</span>
      <span>Capture new booking</span>
    </Link>
  );

  return (
    <div className="screen-stack pcov">
      <section className="pcov-hero" aria-labelledby="pcov-hero-title">
        <div className="pcov-hero__top">
          <div>
            <p className="pcov-hero__greet">{greeting()}, {firstName(displayName, email)}</p>
            <p className="pcov-hero__place"><b>{dealerName}</b> · {outletName}</p>
          </div>
          {captureLink}
        </div>
        <h1 id="pcov-hero-title" className="pcov-hero__headline">{headline}</h1>
        <p className="pcov-hero__sub">
          {loading
            ? 'Loading your work…'
            : subClauses.length > 0
              ? subClauses.join(' · ')
              : 'Nothing needs your attention right now. New bookings and deliveries will show up here.'}
        </p>
        <div className="pcov-hero__kpis" aria-label="Current work summary">
          <Link className="pcov-kpi" to={`${QUEUE}&view=BOOKING`}>
            <div className="pcov-kpi__value">{metrics ? bookingsInProgress : '—'}</div>
            <div className="pcov-kpi__label">Bookings in progress</div>
          </Link>
          <Link className="pcov-kpi" to={`${QUEUE}&view=DELIVERY`}>
            <div className="pcov-kpi__value">{metrics ? deliveriesInProgress : '—'}</div>
            <div className="pcov-kpi__label">Deliveries in progress</div>
          </Link>
          <Link className="pcov-kpi pcov-kpi--verify" to={`${QUEUE}&view=VERIFY`}>
            <div className="pcov-kpi__value">{workQuery.data ? manualVerificationCount : '—'}</div>
            <div className="pcov-kpi__label">Manual verification required</div>
          </Link>
          <Link className="pcov-kpi pcov-kpi--flag" to={`${QUEUE}&view=FLAGS`}>
            <div className="pcov-kpi__value">{metrics ? openFlags : '—'}</div>
            <div className="pcov-kpi__label">Open observations</div>
          </Link>
        </div>
      </section>

      {!statsQuery.isError && (
        <div className="pcov-perf" aria-label="Your throughput">
          <div className="pcov-perf__toggle" role="group" aria-label="Period">
            <button
              type="button"
              className={statsPeriod === 'week' ? 'is-active' : undefined}
              aria-pressed={statsPeriod === 'week'}
              onClick={() => setStatsPeriod('week')}
            >
              This week
            </button>
            <button
              type="button"
              className={statsPeriod === 'month' ? 'is-active' : undefined}
              aria-pressed={statsPeriod === 'month'}
              onClick={() => setStatsPeriod('month')}
            >
              This month
            </button>
          </div>
          <div className="pcov-perf__stat">
            <b>{stats ? stats.bookingsCompleted : '—'}</b>
            <span>bookings completed</span>
          </div>
          <div className="pcov-perf__stat">
            <b>{stats ? stats.deliveriesCompleted : '—'}</b>
            <span>deliveries completed</span>
          </div>
        </div>
      )}

      {(metricsQuery.isError || workQuery.isError) && (
        <div className="pcov-state" role="alert">
          <div>
            <strong>We couldn&rsquo;t load part of your dashboard.</strong>
            <p>Your bookings and deliveries are still safe. Try again in a moment.</p>
          </div>
          <button
            type="button"
            onClick={() => { void metricsQuery.refetch(); void workQuery.refetch(); }}
          >
            Try again
          </button>
        </div>
      )}

      {loading && !workQuery.data && (
        <div className="pcov-skeleton" role="status">Loading your bookings and deliveries…</div>
      )}

      {!loading && !hasAnyWork && (
        <div className="pcov-empty">
          <h2>Ready when you are</h2>
          <p>
            When a customer books a vehicle, capture it here. Verigence walks you through the
            documents, the delivery and the audit trail — one step at a time.
          </p>
          {captureLink}
          <div className="pcov-flowprev" aria-hidden="true">
            <span>Booking</span>
            <span>Verify</span>
            <span>Delivery</span>
            <span>Delivered</span>
          </div>
        </div>
      )}

      {!loading && hasAnyWork && (
        <>
          <div className="pcov-sec-head">
            <h2>Do these next</h2>
            {candidates.length > shownCandidates.length && (
              <Link className="pcov-seeall" to={`${QUEUE}&view=ALL`}>
                See all {candidates.length}
                <span aria-hidden="true">→</span>
              </Link>
            )}
          </div>

          {shownCandidates.length > 0 ? (
            <div className="pcov-cards">
              {shownCandidates.map((candidate) => (
                <WorkCard
                  key={candidate.item.journeyId}
                  candidate={candidate}
                  productLabel={
                    candidate.item.productLabel
                    || enrichedLabels[candidate.item.journeyId]
                    || 'Vehicle not captured'
                  }
                />
              ))}
            </div>
          ) : (
            <div className="pcov-empty">
              <h2>You&rsquo;re all caught up</h2>
              <p>
                Nothing needs your attention right now. New bookings and deliveries show up here
                as soon as there&rsquo;s something to do.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
