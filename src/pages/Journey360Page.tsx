import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';

import PageHeader from '../components/PageHeader';
import StatusPill from '../components/StatusPill';
import { categoryFor, categoryTitle, FIELD_CATEGORY_ORDER, type FieldCategory } from '../features/uc03/fieldCategoryGroups';
import {
  deriveAspects,
  deriveSteps,
  findingAspect,
  openFindings,
  type AspectKey,
  type AspectMeta,
  type JourneyStep,
} from '../features/uc03/journey/deriveJourneyLine';
import ModifyModelModal from '../features/uc03/ModifyModelModal';
import { AuditCoreHttpError } from '../services/audit-core/client';
import { getFinance, getInsurance } from '../services/audit-core/operations';
import { resyncBookingCaptureV2 } from '../services/audit-core/uc03DocumentCaptureV2';
import { resyncDeliveryCaptureV2 } from '../services/audit-core/uc03DeliveryCaptureV2';
import { getReviewDocumentContentV2 } from '../services/audit-core/uc03DocumentReviewV2';
import { runAllApplicableRules, type Uc03RunAllRulesRuleResult } from '../services/audit-core/uc03Audit';
import {
  getUc03JourneyOverview,
  type DealSourceValue,
  type JourneyOverview,
  type JourneyReviewedField,
  type SkuPricing,
  type SkuPricingComponent,
} from '../services/audit-core/uc03JourneySearch';
import { useProjectContextStore } from '../store/projectContextStore';
import { useSessionStore } from '../store/sessionStore';

// Longer than a plain confirmation needs -- this banner also carries the
// only explanation a PC gets, right after Submit, that extraction is a
// background process (not instant): previously said only "submitted
// successfully" and gave no reason values on this page might still look
// incomplete for a few minutes.
const SUBMIT_BANNER_DURATION_MS = 9_000;

// Same three finding_class values and labels as ReviewQueuePage's
// CLASS_LABEL -- kept in sync deliberately so a finding reads the same way
// whether it's seen here or in the Task Queue.
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

function listText(record: Record<string, unknown> | null | undefined, key: string): string {
  const current = value(record, key);
  if (!Array.isArray(current) || current.length === 0) return 'Not available';
  return current.map((item) => (typeof item === 'string' ? item : String(item))).join(', ');
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
  // A ₹1 dead-band for rounding noise between a master price stored with
  // paisa precision and a document-extracted whole-rupee amount -- the
  // same threshold this file already uses everywhere else a standard is
  // compared to an actual (see the invoice-disagreement and discount-over
  // checks below). 0.01 flagged a one-paisa rounding difference (TCS,
  // Ex Showroom) as a real "exception" needing PC/TL attention.
  const state: 'ok' | 'over' | 'under' | 'unknown' =
    deviationAmount === null ? 'unknown'
    : Math.abs(deviationAmount) <= 1 ? 'ok'
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

function SkuPriceCheckPanel({
  pricing,
  tenantId,
  journeyId,
  accessToken,
}: {
  pricing: SkuPricing;
  tenantId: string;
  journeyId: string;
  accessToken?: string;
}) {
  const [showAll, setShowAll] = useState(false);
  const [modifyOpen, setModifyOpen] = useState(false);
  const currency = pricing.currencyCode || 'INR';
  const componentLabel = (k: string) =>
    k.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
  const rows = pricing.masterComponents as SkuPricingComponent[];
  const exceptions  = rows.filter((r) => r.deviationAmount !== null && Math.abs(r.deviationAmount) > 1);
  const clean       = rows.filter((r) => r.deviationAmount !== null && Math.abs(r.deviationAmount) <= 1);
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
        {/* Wrong vehicle already confirmed? A simple trigger, not a heavy
            inline section -- the whole "pick the right one" job happens in
            its own popup (ModifyModelModal). Only makes sense once
            something is actually CONFIRMED to correct; the tentative case
            already has its own picker on the Documents page. */}
        {pricing.selectionStatus === 'CONFIRMED' ? (
          <button type="button" className="pc-sku-strip__modify" onClick={() => setModifyOpen(true)}>
            Modify Model
          </button>
        ) : null}
      </div>

      {modifyOpen ? (
        <ModifyModelModal
          tenantId={tenantId}
          journeyId={journeyId}
          accessToken={accessToken}
          onClose={() => setModifyOpen(false)}
          onProposed={() => { /* the Task Queue is the source of truth from here */ }}
        />
      ) : null}

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

// All three counts come straight out of the same `evidence`/`reviewedFields`
// arrays the page already fetches in its one overview call -- no extra
// request, no extra render weight beyond a single pass over data already
// in memory. "Classified" mirrors the Capture screens' own definition (a
// real document type was assigned); "Extracted" means at least one field
// was actually pulled from that specific document, keyed the same way
// DocumentSelector already matches a document to its own reviewed fields.
function documentExtractionCounts(
  documents: Array<Record<string, unknown>>,
  reviewedFields: JourneyReviewedField[],
): { uploaded: number; classified: number; extracted: number; duplicates: number } {
  const extractedIds = new Set(reviewedFields.map((field) => field.documentId));
  let classified = 0;
  let extracted = 0;
  let duplicates = 0;
  documents.forEach((doc, idx) => {
    if (doc.documentTypeKey) {
      classified += 1;
      // Classified but never bound to an open requirement slot (see
      // audit_core._requirements_with_open_slot) -- an extra copy of a
      // single-document requirement that's already filled. requirementKey
      // comes straight off document_capture_v2_documents (see
      // uc03_journey_overview_projection._documents), same signal
      // JourneyDocumentsPage's own "Extra copies" summary uses.
      if (!doc.requirementKey) duplicates += 1;
    }
    if (extractedIds.has(documentId(doc, idx))) extracted += 1;
  });
  return { uploaded: documents.length, classified, extracted, duplicates };
}

// ── Document dropdown: pick one document, see its own file + its own
// extracted values only. Replaces a prior design that rendered every
// document's every reviewed field, in every business category, all at
// once, regardless of which (if any) document was open -- selecting one
// document here now actually scopes what's shown to that document. ───────
function DocumentSelector({
  tenantId,
  journeyId,
  accessToken,
  documents,
  reviewedFields,
}: {
  tenantId: string;
  journeyId: string;
  accessToken?: string;
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

  // Only this document's own extracted values -- not the whole journey's.
  // Grouped (Customer / Vehicle / Financial / Other) rather than a flat
  // alphabetical list -- payment-related fields, say, land together
  // instead of scattered between unrelated ones.
  const fields = reviewedFields.filter((field) => field.documentId === selectedKey);
  const fieldsByCategory = new Map<FieldCategory, JourneyReviewedField[]>();
  for (const field of fields) {
    const category = categoryFor(field.semanticKey, field.semanticKey);
    const bucket = fieldsByCategory.get(category) ?? [];
    bucket.push(field);
    fieldsByCategory.set(category, bucket);
  }
  for (const bucket of fieldsByCategory.values()) {
    bucket.sort((a, b) => a.semanticKey.localeCompare(b.semanticKey));
  }

  // Reuses the same document-content endpoint the Booking/Delivery Review
  // screens already use (uc03_document_review_v2.py's own
  // /review/documents/{id}/content) -- generic to any document linked to
  // the Journey, not gated on review state. Fetched lazily, only for
  // whichever document is currently selected here, not eagerly for all of
  // them: the Journey Overview read this page already makes is the
  // slowest single call on it as it is.
  const contentQuery = useQuery({
    queryKey: ['uc03-journey-document-content', tenantId, journeyId, selectedKey],
    queryFn: () => getReviewDocumentContentV2(tenantId, journeyId, selectedKey, accessToken),
    enabled: Boolean(tenantId && journeyId && selectedKey),
    staleTime: 5 * 60 * 1000,
  });
  const [objectUrl, setObjectUrl] = useState<string>();
  useEffect(() => {
    if (!contentQuery.data?.blob) {
      setObjectUrl(undefined);
      return undefined;
    }
    const next = URL.createObjectURL(contentQuery.data.blob);
    setObjectUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [contentQuery.data?.blob]);

  const contentType = contentQuery.data?.contentType || '';
  const filename = String(selected.originalFilename || '').toLowerCase();
  const isPdf = contentType.includes('pdf') || filename.endsWith('.pdf');
  const isImage = contentType.startsWith('image/') || /\.(png|jpe?g|webp|gif|bmp)$/i.test(filename);

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

      <div className="journey-360-doc-detail journey-360-doc-detail--boxed">
        <div className="journey-360-doc-preview">
          {contentQuery.isPending && <div className="journey-360-doc-preview__message">Loading document…</div>}
          {contentQuery.isError && <div className="journey-360-doc-preview__message is-error">The document could not be loaded. Try again.</div>}
          {objectUrl && isImage && <img className="journey-360-doc-preview__image" src={objectUrl} alt={String(selected.originalFilename || label)} />}
          {objectUrl && isPdf && (
            <iframe className="journey-360-doc-preview__pdf" src={objectUrl} title={String(selected.originalFilename || label)} />
          )}
          {objectUrl && !isImage && !isPdf && (
            <div className="journey-360-doc-preview__message">A preview isn't available for this file type.</div>
          )}
          {objectUrl && (
            <a href={objectUrl} target="_blank" rel="noopener noreferrer" className="journey-360-doc-view-btn">
              Open in new tab ↗
            </a>
          )}
        </div>

        <div className="journey-360-doc-facts">
          <div className="journey-360-facts journey-360-facts--single">
            <Fact label="Document Type">{label}</Fact>
            <Fact label="Stage">{stage}</Fact>
            <Fact label="Status"><StatusPill value={status} /></Fact>
            {Boolean(selected.originalFilename) && <Fact label="File">{String(selected.originalFilename)}</Fact>}
            {Boolean(selected.requirementKey) && <Fact label="Requirement">{readable(selected.requirementKey)}</Fact>}
            {Boolean(selected.captureStatus) && <Fact label="Capture Status">{readable(selected.captureStatus)}</Fact>}
            {Boolean(selected.linkedAtUtc) && <Fact label="Linked">{dateLabel(selected.linkedAtUtc)}</Fact>}
          </div>
          {fields.length > 0 ? (
            <div className="journey-360-table-wrap">
              {FIELD_CATEGORY_ORDER.filter((category) => fieldsByCategory.has(category)).map((category) => (
                <div key={category} className="journey-360-field-group">
                  <h4 className="journey-360-field-group__title">{categoryTitle(category)}</h4>
                  <table className="journey-360-table">
                    <thead>
                      <tr><th>Attribute</th><th>Extracted value</th></tr>
                    </thead>
                    <tbody>
                      {(fieldsByCategory.get(category) ?? []).map((field) => (
                        <tr key={field.reviewedFieldId}>
                          <td><strong>{readable(field.semanticKey)}</strong></td>
                          <td>{formatFieldValue(field.displayValue)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
        ) : (
          <p className="jline__empty">No extracted values retained for this document.</p>
        )}
        </div>
      </div>
    </div>
  );
}

// ── The Journey Line building blocks ────────────────────────────────────────

// A document only shows here once DI has permanently failed it (and thus
// backed it out) -- not on a transient in-flight retry. DI's fail_job() and
// insert_backout_job() happen atomically together, so "processingStatus ===
// 'FAILED'" on the already-synced evidence record is exactly "this document
// is sitting in the backout queue" without this page needing to know
// anything about DI's own backout_jobs table.
function FailedExtractionBanner({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <div className="jline__strip jline__strip--attention" role="status">
      <span className="jline__stripText">
        {count} document{count !== 1 ? 's' : ''} failed to extract
        <small>Reviewed automatically each night — no action needed unless it's still failing after a few days.</small>
      </span>
    </div>
  );
}

function DocumentProgressStrip({
  uploaded,
  classified,
  extracted,
  duplicates,
}: {
  uploaded: number;
  classified: number;
  extracted: number;
  duplicates: number;
}) {
  if (uploaded === 0) return null;
  const done = extracted === uploaded;
  return (
    <div className="jline__docProgress" role="status">
      <div className="jline__docStat jline__docStat--uploaded">
        <span>Uploaded</span>
        <strong>{uploaded}</strong>
      </div>
      <div className="jline__docStat jline__docStat--classified">
        <span>Classified</span>
        <strong>{classified}</strong>
      </div>
      <div className={`jline__docStat jline__docStat--extracted ${done ? 'jline__docStat--done' : ''}`}>
        <span>Extracted</span>
        <strong>{extracted}</strong>
      </div>
      <div className={`jline__docStat jline__docStat--duplicate ${duplicates > 0 ? 'jline__docStat--duplicate-active' : ''}`}>
        <span>Duplicates</span>
        <strong>{duplicates}</strong>
      </div>
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

// Any journey_addon whose type isn't already one of the two named toggles
// below (Accessories/Extended Warranty) -- driven off the addon's own code
// rather than a hardcoded allowlist, so a new addon type materialized on
// the backend (uc03_v2_review_materialization._ADDON_TYPE_BY_FIELD) shows
// up here automatically instead of silently never being displayed, per
// explicit repeated complaint: "extracted fields... always it is less."
const _ADDON_LABELS: Record<string, string> = {
  EXTENDED_WARRANTY: 'Extended Warranty (Addon)',
  ESSENTIAL_KIT: 'Essential Kit',
  GENUINE_ACCESSORIES: 'Genuine Accessories',
  NON_GENUINE_ACCESSORIES: 'Non-Genuine Accessories',
  SERVICE_PACKAGE: 'Service Package',
  RSA: 'RSA',
  FASTAG: 'FASTag',
};

function otherAddons(model: JourneyOverview, exclude: string[]): Array<Record<string, unknown>> {
  const addons = Array.isArray(model.addons) ? model.addons : [];
  return addons.filter((a) => {
    const code = String(value(a, 'addonTypeCode') || '').toUpperCase();
    if (exclude.includes(code)) return false;
    const amount = value(a, 'actualAmount');
    return amount !== null && amount !== undefined && Number(amount) > 0;
  });
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

/** The document type that contributed an addon/commercial-line amount --
 * journey_addons carries it in details.sourceDocumentType (set at write
 * time by _upsert_addon); commercial_lines carries it packed into
 * source_reference as "{document_type}:{document_id}" instead (set by
 * _upsert_commercial_line/_materialize_discount_standards). Either way,
 * this is the ONLY source-document info consistently available when the
 * source is a whole single-purpose invoice with nothing itemized inside
 * it (an "Accessory Invoice" IS the accessory line, not a container of
 * several) -- there is no invoice line_items row to point at in that
 * case, by design. */
function readableSourceDocumentType(source: Record<string, unknown> | null): string | null {
  if (!source) return null;
  const details = objectValue(source, 'details');
  const fromDetails = details ? pickStr(details, 'sourceDocumentType') : '';
  if (fromDetails) return fromDetails;
  const sourceReference = pickStr(source, 'sourceReference', 'source_reference');
  const documentType = sourceReference.split(':')[0]?.trim();
  return documentType || null;
}

/** Line items when the source document itemizes this category (a Tax
 * Invoice bundling vehicle + accessory + insurance lines, say);
 * otherwise a single fallback "item" built from the source document
 * itself, so a category showing "Taken" never renders an empty,
 * unexplained item list underneath -- confirmed live: a standalone
 * Accessory Invoice or Insurance Policy has nothing in invoice
 * line_items to match against at all, since the WHOLE document is the
 * line, not a container of several. */
function resolvedItems(
  model: JourneyOverview,
  categories: string[],
  source: Record<string, unknown> | null,
  amount: unknown,
): Array<Record<string, unknown>> {
  const lineItems = invoiceLineItems(model, categories);
  if (lineItems.length > 0) return lineItems;
  const documentType = readableSourceDocumentType(source);
  if (!documentType || amount === null || amount === undefined || Number(amount) <= 0) return [];
  return [{ description_raw: `From ${readable(documentType)}`, net_amount: amount }];
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

  const accessoryItems = resolvedItems(model, ['ACCESSORY_GENUINE', 'ACCESSORY_NON_GENUINE'], accessoriesAddon, accessoriesAmount);
  const warrantyItems = resolvedItems(model, ['EXTENDED_WARRANTY'], warrantyAddon, warrantyAmount);
  const insuranceItems = resolvedItems(model, ['INSURANCE'], insuranceLine, insuranceAmount);
  const otherAddonRows = otherAddons(model, ['ACCESSORIES_TOTAL', 'ADDITIONAL_WARRANTY']);

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
        {otherAddonRows.map((addon, index) => {
          const code = String(value(addon, 'addonTypeCode') || '').toUpperCase();
          return (
            <TakenToggleRow
              key={`${code}-${index}`}
              label={_ADDON_LABELS[code] || readable(code)}
              taken
              amount={value(addon, 'actualAmount')}
              provider={nonEmptyText(value(addon, 'providerName'))}
            />
          );
        })}
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

/** Every recorded source for one commercial/discount line, keyed
 * case-insensitively -- commercial component keys arrive lowercase
 * ("accessories_cost"), discount keys arrive uppercase ("ACCESSORIES_KIT"),
 * and dealSourceBreakdown always stores the key lowercased. Only rendered
 * when a second, disagreeing source actually exists: a single-source line
 * already shows its one value in the parent row, so listing it again here
 * would just repeat the same number under a new label. */
function sourceValuesFor(
  breakdown: DealSourceValue[] | undefined,
  lineKind: 'COMMERCIAL' | 'DISCOUNT',
  componentKey: string,
): DealSourceValue[] {
  if (!breakdown || breakdown.length === 0) return [];
  const key = componentKey.trim().toLowerCase();
  const matches = breakdown.filter((row) => row.lineKind === lineKind && row.componentKey.trim().toLowerCase() === key);
  return matches.length > 1 ? matches : [];
}

// ── Retail / Tax invoice columns ─────────────────────────────────────────────
// Every value a document has ever reported for this component, regardless of
// whether a second source disagrees (unlike sourceValuesFor above, which only
// returns rows when there's a real disagreement to show) -- the Retail/Tax
// columns need the one-and-only source too, not just disagreements.
function allSourceValuesFor(
  breakdown: DealSourceValue[] | undefined,
  componentKey: string,
): DealSourceValue[] {
  if (!breakdown || breakdown.length === 0) return [];
  const key = componentKey.trim().toLowerCase();
  return breakdown.filter((row) => row.lineKind === 'COMMERCIAL' && row.componentKey.trim().toLowerCase() === key);
}

// Retail Invoice is the customer's own bill -- the main sale invoice plus
// whichever add-on invoices roll into it (accessories, extended warranty,
// RSA, a credit note adjustment), per explicit instruction: "update
// accessories/EW or any other additional invoice under the Retail invoice
// only". Tax Invoice is the separate statutory GST document. Wholesale
// (dealer<->OEM) invoices are neither -- a different transaction entirely,
// excluded from both.
const RETAIL_INVOICE_TYPES = new Set([
  'customer_invoice_dms', 'customer_invoice_dms_v2', 'invoice_generic',
  'accessory_invoice_dms', 'accessory_invoice_tally', 'ew_invoice', 'rsa_invoice', 'credit_note',
]);
const TAX_INVOICE_TYPES = new Set(['tax_invoice_tally', 'tax_invoice', 'tax_invoice_dms']);

function invoiceColumnBucket(sourceDocumentType: string): 'RETAIL' | 'TAX' | null {
  const t = sourceDocumentType.trim().toLowerCase();
  if (RETAIL_INVOICE_TYPES.has(t)) return 'RETAIL';
  if (TAX_INVOICE_TYPES.has(t)) return 'TAX';
  return null;
}

interface InvoiceColumns {
  retail: DealSourceValue | null;
  tax: DealSourceValue | null;
}

function bucketInvoiceColumns(sources: DealSourceValue[]): InvoiceColumns {
  let retail: DealSourceValue | null = null;
  let tax: DealSourceValue | null = null;
  for (const source of sources) {
    const bucket = invoiceColumnBucket(source.sourceDocumentType);
    if (bucket === 'RETAIL') retail = source;
    else if (bucket === 'TAX') tax = source;
  }
  return { retail, tax };
}

/** Whether ANY commercial line on this deal has reported a Retail or Tax
 * invoice value yet -- gates whether the table shows those two columns at
 * all. Before any invoice exists the table stays exactly as simple as
 * before (Standard | Actual); the moment one invoice line lands, every row
 * gains the two columns so the table never jumps around per-row. */
function dealHasAnyInvoiceColumn(breakdown: DealSourceValue[] | undefined): boolean {
  if (!breakdown || breakdown.length === 0) return false;
  return breakdown.some((row) => row.lineKind === 'COMMERCIAL' && invoiceColumnBucket(row.sourceDocumentType) !== null);
}

// Given amount lands in column 3 (Scheme/benefit | Entitled | Given | Eligibility).
function DiscountSourceRows({ sources }: { sources: DealSourceValue[] }) {
  if (sources.length === 0) return null;
  return (
    <>
      {sources.map((source) => (
        <tr key={`${source.componentKey}-${source.sourceDocumentType}`} className="jline__sourceRow">
          <td className="jline__sourceRow__label">via {readable(source.sourceDocumentType)}</td>
          <td />
          <td className="jline__sourceRow__value">{money(source.amount)}</td>
          <td />
        </tr>
      ))}
    </>
  );
}

function DealPanel({
  model,
  reviewedBooking,
  modelNotIdentified,
  tenantId,
  journeyId,
  accessToken,
  role,
}: {
  model: JourneyOverview;
  reviewedBooking: Record<string, unknown> | null;
  modelNotIdentified: Record<string, unknown> | null;
  tenantId: string;
  journeyId: string;
  accessToken?: string;
  role?: string;
}) {
  const pricing = model.skuPricing;
  // booking_amount_paid is a payment record, not a priced deal component --
  // it has no "standard" price to compare against and belongs on the
  // Payments panel (already shown there). Filtered here only, for the two
  // Deal-tab consumers below -- commercialLineByComponentKey's own generic
  // lookups elsewhere are unaffected.
  const dealModel: JourneyOverview = {
    ...model,
    commercialLines: model.commercialLines.filter((line) => line.componentKey !== 'booking_amount_paid'),
  };
  // Regression: commercial lines / invoice amounts (auditcore.commercial_lines)
  // and discounts are materialized independent of SKU resolution -- confirmed
  // live, a journey with an unresolved SKU (MODEL_NOT_IDENTIFIED still open)
  // already had a real accessories_cost commercial line with a genuine
  // actualAmount from the Invoice. Only the master-vs-offered price CHECK
  // (SkuPriceCheckPanel) genuinely needs a resolved SKU to compare against --
  // everything else below must render exactly as it would once resolved,
  // per explicit instruction: map the price from the Booking Form and
  // Invoice even when the SKU isn't available yet.
  return (
    <>
      <PanelHead
        title="Deal — masters vs offered"
        hint={pricing ? `SKU ${pricing.skuCode} · ${readable(pricing.selectionStatus)}` : undefined}
      />
      {pricing ? (
        <SkuPriceCheckPanel pricing={pricing} tenantId={tenantId} journeyId={journeyId} accessToken={accessToken} />
      ) : modelNotIdentified ? (
        <div className="jline__callout">
          {/* Same finding, same title, same severity as its Audit Review
              card -- previously this was fixed, generic copy with no
              visible link between the two, so a reviewer had no way to
              tell "this box" and "that card" were the same record. */}
          <strong>{String(modelNotIdentified.title || 'Model not identified')}</strong>
          <span>{String(modelNotIdentified.description || 'The vehicle could not be matched to the price masters. Confirm the model on the booking so masters can be applied.')}</span>
          <span className="jline__calloutMeta">
            {readable(modelNotIdentified.severity)} · Owner {readable(modelNotIdentified.ownerRoleCode)}
          </span>
          <div className="jline__calloutActions">
            <Link to={`/journeys/${String((model.journey as Record<string, unknown>).journeyId ?? '')}/documents`}>Open Documents to confirm model →</Link>
            {role !== 'PC' && (
              <Link to={`/audit/${String((model.journey as Record<string, unknown>).journeyId ?? '')}?findingId=${encodeURIComponent(String(modelNotIdentified.auditFindingId))}`}>
                View in Audit Review →
              </Link>
            )}
          </div>
        </div>
      ) : (
        <p className="jline__empty">The price masters have not been resolved for this booking yet. Complete Booking document review.</p>
      )}
      {!pricing && (
        <div style={{ marginTop: 16 }}>
          <BookingCommercialFacts reviewedBooking={reviewedBooking} />
        </div>
      )}
      {/* booking_amount_paid is a payment, not a priced deal component --
          it belongs on the Payments panel (already shown there), not
          compared against a "standard" price it never had. */}
      <DealTotalsStrip model={dealModel} />
      <CommercialLinesTable model={dealModel} />
      <div style={{ marginTop: 24 }}>
        <DiscountsPanel model={model} />
      </div>
    </>
  );
}

function CommercialLinesTable({ model }: { model: JourneyOverview }) {
  if (model.commercialLines.length === 0) return null;
  const invoiceColumnsOn = dealHasAnyInvoiceColumn(model.dealSourceBreakdown);
  return (
    <div className="jline__tableWrap" style={{ marginTop: 16 }}>
      <table className="jline__table">
        <thead>
          <tr>
            <th>Component</th>
            <th>Standard</th>
            {invoiceColumnsOn ? (
              <>
                <th>Retail Invoice</th>
                <th>Tax Invoice</th>
              </>
            ) : (
              <th>Actual</th>
            )}
          </tr>
        </thead>
        <tbody>
          {model.commercialLines.map((line) => {
            const currency = String(line.currencyCode || 'INR');
            const componentKey = String(line.componentKey);
            if (!invoiceColumnsOn) {
              return (
                <tr key={String(line.commercialLineId)}>
                  <td>{readable(componentKey)}</td>
                  <td>{money(line.standardAmount, currency)}</td>
                  <td>{money(line.actualAmount, currency)}</td>
                </tr>
              );
            }
            const sources = allSourceValuesFor(model.dealSourceBreakdown, componentKey);
            const { retail, tax } = bucketInvoiceColumns(sources);
            // Neither invoice bucket has reported this line yet -- fall
            // back to whatever is currently known (the Booking Form,
            // since an invoice always wins once one exists) so the row
            // never goes blank just because no invoice covers it yet.
            const retailValue = retail ? retail.amount : line.actualAmount;
            const retailIsFallback = !retail && line.actualAmount !== null && line.actualAmount !== undefined;
            const disagree = retail && tax && Math.abs(retail.amount - tax.amount) > 1;
            return (
              <tr key={String(line.commercialLineId)}>
                <td>{readable(componentKey)}</td>
                <td>{money(line.standardAmount, currency)}</td>
                <td className={disagree ? 'jline__delta--over' : undefined}>
                  {money(retailValue, currency)}
                  {retailIsFallback ? <span className="jline__invoiceColFallback"> (Booking Form)</span> : null}
                </td>
                <td className={disagree ? 'jline__delta--over' : undefined}>{tax ? money(tax.amount, currency) : '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Applicable = evidence_status: MISSING/PENDING/VERIFIED reflect only
 * conditional discounts (corporate/exchange/scrappage); a plain cash or
 * value-in-kind discount has no such concept and shows nothing here. */
function evidenceBadge(status: unknown): React.ReactNode {
  const s = String(status || '').toUpperCase();
  if (s === 'VERIFIED') return <span className="jline__evidence jline__evidence--ok">Applicable</span>;
  if (s === 'MISSING') return <span className="jline__evidence jline__evidence--missing">Not Applicable</span>;
  if (s === 'PENDING') return <span className="jline__evidence jline__evidence--pending">Pending</span>;
  return null;
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
            <thead><tr><th>Scheme / benefit</th><th>Entitled</th><th>Given</th><th>Status</th></tr></thead>
            <tbody>
              {rows.map((d) => {
                const std = d.standardEligibleAmount === null || d.standardEligibleAmount === undefined ? null : Number(d.standardEligibleAmount);
                const act = d.actualDiscountAmount === null || d.actualDiscountAmount === undefined ? null : Number(d.actualDiscountAmount);
                const over = std !== null && act !== null && act - std > 1;
                const sources = sourceValuesFor(model.dealSourceBreakdown, 'DISCOUNT', String(d.discountKey));
                return (
                  <Fragment key={String(d.discountApplicationId)}>
                    <tr>
                      <td>{readable(d.discountKey)}</td>
                      <td>{money(std)}</td>
                      <td className={over ? 'jline__delta--over' : String(d.eligibilityResult).toUpperCase() === 'ELIGIBLE_UNCLAIMED' ? 'jline__delta--under' : ''}>{money(act)}</td>
                      <td>
                        <span className="jline__statusCell">
                          <span>{readable(d.eligibilityResult)}</span>
                          {evidenceBadge(d.evidenceStatus)}
                        </span>
                      </td>
                    </tr>
                    <DiscountSourceRows sources={sources} />
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

/** Total Standard vs Total Actual, net of discounts -- the same figures
 * uc03_deal_reconciliation.py::_sync_total_variance computes server-side
 * (which is what actually raises the flag below); this just presents the
 * same two sums for the deal already loaded, so it stays in lockstep with
 * the backend by construction rather than a second, possibly-drifting
 * computation. */
function DealTotalsStrip({ model }: { model: JourneyOverview }) {
  const lines = model.commercialLines || [];
  const discounts = model.discounts || [];
  const hasAnyActual = lines.some((l) => l.actualAmount !== null && l.actualAmount !== undefined);
  if (!hasAnyActual) return null;

  const sum = (values: Array<unknown>) =>
    values.reduce((total: number, v) => total + (v === null || v === undefined ? 0 : Number(v)), 0);
  const standardNet = sum(lines.map((l) => l.standardAmount)) - sum(discounts.map((d) => d.standardEligibleAmount));
  const actualNet = sum(lines.map((l) => l.actualAmount)) - sum(discounts.map((d) => d.actualDiscountAmount));
  const variance = actualNet - standardNet;

  const flagged = (model.findings || []).find(
    (f) =>
      String(f.ruleKey || '') === 'DEAL_TOTAL_VARIANCE_NEGATIVE' &&
      ['OPEN', 'ACKNOWLEDGED'].includes(String(f.findingStatus || '')),
  );

  const tone = flagged ? 'flagged' : variance > 1 ? 'over' : variance < -1 ? 'under' : 'even';
  const label =
    tone === 'flagged' ? 'Below standard — flagged for Team Lead'
    : tone === 'over' ? 'Above standard'
    : tone === 'under' ? 'Below standard'
    : 'Matches standard';

  return (
    <div className={`jline__totalsStrip jline__totalsStrip--${tone}`}>
      <div className="jline__totalsStrip__cell">
        <span>Total Standard</span>
        <strong>{money(standardNet)}</strong>
      </div>
      <div className="jline__totalsStrip__cell">
        <span>Total Actual</span>
        <strong>{money(actualNet)}</strong>
      </div>
      <div className="jline__totalsStrip__cell jline__totalsStrip__variance">
        <span>Variance</span>
        <strong>{variance > 0 ? '+' : ''}{money(variance)}</strong>
        <em>{label}</em>
      </div>
    </div>
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
  reviewedBooking,
}: {
  model: JourneyOverview;
  receipts: Array<Record<string, unknown>>;
  reviewedBooking: Record<string, unknown> | null;
}) {
  const matched = receipts.filter((r) => String((objectValue(r, 'bankMatch') || {}).status).toUpperCase() === 'MATCHED').length;
  const unmatched = receipts.filter((r) => String((objectValue(r, 'bankMatch') || {}).status).toUpperCase() === 'UNMATCHED').length;
  const duplicateCount = receipts.filter((r) => pick(r, 'isDuplicate') === true).length;
  // A duplicate receipt (same physical receipt uploaded more than once --
  // see the DUPLICATE_RECEIPT audit finding) must never be counted twice
  // toward what the customer paid. The server already tells us which of
  // each duplicate group is the excess one (isDuplicate) -- exclude it
  // here rather than re-deriving the match client-side.
  const total = receipts.reduce((s, r) => {
    if (pick(r, 'isDuplicate') === true) return s;
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
    (p) =>
      !receiptDocumentIds.has(pickStr(p, 'sourceEvidenceId', 'source_evidence_id')) &&
      // A receipt materialized straight into auditcore.payments without a
      // dealer_receipt_review_values row (see _receipts()'s own fallback)
      // never carries a sourceEvidenceId match against the receipts list --
      // its identity there is the DI document id, not an evidence id -- so
      // without this it showed up a second time here too, with a "Status:
      // Not available" ledger row duplicating the already-correct receipt
      // row above it.
      !receiptDocumentIds.has(pickStr(p, 'sourceDiDocumentId', 'source_di_document_id')),
  );
  // A journey whose payments were all reconciled straight off the bank
  // statement (no separately-reviewed receipt document) has receipts.length
  // === 0, which used to blank out the "Payments / Receipts" hint entirely
  // -- the section header showed no total at all even though the
  // ledger-only table below it lists real amounts. Sum across both so the
  // sum-of-payments total is always there regardless of which of the two
  // tables actually holds this journey's payments.
  const ledgerOnlyTotal = ledgerOnly.reduce((s, p) => {
    const a = Number(pick(p, 'amount', 'amount_paid') ?? 0);
    return s + (Number.isNaN(a) ? 0 : a);
  }, 0);
  const combinedTotal = total + ledgerOnlyTotal;
  const combinedCount = receipts.filter((r) => pick(r, 'isDuplicate') !== true).length + ledgerOnly.length;
  const invoices = model.invoices || [];
  const invoiceTotal = invoices.reduce((s, inv) => {
    const a = Number(pick(inv, 'grandTotalAmount', 'grand_total_amount') ?? 0);
    return s + (Number.isNaN(a) ? 0 : a);
  }, 0);
  const noReceiptsAtAll = receipts.length === 0 && ledgerOnly.length === 0;

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
        hint={combinedCount > 0 ? `${money(combinedTotal)} collected across ${combinedCount} payment${combinedCount !== 1 ? 's' : ''}${receipts.length > 0 ? ` · ${matched} bank-matched · ${unmatched} unmatched` : ''}${duplicateCount > 0 ? ` · ${duplicateCount} duplicate${duplicateCount === 1 ? '' : 's'} excluded` : ''}` : undefined}
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
                      const isDuplicate = pick(r, 'isDuplicate') === true;
                      const needsAttention = !isDuplicate && (matchStatus === 'UNMATCHED' || matchStatus === 'AMBIGUOUS');
                      return (
                        <tr
                          key={String(pick(r, 'documentId', 'evidenceId') ?? idx)}
                          className={needsAttention ? 'jline__row--attention' : isDuplicate ? 'jline__row--duplicate' : undefined}
                        >
                          <td>{pickStr(r, 'receiptNumber', 'receipt_number') || '—'}</td>
                          <td>{dateLabel(pick(r, 'receiptDate', 'receipt_date'))}</td>
                          <td>{readable(pick(r, 'paymentMode', 'payment_mode', 'paymentMethodCode', 'payment_method_code'))}</td>
                          <td className={isDuplicate ? 'jline__amount--excluded' : undefined}>
                            {money(pick(r, 'amount', 'amount_paid'), String(pick(r, 'currencyCode', 'currency_code') || 'INR'))}
                          </td>
                          <td>{isDuplicate ? <span className="rcpt-duplicate-pill">Duplicate — excluded</span> : (bankMatchPill(objectValue(r, 'bankMatch')) ?? '—')}</td>
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
                  <thead><tr><th>Date</th><th>Receipt No.</th><th>Reference</th><th>Mode</th><th>Status</th><th>Amount</th></tr></thead>
                  <tbody>
                    {ledgerOnly.map((p, i) => (
                      <tr key={String(p.paymentId || i)}>
                        <td>{dateLabel(pick(p, 'paymentAtUtc', 'payment_at_utc'))}</td>
                        <td>{String(pick(p, 'receiptNumber', 'receipt_number') || '—')}</td>
                        <td>{String(pick(p, 'paymentReference', 'payment_reference') || '—')}</td>
                        <td>{readable(pick(p, 'paymentMethodCode', 'payment_method_code'))}</td>
                        <td>{readable(pick(p, 'verificationResult', 'verification_result'))}</td>
                        <td>{money(pick(p, 'amount', 'amount_paid'), String(pick(p, 'currencyCode', 'currency_code') || 'INR'))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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

// A summary, not a third full list. This used to render every finding as
// its own card, independently of both Audit Review (/audit/:id) and Task
// Queue -- three separately-styled implementations of "show findings for
// a journey" that could (and did) drift out of sync with each other, and
// for every finding except a plain document gap, clicking the card just
// jumped straight to Audit Review anyway (an extra click, no extra info).
// A PC's permittedActions never include anything on a Violation -- the
// only thing a PC can ever act on is a self-serve gap, and that's fixed
// on Journey Documents, not read about here -- so PC gets a document-gap
// count + a direct link there; TL/PM get the full open/severity breakdown
// (their actual oversight job) + a link into the real register, Audit
// Review, rather than a duplicate of it.
// Shows every open finding, not just a count -- a count alone answers
// "how many" but not "what", which is the actual reason to look here.
// What changed instead: a PC's own Violations (which they can never act on
// anywhere -- Audit Review redirects them away entirely, see #286) are
// listed but not clickable, since there's genuinely nowhere useful to send
// that click; a self-serve gap (DATA_GAP/DOCUMENT_GAP) still opens the
// capture screen for every role, and TL/PM's Violations still open Audit
// Review, exactly as before.
function FlagsPanel({ model, role, onSelectAspect }: { model: JourneyOverview; role?: string; onSelectAspect: (key: AspectKey) => void }) {
  const all = model.findings || [];
  const [showResolved, setShowResolved] = useState(false);
  const open = all.filter((f) => ['OPEN', 'ACKNOWLEDGED'].includes(String(f.findingStatus || '')));
  const shown = showResolved ? all : open;
  const navigate = useNavigate();
  const journeyId = String((model.journey as Record<string, unknown>)?.journeyId ?? '');
  const isPc = role === 'PC';

  const counts: Record<string, number> = {};
  for (const f of open) {
    const key = String(f.findingClass || 'UNCLASSIFIED').toUpperCase();
    counts[key] = (counts[key] || 0) + 1;
  }

  return (
    <>
      <PanelHead
        title="Flags — audit findings"
        hint={`${open.length} open of ${all.length}`}
      />
      {open.length > 0 && (
        <div className="jline__flagsSummary">
          {Object.entries(counts).map(([key, count]) => (
            <span key={key} className={`jline__flagsSummaryChip jline__flagsSummaryChip--${key.toLowerCase()}`}>
              {FINDING_CLASS_LABEL[key] || readable(key)} <strong>{count}</strong>
            </span>
          ))}
        </div>
      )}
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
            const isOpen = ['OPEN', 'ACKNOWLEDGED'].includes(String(f.findingStatus || ''));
            const isDocumentGap = findingClass === 'DOCUMENT_GAP' || findingClass === 'DATA_GAP';
            const isDeliveryStage = String(f.stageCode || '').toUpperCase() === 'DELIVERY';
            // PC can never act on a Violation anywhere -- Audit Review
            // redirects them straight back here (#286) -- so a Violation
            // row is informational only for PC, not a dead-end click.
            const clickable = isOpen && (isDocumentGap || !isPc);
            const goToTarget = () => {
              if (!clickable) return;
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
                role={clickable ? 'button' : undefined}
                tabIndex={clickable ? 0 : undefined}
                style={{ cursor: clickable ? 'pointer' : 'default' }}
                onClick={clickable ? goToTarget : undefined}
                onKeyDown={
                  clickable
                    ? (e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          goToTarget();
                        }
                      }
                    : undefined
                }
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
                    {clickable ? <>{' · '}{isDocumentGap ? '→ Upload document' : '→ Audit view'}</> : null}
                  </small>
                </div>
                <div>
                  <StatusPill value={sev} compact />
                  {Boolean(f.slaDueAtUtc) && isOpen && <div className="jline__findingSla">SLA {dateLabel(f.slaDueAtUtc)}</div>}
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
  reviewedBooking,
  onSelectAspect,
  tenantId,
  journeyId,
  accessToken,
  role,
}: {
  aspect: AspectKey;
  model: JourneyOverview;
  receipts: Array<Record<string, unknown>>;
  reviewedBooking: Record<string, unknown> | null;
  onSelectAspect: (key: AspectKey) => void;
  tenantId: string;
  journeyId: string;
  accessToken?: string;
  role?: string;
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
          tenantId={tenantId}
          journeyId={journeyId}
          accessToken={accessToken}
          role={role}
        />
      );
      break;
    case 'invoice':
      body = <InvoicesPanel invoices={model.invoices || []} documents={model.evidence} />;
      break;
    case 'payments':
      // Bank statements is a sub-section here now (merged from its own
      // former tab); Discounts is the same, folded into Deal above.
      body = <PaymentsPanel model={model} receipts={receipts} reviewedBooking={reviewedBooking} />;
      break;
    case 'documents':
      body = (
        <>
          <PanelHead title="Documents" hint="Pick a document to open the file and see only its own extracted values." />
          <DocumentSelector
            tenantId={tenantId}
            journeyId={journeyId}
            accessToken={accessToken}
            documents={model.evidence}
            reviewedFields={model.reviewedFields || []}
          />
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
    case 'tradeIn': {
      // scrappageCertificates (auditcore.scrappage_certificate_review_
      // values) is a separate concept from tradeIn (auditcore.trade_in_
      // cases) -- a customer scrapping their old vehicle via an RVSF is not
      // the same transaction as trading it in to the dealer against this
      // deal's price -- but this panel is titled "Trade-in / Scrappage" and
      // previously only ever read tradeIn, so a fully extracted, fully
      // materialized Scrappage Certificate of Deposit (certificate number,
      // old-vehicle details, current holder) never showed anywhere on this
      // page. The backend has exposed this on JourneyOverview all along
      // (_scrappage_certificates); this panel simply never read it.
      const scrappageCertificates = model.scrappageCertificates || [];
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
          ) : scrappageCertificates.length === 0 ? (
            <p className="jline__empty">No trade-in or scrappage record beyond the booking's exchange fields.</p>
          ) : null}
          {scrappageCertificates.map((cert, idx) => (
            <div key={String(pick(cert, 'scrappageCertificateReviewValueId') ?? idx)} style={{ marginTop: idx === 0 && !model.tradeIn ? 0 : 16 }}>
              <PanelHead title={readable(pickStr(cert, 'certificateVariant') || 'Scrappage Certificate')} />
              <FactList>
                <JFact label="Certificate No.">{textValue(cert, 'certificateNumber')}</JFact>
                <JFact label="Issue Date">{dateLabel(value(cert, 'certificateIssueDate'))}</JFact>
                <JFact label="Valid Until">{dateLabel(value(cert, 'certificateValidUntilDate'))}</JFact>
                <JFact label="Old Vehicle Reg. No.">{textValue(cert, 'oldVehicleRegistrationNumber')}</JFact>
                <JFact label="Old Vehicle Make">{textValue(cert, 'oldVehicleMake')}</JFact>
                <JFact label="Old Vehicle Model">{textValue(cert, 'oldVehicleModel')}</JFact>
                <JFact label="Old Vehicle Type">{textValue(cert, 'oldVehicleType')}</JFact>
                <JFact label="Fuel Type">{textValue(cert, 'oldVehicleFuelType')}</JFact>
                <JFact label="Year of Manufacture">{textValue(cert, 'oldVehicleYearOfManufacturing')}</JFact>
                <JFact label="Original Owner">{textValue(cert, 'originalOwnerName')}</JFact>
                <JFact label="Current Holder">{textValue(cert, 'currentHolderName')}</JFact>
                <JFact label="Trade No.">{textValue(cert, 'tradeNumber')}</JFact>
                <JFact label="Trade Date">{dateLabel(value(cert, 'tradeDate'))}</JFact>
                <JFact label="Scrapping Facility">{textValue(cert, 'scrappingFacilityName')}</JFact>
                <JFact label="RVSF Registration No.">{textValue(cert, 'rvsfRegistrationNumber')}</JFact>
                <JFact label="State of Scrapping">{textValue(cert, 'stateOfScrapping')}</JFact>
              </FactList>
            </div>
          ))}
        </>
      );
      break;
    }
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
    case 'registration': {
      // registration_charges/road_tax_amount are both canonical commercial-
      // line components (uc03_v2_review_materialization._COMMERCIAL_LINE_
      // FIELDS) -- auditcore.commercial_lines.actual_amount already carries
      // whatever the invoice reconciliation program resolved (invoice
      // precedence over the raw booking form, per-source breakdown
      // available). Reading reviewedBooking directly here always showed the
      // stale, pre-reconciliation booking-form value instead, the same gap
      // already fixed for Insurance/Accessories/Finance elsewhere on this
      // page. Falls back to the booking form only when no commercial line
      // has been materialized yet (e.g. before any invoice is uploaded).
      const registrationChargesLine = commercialLineByComponentKey(model, 'registration_charges');
      const roadTaxLine = commercialLineByComponentKey(model, 'road_tax_amount');
      const registrationCharges = registrationChargesLine
        ? value(registrationChargesLine, 'actualAmount')
        : value(reviewedBooking, 'registration_charges');
      const roadTax = roadTaxLine ? value(roadTaxLine, 'actualAmount') : value(reviewedBooking, 'road_tax_amount');
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
              <JFact label="Registration Charges">{money(registrationCharges)}</JFact>
              <JFact label="Road Tax">{money(roadTax)}</JFact>
              <JFact label="Status">{readable(value(model.registration, 'actualStatusCode'))}</JFact>
            </FactList>
          ) : (
            <p className="jline__empty">Registration details are not available yet.</p>
          )}
        </>
      );
      break;
    }
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
              <JFact label="Agent/Intermediary">{textValue(model.insurance, 'agentIntermediaryName')}</JFact>
              <JFact label="Agent/Intermediary Code">{textValue(model.insurance, 'agentIntermediaryCode')}</JFact>
              <JFact label="MISP Code">{textValue(model.insurance, 'mispCode')}</JFact>
              <JFact label="Add-ons Taken">{listText(model.insurance, 'insuranceAddOns')}</JFact>
              <JFact label="Self Insurance">{readable(value(model.insurance, 'selfInsuranceFlag'))}</JFact>
              <JFact label="Status">{readable(value(model.insurance, 'actualStatusCode'))}</JFact>
            </FactList>
          ) : (
            <p className="jline__empty">No insurance record is available.</p>
          )}
        </>
      );
      break;
    case 'finance': {
      // "Financed Amount" here is deliberately the RTO Challan's own
      // hypothecation charges (materialize_delivery_finance), not the loan
      // principal -- confirmed correct, per explicit ask. Registration
      // charges is a separate commercial-line component (same reconciled,
      // invoice-precedence source the Registration tab reads, #308) that
      // never showed anywhere on this tab even though it combines with
      // hypothecation charges into what the dealer actually collects for
      // registration/financing together.
      const registrationChargesLine = commercialLineByComponentKey(model, 'registration_charges');
      const registrationCharges = registrationChargesLine
        ? value(registrationChargesLine, 'actualAmount')
        : value(reviewedBooking, 'registration_charges');
      const financedAmount = value(model.finance, 'financedAmount');
      const hasEitherCharge = financedAmount !== null && financedAmount !== undefined
        || (registrationCharges !== null && registrationCharges !== undefined);
      const totalCharges = hasEitherCharge
        ? (Number(financedAmount) || 0) + (Number(registrationCharges) || 0)
        : null;
      body = (
        <>
          <PanelHead title="Finance" />
          {model.finance ? (
            <FactList>
              <JFact label="Type">{readable(value(model.finance, 'financeTypeCode'))}</JFact>
              <JFact label="Provider">{textValue(model.finance, 'providerName')}</JFact>
              <JFact label="DO Reference">{textValue(model.finance, 'doReference')}</JFact>
              <JFact label="PO Reference">{textValue(model.finance, 'poReference')}</JFact>
              <JFact label="Financed Amount (Hypothecation Charges)">{money(financedAmount)}</JFact>
              <JFact label="Registration Charges">{money(registrationCharges)}</JFact>
              <JFact label="Total Charges">{totalCharges === null ? '—' : money(totalCharges)}</JFact>
              <JFact label="Status">{readable(value(model.finance, 'actualStatusCode'))}</JFact>
              <JFact label="Loan Disbursement Amount">{money(value(model.finance, 'loanDisbursementAmount'))}</JFact>
              <JFact label="Loan Disbursement Confidence">{readable(value(model.finance, 'loanDisbursementConfidence'))}</JFact>
              <JFact label="Loan Disbursement Basis">{textValue(model.finance, 'loanDisbursementMatchBasis')}</JFact>
            </FactList>
          ) : (
            <p className="jline__empty">No finance record is available — this booking is presumed cash/outright purchase.</p>
          )}
        </>
      );
      break;
    }
    case 'flags':
    default:
      body = <FlagsPanel model={model} role={role} onSelectAspect={onSelectAspect} />;
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

  // The main overview response never carried insurance/finance at all --
  // confirmed live, reported repeatedly ("insurance fields extracted but
  // not shown in Journey 360"): the Insurance/Finance panels below and the
  // JourneyOverview type itself have always expected model.insurance/
  // model.finance, but nothing populated either field -- not a display bug,
  // a genuinely missing fetch. get_insurance/get_finance (dedicated GET
  // endpoints, already reading auditcore.insurance_records/finance_records)
  // and their web callers (getInsurance/getFinance in operations.ts) both
  // already existed and worked; this page just never called them. Both
  // 404 when no record exists yet (the normal case before Insurance Cover/
  // a financier's document is confirmed) -- treated as "no record" (null),
  // not a query error, matching what the panels below already render for.
  const insuranceQuery = useQuery({
    queryKey: ['uc03-journey-insurance', tenantId, journeyId],
    queryFn: async () => {
      try {
        return await getInsurance(tenantId, journeyId, accessToken);
      } catch (error) {
        if (error instanceof AuditCoreHttpError && error.status === 404) return null;
        throw error;
      }
    },
    enabled: Boolean(accessToken && tenantId && journeyId),
    staleTime: 15_000,
  });
  const financeQuery = useQuery({
    queryKey: ['uc03-journey-finance', tenantId, journeyId],
    queryFn: async () => {
      try {
        return await getFinance(tenantId, journeyId, accessToken);
      } catch (error) {
        if (error instanceof AuditCoreHttpError && error.status === 404) return null;
        throw error;
      }
    },
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

  const [runningAllRules, setRunningAllRules] = useState(false);
  const [runAllRulesMessage, setRunAllRulesMessage] = useState<string>();
  const handleRunAllRules = async () => {
    if (!tenantId || !journeyId) return;
    setRunningAllRules(true);
    setRunAllRulesMessage(undefined);
    try {
      // No DI call here -- unlike Resync, this only re-checks rules against
      // whatever is already durably stored, so it's safe (and cheap) to
      // press whenever a PC/TL/PM wants a fresh read without waiting for
      // the next document event.
      const outcome = await runAllApplicableRules(tenantId, journeyId, accessToken);
      const byOutcome = outcome.results.reduce<Record<string, number>>((acc, r: Uc03RunAllRulesRuleResult) => {
        acc[r.outcome] = (acc[r.outcome] || 0) + 1;
        return acc;
      }, {});
      const parts = [
        byOutcome.FAIL ? `${byOutcome.FAIL} failed` : null,
        byOutcome.PASS ? `${byOutcome.PASS} passed` : null,
        byOutcome.SKIPPED ? `${byOutcome.SKIPPED} not applicable` : null,
        byOutcome.ERROR ? `${byOutcome.ERROR} errored` : null,
      ].filter((p): p is string => p !== null);
      setRunAllRulesMessage(
        outcome.results.length === 0
          ? 'No applicable rules found for this Journey yet.'
          : `Ran ${outcome.results.length} rule${outcome.results.length === 1 ? '' : 's'} across ${outcome.stagesEvaluated.join(' & ')} · ${parts.join(' · ')}`,
      );
      void queryClient.invalidateQueries({ queryKey: ['uc03-journey-overview', tenantId, journeyId] });
    } catch {
      setRunAllRulesMessage('Could not run rules. Try again in a moment.');
    } finally {
      setRunningAllRules(false);
    }
  };

  const model = overviewQuery.data
    ? { ...overviewQuery.data, insurance: insuranceQuery.data ?? null, finance: financeQuery.data ?? null }
    : undefined;

  const receiptRows = useMemo(() => (model?.receipts || []).filter((r) => !receiptIsPending(r)), [model?.receipts]);

  const steps = useMemo(() => (model ? deriveSteps(model).steps : []), [model]);
  const aspects = useMemo(() => (model ? deriveAspects(model) : []), [model]);
  const openCount = useMemo(() => (model ? openFindings(model).length : 0), [model]);
  const documentCounts = useMemo(
    () => documentExtractionCounts(model?.evidence || [], model?.reviewedFields || []),
    [model?.evidence, model?.reviewedFields],
  );
  const failedExtractionCount = useMemo(
    () => (model?.evidence || []).filter((doc) => doc.processingStatus === 'FAILED').length,
    [model?.evidence],
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
          <span>✔ Booking submitted successfully. Document extraction is still running in the background — check back in a few minutes and refresh to see extracted values.</span>
          <button type="button" className="journey-360-banner-dismiss" aria-label="Dismiss" onClick={() => setShowSubmitBanner(false)}>×</button>
        </div>
      )}

      <div className="journey-360-topline">
        <Link className="journey-360-back" to="/search">← Search results</Link>
        <div className="journey-360-actions">
          <button type="button" disabled={resyncing} onClick={() => void handleResync()}>
            {resyncing ? 'Resyncing…' : 'Resync Documents'}
          </button>
          <button type="button" disabled={runningAllRules} onClick={() => void handleRunAllRules()}>
            {runningAllRules ? 'Running Rules…' : 'Run All Applicable Rules'}
          </button>
          <Link to={`/journeys/${journeyId}/documents`}>Open Documents</Link>
          {selectedProject?.operatingRole !== 'PC' && (
            <Link className="journey-360-actions__primary" to={`/audit/${journeyId}`}>Audit Review</Link>
          )}
        </div>
      </div>
      {resyncMessage && (
        <p className="journey-360-resync-message" role="status">{resyncMessage}</p>
      )}
      {runAllRulesMessage && (
        <p className="journey-360-resync-message" role="status">{runAllRulesMessage}</p>
      )}

      <PageHeader
        eyebrow={`${textValue(model.journey, 'dealerName')} · ${textValue(model.journey, 'outletName')}`}
        title={customerName}
        description={`Dealer Booking ${bookingReference} · ${productLabel}`}
        actions={<div className="header-statuses"><StatusPill value={String(bookingStatus) === 'CLOSED' ? 'BOOKING_COMPLETE' : String(bookingStatus || 'NOT_STARTED')} /><StatusPill value={String(deliveryStatus || 'NOT_STARTED')} /></div>}
      />

      <div className="jline">
        <DocumentProgressStrip {...documentCounts} />
        <FailedExtractionBanner count={failedExtractionCount} />
        <JourneyLine steps={steps} />
        <AspectChips aspects={aspects} active={activeAspect} onSelect={setAspect} />
        <FocusPanel
          aspect={activeAspect}
          model={model}
          receipts={receiptRows}
          reviewedBooking={reviewedBooking}
          onSelectAspect={setAspect}
          tenantId={tenantId}
          journeyId={journeyId}
          accessToken={accessToken}
          role={selectedProject?.operatingRole}
        />
      </div>
    </div>
  );
}
