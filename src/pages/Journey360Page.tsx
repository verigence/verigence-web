import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';

import PageHeader from '../components/PageHeader';
import SectionCard from '../components/SectionCard';
import StatusPill from '../components/StatusPill';
import { getUc03JourneyOverview } from '../services/audit-core/uc03JourneySearch';
import { useProjectContextStore } from '../store/projectContextStore';
import { useSessionStore } from '../store/sessionStore';

function value(record: Record<string, unknown> | null | undefined, key: string): unknown {
  return record?.[key];
}

function textValue(record: Record<string, unknown> | null | undefined, key: string): string {
  const current = value(record, key);
  if (current === null || current === undefined || current === '') return 'Not available';
  if (typeof current === 'boolean') return current ? 'Yes' : 'No';
  return String(current);
}

function readable(valueToFormat: unknown): string {
  if (valueToFormat === null || valueToFormat === undefined || valueToFormat === '') return 'Not available';
  return String(valueToFormat)
    .replaceAll('_', ' ')
    .toLowerCase()
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function money(valueToFormat: unknown, currency = 'INR'): string {
  if (valueToFormat === null || valueToFormat === undefined || valueToFormat === '') return '—';
  const amount = Number(valueToFormat);
  if (Number.isNaN(amount)) return String(valueToFormat);
  try {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 2 }).format(amount);
  } catch {
    return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(amount);
  }
}

function dateLabel(valueToFormat: unknown): string {
  if (!valueToFormat) return 'Not available';
  const parsed = new Date(String(valueToFormat));
  if (Number.isNaN(parsed.getTime())) return String(valueToFormat);
  return new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).format(parsed);
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="journey-360-fact">
      <span>{label}</span>
      <strong>{children}</strong>
    </div>
  );
}

function EmptySection({ children }: { children: React.ReactNode }) {
  return <p className="journey-360-empty">{children}</p>;
}

export default function Journey360Page() {
  const { journeyId = '' } = useParams();
  const accessToken = useSessionStore((state) => state.accessToken);
  const selectedProject = useProjectContextStore((state) => state.selectedProject);
  const tenantId = selectedProject?.tenantId || '';

  const overviewQuery = useQuery({
    queryKey: ['uc03-journey-overview', tenantId, journeyId],
    queryFn: () => getUc03JourneyOverview(tenantId, journeyId, accessToken),
    enabled: Boolean(accessToken && tenantId && journeyId),
    staleTime: 15_000,
  });

  const model = overviewQuery.data;
  const paymentTotal = useMemo(() => (
    (model?.payments || []).reduce((sum, payment) => {
      const amount = Number(payment.amount ?? 0);
      return sum + (Number.isNaN(amount) ? 0 : amount);
    }, 0)
  ), [model?.payments]);

  if (overviewQuery.isLoading) return <div className="page-loading">Loading complete Journey…</div>;
  if (overviewQuery.isError || !model) {
    return (
      <div className="screen-stack journey-360-page">
        <PageHeader title="Journey unavailable" description="This Journey was not found in your current authorized Project scope." />
        <Link className="journey-360-back" to="/search">← Back to Journey Search</Link>
      </div>
    );
  }

  const enteredName = textValue(model.customer, 'enteredName');
  const legalNameRaw = value(model.customer, 'legalName');
  const customerName = legalNameRaw ? String(legalNameRaw) : enteredName;
  const bookingReference = textValue(model.booking, 'bookingReference');
  const productLabel = textValue(model.journey, 'productLabel');
  const bookingStatus = value(model.journey, 'bookingStatus');
  const deliveryStatus = value(model.journey, 'deliveryStatus');
  const activeFindings = model.findings.filter((finding) => ['OPEN', 'ACKNOWLEDGED'].includes(String(finding.findingStatus || '')));

  return (
    <div className="screen-stack journey-360-page">
      <div className="journey-360-topline">
        <Link className="journey-360-back" to="/search">← Search results</Link>
        <div className="journey-360-actions">
          <Link to={`/v2/bookings/${journeyId}`}>Open Booking</Link>
          <Link to={`/v2/deliveries/${journeyId}`}>Open Delivery</Link>
          <Link className="journey-360-actions__primary" to={`/audit/${journeyId}`}>Audit Review</Link>
        </div>
      </div>

      <PageHeader
        eyebrow={`${textValue(model.journey, 'dealerName')} · ${textValue(model.journey, 'outletName')}`}
        title={customerName}
        description={`Dealer Booking ${bookingReference} · ${productLabel}`}
        actions={<div className="header-statuses"><StatusPill value={String(bookingStatus || 'NOT_STARTED')} /><StatusPill value={String(deliveryStatus || 'NOT_STARTED')} /></div>}
      />

      <section className="journey-360-summary" aria-label="Journey summary">
        <div><span>Dealer Booking No.</span><strong>{bookingReference}</strong></div>
        <div><span>Payments</span><strong>{model.payments.length}</strong><small>{money(paymentTotal)}</small></div>
        <div><span>Documents</span><strong>{model.evidence.length}</strong></div>
        <div><span>Open Findings</span><strong>{activeFindings.length}</strong></div>
      </section>

      <div className="journey-360-grid journey-360-grid--two">
        <SectionCard title="Customer" description="Entered identity remains separate from reviewed document identity.">
          <div className="journey-360-facts">
            <Fact label="Entered Name">{enteredName}</Fact>
            <Fact label="Document / Legal Name">{textValue(model.customer, 'legalName')}</Fact>
            <Fact label="Identity Status">{readable(value(model.customer, 'legalNameStatus'))}</Fact>
            <Fact label="Mobile">{textValue(model.customer, 'mobileNumber')}</Fact>
            <Fact label="Email">{textValue(model.customer, 'emailReference')}</Fact>
            <Fact label="Customer Type">{readable(value(model.customer, 'customerType'))}</Fact>
            <Fact label="Relationship">{textValue(model.customer, 'relationshipType')}</Fact>
            <Fact label="Related Person">{textValue(model.customer, 'relationshipName')}</Fact>
          </div>
        </SectionCard>

        <SectionCard title="Booking" description="What was agreed / captured at Booking.">
          {model.booking ? (
            <div className="journey-360-facts">
              <Fact label="Dealer Booking No.">{bookingReference}</Fact>
              <Fact label="Booking Date">{dateLabel(value(model.booking, 'bookingDate'))}</Fact>
              <Fact label="Model">{textValue(model.booking, 'modelName')}</Fact>
              <Fact label="Variant">{textValue(model.booking, 'variantName')}</Fact>
              <Fact label="Colour">{textValue(model.booking, 'colourName')}</Fact>
              <Fact label="Deal Type">{readable(value(model.booking, 'dealType'))}</Fact>
              <Fact label="Deal Source">{readable(value(model.booking, 'dealSource'))}</Fact>
              <Fact label="Lead Source">{readable(value(model.booking, 'leadSource'))}</Fact>
              <Fact label="Expected Delivery">{textValue(model.booking, 'expectedDeliveryText')}</Fact>
              <Fact label="Expected Delivery Date">{dateLabel(value(model.booking, 'expectedDeliveryDate'))}</Fact>
              <Fact label="GST Benefit">{readable(value(model.booking, 'gstBenefit'))}</Fact>
              <Fact label="Corporate ID Available">{readable(value(model.booking, 'corporateIdAvailable'))}</Fact>
            </div>
          ) : <EmptySection>Booking details are not available yet.</EmptySection>}
        </SectionCard>
      </div>

      <div className="journey-360-grid journey-360-grid--two">
        <SectionCard title="Commercials & Discounts" description="Core-owned standard versus actual values used for audit and reconciliation.">
          {model.commercialLines.length > 0 ? (
            <div className="journey-360-table-wrap">
              <table className="journey-360-table">
                <thead><tr><th>Component</th><th>Standard</th><th>Actual</th><th>Source</th></tr></thead>
                <tbody>
                  {model.commercialLines.map((line) => (
                    <tr key={String(line.commercialLineId)}>
                      <td>{readable(line.componentKey)}</td>
                      <td>{money(line.standardAmount, String(line.currencyCode || 'INR'))}</td>
                      <td>{money(line.actualAmount, String(line.currencyCode || 'INR'))}</td>
                      <td>{readable(line.sourceKind)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <EmptySection>No reviewed commercial lines are available yet.</EmptySection>}

          {model.discounts.length > 0 && (
            <div className="journey-360-subsection">
              <strong>Discounts / Benefits</strong>
              <div className="journey-360-table-wrap">
                <table className="journey-360-table">
                  <thead><tr><th>Discount</th><th>Standard Eligible</th><th>Actual</th></tr></thead>
                  <tbody>
                    {model.discounts.map((discount) => (
                      <tr key={String(discount.discountApplicationId)}>
                        <td>{readable(discount.discountKey)}</td>
                        <td>{money(discount.standardEligibleAmount)}</td>
                        <td>{money(discount.actualDiscountAmount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </SectionCard>

        <SectionCard title="Payments" description="Every receipt remains an independent payment record under the same Journey.">
          {model.payments.length > 0 ? (
            <>
              <div className="journey-360-payment-total"><span>Total recorded</span><strong>{money(paymentTotal)}</strong></div>
              <div className="journey-360-table-wrap">
                <table className="journey-360-table">
                  <thead><tr><th>Date</th><th>Reference</th><th>Stage</th><th>Status</th><th>Amount</th></tr></thead>
                  <tbody>
                    {model.payments.map((payment) => (
                      <tr key={String(payment.paymentId)}>
                        <td>{dateLabel(payment.paymentAtUtc)}</td>
                        <td>{payment.paymentReference ? String(payment.paymentReference) : '—'}</td>
                        <td>{readable(payment.paymentStage)}</td>
                        <td>{readable(payment.actualStatusCode)}</td>
                        <td>{money(payment.amount, String(payment.currencyCode || 'INR'))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : <EmptySection>No payment / receipt has been recorded for this Journey.</EmptySection>}
        </SectionCard>
      </div>

      <div className="journey-360-grid journey-360-grid--three">
        <SectionCard title="Delivery">
          {model.delivery ? (
            <div className="journey-360-facts journey-360-facts--single">
              <Fact label="Status">{readable(value(model.delivery, 'actualDeliveryStatusCode'))}</Fact>
              <Fact label="Planned">{dateLabel(value(model.delivery, 'plannedDeliveryAt'))}</Fact>
              <Fact label="Intimated">{dateLabel(value(model.delivery, 'deliveryIntimatedAt'))}</Fact>
              <Fact label="Delivered">{dateLabel(value(model.delivery, 'actualDeliveredAt'))}</Fact>
            </div>
          ) : <EmptySection>Delivery has not been recorded yet.</EmptySection>}
        </SectionCard>

        <SectionCard title="Vehicle">
          {model.vehicle ? (
            <div className="journey-360-facts journey-360-facts--single">
              <Fact label="VIN">{textValue(model.vehicle, 'vin')}</Fact>
              <Fact label="Chassis No.">{textValue(model.vehicle, 'chassisNumber')}</Fact>
              <Fact label="DMS Reference">{textValue(model.vehicle, 'dmsReference')}</Fact>
              <Fact label="Invoice Reference">{textValue(model.vehicle, 'invoiceReference')}</Fact>
            </div>
          ) : <EmptySection>Vehicle allocation details are not available yet.</EmptySection>}
        </SectionCard>

        <SectionCard title="Registration">
          {model.registration ? (
            <div className="journey-360-facts journey-360-facts--single">
              <Fact label="Registration No.">{textValue(model.registration, 'registrationNumber')}</Fact>
              <Fact label="State">{textValue(model.registration, 'registrationState')}</Fact>
              <Fact label="Type">{readable(value(model.registration, 'registrationTypeCode'))}</Fact>
              <Fact label="Registration By">{textValue(model.registration, 'registrationBy')}</Fact>
              <Fact label="Status">{readable(value(model.registration, 'actualStatusCode'))}</Fact>
            </div>
          ) : <EmptySection>Registration details are not available yet.</EmptySection>}
        </SectionCard>
      </div>

      <div className="journey-360-grid journey-360-grid--three">
        <SectionCard title="Finance">
          {model.finance ? (
            <div className="journey-360-facts journey-360-facts--single">
              <Fact label="Type">{readable(value(model.finance, 'financeTypeCode'))}</Fact>
              <Fact label="Provider">{textValue(model.finance, 'providerName')}</Fact>
              <Fact label="DO Reference">{textValue(model.finance, 'doReference')}</Fact>
              <Fact label="Financed Amount">{money(value(model.finance, 'financedAmount'))}</Fact>
              <Fact label="Status">{readable(value(model.finance, 'actualStatusCode'))}</Fact>
            </div>
          ) : <EmptySection>No finance record is available.</EmptySection>}
        </SectionCard>

        <SectionCard title="Insurance">
          {model.insurance ? (
            <div className="journey-360-facts journey-360-facts--single">
              <Fact label="Insurer">{textValue(model.insurance, 'insurerName')}</Fact>
              <Fact label="Policy">{textValue(model.insurance, 'policyReference')}</Fact>
              <Fact label="Insurance By">{textValue(model.insurance, 'insuranceBy')}</Fact>
              <Fact label="Actual Premium">{money(value(model.insurance, 'actualPremiumAmount'))}</Fact>
              <Fact label="Status">{readable(value(model.insurance, 'actualStatusCode'))}</Fact>
            </div>
          ) : <EmptySection>No insurance record is available.</EmptySection>}
        </SectionCard>

        <SectionCard title="Trade-in / Exchange">
          {model.tradeIn ? (
            <div className="journey-360-facts journey-360-facts--single">
              <Fact label="Status">{readable(value(model.tradeIn, 'actualStatusCode'))}</Fact>
              <Fact label="Old Vehicle">{textValue(model.tradeIn, 'oldVehicleMakeModel')}</Fact>
              <Fact label="Registration">{textValue(model.tradeIn, 'oldVehicleRegistration')}</Fact>
              <Fact label="Quoted Value">{money(value(model.tradeIn, 'quotedValue'))}</Fact>
              <Fact label="Actual Value">{money(value(model.tradeIn, 'actualValue'))}</Fact>
            </div>
          ) : <EmptySection>No trade-in record is available.</EmptySection>}
        </SectionCard>
      </div>

      <div className="journey-360-grid journey-360-grid--two">
        <SectionCard title="Documents & Evidence" description="Documents linked to Booking and Delivery for this Journey.">
          {model.evidence.length > 0 ? (
            <div className="journey-360-list">
              {model.evidence.map((document) => (
                <div className="journey-360-list__row" key={String(document.evidenceId)}>
                  <span className="journey-360-document-mark">DOC</span>
                  <div>
                    <strong>{readable(document.documentTypeKey)}</strong>
                    <small>{readable(document.processArea || document.evidencePurpose)}</small>
                  </div>
                  <div className="journey-360-list__status">
                    <StatusPill value={String(document.verificationStatus || document.processingStatus || 'UNKNOWN')} compact />
                  </div>
                </div>
              ))}
            </div>
          ) : <EmptySection>No active documents are linked to this Journey.</EmptySection>}
        </SectionCard>

        <SectionCard title="Audit Findings" description="Current non-voided findings across Booking and Delivery.">
          {model.findings.length > 0 ? (
            <div className="journey-360-list">
              {model.findings.map((finding) => (
                <div className="journey-360-list__row" key={String(finding.auditFindingId)}>
                  <span className="journey-360-finding-mark">!</span>
                  <div>
                    <strong>{String(finding.title || 'Audit finding')}</strong>
                    <small>{readable(finding.stageCode)} · {readable(finding.findingStatus)}</small>
                  </div>
                  <div className="journey-360-list__status"><StatusPill value={String(finding.severity || 'INFO')} compact /></div>
                </div>
              ))}
            </div>
          ) : <EmptySection>No active audit findings are recorded for this Journey.</EmptySection>}
        </SectionCard>
      </div>
    </div>
  );
}
