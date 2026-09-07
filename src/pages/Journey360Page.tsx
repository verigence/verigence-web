import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useLocation, useParams } from 'react-router-dom';

import PageHeader from '../components/PageHeader';
import SectionCard from '../components/SectionCard';
import StatusPill from '../components/StatusPill';
import JourneyReviewedDetails from '../features/uc03/JourneyReviewedDetails';
import { getUc03JourneyOverview, type SkuPricing, type SkuPricingComponent } from '../services/audit-core/uc03JourneySearch';
import { useProjectContextStore } from '../store/projectContextStore';
import { useSessionStore } from '../store/sessionStore';

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
    try { return JSON.stringify(current); } catch { return String(current); }
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

function readable(v: unknown): string {
  if (v === null || v === undefined || v === '') return 'Not available';
  return String(v).replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

function money(v: unknown, currency = 'INR'): string {
  if (v === null || v === undefined || v === '') return '—';
  const n = Number(v);
  if (Number.isNaN(n)) return String(v);
  try {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 2 }).format(n);
  } catch {
    return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(n);
  }
}

function dateLabel(v: unknown): string {
  if (!v) return 'Not available';
  const d = new Date(String(v));
  if (Number.isNaN(d.getTime())) return String(v);
  return new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).format(d);
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

function receiptIsPending(r: Record<string, unknown>): boolean {
  return (
    r.amount === null || r.amount === undefined || r.amount === '' || Number(r.amount) === 0
  ) && String(r.reviewStatus || '').toUpperCase() !== 'VERIFIED';
}

function DeviationCell({ amount, percent, currency = 'INR' }: { amount: number | null; percent: number | null; currency?: string }) {
  if (amount === null) return <td className="journey-360-deviation journey-360-deviation--none">—</td>;
  const sign = amount > 0 ? '+' : '';
  const cls = Math.abs(amount) < 0.01
    ? 'journey-360-deviation journey-360-deviation--ok'
    : amount > 0
    ? 'journey-360-deviation journey-360-deviation--over'
    : 'journey-360-deviation journey-360-deviation--under';
  return (
    <td className={cls}>
      {sign}{new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount)}
      {percent !== null && <small>{sign}{percent.toFixed(1)}%</small>}
    </td>
  );
}

function SkuPriceCheckPanel({ pricing }: { pricing: SkuPricing }) {
  const currency = pricing.currencyCode || 'INR';
  const fmt = (v: number | null) =>
    v === null ? '—' : new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 0 }).format(v);
  const statusCls = pricing.selectionStatus === 'CONFIRMED'
    ? 'journey-360-sku-status journey-360-sku-status--confirmed'
    : 'journey-360-sku-status journey-360-sku-status--tentative';
  const componentLabel = (k: string) =>
    k.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
  const rows = pricing.masterComponents as SkuPricingComponent[];
  const versionShort = pricing.priceListVersionId
    ? `${pricing.priceListVersionId.slice(0, 8)}…`
    : 'unknown';
  return (
    <div className="journey-360-sku-price-check">
      <div className="journey-360-sku-meta">
        <div><span className="journey-360-sku-label">SKU</span><strong>{pricing.skuCode}</strong></div>
        <div>
          <span className="journey-360-sku-label">Product</span>
          <strong>{[pricing.modelName, pricing.variantName, pricing.colourName].filter(Boolean).join(' · ')}</strong>
        </div>
        <div><span className="journey-360-sku-label">Status</span><span className={statusCls}>{pricing.selectionStatus}</span></div>
        <div><span className="journey-360-sku-label">Price List</span><strong>{versionShort}</strong></div>
      </div>
      {rows.length > 0 && (
        <div className="journey-360-table-wrap">
          <table className="journey-360-table journey-360-table--price-check">
            <thead><tr><th>Component</th><th className="journey-360-col-master">Master (Standard)</th><th className="journey-360-col-booking">Booking / Invoice</th><th className="journey-360-col-deviation">Deviation</th></tr></thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.componentKey} className={row.deviationAmount !== null && row.deviationAmount !== 0 ? 'journey-360-row--deviated' : ''}>
                  <td>{componentLabel(row.componentKey)}</td>
                  <td className="journey-360-col-master">{fmt(row.masterAmount)}</td>
                  <td className="journey-360-col-booking">{fmt(row.bookingAmount)}</td>
                  <DeviationCell amount={row.deviationAmount} percent={row.deviationPercent} currency={currency} />
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="journey-360-row--total">
                <td><strong>Total (On-Road)</strong></td>
                <td className="journey-360-col-master"><strong>{fmt(pricing.masterTotalAmount)}</strong></td>
                <td className="journey-360-col-booking"><strong>{fmt(pricing.bookingTotalPrice)}</strong></td>
                <DeviationCell amount={pricing.totalDeviationAmount} percent={pricing.totalDeviationPercent} currency={currency} />
              </tr>
              {pricing.bookingNetAmount !== null && (
                <tr className="journey-360-row--net">
                  <td><strong>Net Amount (after discounts)</strong></td>
                  <td className="journey-360-col-master">—</td>
                  <td className="journey-360-col-booking"><strong>{fmt(pricing.bookingNetAmount)}</strong></td>
                  <td>—</td>
                </tr>
              )}
            </tfoot>
          </table>
        </div>
      )}
      {(pricing.bookingDiscount !== null || pricing.bookingBonus !== null) && (
        <div className="journey-360-sku-deductions">
          {pricing.bookingDiscount !== null && (
            <span><span className="journey-360-sku-label">Discount</span> <strong className="journey-360-sku-deduction">{fmt(pricing.bookingDiscount)}</strong></span>
          )}
          {pricing.bookingBonus !== null && (
            <span><span className="journey-360-sku-label">Bonus</span> <strong className="journey-360-sku-deduction">{fmt(pricing.bookingBonus)}</strong></span>
          )}
        </div>
      )}
      {pricing.selectionStatus === 'TENTATIVE' && (
        <p className="journey-360-sku-note">⚠ SKU is tentative — multiple matching master rows found. Confirm via Audit Review.</p>
      )}
    </div>
  );
}

// ── Accordion document selector ─────────────────────────────────────────────
function DocumentSelector({ documents }: { documents: Array<Record<string, unknown>> }) {
  const [openId, setOpenId] = useState<string | null>(null);
  if (documents.length === 0) return <EmptySection>No active documents are linked to this Journey.</EmptySection>;
  return (
    <div className="journey-360-doc-list">
      {documents.map((doc, idx) => {
        const id = String(doc.documentId || doc.evidenceId || idx);
        const isOpen = openId === id;
        const label = readable(doc.documentTypeKey || doc.requirementKey || doc.originalFilename);
        const stage = readable(doc.processArea || doc.evidencePurpose);
        const status = String(doc.reviewStatus || doc.verificationStatus || doc.processingStatus || 'UNKNOWN');
        return (
          <div key={id} className={`journey-360-doc-row${isOpen ? ' journey-360-doc-row--open' : ''}`}>
            <button
              type="button"
              className="journey-360-doc-trigger"
              onClick={() => setOpenId(isOpen ? null : id)}
              aria-expanded={isOpen}
            >
              <span className="journey-360-document-mark">DOC</span>
              <span className="journey-360-doc-trigger__label">
                <strong>{label}</strong>
                <small>{stage}</small>
              </span>
              <StatusPill value={status} compact />
              <span className="journey-360-doc-trigger__chevron" aria-hidden="true">{isOpen ? '▲' : '▼'}</span>
            </button>
            {isOpen && (
              <div className="journey-360-doc-detail">
                <div className="journey-360-facts journey-360-facts--single">
                  <Fact label="Document Type">{label}</Fact>
                  <Fact label="Stage">{stage}</Fact>
                  <Fact label="Status"><StatusPill value={status} /></Fact>
                  {Boolean(doc.originalFilename) && <Fact label="File">{String(doc.originalFilename)}</Fact>}
                  {Boolean(doc.requirementKey) && <Fact label="Requirement">{readable(doc.requirementKey)}</Fact>}
                  {Boolean(doc.captureStatus) && <Fact label="Capture Status">{readable(doc.captureStatus)}</Fact>}
                  {Boolean(doc.linkedAtUtc) && <Fact label="Linked">{dateLabel(doc.linkedAtUtc)}</Fact>}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function Journey360Page() {
  const { journeyId = '' } = useParams();
  const location = useLocation();
  const queryClient = useQueryClient();
  const accessToken = useSessionStore((state) => state.accessToken);
  const selectedProject = useProjectContextStore((state) => state.selectedProject);
  const tenantId = selectedProject?.tenantId || '';

  const arrivedFromSubmit = (location.state as Record<string, unknown> | null)?.bookingSubmitted === true;
  const [showSubmitBanner, setShowSubmitBanner] = useState(arrivedFromSubmit);
  useEffect(() => {
    if (!arrivedFromSubmit) return undefined;
    const timer = window.setTimeout(() => setShowSubmitBanner(false), SUBMIT_BANNER_DURATION_MS);
    return () => window.clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const invalidatedOnArrival = useRef(false);
  useEffect(() => {
    if (!arrivedFromSubmit || invalidatedOnArrival.current) return;
    invalidatedOnArrival.current = true;
    void queryClient.invalidateQueries({ queryKey: ['uc03-journey-overview', tenantId, journeyId] });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const overviewQuery = useQuery({
    queryKey: ['uc03-journey-overview', tenantId, journeyId],
    queryFn: () => getUc03JourneyOverview(tenantId, journeyId, accessToken),
    enabled: Boolean(accessToken && tenantId && journeyId),
    staleTime: 15_000,
  });

  const model = overviewQuery.data;

  // ── Payment / Receipt split ─────────────────────────────────────────────
  const receiptRows = useMemo(() => (model?.receipts || []).filter((r) => !receiptIsPending(r)), [model?.receipts]);
  const pendingReceiptRows = useMemo(() => (model?.receipts || []).filter(receiptIsPending), [model?.receipts]);
  const invoiceRows = model?.payments || [];
  const receiptTotal = useMemo(() => receiptRows.reduce((s, r) => {
    const a = Number(r.amount ?? 0); return s + (Number.isNaN(a) ? 0 : a);
  }, 0), [receiptRows]);
  const invoiceTotal = useMemo(() => invoiceRows.reduce((s, p) => {
    const a = Number(p.amount ?? 0); return s + (Number.isNaN(a) ? 0 : a);
  }, 0), [invoiceRows]);

  if (overviewQuery.isLoading) return <div className="page-loading">Loading complete Journey…</div>;
  if (overviewQuery.isError || !model) {
    return (
      <div className="screen-stack journey-360-page">
        <PageHeader eyebrow="Journey Search" title="Journey unavailable" description="This Journey was not found in your current authorized Project scope." />
        <Link className="journey-360-back" to="/search">← Back to Journey Search</Link>
      </div>
    );
  }

  const reviewedBooking = objectValue(model.booking, 'reviewedValues');
  const capturedCustomerName = preferredText(reviewedBooking, 'customer_name', model.customer, 'enteredName');
  const customerName = value(model.customer, 'legalName') ? String(value(model.customer, 'legalName')) : capturedCustomerName;
  const bookingReference = textValue(model.booking, 'bookingReference');
  const productLabel = textValue(model.journey, 'productLabel');
  const bookingStatus = value(model.journey, 'bookingStatus');
  const deliveryStatus = value(model.journey, 'deliveryStatus');
  const activeFindings = model.findings.filter((f) => ['OPEN', 'ACKNOWLEDGED'].includes(String(f.findingStatus || '')));
  const reviewedFields = model.reviewedFields || [];

  const resolvedSkuCode = value(model.booking, 'skuCode');
  const skuDisplay = resolvedSkuCode != null && resolvedSkuCode !== ''
    ? String(resolvedSkuCode)
    : model.skuPricing?.skuCode ?? 'Not available';
  const skuSelectionStatus = value(model.booking, 'selectionStatus') as string | null;

  return (
    <div className="screen-stack journey-360-page">
      {showSubmitBanner && (
        <div className="journey-360-submit-banner" role="status" aria-live="polite">
          <span>✔ Booking submitted successfully.</span>
          <button type="button" className="journey-360-banner-dismiss" aria-label="Dismiss" onClick={() => setShowSubmitBanner(false)}>×</button>
        </div>
      )}

      <div className="journey-360-topline">
        <Link className="journey-360-back" to="/search">← Search results</Link>
        <div className="journey-360-actions">
          {/* /details renders Journey360Page directly — no capture-gate redirect */}
          <Link to={`/v2/bookings/${journeyId}/details`}>Open Booking</Link>
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

      {/* ── Summary bar ── */}
      <section className="journey-360-summary" aria-label="Journey summary">
        <div>
          <span>Dealer Booking No.</span>
          <strong>{bookingReference}</strong>
        </div>
        <div>
          <span>Receipts (verified)</span>
          <strong>
            {receiptRows.length}
            {pendingReceiptRows.length > 0 && (
              <span className="journey-360-receipt-pending-badge">{pendingReceiptRows.length} pending</span>
            )}
          </strong>
          <small>{money(receiptTotal)}</small>
        </div>
        <div>
          <span>Payments</span>
          <strong>{invoiceRows.length}</strong>
          <small>{money(invoiceTotal)}</small>
        </div>
        <div>
          <span>Documents</span>
          <strong>{model.evidence.length}</strong>
        </div>
        <div>
          <span>Open Findings</span>
          <strong>{activeFindings.length}</strong>
        </div>
      </section>

      {/* ── Row 1: Customer + Booking ── */}
      <div className="journey-360-grid journey-360-grid--two">
        <SectionCard title="Customer" description="KYC-reviewed identity is the source of truth for customer details.">
          <div className="journey-360-facts">
            <Fact label="Entered Name">{capturedCustomerName}</Fact>
            <Fact label="Legal / KYC Name">{textValue(model.customer, 'legalName')}</Fact>
            <Fact label="PAN">{textValue(model.customer, 'panNumber')}</Fact>
            <Fact label="Aadhaar">{textValue(model.customer, 'aadhaarNumber')}</Fact>
            <Fact label="Date of Birth">{dateLabel(value(model.customer, 'dateOfBirth'))}</Fact>
            <Fact label="Gender">{readable(value(model.customer, 'gender'))}</Fact>
            <Fact label="Mobile">{preferredText(model.customer, 'mobileNumber', reviewedBooking, 'customer_phone')}</Fact>
            <Fact label="Email">{preferredText(model.customer, 'emailReference', reviewedBooking, 'customer_email')}</Fact>
            <Fact label="Address">{preferredText(model.customer, 'address', reviewedBooking, 'customer_address')}</Fact>
            <Fact label="Pincode">{textValue(model.customer, 'pincode')}</Fact>
            <Fact label="State">{textValue(model.customer, 'kycState')}</Fact>
            <Fact label="District">{textValue(model.customer, 'kycDistrict')}</Fact>
            <Fact label="Relationship">{textValue(model.customer, 'relationshipType')}</Fact>
            <Fact label="Relationship Name">{textValue(model.customer, 'relationshipName')}</Fact>
            <Fact label="Customer Type">{readable(value(model.customer, 'customerType'))}</Fact>
            <Fact label="Identity Status">{readable(value(model.customer, 'legalNameStatus'))}</Fact>
          </div>
        </SectionCard>

        <SectionCard title="Booking & Vehicle" description="Resolved product facts — Delivery document values take precedence over Booking where both exist.">
          {model.booking ? (
            <div className="journey-360-facts">
              <Fact label="Dealer Booking No.">{bookingReference}</Fact>
              <Fact label="Booking Date">{dateLabel(value(model.booking, 'bookingDate'))}</Fact>
              <Fact label="Model">{preferredText(model.booking, 'modelName', reviewedBooking, 'vehicle_model')}</Fact>
              <Fact label="Variant">{preferredText(model.booking, 'variantName', reviewedBooking, 'vehicle_variant')}</Fact>
              <Fact label="Colour">{preferredText(model.booking, 'colourName', reviewedBooking, 'vehicle_color')}</Fact>
              <Fact label="SKU">
                {skuDisplay}
                {skuSelectionStatus === 'TENTATIVE' && (
                  <small style={{ display: 'block', fontWeight: 'normal', fontSize: '0.78em', color: '#b45309', marginTop: '2px' }}>Tentative — confirm at Delivery</small>
                )}
              </Fact>
              <Fact label="Sales Consultant">{textValue(reviewedBooking, 'sales_person')}</Fact>
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

      {/* ── Price Check ── */}
      {model.skuPricing && (
        <SectionCard
          title="Price Check — Master vs Booking"
          description={`SKU ${model.skuPricing.skuCode} · ${model.skuPricing.selectionStatus}`}
        >
          <SkuPriceCheckPanel pricing={model.skuPricing} />
        </SectionCard>
      )}

      {/* ── Row 2: Commercials + Receipts / Payments ── */}
      <div className="journey-360-grid journey-360-grid--two">
        <SectionCard title="Commercials & Discounts" description="Booking-reviewed amounts from Booking Form. Commercial lines below reflect the Audit Core final view.">
          {reviewedBooking && Object.keys(reviewedBooking).length > 0 && (
            <div className="journey-360-facts">
              <Fact label="Ex-showroom Price">{money(value(reviewedBooking, 'ex_showroom_price'))}</Fact>
              <Fact label="Insurance">{money(value(reviewedBooking, 'insurance_amount'))}</Fact>
              <Fact label="Registration">{money(value(reviewedBooking, 'registration_charges'))}</Fact>
              <Fact label="Road Tax">{money(value(reviewedBooking, 'road_tax_amount'))}</Fact>
              <Fact label="TCS">{money(value(reviewedBooking, 'tcs_amount'))}</Fact>
              <Fact label="RSA">{money(value(reviewedBooking, 'rsa_amount'))}</Fact>
              <Fact label="Warranty">{money(value(reviewedBooking, 'additional_warranty_amount'))}</Fact>
              <Fact label="Accessories">{money(value(reviewedBooking, 'accessories_cost'))}</Fact>
              <Fact label="Other Charges">{money(value(reviewedBooking, 'other_charges'))}</Fact>
              <Fact label="Discount">{money(value(reviewedBooking, 'discount_amount'))}</Fact>
              <Fact label="Bonus">{money(value(reviewedBooking, 'bonus_amount'))}</Fact>
              <Fact label="Total Price">{money(value(reviewedBooking, 'total_price'))}</Fact>
              <Fact label="Net Amount">{money(value(reviewedBooking, 'net_amount'))}</Fact>
              <Fact label="Booking Amount Paid">{money(value(reviewedBooking, 'booking_amount_paid'))}</Fact>
              <Fact label="Balance Amount">{money(value(reviewedBooking, 'balance_amount'))}</Fact>
            </div>
          )}
          {model.commercialLines.length > 0 && (
            <div className="journey-360-subsection">
              <strong>Audit Core commercial lines</strong>
              <div className="journey-360-table-wrap">
                <table className="journey-360-table">
                  <thead><tr><th>Component</th><th>Standard</th><th>Actual</th></tr></thead>
                  <tbody>
                    {model.commercialLines.map((line) => (
                      <tr key={String(line.commercialLineId)}>
                        <td>{readable(line.componentKey)}</td>
                        <td>{money(line.standardAmount, String(line.currencyCode || 'INR'))}</td>
                        <td>{money(line.actualAmount, String(line.currencyCode || 'INR'))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {model.discounts.length > 0 && (
            <div className="journey-360-subsection">
              <strong>Discounts / Benefits</strong>
              <div className="journey-360-table-wrap">
                <table className="journey-360-table">
                  <thead><tr><th>Discount</th><th>Standard Eligible</th><th>Actual</th></tr></thead>
                  <tbody>
                    {model.discounts.map((d) => (
                      <tr key={String(d.discountApplicationId)}>
                        <td>{readable(d.discountKey)}</td>
                        <td>{money(d.standardEligibleAmount)}</td>
                        <td>{money(d.actualDiscountAmount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {(!reviewedBooking || Object.keys(reviewedBooking).length === 0) && model.commercialLines.length === 0 && (
            <EmptySection>No commercial data available yet. DI review is pending for this booking.</EmptySection>
          )}
        </SectionCard>

        {/* ── Payment Receipts + Invoice Payments stacked ── */}
        <div className="journey-360-payment-split">
          <SectionCard title="Payment Receipts" description="DI-reviewed dealer receipts — amount collected, date, mode and reference.">
            {receiptRows.length > 0 ? (
              <>
                <div className="journey-360-payment-total">
                  <span>Total collected (verified)</span>
                  <strong>{money(receiptTotal)}</strong>
                </div>
                <div className="journey-360-table-wrap">
                  <table className="journey-360-table">
                    <thead><tr><th>Date</th><th>Receipt No.</th><th>Mode</th><th>Amount</th></tr></thead>
                    <tbody>
                      {receiptRows.map((r, i) => (
                        <tr key={String(r.documentId || r.evidenceId || i)}>
                          <td>{dateLabel(r.receiptDate)}</td>
                          <td>{String(r.receiptNumber || r.paymentReference || '—')}</td>
                          <td>{readable(r.paymentMethodCode)}</td>
                          <td>{money(r.amount, String(r.currencyCode || 'INR'))}</td>
                        </tr>
                      ))}
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
            {pendingReceiptRows.length > 0 && (
              <div className="journey-360-subsection">
                <strong>Pending extraction ({pendingReceiptRows.length})</strong>
                <div className="journey-360-table-wrap">
                  <table className="journey-360-table">
                    <thead><tr><th>File</th><th>Stage</th><th>Status</th></tr></thead>
                    <tbody>
                      {pendingReceiptRows.map((r, i) => (
                        <tr key={String(r.documentId || i)} className="journey-360-receipt-pending">
                          <td>{String(r.originalFilename || '—')}</td>
                          <td>{readable(r.stageCode)}</td>
                          <td><span className="journey-360-receipt-pending-status">DI extracting…</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </SectionCard>

          {/* ── Invoice Payments ── */}
          <SectionCard title="Invoice Payments" description="Audit Core payment records — booking advance, balance and final settlement.">
            {invoiceRows.length > 0 ? (
              <>
                <div className="journey-360-payment-total">
                  <span>Total recorded</span>
                  <strong>{money(invoiceTotal)}</strong>
                </div>
                <div className="journey-360-table-wrap">
                  <table className="journey-360-table">
                    <thead><tr><th>Date</th><th>Reference</th><th>Status</th><th>Amount</th></tr></thead>
                    <tbody>
                      {invoiceRows.map((p, i) => (
                        <tr key={String(p.paymentId || i)}>
                          <td>{dateLabel(p.paymentAtUtc)}</td>
                          <td>{String(p.paymentReference || '—')}</td>
                          <td>{readable(p.actualStatusCode)}</td>
                          <td>{money(p.amount, String(p.currencyCode || 'INR'))}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <EmptySection>No invoice payment records have been posted yet.</EmptySection>
            )}
          </SectionCard>
        </div>
      </div>

      {/* ── Row 3: Delivery + Vehicle + Registration ── */}
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

        <SectionCard title="Vehicle Allocation">
          {model.vehicle ? (
            <div className="journey-360-facts journey-360-facts--single">
              <Fact label="VIN">{textValue(model.vehicle, 'vin')}</Fact>
              <Fact label="Chassis No.">{textValue(model.vehicle, 'chassisNumber')}</Fact>
              <Fact label="DMS Reference">{textValue(model.vehicle, 'dmsReference')}</Fact>
              <Fact label="Invoice Reference">{textValue(model.vehicle, 'invoiceReference')}</Fact>
              <Fact label="Allocated">{dateLabel(value(model.vehicle, 'allocatedAtUtc'))}</Fact>
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
            </div>
          ) : <EmptySection>Registration details are not available yet.</EmptySection>}
        </SectionCard>
      </div>

      {/* ── Row 4: Finance + Insurance + Trade-in ── */}
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
            </div>
          ) : <EmptySection>No finance record is available.</EmptySection>}
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
              <Fact label="Handover">{dateLabel(value(model.tradeIn, 'handoverAtUtc'))}</Fact>
              <Fact label="Payment Date">{dateLabel(value(model.tradeIn, 'paymentAtUtc'))}</Fact>
            </div>
          ) : <EmptySection>No trade-in record is available.</EmptySection>}
        </SectionCard>
      </div>

      {/* ── Add-ons ── */}
      {model.addons.length > 0 && (
        <SectionCard title="Add-ons / Warranty / Accessories">
          <div className="journey-360-table-wrap">
            <table className="journey-360-table">
              <thead><tr><th>Type</th><th>Provider</th><th>Reference</th><th>Standard</th><th>Actual</th></tr></thead>
              <tbody>
                {model.addons.map((a, i) => (
                  <tr key={String(a.journeyAddonId || i)}>
                    <td>{readable(a.addonTypeCode)}</td>
                    <td>{String(a.providerName || '—')}</td>
                    <td>{String(a.referenceNumber || '—')}</td>
                    <td>{money(a.standardAmount)}</td>
                    <td>{money(a.actualAmount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}

      {/* ── Reviewed DI fields (full detail) ── */}
      <JourneyReviewedDetails fields={reviewedFields} />

      {/* ── Row 5: Documents (accordion) + Findings ── */}
      <div className="journey-360-grid journey-360-grid--two">
        <SectionCard title="Documents" description="Click a document to expand its details.">
          <DocumentSelector documents={model.evidence} />
        </SectionCard>

        <SectionCard title="Audit Findings" description="Current non-voided findings across Booking and Delivery.">
          {model.findings.length > 0 ? (
            <div className="journey-360-list">
              {model.findings.map((f) => (
                <div className="journey-360-list__row" key={String(f.auditFindingId)}>
                  <span className="journey-360-finding-mark">!</span>
                  <div>
                    <strong>{String(f.title || 'Audit finding')}</strong>
                    <small>{readable(f.stageCode)} · {readable(f.findingStatus)}</small>
                    {Boolean(f.description) && <small style={{ marginTop: '2px', color: '#64748b' }}>{String(f.description)}</small>}
                  </div>
                  <div className="journey-360-list__status"><StatusPill value={String(f.severity || 'INFO')} compact /></div>
                </div>
              ))}
            </div>
          ) : <EmptySection>No active audit findings are recorded for this Journey.</EmptySection>}
        </SectionCard>
      </div>
    </div>
  );
}
