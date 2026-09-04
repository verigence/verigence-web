import { useEffect, useMemo, useState } from 'react';
import { type InfiniteData, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';

import PageHeader from '../components/PageHeader';
import { type Uc03WorkItem, type Uc03WorkItemPage } from '../services/audit-core/uc03';
import { type BookingWorkspace } from '../services/audit-core/uc03Booking';
import { getBookingPart1, type BookingPart1View } from '../services/audit-core/uc03BookingPart1';
import { useProjectContextStore } from '../store/projectContextStore';
import { useSessionStore } from '../store/sessionStore';
import BookingCaptureV2WorkspacePage from './BookingCaptureV2WorkspacePage';

function bootstrapWorkspace(part1: BookingPart1View): BookingWorkspace {
  const started = Boolean(part1.bookingStage.businessStatus);
  return {
    journeyId: part1.journeyId,
    bookingStage: part1.bookingStage,
    capture: part1.capture,
    documents: [],
    proposals: [],
    flags: [],
    completion: { ready: false, blockers: [] },
    processingSummary: { pendingCount: 0, failedCount: 0, readyProposalCount: 0 },
    flagSummary: { openCount: 0, totalCount: 0 },
    permittedActions: started ? ['CAPTURE', 'UPLOAD_DOCUMENT'] : ['START_BOOKING'],
    aggregateVersion: part1.aggregateVersion,
    operatingRole: part1.operatingRole,
  };
}

export default function BookingCaptureV2FastEntry() {
  const { journeyId = '' } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const project = useProjectContextStore((state) => state.selectedProject);
  const accessToken = useSessionStore((state) => state.accessToken);
  const workspaceKey = ['uc03-booking-workspace', project?.tenantId, journeyId] as const;
  const existingWorkspace = queryClient.getQueryData<BookingWorkspace>(workspaceKey);
  const [handoffReady, setHandoffReady] = useState(Boolean(existingWorkspace));

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

  const enabled = Boolean(project?.tenantId && journeyId && accessToken);
  const part1Query = useQuery({
    queryKey: ['uc03-booking-part1', project?.tenantId, journeyId],
    queryFn: () => getBookingPart1(project!.tenantId, journeyId, accessToken),
    enabled: enabled && !existingWorkspace,
    retry: false,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  useEffect(() => {
    if (!part1Query.data || !project?.tenantId || !journeyId) return;
    queryClient.setQueryData<BookingWorkspace>(
      ['uc03-booking-workspace', project.tenantId, journeyId],
      bootstrapWorkspace(part1Query.data),
      { updatedAt: Date.now() },
    );
    setHandoffReady(true);
  }, [journeyId, part1Query.data, project?.tenantId, queryClient]);

  if (!project || !journeyId) return null;

  if (handoffReady || part1Query.isError) {
    return <BookingCaptureV2WorkspacePage />;
  }

  return (
    <div className="screen-stack uc03-v2-capture">
      <div className="uc03-c1-topbar">
        <button type="button" className="uc03-c1-back" onClick={() => navigate('/dashboard')}>← Work List</button>
      </div>
      <PageHeader
        eyebrow="Booking · V2"
        title={cachedWorkItem?.customerDisplayName || 'Booking'}
        description="Opening Booking documents…"
      />
      <section className="uc03-c1-start-panel" aria-busy="true">
        <div>
          <span className="uc03-c1-eyebrow">Booking Journey</span>
          <h2>Loading document workspace</h2>
          <p>The Booking screen is opening from the lightweight journey context while detailed audit data loads.</p>
        </div>
        <div className="uc03-project-gate__spinner" aria-hidden="true" />
      </section>
    </div>
  );
}
