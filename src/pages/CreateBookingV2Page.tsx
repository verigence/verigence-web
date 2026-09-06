import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';

import PageHeader from '../components/PageHeader';
import type { BookingWorkspace } from '../services/audit-core/uc03Booking';
import { createBooking } from '../services/audit-core/uc03CreateBooking';
import { getBookingCaptureV2 } from '../services/audit-core/uc03DocumentCaptureV2';
import { useProjectContextStore } from '../store/projectContextStore';
import { useSessionStore } from '../store/sessionStore';

const CAPTURE_HANDOFF_STALE_MS = 3_000;

function newBookingWorkspace(
  journeyId: string,
  businessStatus: string,
  aggregateVersion: number,
): BookingWorkspace {
  return {
    journeyId,
    bookingStage: {
      businessStatus,
      closureDisposition: null,
      auditState: 'NOT_STARTED',
      auditStatus: 'NOT_EVALUATED',
      closeReasonCode: null,
      closureRemarks: null,
    },
    capture: {},
    documents: [],
    proposals: [],
    flags: [],
    completion: { ready: false, blockers: [] },
    processingSummary: { pendingCount: 0, failedCount: 0, readyProposalCount: 0 },
    flagSummary: { openCount: 0, totalCount: 0 },
    permittedActions: [],
    aggregateVersion,
    operatingRole: 'PC',
  };
}

export default function CreateBookingV2Page() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const project = useProjectContextStore((state) => state.selectedProject);
  const accessToken = useSessionStore((state) => state.accessToken);
  const outletId = useSessionStore((state) => state.outletId);
  const creationStarted = useRef(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const selectedOutlet = useMemo(
    () => project?.scope.outlets.find((outlet) => outlet.outletId === outletId),
    [outletId, project?.scope.outlets],
  );

  async function startBooking() {
    if (!project || !outletId || !accessToken || creationStarted.current) return;
    creationStarted.current = true;
    setCreating(true);
    setError('');
    try {
      const result = await createBooking(project.tenantId, outletId, accessToken);

      queryClient.setQueryData<BookingWorkspace>(
        ['uc03-booking-workspace', project.tenantId, result.journeyId],
        newBookingWorkspace(result.journeyId, result.businessStatus, result.aggregateVersion),
      );

      // Warm the document screen and its first capture-state request before routing.
      void import('./BookingCaptureV2Page');
      void queryClient.prefetchQuery({
        queryKey: ['uc03-document-capture-v2', project.tenantId, result.journeyId],
        queryFn: () => getBookingCaptureV2(project.tenantId, result.journeyId, accessToken),
        staleTime: CAPTURE_HANDOFF_STALE_MS,
      });

      navigate(`/v2/bookings/${result.journeyId}`, {
        replace: true,
        state: {
          createdBooking: {
            journeyId: result.journeyId,
            businessStatus: result.businessStatus,
            aggregateVersion: result.aggregateVersion,
          },
        },
      });
    } catch (cause) {
      creationStarted.current = false;
      setError(cause instanceof Error ? cause.message : 'The Booking could not be started.');
    } finally {
      setCreating(false);
    }
  }

  useEffect(() => {
    if (project && outletId && accessToken && selectedOutlet) void startBooking();
    // startBooking intentionally runs once for the resolved working context.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.tenantId, outletId, accessToken, selectedOutlet?.outletId]);

  if (!project) return null;

  return (
    <div className="screen-stack uc03-capture-new-booking">
      <PageHeader
        eyebrow="Process Coordinator"
        title="Capture New Booking"
        description="Creating the Journey and opening Documents. Customer identity will come from documentary evidence."
      />

      <section className="section-card uc03-capture-new-booking__card">
        {!selectedOutlet ? (
          <div className="dashboard-load-state" role="alert">
            <div className="dashboard-load-state__copy">
              <strong>No working Outlet is selected.</strong>
              <p>Return to the Project context and choose the Outlet you want to work in.</p>
            </div>
          </div>
        ) : error ? (
          <div className="dashboard-load-state" role="alert">
            <div className="dashboard-load-state__mark">!</div>
            <div className="dashboard-load-state__copy">
              <strong>Booking could not be started.</strong>
              <p>{error}</p>
            </div>
            <button type="button" className="user-menu-button" disabled={creating} onClick={() => void startBooking()}>
              {creating ? 'Creating…' : 'Try Again'}
            </button>
          </div>
        ) : (
          <div className="dashboard-load-state" role="status">
            <div className="dashboard-load-state__copy">
              <strong>{creating ? 'Creating Journey…' : 'Opening Documents…'}</strong>
              <p>{selectedOutlet.dealerName} · {selectedOutlet.outletName}</p>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
