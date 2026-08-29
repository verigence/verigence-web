import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';

import PageHeader from '../components/PageHeader';
import type { BookingWorkspace } from '../services/audit-core/uc03Booking';
import { createBooking } from '../services/audit-core/uc03CreateBooking';
import { useProjectContextStore } from '../store/projectContextStore';
import { useSessionStore } from '../store/sessionStore';

function newBookingWorkspace(
  journeyId: string,
  customerName: string,
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
    capture: { CUSTOMER_NAME: customerName },
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

  async function handleContinue() {
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
      // Reuse the existing create API exactly as-is. Only the V2 Web route differs.
      const result = await createBooking(
        activeProject.tenantId,
        outletId,
        normalizedCustomerName,
        accessToken,
      );

      queryClient.setQueryData<BookingWorkspace>(
        ['uc03-booking-workspace', activeProject.tenantId, result.journeyId],
        newBookingWorkspace(
          result.journeyId,
          normalizedCustomerName,
          result.businessStatus,
          result.aggregateVersion,
        ),
      );

      navigate(`/v2/bookings/${result.journeyId}`, {
        replace: true,
        state: {
          createdBooking: {
            journeyId: result.journeyId,
            customerName: normalizedCustomerName,
            businessStatus: result.businessStatus,
            aggregateVersion: result.aggregateVersion,
          },
        },
      });
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
        title="Capture New Booking — V2"
        description="Enter the customer name to create the Booking and continue with the new document-driven capture flow."
      />

      <section className="section-card uc03-capture-new-booking__card">
        {!selectedOutlet ? (
          <div className="dashboard-load-state" role="alert">
            <div className="dashboard-load-state__copy">
              <strong>No working Outlet is selected.</strong>
              <p>Return to the Project context and choose the Outlet you want to work in.</p>
            </div>
          </div>
        ) : (
          <div className="form-stack uc03-capture-new-booking__form">
            <div className="uc03-capture-new-booking__context" aria-label="Current working outlet">
              <div>
                <span>Working Outlet</span>
                <strong>{selectedOutlet.dealerName} · {selectedOutlet.outletName}</strong>
              </div>
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
                autoFocus
                onChange={(event) => {
                  setCustomerName(event.target.value);
                  if (error) setError('');
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && normalizedCustomerName && !creating) {
                    event.preventDefault();
                    void handleContinue();
                  }
                }}
              />
              <small>Customer Name is locked after the Booking is created.</small>
            </label>

            {error && <div className="uc03-c1-feedback is-error" role="alert">{error}</div>}

            <div className="uc03-capture-new-booking__actions">
              <button
                type="button"
                className="uc03-c1-primary"
                disabled={creating || !normalizedCustomerName}
                onClick={() => void handleContinue()}
              >
                {creating ? 'Creating Booking…' : 'Continue to Documents'}
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
