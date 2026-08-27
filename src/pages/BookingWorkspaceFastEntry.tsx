import { useMemo } from 'react';
import { type InfiniteData, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';

import PageHeader from '../components/PageHeader';
import { type Uc03WorkItem, type Uc03WorkItemPage } from '../services/audit-core/uc03';
import { getBookingWorkspace } from '../services/audit-core/uc03Booking';
import { getBookingPart1 } from '../services/audit-core/uc03BookingPart1';
import { getBookingSummary } from '../services/audit-core/uc03BookingSummary';
import { useProjectContextStore } from '../store/projectContextStore';
import { useSessionStore } from '../store/sessionStore';
import BookingWorkspacePage from './BookingWorkspacePage';

function FastBookingShell({
  customerName,
  bookingReference,
  productLabel,
  statusMessage,
  onBack,
  onRetry,
}: {
  customerName: string;
  bookingReference?: string | null;
  productLabel?: string | null;
  statusMessage: string;
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

        <div className="uc03-c1-loading" role="status">Loading Booking documents…</div>
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
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const project = useProjectContextStore((state) => state.selectedProject);
  const accessToken = useSessionStore((state) => state.accessToken);

  const enabled = Boolean(project?.tenantId && journeyId && accessToken);

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
    enabled: enabled && !cachedWorkItem,
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
  const customerName = cachedWorkItem?.customerDisplayName || 'Booking';
  const bookingReference = cachedWorkItem?.bookingReference ?? summary?.bookingReference;
  const productLabel = cachedWorkItem?.productLabel
    ?? (summary ? [summary.product.modelName, summary.product.variantName, summary.product.colourName].filter(Boolean).join(' · ') : null);
  const hasImmediateBookingData = Boolean(cachedWorkItem || summary);
  const hasReadError = workspaceQuery.isError || part1Query.isError;

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
      statusMessage={hasReadError ? 'Booking document view needs retry' : 'Loading document requirements…'}
      onBack={() => navigate('/dashboard')}
      onRetry={hasReadError
        ? () => { void Promise.all([workspaceQuery.refetch(), part1Query.refetch()]); }
        : undefined}
    />
  );
}
