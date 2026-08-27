import { useMemo } from 'react';
import { type InfiniteData, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate, useParams } from 'react-router-dom';

import PageHeader from '../components/PageHeader';
import StatusPill from '../components/StatusPill';
import { type Uc03WorkItem, type Uc03WorkItemPage } from '../services/audit-core/uc03';
import { getBookingWorkspace } from '../services/audit-core/uc03Booking';
import {
  getBookingPart1,
  type BookingPart1View,
  type Part1Requirement,
} from '../services/audit-core/uc03BookingPart1';
import { getBookingSummary } from '../services/audit-core/uc03BookingSummary';
import { useProjectContextStore } from '../store/projectContextStore';
import { useSessionStore } from '../store/sessionStore';
import { displayName } from '../utils/displayNames';
import BookingWorkspacePage from './BookingWorkspacePage';

type CreatedBookingNavigationState = {
  createdBooking?: {
    journeyId: string;
    customerName: string;
    businessStatus: string;
    aggregateVersion: number;
  };
};

function requirementLabel(requirement: Part1Requirement): string {
  switch (requirement.kind) {
    case 'BOOKING_DOCKET': return 'Booking Form / Booking Docket';
    case 'BOOKING_PAYMENT_RECEIPT': return 'Booking Payment Receipt(s)';
    case 'PAN': return 'PAN';
    case 'AADHAAR': return 'Aadhaar';
  }
}

function Part1DocumentPreview({ part1 }: { part1: BookingPart1View }) {
  return (
    <div className="uc03-booking-document-grid">
      {part1.requirements.map((requirement) => {
        const evidence = requirement.evidence ?? [];
        const latest = evidence.at(-1);
        const status = evidence.length > 0 ? 'UPLOADED' : 'PENDING';
        return (
          <article className="uc03-booking-upload-card" key={requirement.requirementKey}>
            <header>
              <div>
                <strong>{requirementLabel(requirement)}</strong>
                {requirement.requirementLevel !== 'REQUIRED' ? <small>{displayName(requirement.requirementLevel)}</small> : null}
              </div>
              <StatusPill value={status} compact />
            </header>
            <div className="uc03-booking-upload-summary">
              {evidence.length > 0 ? (
                evidence.map((item, index) => (
                  <span key={item.evidenceId}>
                    ✓ {evidence.length > 1 ? `Document ${index + 1}` : 'Document'} · {displayName(item.processingStatus || 'Accepted')}
                  </span>
                ))
              ) : (
                <span>No document uploaded yet</span>
              )}
              {latest?.verificationStatus ? <span>{displayName(latest.verificationStatus)}</span> : null}
            </div>
          </article>
        );
      })}
    </div>
  );
}

function FastBookingShell({
  customerName,
  bookingReference,
  productLabel,
  statusMessage,
  part1,
  onBack,
  onRetry,
}: {
  customerName: string;
  bookingReference?: string | null;
  productLabel?: string | null;
  statusMessage: string;
  part1?: BookingPart1View;
  onBack: () => void;
  onRetry?: () => void;
}) {
  return (
    <div className="screen-stack uc03-booking-journey">
      <div className="uc03-c1-topbar">
        <button type="button" className="uc03-c1-back" onClick={onBack}>← Work List</button>
      </div>

      <PageHeader
        eyebrow="Capture New Booking"
        title={customerName}
        description="Step 1 of 2 · Upload the Booking documents that are currently available."
      />

      <nav className="uc03-booking-steps" aria-label="Booking capture steps">
        <button type="button" className="is-active" disabled>1 <span>Documents</span></button>
        <button type="button" disabled>2 <span>Booking Details</span></button>
      </nav>

      <section className="uc03-booking-step-panel">
        <header className="uc03-booking-step-heading">
          <div><span className="uc03-c1-eyebrow">Step 1</span><h2>Upload Documents</h2></div>
          <span>{statusMessage}</span>
        </header>

        {(bookingReference || productLabel) ? (
          <div className="uc03-booking-journey-feedback" role="status">
            {bookingReference ? `Booking ${bookingReference}` : 'Booking'}
            {productLabel ? ` · ${productLabel}` : ''}
          </div>
        ) : null}

        {part1 ? (
          <>
            <Part1DocumentPreview part1={part1} />
            <div className="uc03-booking-step-footer">
              <span>Document requirements loaded. Booking workspace state is still loading in the background for this performance trial.</span>
            </div>
          </>
        ) : (
          <div className="uc03-c1-loading" role="status">Loading Booking documents…</div>
        )}

        {onRetry ? (
          <div className="uc03-booking-step-footer">
            <span>Booking details are available, but the document view could not be loaded.</span>
            <button type="button" className="uc03-c1-secondary" onClick={onRetry}>Try Again</button>
          </div>
        ) : null}
      </section>
    </div>
  );
}

export default function BookingWorkspaceFastEntry() {
  const { journeyId } = useParams<{ journeyId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const project = useProjectContextStore((state) => state.selectedProject);
  const accessToken = useSessionStore((state) => state.accessToken);

  const enabled = Boolean(project?.tenantId && journeyId && accessToken);

  const createdBooking = useMemo(() => {
    const state = location.state as CreatedBookingNavigationState | null;
    const candidate = state?.createdBooking;
    return candidate?.journeyId === journeyId ? candidate : undefined;
  }, [journeyId, location.state]);

  const cachedWorkItem = useMemo<Uc03WorkItem | undefined>(() => {
    if (!project?.tenantId || !journeyId) return undefined;
    const cachedPages = queryClient.getQueriesData<InfiniteData<Uc03WorkItemPage>>({
      queryKey: ['uc03-work-items', project.tenantId],
    });
    for (const [, cached] of cachedPages) {
      const match = cached?.pages
        .flatMap((page) => page.items)
        .find((item) => item.journeyId === journeyId);
      if (match) return match;
    }
    return undefined;
  }, [journeyId, project?.tenantId, queryClient]);

  const summaryQuery = useQuery({
    queryKey: ['uc03-booking-summary', project?.tenantId, journeyId],
    queryFn: () => getBookingSummary(project!.tenantId, journeyId!, accessToken),
    enabled: enabled && !cachedWorkItem && !createdBooking,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: 1,
  });

  const workspaceQuery = useQuery({
    queryKey: ['uc03-booking-workspace', project?.tenantId, journeyId],
    queryFn: () => getBookingWorkspace(project!.tenantId, journeyId!, accessToken),
    enabled,
    refetchOnWindowFocus: false,
  });

  const part1Query = useQuery({
    queryKey: ['uc03-booking-part1', project?.tenantId, journeyId],
    queryFn: () => getBookingPart1(project!.tenantId, journeyId!, accessToken),
    enabled,
    refetchOnWindowFocus: false,
  });

  if (!project || !journeyId) return null;

  if (workspaceQuery.data && part1Query.data) {
    return <BookingWorkspacePage />;
  }

  const summary = summaryQuery.data;
  const customerName = cachedWorkItem?.customerDisplayName || createdBooking?.customerName || 'Booking';
  const bookingReference = cachedWorkItem?.bookingReference ?? summary?.bookingReference;
  const productLabel = cachedWorkItem?.productLabel
    ?? (summary ? [summary.product.modelName, summary.product.variantName, summary.product.colourName].filter(Boolean).join(' · ') : null);
  const hasImmediateBookingData = Boolean(cachedWorkItem || createdBooking || summary);
  const part1Failed = part1Query.isError;

  if (!hasImmediateBookingData && summaryQuery.isError) {
    return (
      <section className="dashboard-load-state" role="alert">
        <div className="dashboard-load-state__mark">!</div>
        <div className="dashboard-load-state__copy">
          <strong>We couldn't open this Booking.</strong>
          <p>{summaryQuery.error instanceof Error ? summaryQuery.error.message : 'Please try again.'}</p>
        </div>
        <button type="button" className="user-menu-button" onClick={() => void summaryQuery.refetch()}>Try Again</button>
      </section>
    );
  }

  return (
    <FastBookingShell
      customerName={customerName}
      bookingReference={bookingReference}
      productLabel={productLabel}
      part1={part1Query.data}
      statusMessage={part1Failed
        ? 'Booking document view needs retry'
        : part1Query.data
          ? 'Document requirements loaded'
          : 'Loading document requirements…'}
      onBack={() => navigate('/dashboard')}
      onRetry={part1Failed ? () => { void part1Query.refetch(); } : undefined}
    />
  );
}
