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

// Read a field from a record trying multiple key names in order
function pick(r: Record<string, unknown>, ...keys: string[]): unknown {
  for (const k of keys) {
    const v = r[k];
    if (v !== null && v !== undefined && v !== '') return v;
  }
  return undefined;
}

function pickStr(r: Record<string, unknown>, ...keys: string[]): string {
  const v = pick(r, ...keys);
  return v !== undefined ? String(v) : '';
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

// A receipt is pending if it has no amount AND no receipt number (raw document not yet processed)
function receiptIsPending(r: Record<string, unknown>): boolean {
  const amt = pick(r, 'amount', 'amount_paid', 'amountPaid');
  const ref = pick(r, 'receiptNumber', 'receipt_number', 'paymentReference', 'payment_reference');
  return (
    (amt === null || amt === undefined || amt === '' || Number(amt) === 0) &&
    (ref === null || ref === undefined || ref === '')
  );
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

// ─── Price Check — verdict-first · visual bars · exception-default ────────────

function moneyInt(v: number | null, currency = 'INR'): string {
  if (v === null) return '—';
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 0 }).format(v);
}

function PriceBar({ standard, actual, state }: {
  standard: number; actual: number | null; state: 'ok' | 'over' | 'under' | 'unknown';
}) {
  if (actual === null || standard === 0) {
    return <div className="pc-bar pc-bar--empty"><span className="pc-bar__label-muted">Not yet extracted</span></div>;
  }
  const max = Math.max(standard, actual, 1);
  return (
    <div className="pc-bar">
      <div className="pc-bar__track">
        <div className="pc-bar__std" style={{ width: `${Math.min((standard / max) * 100, 100)}%` }} />
        <div className={`pc-bar__act pc-bar__act--${state}`} style={{ width: `${Math.min((actual / max) * 100, 100)}%` }} />
      </div>
    </div>
  );
}

function PriceCard({ label, standard, actual, deviationAmount, deviationPercent, currency, sourceLabel }: {
  label: string; standard: number; actual: number | null;
  deviationAmount: number | null; deviationPercent: number | null;
  currency: string; sourceLabel?: string;
}) {
  const fmt = (v: number | null) => moneyInt(v, currency);
  const state: 'ok' | 'over' | 'under' | 'unknown' =
    deviationAmount === null ? 'unknown'
    : Math.abs(deviationAmount) < 0.01 ? 'ok'
    : deviationAmount > 0 ? 'over' : 'under';
  const devLabel = state === 'ok' ? '✓ On standard'
    : state === 'unknown' ? null
    : (() => {
        const sign = deviationAmount! > 0 ? '+' : '';
        const pct = deviationPercent !== null ? ` (${sign}${deviationPercent.toFixed(1)}%)` : '';
        return `${sign}${moneyInt(deviationAmount, currency)}${pct}`;
      })();
  return (
    <div className={`pc-card pc-card--${state}`}>
      <div className="pc-card__top">
        <span className="pc-card__name">{label}</span>
        <div className="pc-card__pills">
          {sourceLabel && <span className="pc-card__source">{sourceLabel}</span>}
          {devLabel && <span className={`pc-card__dev pc-card__dev--${state}`}>{devLabel}</span>}
        </div>
      </div>
      <PriceBar standard={standard} actual={actual} state={state} />
      <div className="pc-card__amounts">
        <div><span>Standard</span><strong>{fmt(standard)}</strong></div>
        <div>
          <span>Extracted</span>
          <strong className={state === 'over' ? 'pc-amt--over' : state === 'under' ? 'pc-amt--under' : ''}>
            {fmt(actual)}
          </strong>
        </div>
      </div>
    </div>
  );
}

function SkuPriceCheckPanel({ pricing }: { pricing: SkuPricing }) {
  const [showAll, setShowAll] = useState(false);
  const currency = pricing.currencyCode || 'INR';
  const componentLabel = (k: string) =>
    k.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
  const rows = pricing.masterComponents as SkuPricingComponent[];
  const exceptions  = rows.filter((r) => r.deviationAmount !== null && Math.abs(r.deviationAmount) >= 0.01);
  const clean       = rows.filter((r) => r.deviationAmount !== null && Math.abs(r.deviationAmount) < 0.01);
  const unextracted = rows.filter((r) => r.deviationAmount === null);
  const allClean = rows.length > 0 && exceptions.length === 0 && unextracted.length === 0;

  return (
    <div className="pc-grid">
      {/* SKU strip */}
      <div className="pc-sku-strip">
        <div className="pc-sku-strip__main">
          <span className="pc-sku-strip__code">{pricing.skuCode}</span>
          <span className="pc-sku-strip__product">
            {[pricing.modelName, pricing.variantName, pricing.colourName].filter(Boolean).join(' · ')}
          </span>
        </div>
        <span className={pricing.selectionStatus === 'CONFIRMED'
          ? 'pc-sku-strip__badge pc-sku-strip__badge--ok'
          : 'pc-sku-strip__badge pc-sku-strip__badge--warn'}>
          {pricing.selectionStatus === 'CONFIRMED' ? 'SKU confirmed' : 'SKU tentative'}
        </span>
      </div>

      {/* Verdict banner */}
      {allClean ? (
        <div className="pc-verdict pc-verdict--clean">
          <span className="pc-verdict__icon">✓</span>
          <div>
            <strong>All components match standard</strong>
            <span>Every extracted value is on standard — no exceptions on this deal.</span>
          </div>
        </div>
      ) : exceptions.length > 0 ? (
        <div className={`pc-verdict pc-verdict--${(pricing.totalDeviationAmount ?? 0) > 0 ? 'over' : 'under'}`}>
          <span className="pc-verdict__icon">{(pricing.totalDeviationAmount ?? 0) > 0 ? '↑' : '↓'}</span>
          <div>
            <strong>
              {exceptions.length} component{exceptions.length !== 1 ? 's' : ''} deviate from standard
              {pricing.totalDeviationAmount !== null ? ` · ${(pricing.totalDeviationAmount > 0 ? '+' : '')}${moneyInt(pricing.totalDeviationAmount, currency)} total` : ''}
            </strong>
            <span>Review each flagged line below before signing off this deal.</span>
          </div>
        </div>
      ) : (
        <div className="pc-verdict pc-verdict--pending">
          <span className="pc-verdict__icon">◌</span>
          <div>
            <strong>No values extracted yet</strong>
            <span>Complete the Booking document review to compare against master prices.</span>
          </div>
        </div>
      )}

      {/* Exception cards */}
      {exceptions.length > 0 && (
        <div className="pc-section">
          <div className="pc-section__head">
            <span className="pc-section__title pc-section__title--alert">{exceptions.length} exception{exceptions.length !== 1 ? 's' : ''}</span>
          </div>
          <div className="pc-cards">
            {exceptions.map((row) => (
              <PriceCard key={row.componentKey} label={componentLabel(row.componentKey)}
                standard={row.masterAmount} actual={row.bookingAmount}
                deviationAmount={row.deviationAmount} deviationPercent={row.deviationPercent} currency={currency} />
            ))}
          </div>
        </div>
      )}

      {/* Show all toggle */}
      {rows.length > 0 && (
        <div className="pc-showall-row">
          <button type="button" className="pc-showall-btn" onClick={() => setShowAll((v) => !v)}>
            {showAll ? `▲ Hide standard components` : `▼ Show all ${rows.length} components`}
          </button>
          {!showAll && (
            <span className="pc-showall-hint">
              {clean.length > 0 && `${clean.length} on standard`}
              {clean.length > 0 && unextracted.length > 0 && ' · '}
              {unextracted.length > 0 && `${unextracted.length} not yet extracted`}
            </span>
          )}
        </div>
      )}

      {/* Clean rows (shown when expanded) */}
      {showAll && (clean.length > 0 || unextracted.length > 0) && (
        <div className="pc-section pc-section--clean">
          <div className="pc-clean-list">
            {[...clean, ...unextracted].map((row) => (
              <div key={row.componentKey} className="pc-clean-row">
                <span className="pc-clean-row__name">{componentLabel(row.componentKey)}</span>
                <span className="pc-clean-row__ok">{row.deviationAmount !== null ? '✓' : '◌'}</span>
                <span className="pc-clean-row__amount">{moneyInt(row.masterAmount, currency)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Net summary footer */}
      <div className="pc-net-bar">
        <div className="pc-net-bar__cell pc-net-bar__cell--std">
          <span>On-Road Standard</span>
          <strong>{moneyInt(pricing.masterTotalAmount, currency)}</strong>
        </div>
        {pricing.bookingTotalPrice !== null && (
          <div className="pc-net-bar__cell">
            <span>Booking Total</span>
            <strong>{moneyInt(pricing.bookingTotalPrice, currency)}</strong>
          </div>
        )}
        {(pricing.bookingDiscount !== null || pricing.bookingBonus !== null) && (
          <div className="pc-net-bar__cell pc-net-bar__cell--deduction">
            <span>Discount / Bonus</span>
            <strong>{[pricing.bookingDiscount, pricing.bookingBonus].filter((v) => v !== null).map((v) => moneyInt(v, currency)).join(' + ')}</strong>
          </div>
        )}
        {pricing.bookingNetAmount !== null && (
          <div className="pc-net-bar__cell pc-net-bar__cell--net">
            <span>Net Payable</span>
            <strong>{moneyInt(pricing.bookingNetAmount, currency)}</strong>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Receipt Accordion ────────────────────────────────────────────────────────
// One row per receipt: Receipt No · Date · Mode · Amount → expand for full detail.
// Handles both camelCase and snake_case field names returned by the API.

function ReceiptAccordion({
  receipts,
  pendingReceipts,
  reviewedBooking,
}: {
  receipts: Array<Record<string, unknown>>;
  pendingReceipts: Array<Record<string, unknown>>;
  reviewedBooking: Record<string, unknown> | null;
}) {
  const [openId, setOpenId] = useState<string | null>(null);

  const total = receipts.reduce((s, r) => {
    const a = Number(pick(r, 'amount', 'amount_paid', 'amountPaid') ?? 0);
    return s + (Number.isNaN(a) ? 0 : a);
  }, 0);

  if (receipts.length === 0 && pendingReceipts.length === 0) {
    return (
      <div>
        {reviewedBooking && Object.keys(reviewedBooking).length > 0 ? (
          <div className="journey-360-facts journey-360-facts--single">
            <Fact label="Amount Paid">{money(value(reviewedBooking, 'booking_amount_paid'))}</Fact>
            <Fact label="Payment Mode">{readable(value(reviewedBooking, 'mode_of_payment'))}</Fact>
            <Fact label="Payment Reference">{textValue(reviewedBooking, 'payment_reference_no')}</Fact>
            <Fact label="Payment Date">{dateLabel(value(reviewedBooking, 'payment_date') || value(reviewedBooking, 'booking_date'))}</Fact>
            <Fact label="Bank / Instrument">{textValue(reviewedBooking, 'bank_name')}</Fact>
            <Fact label="Balance Amount">{money(value(reviewedBooking, 'balance_amount'))}</Fact>
          </div>
        ) : (
          <EmptySection>No payment receipts have been extracted yet.</EmptySection>
        )}
      </div>
    );
  }

  return (
    <div>
      {receipts.length > 0 && (
        <div className="rcpt-total">
          <span>Total collected (verified)</span>
          <strong>{money(total)}</strong>
        </div>
      )}

      <div className="rcpt-list">
        {receipts.map((r, idx) => {
          const id = String(pick(r, 'receiptId', 'documentId', 'evidenceId') ?? idx);
          const isOpen = openId === id;

          // Field reading — API may return camelCase or snake_case
          const receiptNo   = pickStr(r, 'receiptNumber', 'receipt_number', 'paymentReference', 'payment_reference') || '—';
          const receiptDate = dateLabel(pick(r, 'receiptDate', 'receipt_date', 'paymentReferenceDate', 'payment_reference_date'));
          const mode        = (pickStr(r, 'paymentMode', 'payment_mode', 'paymentMethodCode', 'payment_method_code') || '—').toUpperCase();
          const amountRaw   = pick(r, 'amount', 'amount_paid', 'amountPaid');
          const amountStr   = money(amountRaw, String(pick(r, 'currencyCode', 'currency_code') || 'INR'));
          const viewUrl     = pickStr(r, 'contentUrl', 'content_url', 'documentUrl', 'document_url');

          const amountInWords     = pickStr(r, 'amountInWords', 'amount_in_words');
          const bankName          = pickStr(r, 'bankName', 'bank_name');
          const bankLocation      = pickStr(r, 'bankLocation', 'bank_location');
          const dealerGstin       = pickStr(r, 'dealerGstin', 'dealer_gstin');
          const remarks           = pickStr(r, 'remarks', 'remark', 'notes');
          const bookingPaymentRef = pickStr(r, 'bookingPaymentReference', 'bookingReference', 'booking_payment_reference');
          const paymentRefDate    = dateLabel(pick(r, 'paymentReferenceDate', 'payment_reference_date'));
          const customerOnReceipt = pickStr(r, 'customerName', 'customer_name');
          const reviewStatus      = pickStr(r, 'reviewStatus', 'review_status', 'verificationStatus', 'verification_status') || 'VERIFIED';

          return (
            <div key={id} className={`rcpt-row${isOpen ? ' rcpt-row--open' : ''}`}>
              <button
                type="button"
                className="rcpt-trigger"
                onClick={() => setOpenId(isOpen ? null : id)}
                aria-expanded={isOpen}
              >
                <span className="rcpt-trigger__mark">REC</span>
                <div className="rcpt-trigger__body">
                  <div className="rcpt-trigger__primary">
                    <span className="rcpt-trigger__ref">{receiptNo}</span>
                    <span className="rcpt-trigger__sep">·</span>
                    <span className="rcpt-trigger__date">{receiptDate}</span>
                    <span className="rcpt-trigger__sep">·</span>
                    <span className="rcpt-trigger__mode">{mode}</span>
                  </div>
                  {amountInWords && (
                    <span className="rcpt-trigger__words">{amountInWords}</span>
                  )}
                </div>
                <div className="rcpt-trigger__right">
                  <strong className="rcpt-trigger__amount">{amountStr}</strong>
                  <StatusPill value={reviewStatus} compact />
                </div>
                <span className="rcpt-trigger__chevron" aria-hidden="true">{isOpen ? '▲' : '▼'}</span>
              </button>

              {isOpen && (
                <div className="rcpt-detail">
                  <div className="journey-360-facts">
                    <Fact label="Receipt Number">{receiptNo}</Fact>
                    <Fact label="Receipt Date">{receiptDate}</Fact>
                    {paymentRefDate && paymentRefDate !== receiptDate && (
                      <Fact label="Payment Ref. Date">{paymentRefDate}</Fact>
                    )}
                    <Fact label="Payment Mode">{mode}</Fact>
                    <Fact label="Amount">{amountStr}</Fact>
                    {amountInWords && <Fact label="Amount in Words">{amountInWords}</Fact>}
                    {bankName && <Fact label="Bank">{bankName}{bankLocation ? ` · ${bankLocation}` : ''}</Fact>}
                    {dealerGstin && <Fact label="Dealer GSTIN">{dealerGstin}</Fact>}
                    {customerOnReceipt && <Fact label="Customer on Receipt">{customerOnReceipt}</Fact>}
                    {bookingPaymentRef && <Fact label="Booking Ref.">{bookingPaymentRef}</Fact>}
                    {remarks && <Fact label="Remarks">{remarks}</Fact>}
                  </div>
                  {viewUrl && (
                    <div className="journey-360-doc-view-row">
                      <a href={viewUrl} target="_blank" rel="noopener noreferrer" className="journey-360-doc-view-btn">
                        View receipt document ↗
                      </a>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {pendingReceipts.map((r, idx) => (
          <div key={String(pick(r, 'documentId', 'evidenceId') ?? `pending-${idx}`)} className="rcpt-row rcpt-row--pending">
            <div className="rcpt-trigger rcpt-trigger--pending">
              <span className="rcpt-trigger__mark rcpt-trigger__mark--pending">REC</span>
              <div className="rcpt-trigger__body">
                <div className="rcpt-trigger__primary">
                  <span className="rcpt-trigger__ref">{String(pick(r, 'originalFilename', 'original_filename') ?? 'Receipt document')}</span>
                </div>
                <span className="rcpt-trigger__words">DI extraction in progress</span>
              </div>
              <div className="rcpt-trigger__right">
                <span className="rcpt-pending-badge">Pending</span>
              </div>
            </div>
          </div>
        ))}
      </div>
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
        const viewUrl = doc.contentUrl ? String(doc.contentUrl) : null;
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
                {viewUrl && (
                  <div className="journey-360-doc-view-row">
                    <a href={viewUrl} target="_blank" rel="noopener noreferrer" className="journey-360-doc-view-btn">
                      View document ↗
                    </a>
                  </div>
                )}
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

  // ── Receipt / Payment split ─────────────────────────────────────────────
  const receiptRows = useMemo(() => (model?.receipts || []).filter((r) => !receiptIsPending(r)), [model?.receipts]);
  const pendingReceiptRows = useMemo(() => (model?.receipts || []).filter(receiptIsPending), [model?.receipts]);
  const invoiceRows = model?.payments || [];
  const receiptTotal = useMemo(() => receiptRows.reduce((s, r) => {
    const a = Number(pick(r, 'amount', 'amount_paid', 'amountPaid') ?? 0);
    return s + (Number.isNaN(a) ? 0 : a);
  }, 0), [receiptRows]);
  const invoiceTotal = useMemo(() => invoiceRows.reduce((s, p) => {
    const a = Number(pick(p, 'amount', 'amount_paid', 'amountPaid') ?? 0);
    return s + (Number.isNaN(a) ? 0 : a);
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
  const resolvedValues  = model.resolvedReviewedValues || {};

  const capturedCustomerName = preferredText(reviewedBooking, 'customer_name', model.customer, 'enteredName');
  const customerName = value(model.customer, 'legalName') ? String(value(model.customer, 'legalName')) : capturedCustomerName;
  const bookingReference = textValue(model.booking, 'bookingReference');
  const productLabel = textValue(model.journey, 'productLabel');
  const bookingStatus = value(model.journey, 'bookingStatus');
  const deliveryStatus = value(model.journey, 'deliveryStatus');
  const activeFindings = model.findings.filter((f) => ['OPEN', 'ACKNOWLEDGED'].includes(String(f.findingStatus || '')));
  const reviewedFields = model.reviewedFields || [];

  // ── SKU resolution ──────────────────────────────────────────────────────
  // Priority: booking.skuCode → resolvedReviewedValues (various keys) → skuPricing
  const resolvedSkuCode = value(model.booking, 'skuCode');
  const resolvedSkuFromValues =
    resolvedValues['vehicle_sku_code']?.value ||
    resolvedValues['sku_code']?.value ||
    resolvedValues['booking_sku_code']?.value ||
    resolvedValues['product_sku']?.value ||
    null;
  const skuDisplay = (
    resolvedSkuCode != null && resolvedSkuCode !== ''
      ? String(resolvedSkuCode)
      : resolvedSkuFromValues != null
      ? String(resolvedSkuFromValues)
      : model.skuPricing?.skuCode ?? 'Not available'
  );
  const skuSelectionStatus = value(model.booking, 'selectionStatus') as string | null;

  // ── Dealer branch resolution ────────────────────────────────────────────
  // Priority: reviewedBooking.dealer_branch → resolvedReviewedValues → journey.outletCode → outletName
  const dealerBranchFromBooking = value(reviewedBooking, 'dealer_branch') ||
    value(reviewedBooking, 'branch_name') ||
    value(reviewedBooking, 'outlet_code');
  const dealerBranchFromResolved =
    resolvedValues['dealer_branch']?.value ||
    resolvedValues['dealer_outlet_code']?.value ||
    resolvedValues['branch_code']?.value ||
    null;
  const dealerBranchRaw =
    dealerBranchFromBooking ||
    dealerBranchFromResolved ||
    value(model.journey, 'outletCode') ||
    null;
  const dealerBranch = dealerBranchRaw ? String(dealerBranchRaw) : textValue(model.journey, 'outletName');

  // ── Expected delivery resolution ────────────────────────────────────────
  const expectedDeliveryRaw =
    value(reviewedBooking, 'expected_delivery_date') ||
    value(reviewedBooking, 'expected_delivery') ||
    resolvedValues['expected_delivery_date']?.value ||
    resolvedValues['delivery_date']?.value ||
    null;
  const expectedDelivery = dateLabel(expectedDeliveryRaw);

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
          {/* Show branch only when it differs from what's already in the header */}
          {dealerBranch !== textValue(model.journey, 'outletName') && dealerBranch !== 'Not available' && (
            <small>{dealerBranch}</small>
          )}
        </div>
        <div>
          <span>SKU</span>
          <strong>{skuDisplay}</strong>
          {skuSelectionStatus === 'TENTATIVE' && (
            <small style={{ color: '#b45309' }}>Tentative</small>
          )}
        </div>
        <div>
          <span>Expected Delivery</span>
          <strong>{expectedDelivery}</strong>
        </div>
        <div>
          <span>Receipts collected</span>
          <strong>
            {receiptRows.length > 0 ? receiptRows.length : (model.receipts?.length ?? 0)}
            {pendingReceiptRows.length > 0 && (
              <span className="journey-360-receipt-pending-badge">{pendingReceiptRows.length} pending</span>
            )}
          </strong>
          <small>{receiptTotal > 0 ? money(receiptTotal) : invoiceTotal > 0 ? money(invoiceTotal) : '—'}</small>
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
              <Fact label="Dealer Branch">{dealerBranch}</Fact>
              <Fact label="Deal Type">{preferredText(model.booking, 'dealType', reviewedBooking, 'deal_type')}</Fact>
              <Fact label="Deal Source">{readable(value(model.booking, 'dealSource'))}</Fact>
              <Fact label="Lead Source">{readable(value(model.booking, 'leadSource'))}</Fact>
              <Fact label="Expected Delivery">{expectedDelivery}</Fact>
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
          description={`SKU ${model.skuPricing.skuCode} · ${model.skuPricing.selectionStatus} · Standard on-road vs extracted booking values`}
        >
          <SkuPriceCheckPanel pricing={model.skuPricing} />
        </SectionCard>
      )}

      {/* ── Row 2: Commercials + Payments ── */}
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

        <div className="journey-360-payment-split">
          <SectionCard
            title="Payment Receipts"
            description="DI-reviewed dealer receipts — click any row to see full receipt detail and document."
          >
            <ReceiptAccordion
              receipts={receiptRows}
              pendingReceipts={pendingReceiptRows}
              reviewedBooking={reviewedBooking}
            />
          </SectionCard>

          {invoiceRows.length > 0 && (
            <SectionCard title="Invoice Payments" description="Audit Core payment ledger — advance, balance and final settlement entries.">
              <div className="journey-360-payment-total">
                <span>Total recorded</span>
                <strong>{money(invoiceTotal)}</strong>
              </div>
              <div className="journey-360-table-wrap">
                <table className="journey-360-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Reference</th>
                      <th>Mode</th>
                      <th>Status</th>
                      <th>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoiceRows.map((p, i) => (
                      <tr key={String(p.paymentId || i)}>
                        <td>{dateLabel(pick(p, 'paymentAtUtc', 'payment_at_utc', 'paymentDate', 'payment_date', 'receiptDate', 'receipt_date', 'paymentReferenceDate', 'payment_reference_date'))}</td>
                        <td>{String(pick(p, 'paymentReference', 'payment_reference', 'referenceNumber', 'reference_number', 'receiptNumber', 'receipt_number') || '—')}</td>
                        <td>{readable(pick(p, 'paymentMethodCode', 'payment_method_code', 'paymentMode', 'payment_mode'))}</td>
                        <td>{readable(pick(p, 'actualStatusCode', 'actual_status_code', 'status', 'paymentStatus', 'payment_status', 'reviewStatus', 'review_status'))}</td>
                        <td>{money(pick(p, 'amount', 'amount_paid', 'amountPaid'), String(pick(p, 'currencyCode', 'currency_code') || 'INR'))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </SectionCard>
          )}
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
        <SectionCard title="Documents" description="Click a document to expand its details. Use the View button to open the original file.">
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
