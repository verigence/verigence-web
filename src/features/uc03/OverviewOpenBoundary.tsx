import { Suspense, useEffect, useMemo, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';

import { useProjectContextStore } from '../../store/projectContextStore';
import {
  OVERVIEW_OPEN_BUDGET_MS,
  type OverviewOpenNavigationState,
} from './overviewOpen';

function displayStatus(value?: string | null): string {
  if (!value) return 'Opening';
  return value
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export default function OverviewOpenBoundary({ children }: { children: ReactNode }) {
  const location = useLocation();
  const operatingRole = useProjectContextStore((state) => state.selectedProject?.operatingRole);
  const navigation = (location.state as OverviewOpenNavigationState | null)?.overviewOpen;
  const snapshot = navigation?.snapshot;

  const targetLabel = useMemo(() => {
    if (!navigation) return 'Journey';
    if (navigation.target === 'BOOKING_REVIEW') return 'Booking Review';
    if (navigation.target === 'DELIVERY_REVIEW') return 'Delivery Review';
    if (navigation.target === 'DELIVERY') return 'Delivery';
    if (navigation.target === 'AUDIT') return 'Audit Review';
    return 'Booking';
  }, [navigation]);

  useEffect(() => {
    if (!navigation) return undefined;
    let cancelled = false;
    const frame = window.requestAnimationFrame(() => {
      if (cancelled) return;
      const elapsedMs = Math.max(0, Date.now() - navigation.openedAtEpochMs);
      window.dispatchEvent(new CustomEvent('uc03-overview-screen-painted', {
        detail: {
          journeyId: navigation.snapshot.journeyId,
          target: navigation.target,
          elapsedMs,
          budgetMs: OVERVIEW_OPEN_BUDGET_MS,
          withinBudget: elapsedMs < OVERVIEW_OPEN_BUDGET_MS,
        },
      }));
    });
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
    };
  }, [navigation]);

  if (!navigation || !snapshot) {
    return (
      <Suspense fallback={<div className="uc03-c1-loading" role="status">Opening journey…</div>}>
        {children}
      </Suspense>
    );
  }

  const reviewStatus = operatingRole === 'PC'
    ? null
    : snapshot.pcVerificationStatus?.toUpperCase() === 'PENDING'
      ? 'Review Pending'
      : snapshot.pcVerificationStatus?.toUpperCase() === 'VERIFIED'
        ? 'Verified'
        : null;

  return (
    <>
      <section
        className="uc03-booking-journey-feedback"
        role="status"
        aria-label={`${targetLabel} opened from Overview`}
        data-overview-open-budget-ms={OVERVIEW_OPEN_BUDGET_MS}
      >
        <strong>{snapshot.customerDisplayName || targetLabel}</strong>
        <span>
          {snapshot.bookingReference ? ` · ${snapshot.bookingReference}` : ''}
          {snapshot.productLabel ? ` · ${snapshot.productLabel}` : ''}
          {` · ${displayStatus(snapshot.stageStatus)}`}
          {reviewStatus ? ` · ${reviewStatus}` : ''}
        </span>
      </section>
      <Suspense fallback={<div className="uc03-c1-loading" role="status">Opening {targetLabel}…</div>}>
        {children}
      </Suspense>
    </>
  );
}
