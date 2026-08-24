import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import PageHeader from '../components/PageHeader';
import { createBooking } from '../services/audit-core/uc03CreateBooking';
import { useProjectContextStore } from '../store/projectContextStore';
import { useSessionStore } from '../store/sessionStore';

export default function CreateBookingPage() {
  const navigate = useNavigate();
  const project = useProjectContextStore((state) => state.selectedProject);
  const accessToken = useSessionStore((state) => state.accessToken);
  const outletId = useSessionStore((state) => state.outletId);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const selectedOutlet = useMemo(
    () => project?.scope.outlets.find((outlet) => outlet.outletId === outletId),
    [outletId, project?.scope.outlets],
  );

  if (!project) return null;
  const activeProject = project;

  async function handleCreate() {
    if (!outletId) {
      setError('Choose your working Outlet before creating a Booking.');
      return;
    }
    setCreating(true);
    setError('');
    try {
      const result = await createBooking(activeProject.tenantId, outletId, accessToken);
      navigate(`/bookings/${result.journeyId}`, { replace: true });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The Booking could not be created.');
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="screen-stack">
      <PageHeader
        eyebrow="Process Coordinator"
        title="Create Booking"
        description="Create a new Booking Journey in your current working Outlet. Booking details will be captured from evidence in the Booking workspace."
      />

      <section className="section-card">
        <div className="section-card__header">
          <div>
            <h2>Booking Journey</h2>
            <p>{activeProject.projectName}</p>
          </div>
        </div>

        {!selectedOutlet ? (
          <div className="dashboard-load-state" role="alert">
            <div className="dashboard-load-state__copy">
              <strong>No working Outlet is selected.</strong>
              <p>Return to the Project context and choose the Outlet you want to work in.</p>
            </div>
          </div>
        ) : (
          <div className="form-stack">
            <div className="field-stack">
              <span>Working Outlet</span>
              <strong>{selectedOutlet.dealerName} · {selectedOutlet.outletName}</strong>
              <small>{selectedOutlet.outletClassification}</small>
            </div>

            {error && <div className="uc03-c1-feedback is-error" role="alert">{error}</div>}

            <div>
              <button
                type="button"
                className="uc03-c1-primary"
                disabled={creating}
                onClick={() => void handleCreate()}
              >
                {creating ? 'Creating Booking…' : 'Create Booking'}
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
