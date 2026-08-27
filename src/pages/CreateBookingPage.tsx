import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';

import PageHeader from '../components/PageHeader';
import type { BookingWorkspace } from '../services/audit-core/uc03Booking';
import type { BookingPart1View } from '../services/audit-core/uc03BookingPart1';
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

function newBookingPart1(journeyId: string): BookingPart1View {
  return {
    journeyId,
    requirements: [
      {
        kind: 'BOOKING_DOCKET',
        requirementKey: 'booking_docket',
        documentTypeKey: 'booking_docket',
        requirementLevel: 'REQUIRED',
        requirementStatus: 'PENDING',
        evidence: [],
      },
      {
        kind: 'BOOKING_PAYMENT_RECEIPT',
        requirementKey: 'booking_payment_receipt',
        documentTypeKey: 'dealer_receipt',
        requirementLevel: 'REQUIRED',
        requirementStatus: 'PENDING',
        evidence: [],
      },
      {
        kind: 'PAN',
        requirementKey: 'pan_card',
        documentTypeKey: 'pan_card',
        requirementLevel: 'OPTIONAL',
        requirementStatus: 'PENDING',
        evidence: [],
      },
      {
        kind: 'AADHAAR',
        requirementKey: 'aadhaar',
        documentTypeKey: 'aadhaar',
        requirementLevel: 'OPTIONAL',
        requirementStatus: 'PENDING',
        evidence: [],
      },
    ],
    mandatoryEvidence: {
      bookingDocketComplete: false,
      kycComplete: false,
      kycBothProvided: false,
      paymentReceiptComplete: false,
      paymentReceiptCount: 0,
      part1EvidenceComplete: false,
    },
    productMaster: {
      status: 'PENDING_EXTRACTION',
      extractedModel: null,
      extractedVariant: null,
      modelId: null,
      modelName: null,
      variantId: null,
      variantName: null,
      masterVersionIds: [],
      message: 'Product matching starts after document extraction.',
    },
  };
}

export default function CreateBookingPage() {
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

      // Create already returned everything needed to paint a brand-new Booking.
      // Seed React Query before navigation so Step 1 never waits for Workspace or
      // Part-1 just to discover that no documents have been uploaded yet.
      queryClient.setQueryData<BookingWorkspace>(
        ['uc03-booking-workspace', activeProject.tenantId, result.journeyId],
        newBookingWorkspace(
          result.journeyId,
          normalizedCustomerName,
          result.businessStatus,
          result.aggregateVersion,
        ),
      );
      queryClient.setQueryData<BookingPart1View>(
        ['uc03-booking-part1', activeProject.tenantId, result.journeyId],
        newBookingPart1(result.journeyId),
      );

      navigate(`/bookings/${result.journeyId}`, {
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
        title="Capture New Booking"
        description="Enter the customer name to create the Booking and continue with documents and Booking details."
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
                    void handleAddDetails();
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
