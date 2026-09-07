import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useLocation, useParams } from 'react-router-dom';

import PageHeader from '../components/PageHeader';
import SectionCard from '../components/SectionCard';
import StatusPill from '../components/StatusPill';
import JourneyReviewedDetails from '../features/uc03/JourneyReviewedDetails';
import { deriveSkuCandidates } from '../services/audit-core/uc03SkuCandidates';
import { getUc03JourneyOverview } from '../services/audit-core/uc03JourneySearch';
import { useProjectContextStore } from '../store/projectContextStore';
import { useSessionStore } from '../store/sessionStore';

// How long the "Booking submitted" success banner stays visible (ms).
const SUBMIT_BANNER_DURATION_MS = 6_000;

function value(record: Record<string, unknown> | null | undefined, key: string): unknown {
  return record?.[key];
}

function objectValue(record: Record<string, unknown> | null | undefined, key: string): Record<string, unknown> | null {
  const current = value(record, key);
  return current && typeof current === 'object' && !Array.isArray(current)
    ? current as Record<string, unknown>
    : null;
}

function textValue(record: Record<string, unknown> | null | undefined, key: string): string {
  const current = value(record, key);
  if (current === null || current === undefined || current === '') return 'Not available';
  if (typeof current === 'boolean') return current ? 'Yes' : 'No';
  if (typeof current === 'object') {
    try {
      return JSON.stringify(current);
    } catch {
      return String(current);
    }
  }
  return String(current);
}

function preferredText(
  primary: Record<string, unknown> | null | undefined,
  primaryKey: string,
  fallback: Record<string, unknown> | null | undefined,
  fallbackKey: string,
): string {
  const first = value(primary, primaryKey);
  if (first !== null && first !== undefined && first !== '') return String(first);
  return textValue(fallback, fallbackKey);
}

function readable(valueToFormat: unknown): string {
  if (valueToFormat === null || valueToFormat === undefined || valueToFormat === '') return 'Not available';
  return String(valueToFormat)
    .replaceAll('_', ' ')
    .toLowerCase()
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function money(valueToFormat: unknown, currency = 'INR'): string {
  if (valueToFormat === null || valueToFormat === undefined || valueToFormat === '') return '\u2014';
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

/** True when the receipt row has no reviewed amount yet (DI still processing). */
function receiptIsPending(payment: Record<string, unknown>): boolean {
  return (
    payment.amount === null
    || payment.amount === undefined
    || payment.amount === ''
    || Number(payment.amount) === 0
  ) && String(payment.reviewStatus || '').toUpperCase() !== 'VERIFIED';
}

export default function Journey360Page() {
  const { journeyId = '' } = useParams();
  const location = useLocation();
  const queryClient = useQueryClient();
  const accessToken = useSessionStore((state) => state.accessToken);
  const selectedProject = useProjectContextStore((state) => state.selectedProject);
  const tenantId = selectedProject?.tenantId || '';

  // BUG-4: show a timed success banner when navigated straight from Booking Review submit.
  const arrivedFromSubmit = (location.state as Record<string, unknown> | null)?.bookingSubmitted === true;
  const [showSubmitBanner, setShowSubmitBanner] = useState(arrivedFromSubmit);
  useEffect(() => {
    if (!arrivedFromSubmit) return undefined;
    const timer = window.setTimeout(() => setShowSubmitBanner(false), SUBMIT_BANNER_DURATION_MS);
    return () => window.clearTimeout(timer);
  // Run once on mount only — the location.state does not change after mount.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // BUG-1: when navigated from Review submit, force the overview query to
  // re-fetch immediately rather than serving the 15s stale cache that still
  // has captureSubmitted=false. This prevents BookingDetailsV2Page redirecting
  // the user back to Review.
  const invalidatedOnArrival = useRef(false);
  useEffect(() => {
    if (!arrivedFromSubmit || invalidatedOnArrival.current) return;
    invalidatedOnArrival.current = true;
    void queryClient.invalidateQueries({
      queryKey: ['uc03-journey-overview', tenantId, journeyId],
    });
  // tenantId and journeyId are stable for the lifetime of this page mount.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const overviewQuery = useQuery({
    queryKey: ['uc03-journey-overview', tenantId, journeyId],
    queryFn: () => getUc03JourneyOverview(tenantId, journeyId, accessToken),
    enabled: Boolean(accessToken && tenantId && journeyId),
    staleTime: 15_000,
  });

  // BUG-3: SKU auto-trigger state.
  const skuTriggered = useRef(false);
  const [skuResult, setSkuResult] = useState<{ label: string; status: string; tentative: boolean } | null>(null);
  const [skuPending, setSkuPending] = useState(false);

  const model = overviewQuery.data;

  // BUG-3: trigger SKU derivation once after data loads, when SKU is missing.
  useEffect(() => {
    if (!model || skuTriggered.current || !tenantId || !journeyId || !accessToken) return;
    const booking = model.booking;
    if (!booking) return;
    const reviewedValues = objectValue(booking, 'reviewedValues');
    // SKU is already present — nothing to do.
    if (textValue(reviewedValues, 'sku_code') !== 'Not available') {
      skuTriggered.current = true;
      return;
    }
    // Need model name and at least one commercial total to attempt resolution.
    const modelName = String(value(booking, 'modelName') || value(reviewedValues, 'vehicle_model') || '').trim();
    // Sum available commercial lines for a total to match against the price master.
    const commercialTotal = (model.commercialLines as Array<Record<string, unknown>>).reduce(
      (sum, line) => {
        const amt = Number(line.standardAmount ?? line.actualAmount ?? 0);
        return sum + (Number.isNaN(amt) ? 0 : amt);
      },
      0,
    );
    // Also try reviewed DI total if Core lines are not yet populated.
    const reviewedTotal = Number(value(reviewedValues, 'total_price') ?? value(reviewedValues, 'net_amount') ?? 0);
    const totalToUse = commercialTotal > 0 ? commercialTotal : reviewedTotal;
    if (!modelName || totalToUse <= 0) return;

    skuTriggered.current = true;
    setSkuPending(true);
    const variantName = String(value(booking, 'variantName') || value(reviewedValues, 'vehicle_variant') || '').trim() || undefined;
    const colourName = String(value(booking, 'colourName') || value(reviewedValues, 'vehicle_color') || '').trim() || undefined;
    deriveSkuCandidates(
      tenantId,
      journeyId,
      {
        modelName,
        variantName: variantName || null,
        colourName: colourName || null,
        totalCommercialAmount: totalToUse,
      },
      accessToken,
    )
      .then((response) => {
        const top = response.candidates[0];
        if (!top) return;
        setSkuResult({
          label: top.displayLabel,
          status: top.candidateStatus === 'CONFIRMED' ? 'SKU resolved' : 'SKU tentative — confirm at Delivery',
          tentative: top.candidateStatus === 'TENTATIVE',
        });
        // Invalidate the overview so the SKU appears in future fetches.
        void queryClient.invalidateQueries({
          queryKey: ['uc03-journey-overview', tenantId, journeyId],
        });
      })
      .catch(() => {
        // VAC-SKU-001 = no exact match; silently suppress — the section will
        // show 'Not available' which is correct when no master row matches.
      })
      .finally(() => setSkuPending(false));
  // Run when model first becomes available; dependencies are stable identifiers.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model]);

  const receiptRows = model?.receipts || [];
  const paymentRows = receiptRows.length > 0 ? receiptRows : (model?.payments || []);
  const paymentTotal = useMemo(() => (
    paymentRows.reduce((sum, payment) => {
      const amount = Number(payment.amount ?? 0);
      return sum + (Number.isNaN(amount) ? 0 : amount);
    }, 0)
  ), [paymentRows]);

  if (overviewQuery.isLoading) return <div className="page-loading">Loading complete Journey\u2026</div>;
  if (overviewQuery.isError || !model) {
    return (
      <div className="screen-stack journey-360-page">
        <PageHeader eyebrow="Journey Search" title="Journey unavailable" description="This Journey was not found in your current authorized Project scope." />
        <Link className="journey-360-back" to="/search">\u2190 Back to Journey Search</Link>
      </div>
    );
  }

  const reviewedBooking = objectValue(model.booking, 'reviewedValues');
  const capturedCustomerName = preferredText(reviewedBooking, 'customer_name', model.customer, 'enteredName');
  const legalNameRaw = value(model.customer, 'legalName');
  const customerName = legalNameRaw ? String(legalNameRaw) : capturedCustomerName;
  const bookingReference = textValue(model.booking, 'bookingReference');
  const productLabel = textValue(model.journey, 'productLabel');
  const bookingStatus = value(model.journey, 'bookingStatus');
  const deliveryStatus = value(model.journey, 'deliveryStatus');
  const activeFindings = model.findings.filter((finding) => ['OPEN', 'ACKNOWLEDGED'].includes(String(finding.findingStatus || '')));
  const reviewedFields = model.reviewedFields || [];

  // Resolved SKU: prefer Core answer, fall back to auto-trigger result.
  const resolvedSku = textValue(reviewedBooking, 'sku_code');
  const skuDisplay = resolvedSku !== 'Not available'
    ? resolvedSku
    : skuPending
      ? 'Resolving SKU\u2026'
      : skuResult
        ? skuResult.label
        : 'Not available';
  const skuNote = resolvedSku === 'Not available' && skuResult ? skuResult.status : undefined;

  return (
    <div className="screen-stack journey-360-page">
      {showSubmitBanner && (
        <div className="journey-360-submit-banner" role="status" aria-live="polite">
          <span>\u2714\ufe0f Booking submitted successfully.</span>
          <button type="button" className="journey-360-banner-dismiss" aria-label="Dismiss" onClick={() => setShowSubmitBanner(false)}>\u00d7</button>
        </div>
      )}

      <div className="journey-360-topline">
        <Link className="journey-360-back" to="/search">\u2190 Search results</Link>
        <div className="journey-360-actions">
          <Link to={`/v2/bookings/${journeyId}`}>Open Booking</Link>
          <Link to={`/v2/deliveries/${journeyId}`}>Open Delivery</Link>
          <Link className="journey-360-actions__primary" to={`/audit/${journeyId}`}>Audit Review</Link>
        </div>
      </div>

      <PageHeader
        eyebrow={`${textValue(model.journey, 'dealerName')} \u00b7 ${textValue(model.journey, 'outletName')}`}
        title={customerName}
        description={`Dealer Booking ${bookingReference} \u00b7 ${productLabel}`}
        actions={<div className="header-statuses"><StatusPill value={String(bookingStatus || 'NOT_STARTED')} /><StatusPill value={String(deliveryStatus || 'NOT_STARTED')} /></div>}
      />

      <section className="journey-360-summary" aria-label="Journey summary">
        <div><span>Dealer Booking No.</span><strong>{bookingReference}</strong></div>
        <div><span>Payments / Receipts</span><strong>{paymentRows.length}</strong><small>{money(paymentTotal)}</small></div>
        <div><span>Documents</span><strong>{model.evidence.length}</strong></div>
        <div><span>Reviewed DI Fields</span><strong>{reviewedFields.length}</strong></div>
        <div><span>Open Findings</span><strong>{activeFindings.length}</strong></div>
      </section>

      <div className="journey-360-grid journey-360-grid--two">
        <SectionCard title="Customer" description="PAN/Aadhaar reviewed identity is the customer source of truth; entered Booking values remain available in the complete source detail below.">
          <div className="journey-360-facts">
            <Fact label="Customer Name (Booking)">{capturedCustomerName}</Fact>
            <Fact label="Legal / KYC Name">{textValue(model.customer, 'legalName')}</Fact>
            <Fact label="PAN">{textValue(model.customer, 'panNumber')}</Fact>
            <Fact label="Aadhaar">{textValue(model.customer, 'aadhaarNumber')}</Fact>
            <Fact label="Date of Birth">{dateLabel(value(model.customer, 'dateOfBirth'))}</Fact>
            <Fact label="Gender">{readable(value(model.customer, 'gender'))}</Fact>
            <Fact label="Mobile">{preferredText(model.customer, 'mobileNumber', reviewedBooking, 'customer_phone')}</Fact>
            <Fact label="Email">{preferredText(model.customer, 'emailReference', reviewedBooking, 'customer_email')}</Fact>
            <Fact label="KYC Address">{preferredText(model.customer, 'address', reviewedBooking, 'customer_address')}</Fact>
            <Fact label="Pincode">{textValue(model.customer, 'pincode')}</Fact>
            <Fact label="KYC State">{textValue(model.customer, 'kycState')}</Fact>
            <Fact label="KYC District">{textValue(model.customer, 'kycDistrict')}</Fact>
            <Fact label="Relationship">{textValue(model.customer, 'relationshipType')}</Fact>
            <Fact label="Relationship Name">{textValue(model.customer, 'relationshipName')}</Fact>
            <Fact label="Customer Type">{readable(value(model.customer, 'customerType'))}</Fact>
            <Fact label="Identity Status">{readable(value(model.customer, 'legalNameStatus'))}</Fact>
          </div>
        </SectionCard>

        <SectionCard title="Booking & Vehicle" description="Booking state with reviewed Delivery product facts taking precedence when the same information is extracted again at Delivery.">
          {model.booking ? (
            <div className="journey-360-facts">
              <Fact label="Dealer Booking No.">{bookingReference}</Fact>
              <Fact label="Booking Date">{dateLabel(value(model.booking, 'bookingDate'))}</Fact>
              <Fact label="Model">{preferredText(model.booking, 'modelName', reviewedBooking, 'vehicle_model')}</Fact>
              <Fact label="Variant">{preferredText(model.booking, 'variantName', reviewedBooking, 'vehicle_variant')}</Fact>
              <Fact label="Colour">{preferredText(model.booking, 'colourName', reviewedBooking, 'vehicle_color')}</Fact>
              <Fact label="SKU">
                {skuDisplay}
                {skuNote && <small style={{ display: 'block', fontWeight: 'normal', fontSize: '0.8em', color: skuResult?.tentative ? '#b45309' : '#15803d' }}>{skuNote}</small>}
              </Fact>
              <Fact label="Sales Consultant">{textValue(reviewedBooking, 'sales_person')}</Fact>
              <Fact label="Dealer">{textValue(reviewedBooking, 'dealer_name')}</Fact>
              <Fact label="Dealer Branch">{textValue(reviewedBooking, 'dealer_branch')}</Fact>
              <Fact label="Deal Type">{preferredText(model.booking, 'dealType', reviewedBooking, 'deal_type')}</Fact>
              <Fact label="Deal Source">{readable(value(model.booking, 'dealSource'))}</Fact>
              <Fact label="Lead Source">{readable(value(model.booking, 'leadSource'))}</Fact>
              <Fact label="Expected Delivery">{dateLabel(value(reviewedBooking, 'expected_delivery_date') || value(reviewedBooking, 'expected_delivery'))}</Fact>
              <Fact label="Registration By">{textValue(reviewedBooking, 'registration_by')}</Fact>
              <Fact label="Registration Type">{textValue(reviewedBooking, 'registration_type')}</Fact>
              <Fact label="Insurance By">{textValue(reviewedBooking, 'insurance_by')}</Fact>
              <Fact label="Exchange Applicable">{readable(value(reviewedBooking, 'exchange_applicable'))}</Fact>
              <Fact label="Exchange Value">{money(value(reviewedBooking, 'exchange_value'))}</Fact>
            </div>
          ) : <EmptySection>Booking details are not available yet.</EmptySection>}
        </SectionCard>
      </div>

      <div className="journey-360-grid journey-360-grid--two">
        <SectionCard title="Commercials & Discounts" description="Current Core-owned commercial lines are the final amounts; Booking reviewed amounts are retained for comparison and audit traceability.">
          {reviewedBooking && (
            <div className="journey-360-subsection">
              <strong>Booking reviewed amounts</strong>
              <div className="journey-360-facts">
                <Fact label="Ex-showroom Price">{money(value(reviewedBooking, 'ex_showroom_price'))}</Fact>
                <Fact label="Insurance Amount">{money(value(reviewedBooking, 'insurance_amount'))}</Fact>
                <Fact label="Registration Charges">{money(value(reviewedBooking, 'registration_charges'))}</Fact>
                <Fact label="Road Tax">{money(value(reviewedBooking, 'road_tax_amount'))}</Fact>
                <Fact label="TCS">{money(value(reviewedBooking, 'tcs_amount'))}</Fact>
                <Fact label="RSA">{money(value(reviewedBooking, 'rsa_amount'))}</Fact>
                <Fact label="Additional Warranty">{money(value(reviewedBooking, 'additional_warranty_amount'))}</Fact>
                <Fact label="Accessories">{money(value(reviewedBooking, 'accessories_cost'))}</Fact>
                <Fact label="Other Charges">{money(value(reviewedBooking, 'other_charges'))}</Fact>
                <Fact label="Discount">{money(value(reviewedBooking, 'discount_amount'))}</Fact>
                <Fact label="Bonus">{money(value(reviewedBooking, 'bonus_amount'))}</Fact>
                <Fact label="Total Price">{money(value(reviewedBooking, 'total_price'))}</Fact>
                <Fact label="Net Amount">{money(value(reviewedBooking, 'net_amount'))}</Fact>
                <Fact label="Booking Amount Paid">{money(value(reviewedBooking, 'booking_amount_paid'))}</Fact>
                <Fact label="Balance Amount">{money(value(reviewedBooking, 'balance_amount'))}</Fact>
              </div>
            </div>
          )}

          {model.commercialLines.length > 0 ? (
            <div className="journey-360-subsection">
              <strong>Current commercial values</strong>
              <div className="journey-360-table-wrap">
                <table className="journey-360-table">
                  <thead><tr><th>Component</th><th>Standard</th><th>Actual</th><th>Source</th></tr></thead>
                  <tbody>
                    {model.commercialLines.map((line) => (
                      <tr key={String(line.commercialLineId)}>
                        <td>{readable(line.componentKey)}</td>
                        <td>{money(line.standardAmount, String(line.currencyCode || 'INR'))}</td>
                        <td>{money(line.actualAmount, String(line.currencyCode || 'INR'))}</td>
                        <td>{String(line.sourceReference || readable(line.sourceKind))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : !reviewedBooking && <EmptySection>No reviewed commercial lines are available yet.</EmptySection>}

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

        <SectionCard title="Payments & Receipts" description="Every uploaded reviewed receipt remains a separate record under this Journey.">
          {paymentRows.length > 0 ? (
            <>
              <div className="journey-360-payment-total"><span>Total recorded</span><strong>{money(paymentTotal)}</strong></div>
              <div className="journey-360-table-wrap">
                <table className="journey-360-table">
                  <thead><tr><th>Date</th><th>Receipt / Reference</th><th>Mode / Status</th><th>Amount</th></tr></thead>
                  <tbody>
                    {paymentRows.map((payment, index) => {
                      const isPending = receiptIsPending(payment);
                      return (
                        <tr
                          key={String(payment.documentId || payment.paymentId || payment.receiptNumber || index)}
                          className={isPending ? 'journey-360-receipt-pending' : ''}
                        >
                          <td>{isPending ? <span className="journey-360-receipt-pending-label">Document received</span> : dateLabel(payment.receiptDate || payment.paymentAtUtc)}</td>
                          <td>{String(payment.receiptNumber || payment.paymentReference || payment.originalFilename || '\u2014')}</td>
                          <td>
                            {isPending
                              ? <span className="journey-360-receipt-pending-status">DI extracting\u2026</span>
                              : readable(payment.paymentMethodCode || payment.reviewStatus || payment.actualStatusCode)}
                          </td>
                          <td>{isPending ? <span className="journey-360-receipt-pending-label">Pending</span> : money(payment.amount, String(payment.currencyCode || 'INR'))}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="journey-360-facts journey-360-facts--single">
              <Fact label="Booking Amount Paid">{money(value(reviewedBooking, 'booking_amount_paid'))}</Fact>
              <Fact label="Payment Mode">{readable(value(reviewedBooking, 'mode_of_payment'))}</Fact>
              <Fact label="Payment Reference">{textValue(reviewedBooking, 'payment_reference_no')}</Fact>
            </div>
          )}
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
              <Fact label="Source">{readable(value(model.delivery, 'sourceKind'))}</Fact>
            </div>
          ) : <EmptySection>Delivery has not been recorded yet.</EmptySection>}
        </SectionCard>

        <SectionCard title="Vehicle Allocation">
          {model.vehicle ? (
            <div className="journey-360-facts journey-360-facts--single">
              <Fact label="VIN">{textValue(model.vehicle, 'vin')}</Fact>
              <Fact label="Chassis No.">{textValue(model.vehicle, 'chassisNumber')}</Fact>
              <Fact label="DMS Reference">{textValue(model.vehicle, 'dmsReference')}</Fact>
              <Fact label="Invoice Reference">{textValue(model.vehicle, 'invoiceReference')}</Fact>
              <Fact label="Allocated">{dateLabel(value(model.vehicle, 'allocatedAtUtc'))}</Fact>
              <Fact label="Source">{readable(value(model.vehicle, 'sourceKind'))}</Fact>
            </div>
          ) : <EmptySection>Vehicle allocation details are not available yet.</EmptySection>}
        </SectionCard>

        <SectionCard title="Registration">
          {model.registration ? (
            <div className="journey-360-facts journey-360-facts--single">
              <Fact label="Registration No.">{textValue(model.registration, 'registrationNumber')}</Fact>
              <Fact label="State">{textValue(model.registration, 'registrationState')}</Fact>
              <Fact label="Territory">{textValue(model.registration, 'registrationTerritory')}</Fact>
              <Fact label="District">{textValue(model.registration, 'registrationDistrict')}</Fact>
              <Fact label="Type">{readable(value(model.registration, 'registrationTypeCode'))}</Fact>
              <Fact label="Category">{readable(value(model.registration, 'registrationCategoryCode'))}</Fact>
              <Fact label="Status">{readable(value(model.registration, 'actualStatusCode'))}</Fact>
              <Fact label="Source">{readable(value(model.registration, 'sourceKind'))}</Fact>
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
              <Fact label="PO Reference">{textValue(model.finance, 'poReference')}</Fact>
              <Fact label="Financed Amount">{money(value(model.finance, 'financedAmount'))}</Fact>
              <Fact label="Status">{readable(value(model.finance, 'actualStatusCode'))}</Fact>
              <Fact label="Details">{textValue(model.finance, 'details')}</Fact>
              <Fact label="Source">{readable(value(model.finance, 'sourceKind'))}</Fact>
            </div>
          ) : <EmptySection>No typed finance record is available. Reviewed finance documents remain visible in Complete Reviewed Document Data.</EmptySection>}
        </SectionCard>

        <SectionCard title="Insurance">
          {model.insurance ? (
            <div className="journey-360-facts journey-360-facts--single">
              <Fact label="Insurer">{textValue(model.insurance, 'insurerName')}</Fact>
              <Fact label="Policy">{textValue(model.insurance, 'policyReference')}</Fact>
              <Fact label="Cover Note">{textValue(model.insurance, 'coverNoteReference')}</Fact>
              <Fact label="Standard Premium">{money(value(model.insurance, 'standardPremiumAmount'))}</Fact>
              <Fact label="Actual Premium">{money(value(model.insurance, 'actualPremiumAmount'))}</Fact>
              <Fact label="Self Insurance">{readable(value(model.insurance, 'selfInsuranceFlag'))}</Fact>
              <Fact label="Status">{readable(value(model.insurance, 'actualStatusCode'))}</Fact>
              <Fact label="Source">{readable(value(model.insurance, 'sourceKind'))}</Fact>
            </div>
          ) : <EmptySection>No typed insurance record is available. Reviewed policy data remains visible below.</EmptySection>}
        </SectionCard>

        <SectionCard title="Trade-in / Exchange">
          {model.tradeIn ? (
            <div className="journey-360-facts journey-360-facts--single">
              <Fact label="Status">{readable(value(model.tradeIn, 'actualStatusCode'))}</Fact>
              <Fact label="Old Vehicle">{textValue(model.tradeIn, 'oldVehicleMakeModel')}</Fact>
              <Fact label="Registration">{textValue(model.tradeIn, 'oldVehicleRegistration')}</Fact>
              <Fact label="Quoted Value">{money(value(model.tradeIn, 'quotedValue'))}</Fact>
              <Fact label="Actual Value">{money(value(model.tradeIn, 'actualValue'))}</Fact>
              <Fact label="Handover">{dateLabel(value(model.tradeIn, 'handoverAtUtc'))}</Fact>
              <Fact label="Payment">{dateLabel(value(model.tradeIn, 'paymentAtUtc'))}</Fact>
              <Fact label="Resale">{dateLabel(value(model.tradeIn, 'resaleAtUtc'))}</Fact>
              <Fact label="Details">{textValue(model.tradeIn, 'details')}</Fact>
              <Fact label="Source">{readable(value(model.tradeIn, 'sourceKind'))}</Fact>
            </div>
          ) : <EmptySection>No typed trade-in record is available. Reviewed exchange documents remain visible below.</EmptySection>}
        </SectionCard>
      </div>

      <SectionCard title="Add-ons / Warranty / Accessories" description="Typed Audit Core add-on records. DI-extracted warranty, RSA and accessory invoice fields are also shown in the complete reviewed data section below.">
        {model.addons.length > 0 ? (
          <div className="journey-360-table-wrap">
            <table className="journey-360-table">
              <thead><tr><th>Type</th><th>Provider</th><th>Reference</th><th>Standard</th><th>Actual</th><th>Source</th></tr></thead>
              <tbody>
                {model.addons.map((addon, index) => (
                  <tr key={String(addon.journeyAddonId || index)}>
                    <td>{readable(addon.addonTypeCode)}</td>
                    <td>{String(addon.providerName || '\u2014')}</td>
                    <td>{String(addon.referenceNumber || '\u2014')}</td>
                    <td>{money(addon.standardAmount)}</td>
                    <td>{money(addon.actualAmount)}</td>
                    <td>{readable(addon.sourceKind)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <EmptySection>No typed add-on rows are available yet; reviewed DI add-on fields are retained below.</EmptySection>}
      </SectionCard>

      <JourneyReviewedDetails fields={reviewedFields} />

      <div className="journey-360-grid journey-360-grid--two">
        <SectionCard title="Documents" description="Booking and Delivery documents already linked to this Journey.">
          {model.evidence.length > 0 ? (
            <div className="journey-360-list">
              {model.evidence.map((document, index) => (
                <div className="journey-360-list__row" key={String(document.documentId || document.evidenceId || index)}>
                  <span className="journey-360-document-mark">DOC</span>
                  <div>
                    <strong>{readable(document.documentTypeKey || document.requirementKey || document.originalFilename)}</strong>
                    <small>{readable(document.processArea || document.evidencePurpose)}{document.originalFilename ? ` \u00b7 ${String(document.originalFilename)}` : ''}</small>
                  </div>
                  <div className="journey-360-list__status">
                    <StatusPill value={String(document.reviewStatus || document.verificationStatus || document.processingStatus || 'UNKNOWN')} compact />
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
                    <small>{readable(finding.stageCode)} \u00b7 {readable(finding.findingStatus)}</small>
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
