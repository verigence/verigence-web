import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';

import PageHeader from '../components/PageHeader';
import SectionCard from '../components/SectionCard';
import StatusPill from '../components/StatusPill';
import P2JourneyTabs from '../features/uc03-p2/P2JourneyTabs';
import { getP2Overview } from '../services/audit-core/uc03P2';
import { useProjectContextStore } from '../store/projectContextStore';
import { useSessionStore } from '../store/sessionStore';

function money(value?: string | null) {
  if (!value) return '—';
  const amount = Number(value);
  if (Number.isNaN(amount)) return value;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
}

const gateLabels: Record<string, string> = {
  BOOKING_FORM_EXTRACTED: 'Booking Form extracted',
  PAN_EXTRACTED: 'PAN extracted',
  AADHAAR_EXTRACTED: 'Aadhaar extracted',
  MINIMUM_BOOKING_PAYMENT: 'Minimum Booking payment received',
  NO_MANUAL_VERIFICATION_PENDING: 'No manual verification pending',
};

export default function P2JourneyOverviewPage() {
  const { journeyId = '' } = useParams();
  const tenantId = useProjectContextStore((s) => s.selectedProject?.tenantId);
  const accessToken = useSessionStore((s) => s.accessToken);

  const query = useQuery({
    queryKey: ['p2-overview', tenantId, journeyId],
    queryFn: () => getP2Overview(tenantId!, journeyId, accessToken),
    enabled: Boolean(tenantId && journeyId && accessToken),
    staleTime: 10_000,
  });

  const data = query.data;

  return (
    <div className="screen-stack p2-screen">
      <PageHeader
        eyebrow="Phase 2 · Journey 360"
        title={data?.journey.customer_name || 'Journey'}
        description={[
          data?.journey.vehicle,
          data?.journey.dealer_name,
          data?.journey.outlet_name,
        ].filter(Boolean).join(' · ') || 'Loading Journey context…'}
        actions={<Link className="text-link" to="/p2/work-queue">Back to Phase 2 queue</Link>}
      />
      <P2JourneyTabs />

      {query.isError ? (
        <div className="form-alert form-alert--error">
          {query.error instanceof Error ? query.error.message : 'Journey 360 could not be loaded.'}
        </div>
      ) : null}

      {data ? (
        <>
          <SectionCard className="p2-readiness">
            <div className="p2-readiness__head">
              <div>
                <span className="eyebrow">Current stage</span>
                <h2>{data.stage.stage.replaceAll('_', ' ')}</h2>
              </div>
              <StatusPill value={data.stage.bookingCompletionState} />
            </div>

            <div className="p2-gates">
              {Object.entries(data.stage.gates).map(([key, gate]) => (
                <div className="p2-gate" key={key}>
                  <span className={gate.passed ? 'p2-gate__mark is-pass' : 'p2-gate__mark'} aria-hidden="true">
                    {gate.passed ? '✓' : '•'}
                  </span>
                  <div>
                    <strong>{gateLabels[key] || key.replaceAll('_', ' ')}</strong>
                    {key === 'MINIMUM_BOOKING_PAYMENT' ? (
                      <small>{money(gate.receiptTotal)} of {money(gate.minimumAmount)}</small>
                    ) : gate.pendingCount ? (
                      <small>{gate.pendingCount} pending</small>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>

          <div className="p2-stat-grid">
            <SectionCard title="Booking">
              <dl className="p2-stat-list">
                <div><dt>Receipts</dt><dd>{data.payments.booking_receipts}</dd></div>
                <div><dt>Receipt total</dt><dd>{money(data.payments.booking_total)}</dd></div>
                <div><dt>Minimum required</dt><dd>{money(data.stage.minimumBookingAmount)}</dd></div>
                <div><dt>Manual verification</dt><dd>{data.stage.manualVerificationPending}</dd></div>
              </dl>
            </SectionCard>

            <SectionCard title="Delivery">
              <dl className="p2-stat-list">
                <div><dt>Documents</dt><dd>{data.documents.delivery_docs}</dd></div>
                <div><dt>Receipts</dt><dd>{data.payments.delivery_receipts}</dd></div>
                <div><dt>Payments</dt><dd>{money(data.payments.delivery_total)}</dd></div>
                <div><dt>Completion rules</dt><dd>Pending definition</dd></div>
              </dl>
            </SectionCard>

            <SectionCard title="Documents">
              <dl className="p2-stat-list">
                <div><dt>Active</dt><dd>{data.documents.total_active}</dd></div>
                <div><dt>Upload batches</dt><dd>{data.uploads.batches}</dd></div>
                <div><dt>Pages processed</dt><dd>{data.uploads.pages}</dd></div>
                <div><dt>Superseded</dt><dd>{data.documents.superseded}</dd></div>
              </dl>
            </SectionCard>

            <SectionCard title="Action">
              <dl className="p2-stat-list">
                <div><dt>Open tasks</dt><dd>{data.tasks.open}</dd></div>
                <div><dt>Overdue</dt><dd>{data.tasks.overdue}</dd></div>
                <div><dt>Open findings</dt><dd>{data.findings.open}</dd></div>
                <div><dt>Resolved findings</dt><dd>{data.findings.resolved}</dd></div>
              </dl>
            </SectionCard>
          </div>

          <SectionCard
            title="Business Journey 360"
            description="The existing detailed Journey 360 remains available unchanged while the isolated Phase 2 read model is stabilized."
            action={<Link className="text-link" to={`/journeys/${journeyId}/overview`}>Open detailed Journey 360</Link>}
          >
            <p className="p2-note">
              Phase 2 adds stage readiness, processing durability and task statistics without replacing the existing business view during stabilization.
            </p>
          </SectionCard>
        </>
      ) : null}
    </div>
  );
}
