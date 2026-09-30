import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  getLoanDisbursementCandidates,
  putLoanDisbursement,
} from '../../../services/audit-core/operations';
import {
  confirmModelResolutionSku,
  proposeModelSelectionCorrection,
} from '../../../services/audit-core/uc03ModelResolution';
import {
  getP2Pricing,
  getP2PricingCatalog,
  recheckP2Journey,
  setP2Pricing,
  type P2CatalogSku,
  type P2Pricing,
} from '../../../services/audit-core/uc03P2';
import { formatDateTime, humanizeKey } from '../workspace/p2Format';
import { money } from './j360Format';

type Props = { tenantId: string; journeyId: string; accessToken?: string };

function errorText(cause: unknown, fallback: string): string {
  return cause instanceof Error && cause.message ? cause.message : fallback;
}

/** "Price list name v3 · effective from 01 Jul 2026": which master applies. */
function priceListLabel(ref: P2Pricing['appliedPriceList']): string {
  if (!ref) return 'no price list effective';
  return `${ref.priceList ?? 'Price list'} v${ref.version ?? '?'}`;
}

function dateLabel(value?: string | null): string {
  if (!value) return '—';
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
}

export function useRefreshDeal(tenantId: string, journeyId: string) {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ['p2-pricing', tenantId, journeyId] });
    void queryClient.invalidateQueries({ queryKey: ['p2-360', tenantId, journeyId] });
    void queryClient.invalidateQueries({ queryKey: ['p2-tasks', tenantId] });
  };
}

// ── Pricing date + model ────────────────────────────────────────────────────
/**
 * Which price masters price this deal. Standard prices and scheme
 * entitlements come from the price-list and scheme versions effective on
 * the pricing date -- the booking date on the booking form unless someone
 * applies the invoice date with a reason; no other date is offered. With
 * no booking date the deal is not priced (never on today): a task asks the
 * PC to enter it on the form. The model is picked from the price masters
 * of that same date.
 */
export function PricingPanel({ tenantId, journeyId, accessToken }: Props) {
  const refresh = useRefreshDeal(tenantId, journeyId);
  const pricing = useQuery({
    queryKey: ['p2-pricing', tenantId, journeyId],
    queryFn: () => getP2Pricing(tenantId, journeyId, accessToken),
    staleTime: 15_000,
  });
  const [editing, setEditing] = useState(false);
  const [picking, setPicking] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string }>();
  const p = pricing.data;

  if (pricing.isError) {
    return <div className="p2w-alert p2w-alert--error" role="alert">Pricing could not be loaded. {errorText(pricing.error, '')}</div>;
  }
  if (!p) return <div className="p2w-skeleton">Loading pricing…</div>;
  const invoiceOption = p.options.find((o) => o.basis === 'INVOICE_DATE');

  return (
    <section className="j360-card j360-pricing" aria-label="Pricing and model">
      <div className="j360-pricing__row">
        <div>
          <span className="j360-label">Vehicle (SKU)</span>
          <strong>{[p.sku.model, p.sku.variant, p.sku.colour].filter(Boolean).join(' · ') || 'Not identified yet'}</strong>
          <span className="p2w-muted">{p.sku.skuCode ?? ''}{p.sku.selectionStatus ? ` · ${humanizeKey(p.sku.selectionStatus)}` : ''}</span>
        </div>
        <div>
          <span className="j360-label">Priced on</span>
          {p.appliedDate ? (
            <>
              <strong>{dateLabel(p.appliedDate)} <span className="p2w-muted">({p.basis === 'INVOICE_DATE' ? 'invoice date' : 'booking date'})</span></strong>
              <span className="p2w-muted">
                {p.appliedPriceList ? priceListLabel(p.appliedPriceList) : 'No price list effective on this date'}
                {` · ${p.appliedSchemeCount} scheme${p.appliedSchemeCount === 1 ? '' : 's'}`}
              </span>
            </>
          ) : (
            <>
              <strong>Not priced yet</strong>
              <span className="p2w-muted">The booking form has no booking date. A task asks the PC to enter it on the form.</span>
            </>
          )}
        </div>
        <div>
          <span className="j360-label">Price master w.e.f.</span>
          <strong>{p.appliedPriceList?.effectiveFrom ? dateLabel(p.appliedPriceList.effectiveFrom) : '—'}</strong>
        </div>
        <div className="j360-pricing__actions">
          <button type="button" className="p2w-button p2w-button--secondary" onClick={() => setPicking(true)}>
            {p.sku.productSkuId ? 'Change model' : 'Pick model'}
          </button>
          <button type="button" className="p2w-button p2w-button--ghost" onClick={() => setEditing((v) => !v)}>Pricing date</button>
        </div>
      </div>
      {invoiceOption?.differsFromApplied && p.basis !== 'INVOICE_DATE' ? (
        <p className="p2w-alert" role="note">
          The invoice is dated {dateLabel(invoiceOption.date)}, when different price masters were effective
          {invoiceOption.priceList ? ` (${priceListLabel(invoiceOption.priceList)})` : ''}.
          Apply the invoice date if the deal belongs under those.
        </p>
      ) : null}
      {p.reason && p.basis !== 'BOOKING_DATE' ? (
        <p className="p2w-muted">Reason: {p.reason}{p.setAtUtc ? ` · ${formatDateTime(p.setAtUtc)}` : ''}</p>
      ) : null}
      {notice ? <div className={`p2w-alert p2w-alert--${notice.tone}`} role="status">{notice.text}</div> : null}
      {editing ? (
        <PricingDateForm pricing={p} tenantId={tenantId} journeyId={journeyId} accessToken={accessToken}
          onDone={(text) => { setEditing(false); setNotice({ tone: 'success', text }); refresh(); }} />
      ) : null}
      {picking ? (
        <ModelPickerDialog pricing={p} tenantId={tenantId} journeyId={journeyId} accessToken={accessToken}
          onClose={() => setPicking(false)}
          onDone={(text) => { setPicking(false); setNotice({ tone: 'success', text }); refresh(); }} />
      ) : null}
    </section>
  );
}

function PricingDateForm({ pricing, tenantId, journeyId, accessToken, onDone }: Props & {
  pricing: P2Pricing; onDone: (message: string) => void;
}) {
  const [basis, setBasis] = useState<P2Pricing['basis']>(pricing.basis);
  const [reason, setReason] = useState('');
  const save = useMutation({
    mutationFn: () => setP2Pricing(tenantId, journeyId, { basis, reason: reason.trim() || undefined }, accessToken),
    onSuccess: (result) => onDone(result.repriced
      ? `Deal re-priced on ${dateLabel(result.appliedDate)}. The checks are running again.`
      : `Pricing date set to ${dateLabel(result.appliedDate)}. Prices update once the model is identified.`),
  });
  const needsReason = basis !== 'BOOKING_DATE';
  const bookingOption = pricing.options.find((o) => o.basis === 'BOOKING_DATE');
  const invoiceOption = pricing.options.find((o) => o.basis === 'INVOICE_DATE');
  // Two choices only: the booking date on the booking form, or the invoice date.
  return (
    <form className="j360-pricing__form" onSubmit={(event) => { event.preventDefault(); save.mutate(); }}>
      <fieldset>
        <legend>Price the deal on</legend>
        <label className="p2w-check">
          <input type="radio" checked={basis === 'BOOKING_DATE'} disabled={!pricing.bookingDate} onChange={() => setBasis('BOOKING_DATE')} />
          {' '}Booking date{pricing.bookingDate ? ` (${dateLabel(pricing.bookingDate)}) · ${priceListLabel(bookingOption?.priceList ?? null)}` : ' (not on the booking form yet: enter it there first)'}
        </label>
        <label className="p2w-check">
          <input type="radio" checked={basis === 'INVOICE_DATE'} disabled={!pricing.invoiceDate} onChange={() => setBasis('INVOICE_DATE')} />
          {' '}Invoice date{pricing.invoiceDate ? ` (${dateLabel(pricing.invoiceDate)}) · ${priceListLabel(invoiceOption?.priceList ?? null)}` : ' (no invoice read yet)'}
        </label>
      </fieldset>
      {needsReason ? (
        <label className="j360-pricing__reason">
          <span>Reason</span>
          <textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why this deal belongs under the invoice date's price master" required />
        </label>
      ) : null}
      {save.isError ? <div className="p2w-alert p2w-alert--error" role="alert">{errorText(save.error, 'The pricing date could not be saved.')}</div> : null}
      <div className="p2w-dialog__actions">
        <button type="submit" className="p2w-button p2w-button--primary"
          disabled={save.isPending || (needsReason && reason.trim().length < 5) || (basis === 'BOOKING_DATE' && !pricing.bookingDate)}>
          {save.isPending ? 'Saving…' : 'Apply'}
        </button>
      </div>
    </form>
  );
}

const STEPS = [
  ['modelName', 'Model'], ['trim', 'Trim'], ['fuel', 'Fuel'], ['transmission', 'Transmission'],
  ['drive', 'Drive'], ['seater', 'Seater'],
] as const;
type StepKey = (typeof STEPS)[number][0];

/**
 * Manual model pick from the price masters effective on a chosen date
 * (the pricing date by default). Narrowing follows Phase 1's picker:
 * model, trim, fuel, transmission, drive, seater, then variant/colour.
 * An unconfirmed model is confirmed directly; changing a confirmed model
 * raises a Team Lead review (existing Phase 1 rule).
 */
function ModelPickerDialog({ pricing, tenantId, journeyId, accessToken, onClose, onDone }: Props & {
  pricing: P2Pricing; onClose: () => void; onDone: (message: string) => void;
}) {
  // No pricing date yet: the catalogue shows today's masters for picking the model.
  const [onDate, setOnDate] = useState(pricing.appliedDate ?? new Date().toISOString().slice(0, 10));
  const [picked, setPicked] = useState<Partial<Record<StepKey, string>>>({});
  const [skuId, setSkuId] = useState('');
  const [reason, setReason] = useState('');
  const catalog = useQuery({
    queryKey: ['p2-pricing-catalog', tenantId, journeyId, onDate],
    queryFn: () => getP2PricingCatalog(tenantId, journeyId, onDate, accessToken),
    retry: false,
  });
  const skus = catalog.data?.skus ?? [];
  const filtered = useMemo(() => skus.filter((sku) => STEPS.every(([key]) => !picked[key] || sku[key] === picked[key])), [skus, picked]);
  const optionsFor = (index: number) => {
    const before = skus.filter((sku) => STEPS.slice(0, index).every(([key]) => !picked[key] || sku[key] === picked[key]));
    return [...new Set(before.map((sku) => sku[STEPS[index][0]]).filter((v): v is string => Boolean(v)))].sort();
  };
  const selected: P2CatalogSku | undefined = filtered.find((s) => s.productSkuId === skuId) ?? (filtered.length === 1 ? filtered[0] : undefined);
  const propose = pricing.modelChange === 'PROPOSE_CORRECTION';

  const save = useMutation({
    mutationFn: async () => {
      if (!selected) throw new Error('Pick the vehicle first.');
      if (propose) {
        await proposeModelSelectionCorrection(tenantId, journeyId, { productSkuId: selected.productSkuId, reason: reason.trim() }, accessToken);
        return `Proposed ${selected.modelName} ${selected.variantName ?? ''}. A Team Lead reviews and applies it from the Task Queue.`;
      }
      await confirmModelResolutionSku(tenantId, journeyId, selected.productSkuId, accessToken);
      await recheckP2Journey(tenantId, journeyId, accessToken).catch(() => undefined);
      return `Model set to ${selected.modelName} ${selected.variantName ?? ''}. The deal is re-priced and the checks run again.`;
    },
    onSuccess: onDone,
  });

  return (
    <div className="p2w-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="p2w-dialog j360-picker" role="dialog" aria-modal="true" aria-labelledby="j360-picker-title">
        <h3 id="j360-picker-title">{propose ? 'Change the model' : 'Pick the model'}</h3>
        <label className="j360-picker__date">
          <span>Price masters as of</span>
          <input type="date" value={onDate} onChange={(e) => { setOnDate(e.target.value); setPicked({}); setSkuId(''); }} />
          <span className="p2w-muted">
            {catalog.data?.priceList ? `${catalog.data.priceList.priceList ?? 'Price list'} v${catalog.data.priceList.version ?? '?'} · ${skus.length} SKUs` : ''}
          </span>
        </label>
        {catalog.isLoading ? <div className="p2w-skeleton">Loading the price masters…</div> : null}
        {catalog.isError ? <div className="p2w-alert p2w-alert--error" role="alert">{errorText(catalog.error, 'No price masters are effective on this date.')}</div> : null}
        {skus.length ? (
          <div className="j360-picker__grid">
            {STEPS.map(([key, label], index) => {
              const options = optionsFor(index);
              if (index > 0 && !options.length) return null;
              return (
                <label key={key}>
                  <span>{label}</span>
                  <select value={picked[key] ?? ''} disabled={index > 0 && !picked[STEPS[index - 1][0]] && optionsFor(index - 1).length > 0}
                    onChange={(e) => {
                      const next: Partial<Record<StepKey, string>> = {};
                      STEPS.slice(0, index).forEach(([k]) => { if (picked[k]) next[k] = picked[k]; });
                      if (e.target.value) next[key] = e.target.value;
                      setPicked(next); setSkuId('');
                    }}>
                    <option value="">{`Any ${label.toLowerCase()}`}</option>
                    {options.map((value) => <option key={value} value={value}>{key === 'modelName' ? value : humanizeKey(value)}</option>)}
                  </select>
                </label>
              );
            })}
            <label className="j360-picker__variant">
              <span>Variant · colour ({filtered.length})</span>
              <select value={selected?.productSkuId ?? skuId} onChange={(e) => setSkuId(e.target.value)} disabled={!picked.modelName}>
                <option value="">{picked.modelName ? 'Select the variant…' : 'Choose the model first'}</option>
                {picked.modelName ? filtered.map((sku) => (
                  <option key={sku.productSkuId} value={sku.productSkuId}>
                    {sku.variantName ?? sku.modelName}{sku.colourName ? ` (${sku.colourName})` : ''} · {sku.skuCode}
                  </option>
                )) : null}
              </select>
            </label>
          </div>
        ) : null}
        {selected ? (
          <dl className="j360-facts">
            <div><dt>Selected</dt><dd>{selected.modelName} {selected.variantName}{selected.colourName ? ` · ${selected.colourName}` : ''}</dd></div>
            <div><dt>Ex-showroom</dt><dd>{money(selected.exShowroomPrice)}</dd></div>
            <div><dt>On-road</dt><dd>{money(selected.totalPrice)}</dd></div>
          </dl>
        ) : null}
        {propose ? (
          <label className="j360-pricing__reason">
            <span>Reason — why is the current model wrong?</span>
            <textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} required />
          </label>
        ) : null}
        {save.isError ? <div className="p2w-alert p2w-alert--error" role="alert">{errorText(save.error, 'The model could not be saved.')}</div> : null}
        <div className="p2w-dialog__actions">
          <button type="button" className="p2w-button p2w-button--ghost" onClick={onClose}>Cancel</button>
          <button type="button" className="p2w-button p2w-button--primary"
            disabled={!selected || save.isPending || (propose && reason.trim().length < 5)} onClick={() => save.mutate()}>
            {save.isPending ? 'Saving…' : propose ? 'Propose change' : 'Confirm model'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Loan disbursement ───────────────────────────────────────────────────────
/**
 * Which received payment is the financier's loan disbursement. Same
 * candidate list and write as Phase 1 (payments after the minimum booking
 * amount, in modes a lender can use); never free-form.
 */
export function LoanDisbursementDialog({ tenantId, journeyId, accessToken, onClose }: Props & { onClose: () => void }) {
  const refresh = useRefreshDeal(tenantId, journeyId);
  const [paymentId, setPaymentId] = useState('');
  const candidates = useQuery({
    queryKey: ['p2-loan-candidates', tenantId, journeyId],
    queryFn: () => getLoanDisbursementCandidates(tenantId, journeyId, accessToken),
    retry: false,
  });
  const save = useMutation({
    mutationFn: async () => {
      await putLoanDisbursement(tenantId, journeyId, paymentId, accessToken);
      await recheckP2Journey(tenantId, journeyId, accessToken).catch(() => undefined);
    },
    onSuccess: () => { refresh(); onClose(); },
  });
  const list = candidates.data ?? [];
  return (
    <div className="p2w-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="p2w-dialog" role="dialog" aria-modal="true" aria-labelledby="j360-loan-title">
        <h3 id="j360-loan-title">Loan disbursement</h3>
        <p className="p2w-muted">Choose the payment that is the financier's loan amount.</p>
        {candidates.isLoading ? <div className="p2w-skeleton">Loading payments…</div> : null}
        {candidates.isError ? <div className="p2w-alert p2w-alert--error" role="alert">{errorText(candidates.error, 'Payments could not be loaded.')}</div> : null}
        {!candidates.isLoading && !candidates.isError && !list.length ? (
          <div className="p2w-empty">No payment can be a loan disbursement yet (cash, UPI and card never qualify).</div>
        ) : null}
        <ul className="j360-choices">
          {list.map((c) => (
            <li key={c.paymentId}>
              <label className={paymentId === c.paymentId ? 'is-active' : ''}>
                <input type="radio" name="loan" checked={paymentId === c.paymentId} onChange={() => setPaymentId(c.paymentId)} />
                <span>
                  <strong>{money(c.amount)}</strong>
                  <span className="p2w-muted">{[c.paymentAtUtc ? formatDateTime(c.paymentAtUtc) : null, c.paymentMethodCode ? humanizeKey(c.paymentMethodCode) : null, c.bankName, c.paymentReference].filter(Boolean).join(' · ')}</span>
                </span>
              </label>
            </li>
          ))}
        </ul>
        {save.isError ? <div className="p2w-alert p2w-alert--error" role="alert">{errorText(save.error, 'The loan disbursement could not be saved.')}</div> : null}
        <div className="p2w-dialog__actions">
          <button type="button" className="p2w-button p2w-button--ghost" onClick={onClose}>Cancel</button>
          <button type="button" className="p2w-button p2w-button--primary" disabled={!paymentId || save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? 'Saving…' : 'Confirm loan amount'}
          </button>
        </div>
      </div>
    </div>
  );
}
