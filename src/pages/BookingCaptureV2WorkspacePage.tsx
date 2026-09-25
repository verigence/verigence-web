import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { createBooking } from '../services/audit-core/uc03CreateBooking';
import { useProjectContextStore } from '../store/projectContextStore';
import { useSessionStore } from '../store/sessionStore';

/**
 * "Capture New Booking" (/v2/bookings/new): creates the Journey, then hands
 * off to the one unified Documents page (JourneyDocumentsPage) for
 * everything else -- upload, checklist, Resync, delete, Submit, and the
 * Accept/Reject review flow all live there now. This page's own former
 * upload/checklist/Submit UI was retired the same way (folded into
 * JourneyDocumentsPage); /v2/bookings/:journeyId for an EXISTING Booking
 * now redirects straight there (see App.tsx) rather than rendering this
 * component at all, so this file only ever needs to handle the no-
 * journey-yet creation step.
 */
export default function BookingCaptureV2CompactPage() {
  const navigate = useNavigate();
  const project = useProjectContextStore((state) => state.selectedProject);
  const accessToken = useSessionStore((state) => state.accessToken);
  const outletId = useSessionStore((state) => state.outletId);
  const [error, setError] = useState<string>();
  const creationStarted = useRef(false);

  useEffect(() => {
    if (creationStarted.current) return;
    if (!project || !outletId || !accessToken) return;
    creationStarted.current = true;
    setError(undefined);
    createBooking(project.tenantId, outletId, accessToken)
      .then((result) => {
        navigate(`/journeys/${result.journeyId}/documents`, { replace: true });
      })
      .catch((cause: unknown) => {
        creationStarted.current = false;
        setError(cause instanceof Error ? cause.message : 'The Booking could not be started.');
      });
  }, [project, outletId, accessToken, navigate]);

  if (error) {
    return (
      <section className="dashboard-load-state" role="alert">
        <div className="dashboard-load-state__mark">!</div>
        <div className="dashboard-load-state__copy">
          <strong>Booking could not be started.</strong>
          <p>{error}</p>
        </div>
        <button
          type="button"
          className="user-menu-button"
          onClick={() => {
            creationStarted.current = false;
            setError(undefined);
          }}
        >
          Try Again
        </button>
      </section>
    );
  }

  return <div className="uc03-c1-loading" role="status">Starting your Booking…</div>;
}
