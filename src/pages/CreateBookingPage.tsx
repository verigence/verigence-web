import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';

import PageHeader from '../components/PageHeader';
import {
  createBooking,
  getCreateBookingContext,
} from '../services/audit-core/uc03CreateBooking';
import { useProjectContextStore } from '../store/projectContextStore';
import { useSessionStore } from '../store/sessionStore';

export default function CreateBookingPage() {
  const navigate = useNavigate();
  const project = useProjectContextStore((state) => state.selectedProject);
  const accessToken = useSessionStore((state) => state.accessToken);
  const [selectedOutletId, setSelectedOutletId] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const contextQuery = useQuery({
    queryKey: ['uc03-create-booking-context', project?.tenantId],
    queryFn: () => getCreateBookingContext(project!.tenantId, accessToken),
    enabled: Boolean(project?.tenantId && accessToken),
    retry: 1,
    refetchOnWindowFocus: false,
  });

  const outlets = contextQuery.data?.outlets || [];

  useEffect(() => {
    if (outlets.length === 1) setSelectedOutletId(outlets[0].outletId);
  }, [outlets]);

  const selectedOutlet = useMemo(
    () => outlets.find((item) => item.outletId === selectedOutletId),
    [outlets, selectedOutletId],
  );

  if (!project) return null;

  async function handleCreate() {
    setCreating(true);
    setError('');
    try {
      const result = await createBooking(
        project.tenantId,
        outlets.length === 1 ? undefined : selectedOutletId || undefined,
        accessToken,
      );
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
        description="Create a new Booking Journey for the current Project. Customer and Booking details can be captured from evidence or entered in the Booking workspace."
      />

      {contextQuery.isPending && (
        <div className="dashboard-load-state" role="status">
          <div className="dashboard-load-state__copy"><strong>Loading your authorized outlet…</strong></div>
        </div>
      )}

      {contextQuery.isError && (
        <section className="dashboard-load-state" role="alert">
          <div className="dashboard-load-state__mark">!</div>
          <div className="dashboard-load-state__copy">
            <strong>Create Booking is not available.</strong>
            <p>{contextQuery.error instanceof Error ? contextQuery.error.message : 'Please try again.'}</p>
          </div>
          <button type="button" className="user-menu-button" onClick={() => contextQuery.refetch()}>Try Again</button>
        </section>
      )}

      {contextQuery.data && (
        <section className="section-card">
          <div className="section-card__header">
            <div>
              <h2>Booking Journey</h2>
              <p>{project.projectName}</p>
            </div>
          </div>

          {outlets.length === 0 ? (
            <div className="dashboard-load-state" role="alert">
              <div className="dashboard-load-state__copy">
                <strong>No authorized outlet is available.</strong>
                <p>Your Process Coordinator assignment must include an active outlet.</p>
              </div>
            </div>
          ) : (
            <div className="form-stack">
              {outlets.length === 1 ? (
                <div className="field-stack">
                  <span>Outlet</span>
                  <strong>{outlets[0].dealerName} · {outlets[0].outletName}</strong>
                  <small>{outlets[0].outletClassification}</small>
                </div>
              ) : (
                <label className="field-stack">
                  <span>Outlet</span>
                  <select value={selectedOutletId} onChange={(event) => setSelectedOutletId(event.target.value)}>
                    <option value="">Select outlet</option>
                    {outlets.map((outlet) => (
                      <option key={outlet.outletId} value={outlet.outletId}>
                        {outlet.dealerName} · {outlet.outletName}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              {selectedOutlet && outlets.length > 1 && (
                <div className="field-stack">
                  <small>{selectedOutlet.outletClassification}</small>
                </div>
              )}

              {error && <div className="uc03-c1-feedback is-error" role="alert">{error}</div>}

              <div>
                <button
                  type="button"
                  className="uc03-c1-primary"
                  disabled={creating || (outlets.length > 1 && !selectedOutletId)}
                  onClick={() => void handleCreate()}
                >
                  {creating ? 'Creating Booking…' : 'Create Booking'}
                </button>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
