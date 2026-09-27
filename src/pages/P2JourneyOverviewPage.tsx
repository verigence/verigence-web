import { useQuery } from '@tanstack/react-query';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import '../styles/uc03-p2.css';

import PageHeader from '../components/PageHeader';
import StatusPill from '../components/StatusPill';
import { getP2Events, getP2Overview, type P2ControlStatistics } from '../services/audit-core/uc03P2';
import {
  getFinance,
  getInsurance,
  getRegistration,
  getVehicle,
  listFindings,
  listPayments,
} from '../services/audit-core/operations';
import {
  getUc03JourneyOverview,
  type DealSourceValue,
  type JourneyOverview,
} from '../services/audit-core/uc03JourneySearch';
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


type BusinessSection =
  | 'summary'
  | 'deal'
  | 'vehicle'
  | 'payments'
  | 'finance'
  | 'insurance'
  | 'registration'
  | 'findings'
  | 'activity';

const BUSINESS_SECTIONS: Array<{ key: BusinessSection; label: string }> = [
  { key: 'summary', label: 'Summary' },
  { key: 'deal', label: 'Deal & Commercial' },
  { key: 'vehicle', label: 'Vehicle' },
  { key: 'payments', label: 'Payments' },
  { key: 'finance', label: 'Finance' },
  { key: 'insurance', label: 'Insurance' },
  { key: 'registration', label: 'Registration' },
  { key: 'findings', label: 'Findings' },
  { key: 'activity', label: 'Activity' },
];

function labelKey(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') return new Intl.NumberFormat('en-IN').format(value);
  if (typeof value === 'string') return stateLabel(value);
  return '—';
}

function primitiveFacts(record: Record<string, unknown> | null | undefined) {
  if (!record) return [];
  const hidden = new Set([
    'tenantId', 'tenant_id', 'journeyId', 'journey_id',
    'createdAtUtc', 'created_at_utc', 'updatedAtUtc', 'updated_at_utc',
    'versionNo', 'version_no',
  ]);
  return Object.entries(record)
    .filter(([key, value]) => !hidden.has(key)
      && value !== null
      && value !== undefined
      && value !== ''
      && ['string', 'number', 'boolean'].includes(typeof value))
    .slice(0, 18);
}

function DomainFacts({
  record,
  empty,
}: {
  record: Record<string, unknown> | null | undefined;
  empty: string;
}) {
  const facts = primitiveFacts(record);
  if (!facts.length) return <p className="p2-note">{empty}</p>;
  return (
    <dl className="p2-business-facts">
      {facts.map(([key, value]) => (
        <div key={key}>
          <dt>{labelKey(key)}</dt>
          <dd>{displayValue(value)}</dd>
        </div>
      ))}
    </dl>
  );
}

function sourceRows(overview?: JourneyOverview): DealSourceValue[] {
  return overview?.dealSourceBreakdown ?? [];
}


const BOOKING_DEAL_SOURCES = new Set(['booking_form', 'booking_docket']);
const INVOICE_DEAL_SOURCES = new Set([
  'customer_invoice_dms',
  'customer_invoice_dms_v2',
  'invoice_generic',
  'tax_invoice_tally',
  'tax_invoice',
  'tax_invoice_dms',
]);

function componentSources(overview: JourneyOverview | undefined, componentKey: string) {
  const key = componentKey.trim().toLowerCase();
  return sourceRows(overview).filter(
    (source) => source.lineKind === 'COMMERCIAL'
      && source.componentKey.trim().toLowerCase() === key,
  );
}

function dealSourceAmounts(
  overview: JourneyOverview,
  line: Record<string, unknown>,
): { booking: number | null; invoice: number | null; disagree: boolean } {
  const componentKey = String(line.componentKey || '');
  const sources = componentSources(overview, componentKey);
  const bookingSource = sources.find(
    (source) => BOOKING_DEAL_SOURCES.has(source.sourceDocumentType.trim().toLowerCase()),
  );
  const invoiceSource = sources.find(
    (source) => INVOICE_DEAL_SOURCES.has(source.sourceDocumentType.trim().toLowerCase()),
  );
  const actual = line.actualAmount === null || line.actualAmount === undefined
    ? null
    : Number(line.actualAmount);
  const booking = bookingSource?.amount ?? (sources.length === 0 ? actual : null);
  const invoice = invoiceSource?.amount ?? null;
  return {
    booking,
    invoice,
    disagree: booking !== null && invoice !== null && Math.abs(booking - invoice) > 1,
  };
}

function recordValue(record: Record<string, unknown>, ...keys: string[]): unknown {
  for (const key of keys) {
    const value = record[key];
    if (value !== null && value !== undefined && value !== '') return value;
  }
  return undefined;
}

function detailsSummary(value: unknown): string {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return '';
  return Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => ['string', 'number', 'boolean'].includes(typeof item))
    .slice(0, 4)
    .map(([key, item]) => `${labelKey(key)}: ${displayValue(item)}`)
    .join(' · ');
}

export default function P2JourneyOverviewPage() {
  const { journeyId = '' } = useParams();
  const tenantId = useProjectContextStore((state) => state.selectedProject?.tenantId);
  const accessToken = useSessionStore((state) => state.accessToken);
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedSection = searchParams.get('section') as BusinessSection | null;
  const section: BusinessSection = BUSINESS_SECTIONS.some((item) => item.key === requestedSection)
    ? requestedSection!
    : 'summary';

  const query = useQuery({
    queryKey: ['p2-overview', tenantId, journeyId],
    queryFn: () => getP2Overview(tenantId!, journeyId, accessToken),
    enabled: Boolean(tenantId && journeyId && accessToken),
    staleTime: 10_000,
  });

  const businessOverviewQuery = useQuery({
    queryKey: ['p2-business-overview', tenantId, journeyId],
    queryFn: () => getUc03JourneyOverview(tenantId!, journeyId, accessToken),
    enabled: Boolean(tenantId && journeyId && accessToken && section === 'deal'),
    staleTime: 15_000,
  });
  const vehicleQuery = useQuery({
    queryKey: ['p2-business-vehicle', tenantId, journeyId],
    queryFn: () => getVehicle(tenantId!, journeyId, accessToken),
    enabled: Boolean(tenantId && journeyId && accessToken && section === 'vehicle'),
    staleTime: 15_000,
    retry: 1,
  });
  const paymentsQuery = useQuery({
    queryKey: ['p2-business-payments', tenantId, journeyId],
    queryFn: () => listPayments(tenantId!, journeyId, accessToken),
    enabled: Boolean(tenantId && journeyId && accessToken && section === 'payments'),
    staleTime: 15_000,
  });
  const financeQuery = useQuery({
    queryKey: ['p2-business-finance', tenantId, journeyId],
    queryFn: () => getFinance(tenantId!, journeyId, accessToken),
    enabled: Boolean(tenantId && journeyId && accessToken && section === 'finance'),
    staleTime: 15_000,
    retry: 1,
  });
  const insuranceQuery = useQuery({
    queryKey: ['p2-business-insurance', tenantId, journeyId],
    queryFn: () => getInsurance(tenantId!, journeyId, accessToken),
    enabled: Boolean(tenantId && journeyId && accessToken && section === 'insurance'),
    staleTime: 15_000,
    retry: 1,
  });
  const registrationQuery = useQuery({
    queryKey: ['p2-business-registration', tenantId, journeyId],
    queryFn: () => getRegistration(tenantId!, journeyId, accessToken),
    enabled: Boolean(tenantId && journeyId && accessToken && section === 'registration'),
    staleTime: 15_000,
    retry: 1,
  });
  const findingsQuery = useQuery({
    queryKey: ['p2-business-findings', tenantId, journeyId],
    queryFn: () => listFindings(tenantId!, journeyId, accessToken),
    enabled: Boolean(tenantId && journeyId && accessToken && section === 'findings'),
    staleTime: 10_000,
  });
  const activityQuery = useQuery({
    queryKey: ['p2-business-activity', tenantId, journeyId],
    queryFn: () => getP2Events(tenantId!, journeyId, 0, accessToken),
    enabled: Boolean(tenantId && journeyId && accessToken && section === 'activity'),
    staleTime: 5_000,
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
        actions={<><Link className="text-link" to={`/p2/journeys/${journeyId}/documents`}>Documents</Link> <Link className="text-link" to="/p2/journey-360">All journeys</Link></>}
      />

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

          <nav className="p2-business-tabs" aria-label="Journey 360 business sections">
            {BUSINESS_SECTIONS.map((item) => (
              <button
                key={item.key}
                type="button"
                className={`p2-business-tabs__item${section === item.key ? ' is-active' : ''}`}
                onClick={() => {
                  const next = new URLSearchParams(searchParams);
                  if (item.key === 'summary') next.delete('section');
                  else next.set('section', item.key);
                  setSearchParams(next, { replace: true });
                }}
              >
                {item.label}
              </button>
            ))}
          </nav>

          <section className="p2-business-panel" aria-live="polite">
            {section === 'summary' ? (
              <div className="p2-journey-actions">
                <div>
                  <strong>What needs attention now</strong>
                  <span>
                    Use Documents for upload/review, Tasks for assigned action, or select a business section above for source-aware Journey detail.
                  </span>
                </div>
                <div className="p2-journey-actions__links">
                  <Link className="p2-primary-link" to={`/p2/journeys/${journeyId}/documents`}>Documents</Link>
                  <Link className="text-link" to={`/p2/journeys/${journeyId}/tasks`}>Tasks</Link>
                </div>
              </div>
            ) : null}

            {section === 'deal' ? (
              <div className="p2-business-stack">
                <div className="p2-business-head">
                  <div>
                    <strong>Deal & Commercial</strong>
                    <span>Master, Booking and document-source values are shown separately; no unexplained blended number.</span>
                  </div>
                </div>
                {businessOverviewQuery.isLoading ? <p className="p2-note">Loading commercial sources…</p> : null}
                {businessOverviewQuery.isError ? <p className="p2-note p2-attention">Commercial detail could not be loaded.</p> : null}
                {businessOverviewQuery.data?.commercialLines?.length ? (
                  <div className="p2-table-wrap">
                    <table className="p2-table">
                      <thead>
                        <tr><th>Component</th><th>Standard</th><th>Booking</th><th>Invoice</th></tr>
                      </thead>
                      <tbody>
                        {businessOverviewQuery.data.commercialLines.map((line, index) => {
                          const source = dealSourceAmounts(businessOverviewQuery.data!, line);
                          return (
                            <tr key={String(line.commercialLineId || line.componentKey || index)}>
                              <td><strong>{labelKey(String(line.componentKey || 'Commercial'))}</strong></td>
                              <td>{money(line.standardAmount === null || line.standardAmount === undefined ? null : String(line.standardAmount))}</td>
                              <td className={source.disagree ? 'p2-attention' : undefined}>
                                {money(source.booking === null ? null : String(source.booking))}
                              </td>
                              <td className={source.disagree ? 'p2-attention' : undefined}>
                                {money(source.invoice === null ? null : String(source.invoice))}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : null}
                {businessOverviewQuery.data?.skuPricing ? (
                  <div className="p2-table-wrap">
                    <table className="p2-table">
                      <thead><tr><th>Component</th><th>Master</th><th>Booking</th><th>Variance</th></tr></thead>
                      <tbody>
                        {businessOverviewQuery.data.skuPricing.masterComponents.map((row) => (
                          <tr key={row.componentKey}>
                            <td><strong>{labelKey(row.componentKey)}</strong>{row.isAlternative ? <small>Alternative price-list option</small> : null}</td>
                            <td>{money(String(row.masterAmount))}</td>
                            <td>{row.bookingAmount === null ? '—' : money(String(row.bookingAmount))}</td>
                            <td className={row.deviationAmount ? 'p2-attention' : undefined}>
                              {row.deviationAmount === null ? '—' : money(String(row.deviationAmount))}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
                {sourceRows(businessOverviewQuery.data).length ? (
                  <div className="p2-table-wrap">
                    <table className="p2-table">
                      <thead><tr><th>Component</th><th>Source</th><th>Amount</th></tr></thead>
                      <tbody>
                        {sourceRows(businessOverviewQuery.data).map((row, index) => (
                          <tr key={`${row.lineKind}:${row.componentKey}:${row.sourceDocumentType}:${index}`}>
                            <td>{labelKey(row.componentKey)}</td>
                            <td>{labelKey(row.sourceDocumentType)}</td>
                            <td>{money(String(row.amount))}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : businessOverviewQuery.data ? <p className="p2-note">No multi-source commercial variance is recorded for this Journey.</p> : null}
              </div>
            ) : null}

            {section === 'vehicle' ? (
              <div className="p2-business-stack">
                <div className="p2-business-head"><div><strong>Vehicle</strong><span>Resolved vehicle projection from Audit Core.</span></div></div>
                {vehicleQuery.isLoading ? <p className="p2-note">Loading vehicle…</p> : null}
                {vehicleQuery.isError ? <p className="p2-note">Vehicle information is not available yet.</p> : null}
                <DomainFacts record={vehicleQuery.data} empty="Vehicle information is not available yet." />
              </div>
            ) : null}

            {section === 'payments' ? (
              <div className="p2-business-stack">
                <div className="p2-business-head"><div><strong>Payments</strong><span>Booking and Delivery receipts remain separate, with their source references.</span></div></div>
                {paymentsQuery.isLoading ? <p className="p2-note">Loading payments…</p> : null}
                {paymentsQuery.data?.length ? (
                  <div className="p2-table-wrap">
                    <table className="p2-table">
                      <thead><tr><th>Stage</th><th>Amount</th><th>Method</th><th>Reference</th><th>Date</th></tr></thead>
                      <tbody>
                        {paymentsQuery.data.map((payment, index) => (
                          <tr key={String(recordValue(payment, 'paymentId', 'payment_id') || index)}>
                            <td>{displayValue(recordValue(payment, 'paymentStage', 'payment_stage'))}</td>
                            <td>{money(String(recordValue(payment, 'amount') ?? ''))}</td>
                            <td>{displayValue(recordValue(payment, 'paymentMethodCode', 'payment_method_code', 'mode'))}</td>
                            <td>{displayValue(recordValue(payment, 'paymentReference', 'payment_reference', 'receiptNumber', 'receipt_number'))}</td>
                            <td>{displayValue(recordValue(payment, 'paymentAtUtc', 'payment_at_utc', 'paymentDate', 'payment_date'))}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : !paymentsQuery.isLoading ? <p className="p2-note">No payments are recorded yet.</p> : null}
              </div>
            ) : null}

            {section === 'finance' ? (
              <div className="p2-business-stack">
                <div className="p2-business-head"><div><strong>Finance</strong><span>Resolved finance and loan-disbursement information.</span></div></div>
                {financeQuery.isLoading ? <p className="p2-note">Loading finance…</p> : null}
                {financeQuery.isError ? <p className="p2-note">Finance information is not available yet.</p> : null}
                <DomainFacts record={financeQuery.data} empty="Finance information is not available yet." />
              </div>
            ) : null}

            {section === 'insurance' ? (
              <div className="p2-business-stack">
                <div className="p2-business-head"><div><strong>Insurance</strong><span>Resolved policy, premium and intermediary information.</span></div></div>
                {insuranceQuery.isLoading ? <p className="p2-note">Loading insurance…</p> : null}
                {insuranceQuery.isError ? <p className="p2-note">Insurance information is not available yet.</p> : null}
                <DomainFacts record={insuranceQuery.data} empty="Insurance information is not available yet." />
              </div>
            ) : null}

            {section === 'registration' ? (
              <div className="p2-business-stack">
                <div className="p2-business-head"><div><strong>Registration</strong><span>Registration and RTO-derived business projection.</span></div></div>
                {registrationQuery.isLoading ? <p className="p2-note">Loading registration…</p> : null}
                {registrationQuery.isError ? <p className="p2-note">Registration information is not available yet.</p> : null}
                <DomainFacts record={registrationQuery.data} empty="Registration information is not available yet." />
              </div>
            ) : null}

            {section === 'findings' ? (
              <div className="p2-business-stack">
                <div className="p2-business-head"><div><strong>Findings</strong><span>Open audit exceptions remain separate from workflow tasks.</span></div></div>
                {findingsQuery.isLoading ? <p className="p2-note">Loading findings…</p> : null}
                {findingsQuery.data?.length ? (
                  <div className="p2-table-wrap">
                    <table className="p2-table">
                      <thead><tr><th>Severity</th><th>Finding</th><th>Status</th></tr></thead>
                      <tbody>
                        {findingsQuery.data.map((finding, index) => {
                          const row = finding as unknown as Record<string, unknown>;
                          return (
                            <tr key={String(recordValue(row, 'findingId', 'auditFindingId', 'audit_finding_id') || index)}>
                              <td><StatusPill value={String(recordValue(row, 'severity') || 'INFO')} compact /></td>
                              <td>
                                <strong>{String(recordValue(row, 'title', 'findingTypeCode', 'finding_type_code') || 'Finding')}</strong>
                                <small>{String(recordValue(row, 'description', 'observedSummary', 'observed_summary') || '')}</small>
                              </td>
                              <td><StatusPill value={String(recordValue(row, 'findingStatus', 'finding_status', 'status') || 'OPEN')} compact /></td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : !findingsQuery.isLoading ? <p className="p2-note">No findings are recorded for this Journey.</p> : null}
              </div>
            ) : null}

            {section === 'activity' ? (
              <div className="p2-business-stack">
                <div className="p2-business-head"><div><strong>Activity</strong><span>Phase 2 processing and user-action history, newest available events first.</span></div></div>
                {activityQuery.isLoading ? <p className="p2-note">Loading activity…</p> : null}
                {(activityQuery.data?.events ?? []).length ? (
                  <div className="p2-table-wrap">
                    <table className="p2-table">
                      <thead><tr><th>Event</th><th>Subject</th><th>Detail</th><th>Time</th></tr></thead>
                      <tbody>
                        {[...(activityQuery.data?.events ?? [])].reverse().map((event, index) => (
                          <tr key={String(event.event_id || index)}>
                            <td><strong>{labelKey(String(event.event_type || 'Activity'))}</strong></td>
                            <td>{labelKey(String(event.subject_type || 'Journey'))}</td>
                            <td>{detailsSummary(event.details) || '—'}</td>
                            <td>{displayValue(event.created_at_utc || event.occurred_at_utc)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : !activityQuery.isLoading ? <p className="p2-note">No Phase 2 activity has been recorded yet.</p> : null}
              </div>
            ) : null}
          </section>
        </>
      ) : null}
    </div>
  );
}
