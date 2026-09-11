import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';

import PageHeader from '../components/PageHeader';
import StatusPill from '../components/StatusPill';
import {
  deriveAspects,
  deriveSteps,
  findingAspect,
  openFindings,
  type AspectKey,
  type AspectMeta,
  type JourneyStep,
} from '../features/uc03/journey/deriveJourneyLine';
import { resyncBookingCaptureV2 } from '../services/audit-core/uc03DocumentCaptureV2';
import { resyncDeliveryCaptureV2 } from '../services/audit-core/uc03DeliveryCaptureV2';
import {
  getUc03JourneyOverview,
  type JourneyOverview,
  type JourneyReviewedField,
  type SkuPricing,
  type SkuPricingComponent,
} from '../services/audit-core/uc03JourneySearch';
import { useProjectContextStore } from '../store/projectContextStore';
import { useSessionStore } from '../store/sessionStore';

const SUBMIT_BANNER_DURATION_MS = 6_000;

// Same three finding_class values and labels as ReviewQueuePage's
// CLASS_LABEL -- kept in sync deliberately so a finding reads the same way
// whether it's seen here or in the Review Queue.
const FINDING_CLASS_LABEL: Record<string, string> = {
  DATA_GAP: 'Missing data',
  DOCUMENT_GAP: 'Missing document',
  VIOLATION: 'Violation',
};

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
  return String(v).replaceAll('_', ' ').replaceAll('-', ' ').replace(/\s+/g, ' ').trim()
    .toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
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

function formatFieldValue(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (typeof v === 'object') {
    try { return JSON.stringify(v); } catch { return String(v); }
  }
  return String(v);
}

function documentId(doc: Record<string, unknown>, idx: number): string {
  return String(doc.documentId || doc.evidenceId || idx);
}

// ── Document dropdown: pick one document, see its own file + its own
// extracted values only. Replaces a prior design that rendered every
// document's every reviewed field, in every business category, all at
// once, regardless of which (if any) document was open -- selecting one
// document here now actually scopes what's shown to that document. ───────
function DocumentSelector({
  documents,
  reviewedFields,
}: {
  documents: Array<Record<string, unknown>>;
  reviewedFields: JourneyReviewedField[];
}) {
  const [selectedId, setSelectedId] = useState<string | null>(
    documents.length > 0 ? documentId(documents[0], 0) : null,
  );
  if (documents.length === 0) return <EmptySection>No active documents are linked to this Journey.</EmptySection>;

  const selectedIndex = documents.findIndex((doc, idx) => documentId(doc, idx) === selectedId);
  const selected = selectedIndex >= 0 ? documents[selectedIndex] : documents[0];
  const selectedKey = documentId(selected, selectedIndex >= 0 ? selectedIndex : 0);

  const label = readable(selected.documentTypeKey || selected.requirementKey || selected.originalFilename);
  const stage = readable(selected.processArea || selected.evidencePurpose);
  const status = String(selected.reviewStatus || selected.verificationStatus || selected.processingStatus || 'UNKNOWN');
  const viewUrl = selected.contentUrl ? String(selected.contentUrl) : null;

  // Only this document's own extracted values -- not the whole journey's.
  const fields = reviewedFields
    .filter((field) => field.documentId === selectedKey)
    .sort((a, b) => a.semanticKey.localeCompare(b.semanticKey));

  return (
    <div className="journey-360-doc-picker">
      <label className="journey-360-doc-picker__label" htmlFor="journey-360-doc-select">
        Select a document ({documents.length} on this Journey)
      </label>
      <select
        id="journey-360-doc-select"
        className="journey-360-doc-picker__select"
        value={selectedKey}
        onChange={(event) => setSelectedId(event.target.value)}
      >
        {documents.map((doc, idx) => {
          const id = documentId(doc, idx);
          const optLabel = readable(doc.documentTypeKey || doc.requirementKey || doc.originalFilename);
          const filename = doc.originalFilename ? ` — ${String(doc.originalFilename)}` : '';
          return <option key={id} value={id}>{optLabel}{filename}</option>;
        })}
      </select>

      <div className="journey-360-doc-detail">
        <div className="journey-360-facts journey-360-facts--single">
          <Fact label="Document Type">{label}</Fact>
          <Fact label="Stage">{stage}</Fact>
          <Fact label="Status"><StatusPill value={status} /></Fact>
          {Boolean(selected.originalFilename) && <Fact label="File">{String(selected.originalFilename)}</Fact>}
          {Boolean(selected.requirementKey) && <Fact label="Requirement">{readable(selected.requirementKey)}</Fact>}
          {Boolean(selected.captureStatus) && <Fact label="Capture Status">{readable(selected.captureStatus)}</Fact>}
          {Boolean(selected.linkedAtUtc) && <Fact label="Linked">{dateLabel(selected.linkedAtUtc)}</Fact>}
        </div>
        {viewUrl && (
          <div className="journey-360-doc-view-row">
            <a href={viewUrl} target="_blank" rel="noopener noreferrer" className="journey-360-doc-view-btn">
              View document ↗
            </a>
          </div>
        )}
        {fields.length > 0 ? (
          <div className="journey-360-table-wrap">
            <table className="journey-360-table">
              <thead>
                <tr><th>Attribute</th><th>Extracted value</th><th>Confidence</th></tr>
              </thead>
              <tbody>
                {fields.map((field) => (
                  <tr key={field.reviewedFieldId}>
                    <td><strong>{readable(field.semanticKey)}</strong></td>
                    <td>{formatFieldValue(field.displayValue)}</td>
                    <td>
                      {field.confidenceScore !== null && field.confidenceScore !== undefined
                        ? `${field.confidenceScore}${field.confidenceScale ? ` ${field.confidenceScale}` : ''}`
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="jline__empty">No extracted values retained for this document.</p>
        )}
      </div>
    </div>
  );
}

// ── The Journey Line building blocks ────────────────────────────────────────

function HealthStrip({
  needCount,
  totalOpen,
  onJump,
}: {
  needCount: number;
  totalOpen: number;
  onJump: () => void;
}) {
  const clean = totalOpen === 0;
  return (
    <div className={`jline__strip ${clean ? 'jline__strip--ok' : 'jline__strip--attention'}`} role="status">
      <span className="jline__stripText">
        {clean ? 'No open audit findings on this journey.' : `${needCount} of ${totalOpen} finding${totalOpen !== 1 ? 's' : ''} need you`}
        <small>{clean ? 'Every checked aspect is on standard.' : 'Data and document gaps are yours to fix; violations route to your TL.'}</small>
      </span>
      {!clean && (
        <button type="button" className="jline__stripJump" onClick={onJump}>
          Go to Flags →
        </button>
      )}
    </div>
  );
}

function JourneyLine({ steps }: { steps: JourneyStep[] }) {
  return (
    <div className="jline__lineWrap">
      <div className="jline__phases">
        <span className="jline__phaseCap jline__phaseCap--booking">Booking</span>
        <span className="jline__phaseCap jline__phaseCap--delivery">Delivery</span>
        {steps.map((step) => (
          <div key={step.key} className={`jline__step jline__step--${step.state}`}>
            <span className="jline__dot" aria-hidden="true">
              {step.state === 'done' ? '✓' : ''}
            </span>
            <span className="jline__stepLabel">{step.label}</span>
            {step.at && <span className="jline__stepAt">{dateLabel(step.at)}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

function AspectChips({
  aspects,
  active,
  onSelect,
}: {
  aspects: AspectMeta[];
  active: AspectKey;
  onSelect: (key: AspectKey) => void;
}) {
  return (
    <div className="jline__chips" role="tablist" aria-label="Journey aspects">
      {aspects.map((a) => (
        <button
          key={a.key}
          type="button"
          role="tab"
          aria-selected={active === a.key}
          className={`jline__chip${active === a.key ? ' jline__chip--active' : ''}`}
          onClick={() => onSelect(a.key)}
          title={a.hint}
        >
          <span className={`jline__chipDot jline__chipDot--${a.status}`} aria-hidden="true" />
          {a.label}
          {a.badge !== null && <span className="jline__chipBadge">{a.badge}</span>}
        </button>
      ))}
    </div>
  );
}

function PanelHead({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="jline__panelHead">
      <span className="jline__panelTitle">{title}</span>
      {hint && <span className="jline__panelHint">{hint}</span>}
    </div>
  );
}

/** A named group WITHIN one panel -- e.g. "Invoices" and "Payments /
 * Receipts" both live under the Payments received panel, but previously
 * ran straight into each other with no label of their own, reading as one
 * undifferentiated block of tables. Smaller and quieter than PanelHead
 * (which names the panel itself), so the hierarchy stays legible: panel,
 * then its named groups. */
function SubSection({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="jline__subSection">
      <div className="jline__subHead">
        <span className="jline__subTitle">{title}</span>
        {hint && <span className="jline__subHint">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function FactList({ children }: { children: React.ReactNode }) {
  return <div className="jline__facts">{children}</div>;
}

function JFact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="jline__fact">
      <span>{label}</span>
      <strong>{children}</strong>
    </div>
  );
}

// Accessories/Extended Warranty line items live inside each invoice's raw
// lineItems array (invoice_review_values.line_items, passed through
// verbatim from DI's snake_case line_category/description_raw/net_amount --
// unlike the rest of this response, that array is never re-cased).
function invoiceLineItems(model: JourneyOverview, categories: string[]): Array<Record<string, unknown>> {
  const invoices = Array.isArray(model.invoices) ? model.invoices : [];
  const items: Array<Record<string, unknown>> = [];
  for (const invoice of invoices) {
    const raw = (invoice as Record<string, unknown> | null)?.lineItems;
    if (!Array.isArray(raw)) continue;
    for (const entry of raw) {
      if (!entry || typeof entry !== 'object') continue;
      const item = entry as Record<string, unknown>;
      const category = String(item.line_category || '').toUpperCase();
      if (categories.includes(category)) items.push(item);
    }
  }
  return items;
}

function addonByCode(model: JourneyOverview, code: string): Record<string, unknown> | null {
  const addons = Array.isArray(model.addons) ? model.addons : [];
  const match = addons.find((a) => String(value(a, 'addonTypeCode') || '').toUpperCase() === code);
  return match ?? null;
}

function lineItemLabel(item: Record<string, unknown>): string {
  const description = item.description_raw;
  if (typeof description === 'string' && description.trim()) return description.trim();
  const code = item.item_code;
  if (typeof code === 'string' && code.trim()) return code.trim();
  return 'Line item';
}

function lineItemAmount(item: Record<string, unknown>): unknown {
  return item.net_amount ?? item.gross_amount ?? item.taxable_amount ?? null;
}

function nonEmptyText(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

/** One "Taken / Not taken" row, styled as the checkbox/slider the user asked
 * for -- read-only here since Journey 360 is a TL/PM display, not a capture
 * screen; the underlying state (accessoriesTaken/extendedWarrantyTaken) is
 * itself already derived from the commercial amount, never a separate
 * declared flag (see uc03_delivery_documents._resolve_condition). */
function TakenToggleRow({
  label,
  taken,
  amount,
  provider,
}: {
  label: string;
  taken: boolean;
  amount: unknown;
  provider: string | null;
}) {
  return (
    <div className="jline__toggleRow">
      <div className="jline__toggleLabel">
        <strong>{label}</strong>
        <small>
          {taken
            ? `Taken${amount !== null && amount !== undefined ? ` · ${money(amount)}` : ''}${provider ? ` · ${provider}` : ''}`
            : 'Not taken on this deal'}
        </small>
      </div>
      <span
        className={`jline__toggleSwitch${taken ? ' jline__toggleSwitch--on' : ''}`}
        role="img"
        aria-label={`${label}: ${taken ? 'taken' : 'not taken'}`}
      />
    </div>
  );
}

function ItemList({ title, items }: { title: string; items: Array<Record<string, unknown>> }) {
  if (items.length === 0) return null;
  return (
    <div className="jline__itemList">
      <span className="jline__itemListTitle">{title}</span>
      {items.map((item, index) => (
        <div className="jline__itemRow" key={index}>
          <span>{lineItemLabel(item)}</span>
          <strong>{money(lineItemAmount(item))}</strong>
        </div>
      ))}
    </div>
  );
}

function commercialLineByComponentKey(model: JourneyOverview, componentKey: string): Record<string, unknown> | null {
  const lines = Array.isArray(model.commercialLines) ? model.commercialLines : [];
  const match = lines.find((line) => String(value(line, 'componentKey') || '').toLowerCase() === componentKey);
  return match ?? null;
}

/** Accessories/Extended Warranty/Insurance confirmation + itemized
 * breakdown, shown under the Vehicle tab per the explicit ask: "get the
 * list of Accessories bought ... same if there is extended warranty ...
 * and on top ... a checkbox or slider which confirms whether this vehicle
 * has EW and Accessories taken up or not." Insurance is a commercial line
 * (commercial_lines.component_key='insurance_amount'), not a journey_addon
 * like the other two -- reconciliation never routes it through addons --
 * so it reads from a different part of the model and has no providerName
 * to show, but the same taken/not-taken + itemized shape still applies. */
function AccessoriesWarrantyPanel({ model }: { model: JourneyOverview }) {
  const accessoriesAddon = addonByCode(model, 'ACCESSORIES_TOTAL');
  const warrantyAddon = addonByCode(model, 'ADDITIONAL_WARRANTY');
  const insuranceLine = commercialLineByComponentKey(model, 'insurance_amount');
  const accessoriesAmount = accessoriesAddon ? value(accessoriesAddon, 'actualAmount') : null;
  const warrantyAmount = warrantyAddon ? value(warrantyAddon, 'actualAmount') : null;
  const insuranceAmount = insuranceLine ? value(insuranceLine, 'actualAmount') : null;
  const accessoriesTaken = Number(accessoriesAmount) > 0;
  const warrantyTaken = Number(warrantyAmount) > 0;
  const insuranceTaken = Number(insuranceAmount) > 0;

  const accessoryItems = invoiceLineItems(model, ['ACCESSORY_GENUINE', 'ACCESSORY_NON_GENUINE']);
  const warrantyItems = invoiceLineItems(model, ['EXTENDED_WARRANTY']);
  const insuranceItems = invoiceLineItems(model, ['INSURANCE']);

  return (
    <div className="jline__accessoriesPanel">
      <div className="jline__toggles">
        <TakenToggleRow
          label="Accessories"
          taken={accessoriesTaken}
          amount={accessoriesAmount}
          provider={accessoriesAddon ? nonEmptyText(value(accessoriesAddon, 'providerName')) : null}
        />
        <TakenToggleRow
          label="Extended Warranty"
          taken={warrantyTaken}
          amount={warrantyAmount}
          provider={warrantyAddon ? nonEmptyText(value(warrantyAddon, 'providerName')) : null}
        />
        <TakenToggleRow
          label="Insurance"
          taken={insuranceTaken}
          amount={insuranceAmount}
          provider={null}
        />
      </div>
      {accessoriesTaken && <ItemList title="Accessories bought" items={accessoryItems} />}
      {warrantyTaken && <ItemList title="Extended Warranty" items={warrantyItems} />}
      {insuranceTaken && <ItemList title="Insurance" items={insuranceItems} />}
    </div>
  );
}

function bankMatchPill(match: Record<string, unknown> | null): React.ReactNode {
  if (!match) return null;
  const status = String(match.status || '').toUpperCase();
  const label =
    status === 'MATCHED' ? `Bank matched${match.method ? ` · ${readable(match.method)}` : ''}`
    : status === 'UNMATCHED' ? 'No bank credit'
    : status === 'AMBIGUOUS' ? 'Multiple bank credits'
    : status === 'NOT_APPLICABLE' ? 'Cash — no bank match' : status;
  return <span className={`jline__bank jline__bank--${status.toLowerCase()}`}>{label}</span>;
}

// ── Focus panels ───────────────────────────────────────────────────────────

function BookingCommercialFacts({ reviewedBooking }: { reviewedBooking: Record<string, unknown> | null }) {
  if (!reviewedBooking || Object.keys(reviewedBooking).length === 0) return null;
  return (
    <FactList>
      <JFact label="Ex-showroom Price">{money(value(reviewedBooking, 'ex_showroom_price'))}</JFact>
      <JFact label="Insurance">{money(value(reviewedBooking, 'insurance_amount'))}</JFact>
      <JFact label="Registration">{money(value(reviewedBooking, 'registration_charges'))}</JFact>
      <JFact label="Road Tax">{money(value(reviewedBooking, 'road_tax_amount'))}</JFact>
      <JFact label="TCS">{money(value(reviewedBooking, 'tcs_amount'))}</JFact>
      <JFact label="RSA">{money(value(reviewedBooking, 'rsa_amount'))}</JFact>
      <JFact label="Extended Warranty">{money(value(reviewedBooking, 'additional_warranty_amount'))}</JFact>
      <JFact label="Accessories">{money(value(reviewedBooking, 'accessories_cost'))}</JFact>
      <JFact label="Other Charges">{money(value(reviewedBooking, 'other_charges'))}</JFact>
      <JFact label="Discount">{money(value(reviewedBooking, 'discount_amount'))}</JFact>
      <JFact label="Bonus">{money(value(reviewedBooking, 'bonus_amount'))}</JFact>
      <JFact label="Total Price">{money(value(reviewedBooking, 'total_price'))}</JFact>
      <JFact label="Net Amount">{money(value(reviewedBooking, 'net_amount'))}</JFact>
      <JFact label="Booking Amount Paid">{money(value(reviewedBooking, 'booking_amount_paid'))}</JFact>
      <JFact label="Balance Amount">{money(value(reviewedBooking, 'balance_amount'))}</JFact>
    </FactList>
  );
}

function DealPanel({
  model,
  reviewedBooking,
  modelNotIdentified,
}: {
  model: JourneyOverview;
  reviewedBooking: Record<string, unknown> | null;
  modelNotIdentified: Record<string, unknown> | null;
}) {
  const pricing = model.skuPricing;
  if (!pricing) {
    return (
      <>
        <PanelHead title="Deal — masters vs offered" />
        {modelNotIdentified ? (
          <div className="jline__callout">
            <strong>Model not identified</strong>
            <span>{String(modelNotIdentified.description || 'The vehicle could not be matched to the price masters. Confirm the model on the booking so masters can be applied.')}</span>
            <Link to={`/v2/bookings/${String((model.journey as Record<string, unknown>).journeyId ?? '')}/details`}>Open Booking to confirm model →</Link>
          </div>
        ) : (
          <p className="jline__empty">The price masters have not been resolved for this booking yet. Complete Booking document review.</p>
        )}
        <div style={{ marginTop: 16 }}>
          <BookingCommercialFacts reviewedBooking={reviewedBooking} />
        </div>
        <div style={{ marginTop: 24 }}>
          <DiscountsPanel model={model} />
        </div>
      </>
    );
  }
  return (
    <>
      <PanelHead title="Deal — masters vs offered" hint={`SKU ${pricing.skuCode} · ${readable(pricing.selectionStatus)}`} />
      <SkuPriceCheckPanel pricing={pricing} />
      {model.commercialLines.length > 0 && (
        <div className="jline__tableWrap" style={{ marginTop: 16 }}>
          <table className="jline__table">
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
      )}
      <div style={{ marginTop: 24 }}>
        <DiscountsPanel model={model} />
      </div>
    </>
  );
}

function DiscountsPanel({ model }: { model: JourneyOverview }) {
  const rows = model.discounts || [];
  return (
    <>
      <PanelHead title="Discounts — entitled vs given" hint={`${readable(value(model.customer, 'customerType'))} customer`} />
      {rows.length === 0 ? (
        <p className="jline__empty">No discount lines have been reconciled yet.</p>
      ) : (
        <div className="jline__tableWrap">
          <table className="jline__table">
            <thead><tr><th>Scheme / benefit</th><th>Entitled</th><th>Given</th><th>Eligibility</th></tr></thead>
            <tbody>
              {rows.map((d) => {
                const std = d.standardEligibleAmount === null || d.standardEligibleAmount === undefined ? null : Number(d.standardEligibleAmount);
                const act = d.actualDiscountAmount === null || d.actualDiscountAmount === undefined ? null : Number(d.actualDiscountAmount);
                const over = std !== null && act !== null && act - std > 1;
                return (
                  <tr key={String(d.discountApplicationId)}>
                    <td>{readable(d.discountKey)}</td>
                    <td>{money(std)}</td>
                    <td className={over ? 'jline__delta--over' : String(d.eligibilityResult).toUpperCase() === 'ELIGIBLE_UNCLAIMED' ? 'jline__delta--under' : ''}>{money(act)}</td>
                    <td>{readable(d.eligibilityResult)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function InvoicesPanel({
  invoices,
  documents,
}: {
  invoices: Array<Record<string, unknown>>;
  documents: Array<Record<string, unknown>>;
}) {
  const urlByDocumentId = new Map<string, string>();
  for (const doc of documents) {
    const id = doc.documentId ? String(doc.documentId) : null;
    if (id && doc.contentUrl) urlByDocumentId.set(id, String(doc.contentUrl));
  }
  return (
    <>
      <PanelHead title="Invoices" hint={`${invoices.length} invoice${invoices.length !== 1 ? 's' : ''} uploaded`} />
      {invoices.length === 0 ? (
        <p className="jline__empty">No invoices have been extracted yet.</p>
      ) : (
        <div className="jline__tableWrap">
          <table className="jline__table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Invoice No.</th>
                <th>Date</th>
                <th>Seller</th>
                <th>Financed By</th>
                <th>Taxable</th>
                <th>Grand Total</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => {
                const id = String(inv.invoiceReviewValueId);
                const documentId = inv.documentId ? String(inv.documentId) : null;
                const viewUrl = documentId ? urlByDocumentId.get(documentId) : undefined;
                const isCreditNote = String(inv.invoiceNature || '').toUpperCase() === 'CREDIT_NOTE';
                return (
                  <tr key={id}>
                    <td>{readable(inv.documentTypeKey)}{isCreditNote ? ' (Credit Note)' : ''}</td>
                    <td>{textValue(inv, 'invoiceNumber') || '—'}</td>
                    <td>{dateLabel(inv.invoiceDate)}</td>
                    <td>{textValue(inv, 'sellerName') || '—'}</td>
                    <td>{textValue(inv, 'financedBy') || '—'}</td>
                    <td>{money(inv.taxableAmount)}</td>
                    <td className={isCreditNote ? 'jline__delta--under' : ''}>{money(inv.grandTotalAmount)}</td>
                    <td>{viewUrl ? <a href={viewUrl} target="_blank" rel="noreferrer">View</a> : null}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function cellText(v: unknown): string {
  return v === null || v === undefined || v === '' ? '—' : String(v);
}

/** Every reviewed invoice's own headline amount, with its line items broken
 * out as a column on the same row (the "additional column" representation
 * asked for) -- so a PC/TL can see what was invoiced right next to what was
 * actually collected, without leaving the Payments tab. */
function InvoiceAmountsTable({ invoices }: { invoices: Array<Record<string, unknown>> }) {
  if (invoices.length === 0) return null;
  return (
    <div className="jline__tableWrap">
      <table className="jline__table">
        <thead>
          <tr>
            <th>Invoice No.</th>
            <th>Type</th>
            <th>Date</th>
            <th>Seller</th>
            <th>Financed By</th>
            <th>Grand Total</th>
            <th>Line Items</th>
          </tr>
        </thead>
        <tbody>
          {invoices.map((invoice, idx) => {
            const items = Array.isArray(invoice.lineItems) ? invoice.lineItems as Array<Record<string, unknown>> : [];
            const isCreditNote = String(invoice.invoiceNature || '').toUpperCase() === 'CREDIT_NOTE';
            return (
              <tr key={String(invoice.invoiceReviewValueId || idx)}>
                <td>{cellText(invoice.invoiceNumber)}{isCreditNote ? ' (Credit Note)' : ''}</td>
                <td>{readable(invoice.documentTypeKey)}</td>
                <td>{dateLabel(invoice.invoiceDate)}</td>
                <td>{cellText(invoice.sellerName)}</td>
                <td>{cellText(invoice.financedBy)}</td>
                <td className={isCreditNote ? 'jline__delta--under' : undefined}>{money(invoice.grandTotalAmount)}</td>
                <td>
                  {items.length > 0 ? (
                    <div className="jline__invoiceItems">
                      {items.map((item, itemIdx) => (
                        <div className="jline__invoiceItem" key={itemIdx}>
                          <span>{lineItemLabel(item)}</span>
                          <strong>{money(lineItemAmount(item))}</strong>
                        </div>
                      ))}
                    </div>
                  ) : '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function PaymentsPanel({
  model,
  receipts,
  pendingReceipts,
  reviewedBooking,
}: {
  model: JourneyOverview;
  receipts: Array<Record<string, unknown>>;
  pendingReceipts: Array<Record<string, unknown>>;
  reviewedBooking: Record<string, unknown> | null;
}) {
  const matched = receipts.filter((r) => String((objectValue(r, 'bankMatch') || {}).status).toUpperCase() === 'MATCHED').length;
  const unmatched = receipts.filter((r) => String((objectValue(r, 'bankMatch') || {}).status).toUpperCase() === 'UNMATCHED').length;
  const total = receipts.reduce((s, r) => {
    const a = Number(pick(r, 'amount', 'amount_paid', 'amountPaid') ?? 0);
    return s + (Number.isNaN(a) ? 0 : a);
  }, 0);

  // A ledger payment already shown as a reviewed receipt is not repeated in
  // the ledger table below. auditcore.payments.source_evidence_id always
  // points at the evidence row (never the DI document id), so the match set
  // has to be built from receipts' evidenceId -- matching on documentId
  // first (as this used to) never found the same receipt, since a payment
  // never carries a documentId to compare against, and every ledger payment
  // showed up a second time underneath its own receipt row.
  const receiptDocumentIds = new Set(
    receipts.flatMap((r) => [pickStr(r, 'evidenceId'), pickStr(r, 'documentId')]).filter(Boolean),
  );
  const ledgerOnly = (model.payments || []).filter(
    (p) => !receiptDocumentIds.has(pickStr(p, 'sourceEvidenceId', 'source_evidence_id')),
  );
  const invoices = model.invoices || [];
  const invoiceTotal = invoices.reduce((s, inv) => {
    const a = Number(pick(inv, 'grandTotalAmount', 'grand_total_amount') ?? 0);
    return s + (Number.isNaN(a) ? 0 : a);
  }, 0);
  const noReceiptsAtAll = receipts.length === 0 && pendingReceipts.length === 0 && ledgerOnly.length === 0;

  return (
    <>
      <PanelHead title="Payments received" />
      {/* Invoices and Payments/Receipts are two genuinely different kinds of
          record (what was billed vs. what was actually collected) -- each
          now gets its own named group with its own summary line, instead of
          one flat run of tables under a single "Payments received" hint
          that mixed both totals together. */}
      <SubSection
        title="Invoices"
        hint={invoices.length > 0 ? `${money(invoiceTotal)} across ${invoices.length} invoice${invoices.length !== 1 ? 's' : ''}` : undefined}
      >
        {invoices.length > 0 ? (
          <InvoiceAmountsTable invoices={invoices} />
        ) : (
          <p className="jline__empty">No invoices have been extracted yet.</p>
        )}
      </SubSection>
      <SubSection
        title="Payments / Receipts"
        hint={receipts.length > 0 ? `${money(total)} across ${receipts.length} receipt${receipts.length !== 1 ? 's' : ''} · ${matched} bank-matched · ${unmatched} unmatched` : undefined}
      >
        {noReceiptsAtAll ? (
          reviewedBooking && Object.keys(reviewedBooking).length > 0 ? (
            <FactList>
              <JFact label="Amount Paid">{money(value(reviewedBooking, 'booking_amount_paid'))}</JFact>
              <JFact label="Payment Mode">{readable(value(reviewedBooking, 'mode_of_payment'))}</JFact>
              <JFact label="Payment Reference">{textValue(reviewedBooking, 'payment_reference_no')}</JFact>
              <JFact label="Balance Amount">{money(value(reviewedBooking, 'balance_amount'))}</JFact>
            </FactList>
          ) : (
            <p className="jline__empty">No payment receipts have been extracted yet.</p>
          )
        ) : (
          <>
            {receipts.length > 0 && (
              <div className="jline__tableWrap">
                <table className="jline__table">
                  <thead>
                    <tr><th>Receipt No.</th><th>Date</th><th>Mode</th><th>Amount</th><th>Bank match</th></tr>
                  </thead>
                  <tbody>
                    {receipts.map((r, idx) => {
                      const matchStatus = String((objectValue(r, 'bankMatch') || {}).status || '').toUpperCase();
                      const needsAttention = matchStatus === 'UNMATCHED' || matchStatus === 'AMBIGUOUS';
                      return (
                        <tr
                          key={String(pick(r, 'documentId', 'evidenceId') ?? idx)}
                          className={needsAttention ? 'jline__row--attention' : undefined}
                        >
                          <td>{pickStr(r, 'receiptNumber', 'receipt_number') || '—'}</td>
                          <td>{dateLabel(pick(r, 'receiptDate', 'receipt_date'))}</td>
                          <td>{readable(pick(r, 'paymentMode', 'payment_mode', 'paymentMethodCode', 'payment_method_code'))}</td>
                          <td>{money(pick(r, 'amount', 'amount_paid'), String(pick(r, 'currencyCode', 'currency_code') || 'INR'))}</td>
                          <td>{bankMatchPill(objectValue(r, 'bankMatch')) ?? '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {ledgerOnly.length > 0 && (
              <div className="jline__tableWrap" style={{ marginTop: 14 }}>
                <table className="jline__table">
                  <thead><tr><th>Date</th><th>Reference</th><th>Mode</th><th>Status</th><th>Amount</th></tr></thead>
                  <tbody>
                    {ledgerOnly.map((p, i) => (
                      <tr key={String(p.paymentId || i)}>
                        <td>{dateLabel(pick(p, 'paymentAtUtc', 'payment_at_utc'))}</td>
                        <td>{String(pick(p, 'paymentReference', 'payment_reference') || '—')}</td>
                        <td>{readable(pick(p, 'paymentMethodCode', 'payment_method_code'))}</td>
                        <td>{readable(pick(p, 'actualStatusCode', 'actual_status_code'))}</td>
                        <td>{money(pick(p, 'amount', 'amount_paid'), String(pick(p, 'currencyCode', 'currency_code') || 'INR'))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {(receipts.length > 0 || pendingReceipts.length > 0) && (
              <div style={{ marginTop: 14 }}>
                <ReceiptAccordion receipts={receipts} pendingReceipts={pendingReceipts} reviewedBooking={null} />
              </div>
            )}
          </>
        )}
      </SubSection>
      <div style={{ marginTop: 24 }}>
        <BankPanel model={model} />
      </div>
    </>
  );
}

function BankPanel({ model }: { model: JourneyOverview }) {
  const lines = (model as unknown as { bankStatementLines?: Array<Record<string, unknown>> }).bankStatementLines || [];
  return (
    <>
      <PanelHead title="Bank statements" hint={`${lines.length} extracted credit / debit line${lines.length !== 1 ? 's' : ''}`} />
      {lines.length === 0 ? (
        <p className="jline__empty">No bank statement has been extracted for this journey.</p>
      ) : (
        <div className="jline__tableWrap">
          <table className="jline__table">
            <thead><tr><th>Date</th><th>Description</th><th>Reference</th><th>Credit</th><th>Debit</th><th>Balance</th><th>Match</th></tr></thead>
            <tbody>
              {lines.map((l) => (
                <tr key={String(l.bankStatementLineId)}>
                  <td>{dateLabel(l.transactionDate)}</td>
                  <td>{String(l.description || '—')}</td>
                  <td>{String(l.referenceNo || '—')}</td>
                  <td>{money(l.creditAmount)}</td>
                  <td>{money(l.debitAmount)}</td>
                  <td>{money(l.runningBalance)}</td>
                  <td>{l.matchStatus === 'MATCHED' ? <span className="jline__bank jline__bank--matched">Receipt</span> : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function FlagsPanel({
  model,
  onSelectAspect,
}: {
  model: JourneyOverview;
  onSelectAspect: (key: AspectKey) => void;
}) {
  const all = model.findings || [];
  const [showResolved, setShowResolved] = useState(false);
  const open = all.filter((f) => ['OPEN', 'ACKNOWLEDGED'].includes(String(f.findingStatus || '')));
  const shown = showResolved ? all : open;
  const navigate = useNavigate();
  const journeyId = String((model.journey as Record<string, unknown>)?.journeyId ?? '');
  return (
    <>
      <PanelHead
        title="Flags — open audit findings"
        hint={`${open.length} open of ${all.length}`}
      />
      {all.length > open.length && (
        <label style={{ fontSize: '0.82rem', display: 'block', marginBottom: 10 }}>
          <input type="checkbox" checked={showResolved} onChange={(e) => setShowResolved(e.target.checked)} /> Show resolved
        </label>
      )}
      {shown.length === 0 ? (
        <p className="jline__empty">No audit findings on this journey.</p>
      ) : (
        <div className="jline__findings">
          {shown.map((f) => {
            const sev = String(f.severity || 'INFO').toUpperCase();
            const cls = ['HIGH', 'CRITICAL'].includes(sev) ? 'bad' : 'warn';
            const findingClass = String(f.findingClass || '').toUpperCase();
            const ownerRole = String(f.ownerRoleCode || '').toUpperCase();
            const targetAspect = findingAspect(f as Record<string, unknown>);
            // A DOCUMENT_GAP finding's actual resolution is uploading the
            // missing document -- send the PC straight to the live Capture
            // workspace for whichever stage actually raised it (Choose Files
            // / Take Photo, auto-classify, review) instead of Audit View,
            // which has no upload control of its own. Previously this always
            // went to Booking's workspace regardless of stage, so a Delivery
            // document-gap flag opened the wrong stage entirely.
            const isDocumentGap = findingClass === 'DOCUMENT_GAP';
            const isDeliveryStage = String(f.stageCode || '').toUpperCase() === 'DELIVERY';
            // Audit View is the one place a finding is meant to be read in
            // full context (classification, severity, owner, SLA, history)
            // and Review Queue is where it's actually acted on -- so every
            // other finding opens there, not a same-page Journey 360 tab.
            // Previously only findings with no matching data tab (findingAspect()'s
            // catch-all, itself named 'flags' -- this exact panel) went to Audit
            // View; everything else just switched tabs in place, which is
            // indistinguishable from a dead click ("clicking a flag doesn't open
            // Audit View"). Deep-links to the specific finding so it's not just
            // a generic list the reviewer has to search through.
            const goToTarget = () => {
              if (isDocumentGap && journeyId) {
                navigate(isDeliveryStage ? `/v2/deliveries/${journeyId}` : `/v2/bookings/${journeyId}`);
              } else if (journeyId) {
                navigate(`/audit/${journeyId}?findingId=${encodeURIComponent(String(f.auditFindingId))}`);
              } else {
                onSelectAspect(targetAspect);
              }
            };
            return (
              <div
                className={`jline__finding jline__finding--${cls}`}
                key={String(f.auditFindingId)}
                role="button"
                tabIndex={0}
                style={{ cursor: 'pointer' }}
                onClick={goToTarget}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    goToTarget();
                  }
                }}
              >
                <span className="jline__findingMark" aria-hidden="true">!</span>
                <div className="jline__findingBody">
                  <div className="jline__findingTags">
                    {findingClass && (
                      <span className={`revq-tag revq-tag--${findingClass.toLowerCase()}`}>
                        {FINDING_CLASS_LABEL[findingClass] || readable(findingClass)}
                      </span>
                    )}
                    {ownerRole && <span className="jline__findingOwner">For {ownerRole}</span>}
                  </div>
                  <strong>{String(f.title || 'Audit finding')}</strong>
                  {Boolean(f.description) && <small>{String(f.description)}</small>}
                  <small>
                    {readable(f.stageCode)} · {readable(f.findingStatus)}
                    {f.ruleKey ? <> · <code>{String(f.ruleKey)}</code></> : null}
                    {' · '}{isDocumentGap ? '→ Upload document' : '→ Audit view'}
                  </small>
                </div>
                <div>
                  <StatusPill value={sev} compact />
                  {Boolean(f.slaDueAtUtc) && <div className="jline__findingSla">SLA {dateLabel(f.slaDueAtUtc)}</div>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

function FocusPanel({
  aspect,
  model,
  receipts,
  pendingReceipts,
  reviewedBooking,
  onSelectAspect,
}: {
  aspect: AspectKey;
  model: JourneyOverview;
  receipts: Array<Record<string, unknown>>;
  pendingReceipts: Array<Record<string, unknown>>;
  reviewedBooking: Record<string, unknown> | null;
  onSelectAspect: (key: AspectKey) => void;
}) {
  const modelNotIdentified =
    (model.findings || []).find(
      (f) =>
        String(f.findingTypeCode || '').toUpperCase() === 'MODEL_NOT_IDENTIFIED' &&
        ['OPEN', 'ACKNOWLEDGED'].includes(String(f.findingStatus || '')),
    ) ?? null;

  let body: React.ReactNode;
  switch (aspect) {
    case 'deal':
      body = (
        <DealPanel
          model={model}
          reviewedBooking={reviewedBooking}
          modelNotIdentified={modelNotIdentified as Record<string, unknown> | null}
        />
      );
      break;
    case 'invoice':
      body = <InvoicesPanel invoices={model.invoices || []} documents={model.evidence} />;
      break;
    case 'payments':
      // Bank statements is a sub-section here now (merged from its own
      // former tab); Discounts is the same, folded into Deal above.
      body = <PaymentsPanel model={model} receipts={receipts} pendingReceipts={pendingReceipts} reviewedBooking={reviewedBooking} />;
      break;
    case 'documents':
      body = (
        <>
          <PanelHead title="Documents" hint="Pick a document to open the file and see only its own extracted values." />
          <DocumentSelector documents={model.evidence} reviewedFields={model.reviewedFields || []} />
        </>
      );
      break;
    case 'vehicle': {
      const dealerBranchRaw =
        value(reviewedBooking, 'dealer_branch') ||
        value(reviewedBooking, 'branch_name') ||
        value(reviewedBooking, 'outlet_code') ||
        model.resolvedReviewedValues?.['dealer_branch']?.value ||
        value(model.journey, 'outletCode') ||
        null;
      const dealerBranch = dealerBranchRaw ? String(dealerBranchRaw) : textValue(model.journey, 'outletName');
      const expectedDelivery = dateLabel(
        value(reviewedBooking, 'expected_delivery_date') ||
        value(reviewedBooking, 'expected_delivery') ||
        model.resolvedReviewedValues?.['expected_delivery_date']?.value ||
        null,
      );
      body = (
        <>
          <PanelHead title="Vehicle" hint="Delivery documents take precedence over Booking." />
          <AccessoriesWarrantyPanel model={model} />
          <FactList>
            <JFact label="Model">{preferredText(model.booking, 'modelName', reviewedBooking, 'vehicle_model')}</JFact>
            <JFact label="Variant">{preferredText(model.booking, 'variantName', reviewedBooking, 'vehicle_variant')}</JFact>
            <JFact label="Colour">{preferredText(model.booking, 'colourName', reviewedBooking, 'vehicle_color')}</JFact>
            <JFact label="SKU">{textValue(model.booking, 'skuCode')}</JFact>
            <JFact label="VIN">{textValue(model.vehicle, 'vin')}</JFact>
            <JFact label="Chassis No.">{textValue(model.vehicle, 'chassisNumber')}</JFact>
            <JFact label="DMS Reference">{textValue(model.vehicle, 'dmsReference')}</JFact>
            <JFact label="Invoice Reference">{textValue(model.vehicle, 'invoiceReference')}</JFact>
            <JFact label="Allocated">{dateLabel(value(model.vehicle, 'allocatedAtUtc'))}</JFact>
            <JFact label="Booking Date">{dateLabel(value(model.booking, 'bookingDate'))}</JFact>
            <JFact label="Sales Consultant">{textValue(reviewedBooking, 'sales_person')}</JFact>
            <JFact label="Dealer Branch">{dealerBranch}</JFact>
            <JFact label="Deal Type">{preferredText(model.booking, 'dealType', reviewedBooking, 'deal_type')}</JFact>
            <JFact label="Deal Source">{readable(value(model.booking, 'dealSource'))}</JFact>
            <JFact label="Lead Source">{readable(value(model.booking, 'leadSource'))}</JFact>
            <JFact label="Expected Delivery">{expectedDelivery}</JFact>
          </FactList>
          <div className="jline__panelHead" style={{ marginTop: 16 }}>
            <span className="jline__panelTitle" style={{ fontSize: '0.95rem' }}>Delivery execution</span>
          </div>
          {model.delivery ? (
            <FactList>
              <JFact label="Status">{readable(value(model.delivery, 'actualDeliveryStatusCode'))}</JFact>
              <JFact label="Planned">{dateLabel(value(model.delivery, 'plannedDeliveryAt'))}</JFact>
              <JFact label="Intimated">{dateLabel(value(model.delivery, 'deliveryIntimatedAt'))}</JFact>
              <JFact label="Delivered">{dateLabel(value(model.delivery, 'actualDeliveredAt'))}</JFact>
            </FactList>
          ) : (
            <p className="jline__empty">Delivery has not been recorded yet.</p>
          )}
        </>
      );
      break;
    }
    case 'tradeIn':
      body = (
        <>
          <PanelHead title="Trade-in / Scrappage" />
          <FactList>
            <JFact label="Exchange Applicable">{readable(value(reviewedBooking, 'exchange_applicable'))}</JFact>
            <JFact label="Exchange Value">{money(value(reviewedBooking, 'exchange_value'))}</JFact>
          </FactList>
          {model.tradeIn ? (
            <FactList>
              <JFact label="Status">{readable(value(model.tradeIn, 'actualStatusCode'))}</JFact>
              <JFact label="Old Vehicle">{textValue(model.tradeIn, 'oldVehicleMakeModel')}</JFact>
              <JFact label="Registration">{textValue(model.tradeIn, 'oldVehicleRegistration')}</JFact>
              <JFact label="Quoted Value">{money(value(model.tradeIn, 'quotedValue'))}</JFact>
              <JFact label="Actual Value">{money(value(model.tradeIn, 'actualValue'))}</JFact>
              <JFact label="Handover">{dateLabel(value(model.tradeIn, 'handoverAtUtc'))}</JFact>
              <JFact label="Payment Date">{dateLabel(value(model.tradeIn, 'paymentAtUtc'))}</JFact>
            </FactList>
          ) : (
            <p className="jline__empty">No trade-in or scrappage record beyond the booking's exchange fields.</p>
          )}
        </>
      );
      break;
    case 'customer':
      body = (
        <>
          <PanelHead title="Customer" hint="KYC-reviewed identity is the source of truth." />
          <FactList>
            <JFact label="Entered Name">{preferredText(reviewedBooking, 'customer_name', model.customer, 'enteredName')}</JFact>
            <JFact label="Legal / KYC Name">{textValue(model.customer, 'legalName')}</JFact>
            <JFact label="PAN">{textValue(model.customer, 'panNumber')}</JFact>
            <JFact label="Aadhaar">{textValue(model.customer, 'aadhaarNumber')}</JFact>
            <JFact label="Date of Birth">{dateLabel(value(model.customer, 'dateOfBirth'))}</JFact>
            <JFact label="Gender">{readable(value(model.customer, 'gender'))}</JFact>
            <JFact label="Mobile">{preferredText(model.customer, 'mobileNumber', reviewedBooking, 'customer_phone')}</JFact>
            <JFact label="Email">{preferredText(model.customer, 'emailReference', reviewedBooking, 'customer_email')}</JFact>
            <JFact label="Address">{preferredText(model.customer, 'address', reviewedBooking, 'customer_address')}</JFact>
            <JFact label="Pincode">{textValue(model.customer, 'pincode')}</JFact>
            <JFact label="State">{textValue(model.customer, 'kycState')}</JFact>
            <JFact label="District">{textValue(model.customer, 'kycDistrict')}</JFact>
            <JFact label="Relationship">{textValue(model.customer, 'relationshipType')}</JFact>
            <JFact label="Relationship Name">{textValue(model.customer, 'relationshipName')}</JFact>
            <JFact label="Customer Type">{readable(value(model.customer, 'customerType'))}</JFact>
            <JFact label="Identity Status">{readable(value(model.customer, 'legalNameStatus'))}</JFact>
          </FactList>
        </>
      );
      break;
    case 'registration':
      body = (
        <>
          <PanelHead title="Registration" />
          {model.registration ? (
            <FactList>
              <JFact label="Registration No.">{textValue(model.registration, 'registrationNumber')}</JFact>
              <JFact label="State">{textValue(model.registration, 'registrationState')}</JFact>
              <JFact label="Territory">{textValue(model.registration, 'registrationTerritory')}</JFact>
              <JFact label="District">{textValue(model.registration, 'registrationDistrict')}</JFact>
              <JFact label="Type">{readable(value(model.registration, 'registrationTypeCode'))}</JFact>
              <JFact label="Category">{readable(value(model.registration, 'registrationCategoryCode'))}</JFact>
              <JFact label="Registration By">{textValue(reviewedBooking, 'registration_by')}</JFact>
              <JFact label="Registration Type (booking)">{textValue(reviewedBooking, 'registration_type')}</JFact>
              <JFact label="Registration Charges">{money(value(reviewedBooking, 'registration_charges'))}</JFact>
              <JFact label="Road Tax">{money(value(reviewedBooking, 'road_tax_amount'))}</JFact>
              <JFact label="Status">{readable(value(model.registration, 'actualStatusCode'))}</JFact>
            </FactList>
          ) : (
            <p className="jline__empty">Registration details are not available yet.</p>
          )}
        </>
      );
      break;
    case 'insurance':
      body = (
        <>
          <PanelHead title="Insurance" />
          {model.insurance ? (
            <FactList>
              <JFact label="Insurer">{textValue(model.insurance, 'insurerName')}</JFact>
              <JFact label="Policy">{textValue(model.insurance, 'policyReference')}</JFact>
              <JFact label="Cover Note">{textValue(model.insurance, 'coverNoteReference')}</JFact>
              <JFact label="Standard Premium">{money(value(model.insurance, 'standardPremiumAmount'))}</JFact>
              <JFact label="Actual Premium">{money(value(model.insurance, 'actualPremiumAmount'))}</JFact>
              <JFact label="Insurance (booking)">{money(value(reviewedBooking, 'insurance_amount'))}</JFact>
              <JFact label="Insurance By">{textValue(reviewedBooking, 'insurance_by')}</JFact>
              <JFact label="Self Insurance">{readable(value(model.insurance, 'selfInsuranceFlag'))}</JFact>
              <JFact label="Status">{readable(value(model.insurance, 'actualStatusCode'))}</JFact>
            </FactList>
          ) : (
            <p className="jline__empty">No insurance record is available.</p>
          )}
        </>
      );
      break;
    case 'finance':
      body = (
        <>
          <PanelHead title="Finance" />
          {model.finance ? (
            <FactList>
              <JFact label="Type">{readable(value(model.finance, 'financeTypeCode'))}</JFact>
              <JFact label="Provider">{textValue(model.finance, 'providerName')}</JFact>
              <JFact label="DO Reference">{textValue(model.finance, 'doReference')}</JFact>
              <JFact label="PO Reference">{textValue(model.finance, 'poReference')}</JFact>
              <JFact label="Financed Amount">{money(value(model.finance, 'financedAmount'))}</JFact>
              <JFact label="Status">{readable(value(model.finance, 'actualStatusCode'))}</JFact>
            </FactList>
          ) : (
            <p className="jline__empty">No finance record is available — this booking is presumed cash/outright purchase.</p>
          )}
        </>
      );
      break;
    case 'flags':
    default:
      body = <FlagsPanel model={model} onSelectAspect={onSelectAspect} />;
      break;
  }
  return <div className="jline__panelCard">{body}</div>;
}

export default function Journey360Page() {
  const { journeyId = '' } = useParams();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
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

  const [resyncing, setResyncing] = useState(false);
  const [resyncMessage, setResyncMessage] = useState<string>();
  const handleResync = async () => {
    if (!tenantId || !journeyId) return;
    setResyncing(true);
    setResyncMessage(undefined);
    try {
      // Every document on this Journey, both stages -- re-checks the
      // uploaded list, re-validates what DI has actually extracted, and
      // reruns the sync for anything classified but not yet durably
      // copied. Each call is a no-op for a stage with nothing uploaded.
      //
      // Settled independently, not Promise.all: Booking and Delivery are
      // two separate stages of the same Journey, and it is normal (the
      // common case, in fact) for one to be unavailable while the other
      // still has work to do -- e.g. Booking is CLOSED on any Journey that
      // has moved on to Delivery. A rejection on one side must not hide a
      // real result on the other.
      const [bookingResult, deliveryResult] = await Promise.allSettled([
        resyncBookingCaptureV2(tenantId, journeyId, accessToken),
        resyncDeliveryCaptureV2(tenantId, journeyId, accessToken),
      ]);
      const booking = bookingResult.status === 'fulfilled' ? bookingResult.value : undefined;
      const delivery = deliveryResult.status === 'fulfilled' ? deliveryResult.value : undefined;

      if (!booking && !delivery) {
        setResyncMessage('Resync could not be started. Try again in a moment.');
        return;
      }

      const found = (booking?.documentsFound ?? 0) + (delivery?.documentsFound ?? 0);
      const resynced = (booking?.documentsResynced ?? 0) + (delivery?.documentsResynced ?? 0);
      const pending = (booking?.documentsNotYetExtracted ?? 0) + (delivery?.documentsNotYetExtracted ?? 0);
      const skippedStages = [
        bookingResult.status === 'rejected' ? 'Booking' : null,
        deliveryResult.status === 'rejected' ? 'Delivery' : null,
      ].filter((stage): stage is string => stage !== null);

      setResyncMessage(
        (found === 0
          ? 'No documents found on this Journey yet.'
          : `${found} document${found === 1 ? '' : 's'} found · ${resynced} resynced` +
            (pending > 0 ? ` · ${pending} still awaiting extraction` : '')) +
          (skippedStages.length > 0 ? ` · ${skippedStages.join(' & ')} could not be checked` : ''),
      );
      void queryClient.invalidateQueries({ queryKey: ['uc03-journey-overview', tenantId, journeyId] });
    } catch {
      setResyncMessage('Resync could not be started. Try again in a moment.');
    } finally {
      setResyncing(false);
    }
  };

  const model = overviewQuery.data;

  const receiptRows = useMemo(() => (model?.receipts || []).filter((r) => !receiptIsPending(r)), [model?.receipts]);
  const pendingReceiptRows = useMemo(() => (model?.receipts || []).filter(receiptIsPending), [model?.receipts]);

  const steps = useMemo(() => (model ? deriveSteps(model).steps : []), [model]);
  const aspects = useMemo(() => (model ? deriveAspects(model) : []), [model]);
  const openCount = useMemo(() => (model ? openFindings(model).length : 0), [model]);
  const needCount = useMemo(
    () => (model ? openFindings(model).filter((f) => ['DATA_GAP', 'DOCUMENT_GAP'].includes(String(f.findingClass || ''))).length : 0),
    [model],
  );

  const requestedAspect = (searchParams.get('aspect') || '') as AspectKey;
  const validAspects = new Set(aspects.map((a) => a.key));
  const activeAspect: AspectKey = validAspects.has(requestedAspect)
    ? requestedAspect
    : openCount > 0
    ? 'flags'
    : 'deal';

  const setAspect = (key: AspectKey) => {
    const next = new URLSearchParams(searchParams);
    next.set('aspect', key);
    setSearchParams(next, { replace: true });
  };

  if (overviewQuery.isLoading) return <div className="page-loading">Loading the journey line…</div>;
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
          <button type="button" disabled={resyncing} onClick={() => void handleResync()}>
            {resyncing ? 'Resyncing…' : 'Resync Documents'}
          </button>
          <Link to={`/v2/bookings/${journeyId}/details`}>Open Booking</Link>
          <Link to={`/v2/deliveries/${journeyId}`}>Open Delivery</Link>
          <Link className="journey-360-actions__primary" to={`/audit/${journeyId}`}>Audit Review</Link>
        </div>
      </div>
      {resyncMessage && (
        <p className="journey-360-resync-message" role="status">{resyncMessage}</p>
      )}

      <PageHeader
        eyebrow={`${textValue(model.journey, 'dealerName')} · ${textValue(model.journey, 'outletName')}`}
        title={customerName}
        description={`Dealer Booking ${bookingReference} · ${productLabel}`}
        actions={<div className="header-statuses"><StatusPill value={String(bookingStatus || 'NOT_STARTED')} /><StatusPill value={String(deliveryStatus || 'NOT_STARTED')} /></div>}
      />

      <div className="jline">
        <HealthStrip needCount={needCount} totalOpen={openCount} onJump={() => setAspect('flags')} />
        <JourneyLine steps={steps} />
        <AspectChips aspects={aspects} active={activeAspect} onSelect={setAspect} />
        <FocusPanel
          aspect={activeAspect}
          model={model}
          receipts={receiptRows}
          pendingReceipts={pendingReceiptRows}
          reviewedBooking={reviewedBooking}
          onSelectAspect={setAspect}
        />
      </div>
    </div>
  );
}
