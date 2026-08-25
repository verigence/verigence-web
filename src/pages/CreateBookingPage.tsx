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
  const [customerName, setCustomerName] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const selectedOutlet = useMemo(
    () => project?.scope.outlets.find((outlet) => outlet.outletId === outletId),
    [outletId, project?.scope.outlets],
  );

  if (!project) return null;
  const activeProject = project;
  const normalizedCustomerName = customerName.trim().replace(/\s+/g, ' ');

  async function handleAddDetails() {
    if (!outletId) {
      setError('Choose your working Outlet before capturing a Booking.');
      return;
    }
    if (!normalizedCustomerName) {
      setError('Enter the Customer Name to continue.');
      return;
    }
    setCreating(true);
    setError('');
    try {
      const result = await createBooking(
        activeProject.tenantId,
        outletId,
        normalizedCustomerName,
        accessToken,
      );
      navigate(`/bookings/${result.journeyId}`, { replace: true });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The Booking could not be started.');
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="screen-stack uc03-capture-new-booking">
      <PageHeader
        eyebrow="Process Coordinator"
        title="Capture New Booking"
        description="Enter the Customer Name first. Add Details creates the Booking Journey and opens the evidence-first Booking workspace."
      />

      <section className="section-card uc03-capture-new-booking__card">
        <div className="section-card__header">
          <div>
            <h2>Customer</h2>
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
          <div className="form-stack uc03-capture-new-booking__form">
            <div className="field-stack uc03-capture-new-booking__outlet">
              <span>Working Outlet</span>
              <strong>{selectedOutlet.dealerName} · {selectedOutlet.outletName}</strong>
              <small>{selectedOutlet.outletClassification}</small>
            </div>

            <label className="field-stack uc03-capture-new-booking__name">
              <span>Customer Name</span>
              <input
                type="text"
                value={customerName}
                maxLength={200}
                autoComplete="name"
                placeholder="Enter customer name"
                disabled={creating}
                onChange={(event) => {
                  setCustomerName(event.target.value);
                  if (error) setError('');
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && normalizedCustomerName && !creating) {
                    event.preventDefault();
                    void handleAddDetails();
                  }
                }}
              />
              <small>The Customer Name becomes read-only after the Booking Journey is created.</small>
            </label>

            {error && <div className="uc03-c1-feedback is-error" role="alert">{error}</div>}

            <div className="uc03-capture-new-booking__actions">
              <button
                type="button"
                className="uc03-c1-primary"
                disabled={creating || !normalizedCustomerName}
                onClick={() => void handleAddDetails()}
              >
                {creating ? 'Adding Details…' : 'Add Details'}
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
