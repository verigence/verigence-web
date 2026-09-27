import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import '../styles/uc03-p2.css';

import PageHeader from '../components/PageHeader';
import StatusPill from '../components/StatusPill';
import P2JourneyTabs from '../features/uc03-p2/P2JourneyTabs';
import { getP2Overview, type P2ControlStatistics } from '../services/audit-core/uc03P2';
import { useProjectContextStore } from '../store/projectContextStore';
import { useSessionStore } from '../store/sessionStore';

function money(value?: string | null) {
  if (value === null || value === undefined || value === '') return '—';
  const amount = Number(value);
  if (Number.isNaN(amount)) return value;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
}

const STAGES = [
  { key: 'BOOKING_DOCUMENT_UPLOAD', label: 'Documents', phase: 'Booking' },
  { key: 'BOOKING_VERIFY_DOCUMENTS', label: 'Verification', phase: 'Booking' },
  { key: 'BOOKING_COMPLETE', label: 'Complete', phase: 'Booking' },
  { key: 'DELIVERY_DOCUMENT_UPLOAD', label: 'Documents', phase: 'Delivery' },
  { key: 'DELIVERY_VERIFY_DOCUMENTS', label: 'Verification', phase: 'Delivery' },
  { key: 'DELIVERY_COMPLETE', label: 'Complete', phase: 'Delivery' },
] as const;

const STAGE_INDEX: Record<string, number> = Object.fromEntries(
  STAGES.map((stage, index) => [stage.key, index]),
);

const gateLabels: Record<string, string> = {
  BOOKING_FORM_EXTRACTED: 'Booking Form',
  PAN_EXTRACTED: 'PAN',
  AADHAAR_EXTRACTED: 'Aadhaar',
  MINIMUM_BOOKING_PAYMENT: 'Booking payment',
  NO_MANUAL_VERIFICATION_PENDING: 'Manual verification',
};

function controlSummary(controls: P2ControlStatistics) {
  if (!controls.tracked) return 'No controls evaluated';
  if (controls.errors || controls.retryPending) {
    return `${controls.errors + controls.retryPending} need retry`;
  }
  if (controls.failed) return `${controls.failed} failed`;
  if (controls.waiting) return `${controls.waiting} waiting`;
  return `${controls.passed}/${controls.tracked} passed`;
}

function stateLabel(value: string) {
  return value.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function P2JourneyOverviewPage() {
  const { journeyId = '' } = useParams();
  const tenantId = useProjectContextStore((state) => state.selectedProject?.tenantId);
  const accessToken = useSessionStore((state) => state.accessToken);

  const query = useQuery({
    queryKey: ['p2-overview', tenantId, journeyId],
    queryFn: () => getP2Overview(tenantId!, journeyId, accessToken),
    enabled: Boolean(tenantId && journeyId && accessToken),
    staleTime: 10_000,
  });

  const data = query.data;
  const currentIndex = data ? (STAGE_INDEX[data.stage.stage] ?? 0) : 0;
  const failedGates = data
    ? Object.entries(data.stage.gates).filter(([, gate]) => !gate.passed)
    : [];
  const needsAttention = data
    ? data.tasks.open + data.findings.open + data.statistics.journey.extractionFailures
    : 0;

  return (
    <div className="screen-stack p2-screen p2-journey360">
      <PageHeader
        eyebrow="Phase 2 · Journey 360"
        title={data?.journey.customer_name || 'Journey'}
        description={[
          data?.journey.vehicle,
          data?.journey.dealer_name,
          data?.journey.outlet_name,
        ].filter(Boolean).join(' · ') || 'Loading Journey context…'}
        actions={<Link className="text-link" to="/p2/work-queue">All journeys</Link>}
      />
      <P2JourneyTabs />

      {query.isError ? (
        <div className="form-alert form-alert--error">
          {query.error instanceof Error ? query.error.message : 'Journey 360 could not be loaded.'}
        </div>
      ) : null}

      {data ? (
        <>
          <section className="p2-journey-stage" aria-label="Journey progress">
            <div className="p2-journey-stage__summary">
              <div>
                <span>Current stage</span>
                <strong>{stateLabel(data.stage.stage)}</strong>
              </div>
              <div>
                <span>Booking</span>
                <StatusPill value={data.stage.bookingCompletionState} compact />
              </div>
              <div>
                <span>Delivery</span>
                <StatusPill value={data.stage.deliveryCompletionState} compact />
              </div>
              <div className={needsAttention ? 'is-attention' : undefined}>
                <span>Needs attention</span>
                <strong>{needsAttention || 'None'}</strong>
              </div>
            </div>

            <ol className="p2-stage-line">
              {STAGES.map((stage, index) => {
                const state = index < currentIndex ? 'is-done' : index === currentIndex ? 'is-current' : 'is-next';
                return (
                  <li key={stage.key} className={state}>
                    <span className="p2-stage-line__mark">{index < currentIndex ? '✓' : index + 1}</span>
                    <span className="p2-stage-line__text">
                      <small>{stage.phase}</small>
                      <strong>{stage.label}</strong>
                    </span>
                  </li>
                );
              })}
            </ol>
          </section>

          {failedGates.length ? (
            <section className="p2-blockers" aria-label="Current blockers">
              <div className="p2-blockers__title">
                <strong>Current blockers</strong>
                <span>{failedGates.length} Booking gate{failedGates.length === 1 ? '' : 's'} pending</span>
              </div>
              <div className="p2-blockers__items">
                {failedGates.map(([key, gate]) => (
                  <span key={key}>
                    {gateLabels[key] || stateLabel(key)}
                    {key === 'MINIMUM_BOOKING_PAYMENT' && gate.minimumAmount
                      ? ` · ${money(gate.receiptTotal)} / ${money(gate.minimumAmount)}`
                      : gate.pendingCount
                        ? ` · ${gate.pendingCount} pending`
                        : ''}
                  </span>
                ))}
              </div>
            </section>
          ) : null}

          <section className="p2-journey-stats" aria-label="Booking, Delivery and Journey statistics">
            <div className="p2-journey-stats__group">
              <strong>Booking</strong>
              <span>Documents <b>{data.statistics.booking.documentsReceived}/{data.statistics.booking.documentsRequired}</b></span>
              <span>Pages <b>{data.statistics.booking.pagesProcessed}/{data.statistics.booking.pages}</b></span>
              <span>Receipts <b>{data.statistics.booking.paymentReceipts}</b></span>
              <span>Payment <b>{money(data.statistics.booking.paymentReceived)} / {money(data.statistics.booking.minimumPayment)}</b></span>
              <span>Verification <b>{data.statistics.booking.manualVerificationPending}</b></span>
              <span className={
                data.statistics.booking.controls.failed
                || data.statistics.booking.controls.retryPending
                || data.statistics.booking.controls.errors
                  ? 'p2-attention'
                  : undefined
              }>Controls <b>{controlSummary(data.statistics.booking.controls)}</b></span>
              <span>Tasks <b>{data.statistics.booking.tasksOpen} open · {data.statistics.booking.tasksCompleted} done</b></span>
            </div>

            <div className="p2-journey-stats__group">
              <strong>Delivery</strong>
              <span>Documents <b>{data.statistics.delivery.documentsReceived}/{data.statistics.delivery.documentsRequired}</b></span>
              <span>Pages <b>{data.statistics.delivery.pagesProcessed}/{data.statistics.delivery.pages}</b></span>
              <span>Invoices <b>{data.statistics.delivery.invoices}</b></span>
              <span>Receipts <b>{data.statistics.delivery.paymentReceipts}</b></span>
              <span>Finance / Insurance <b>{data.statistics.delivery.financeRecords} / {data.statistics.delivery.insuranceRecords}</b></span>
              <span>Vehicle / Reg. <b>{data.statistics.delivery.vehicleRecords} / {data.statistics.delivery.registrationRecords}</b></span>
              <span className={
                data.statistics.delivery.controls.failed
                || data.statistics.delivery.controls.retryPending
                || data.statistics.delivery.controls.errors
                  ? 'p2-attention'
                  : undefined
              }>Controls <b>{controlSummary(data.statistics.delivery.controls)}</b></span>
              <span>Tasks <b>{data.statistics.delivery.tasksOpen} open · {data.statistics.delivery.tasksCompleted} done</b></span>
            </div>

            <div className="p2-journey-stats__group">
              <strong>Journey</strong>
              <span>Uploads <b>{data.statistics.journey.uploads}</b></span>
              <span>Superseded <b>{data.statistics.journey.supersededDocuments}</b></span>
              <span>Failures <b>{data.statistics.journey.extractionFailures}</b></span>
              <span>Retries <b>{data.statistics.journey.retries}</b></span>
              <span>Corrections <b>{data.statistics.journey.correctedFields}</b></span>
              <span>Findings <b>{data.statistics.journey.openFindings}</b></span>
              <span>Tasks <b>{data.statistics.journey.totalTasks}</b></span>
              <span className={data.statistics.journey.slaBreaches ? 'p2-attention' : undefined}>
                SLA breaches <b>{data.statistics.journey.slaBreaches}</b>
              </span>
            </div>
          </section>

          <section className="p2-journey-actions">
            <div>
              <strong>Business view</strong>
              <span>
                Detailed customer, deal, vehicle, payment, finance, insurance and registration information remains available in the established Journey 360 while isolated Phase 2 business projections are completed.
              </span>
            </div>
            <div className="p2-journey-actions__links">
              <Link className="p2-primary-link" to={`/p2/journeys/${journeyId}/documents`}>Documents</Link>
              <Link className="text-link" to={`/p2/journeys/${journeyId}/tasks`}>Tasks</Link>
              <Link className="text-link" to={`/journeys/${journeyId}/overview`}>Detailed Journey 360</Link>
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
