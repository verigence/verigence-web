import type { Uc03StageSummary, Uc03WorkItem } from '../../services/audit-core/uc03';

export const OVERVIEW_OPEN_BUDGET_MS = 10_000;

export type OverviewStageKind = 'BOOKING' | 'DELIVERY';
export type OverviewTarget = 'BOOKING' | 'BOOKING_REVIEW' | 'DELIVERY' | 'DELIVERY_REVIEW' | 'AUDIT';

export interface OverviewOpenSnapshot {
  journeyId: string;
  customerDisplayName: string;
  bookingReference: string | null;
  productLabel: string | null;
  stageKind: OverviewStageKind;
  stageStatus: string | null;
  pcVerificationStatus: string | null;
}

export interface OverviewOpenNavigationState {
  overviewOpen: {
    openedAtEpochMs: number;
    target: OverviewTarget;
    snapshot: OverviewOpenSnapshot;
  };
}

const BOOKING_TERMINAL_STATUSES = new Set([
  'BOOKING_CLOSED',
  'BOOKING_CANCELLED',
  'BOOKING_DUPLICATE',
  'BOOKING_NO_DELIVERY',
]);

export function effectiveStageStatus(
  stage: Uc03StageSummary,
  kind: OverviewStageKind,
): string | null {
  const raw = stage.businessStatus?.trim().toUpperCase() || null;
  if (
    kind === 'BOOKING'
    && stage.captureCompletedAtUtc
    && (!raw || !BOOKING_TERMINAL_STATUSES.has(raw))
  ) {
    return 'BOOKING_COMPLETED';
  }
  return raw;
}

export function stageReviewPending(stage: Uc03StageSummary): boolean {
  return Boolean(stage.captureCompletedAtUtc)
    && stage.pcVerificationStatus?.trim().toUpperCase() === 'PENDING';
}

export function overviewOpenState(
  item: Uc03WorkItem,
  target: OverviewTarget,
): OverviewOpenNavigationState {
  const stageKind: OverviewStageKind = target === 'DELIVERY' || target === 'DELIVERY_REVIEW'
    ? 'DELIVERY'
    : 'BOOKING';
  const stage = stageKind === 'DELIVERY' ? item.delivery : item.booking;
  return {
    overviewOpen: {
      openedAtEpochMs: Date.now(),
      target,
      snapshot: {
        journeyId: item.journeyId,
        customerDisplayName: item.customerDisplayName,
        bookingReference: item.bookingReference,
        productLabel: item.productLabel,
        stageKind,
        stageStatus: effectiveStageStatus(stage, stageKind),
        pcVerificationStatus: stage.pcVerificationStatus || null,
      },
    },
  };
}

export function reviewPendingOverviewOpenState(item: {
  journeyId: string;
  customerDisplayName: string;
  bookingReference: string | null;
  productLabel: string | null;
}): OverviewOpenNavigationState {
  return {
    overviewOpen: {
      openedAtEpochMs: Date.now(),
      target: 'BOOKING_REVIEW',
      snapshot: {
        journeyId: item.journeyId,
        customerDisplayName: item.customerDisplayName,
        bookingReference: item.bookingReference,
        productLabel: item.productLabel,
        stageKind: 'BOOKING',
        stageStatus: 'BOOKING_COMPLETED',
        pcVerificationStatus: 'PENDING',
      },
    },
  };
}
