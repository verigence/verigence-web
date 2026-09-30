import { Fragment, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

import {
  setP2InsuranceSource,
  type Money, type P2Deal, type P2DealCategory, type P2DealInsurance, type P2DealOpted, type P2DealRow, type P2DiscountRow,
} from '../../../services/audit-core/uc03P2';
import { humanizeKey } from '../workspace/p2Format';
import { PricingPanel, useRefreshDeal } from './DealControls';
import { FLAG_LABELS, money, recordField, signedMoney, varianceTone } from './j360Format';

/** What the customer opted for on this line, as a small switch: on is
 * taken, read from the invoice once the deal has one, else the booking. */
function Opted({ opted }: { opted?: P2DealOpted | null }) {
  if (!opted) return null;  // a mandatory line: nothing to opt
  const label = opted.source === 'insurance' ? (opted.taken ? 'Inhouse' : 'Self') : opted.taken ? 'Taken' : 'Opted out';
  const text = opted.source === 'insurance' ? `Insurance ${label.toLowerCase()}`
    : `${label}${opted.source ? ` per ${opted.source === 'invoice' ? 'invoice' : 'booking form'}` : ''}`;
  return (
    <span className="j360-opted" title={text}>
      <span className={`j360-switch j360-switch--small${opted.taken ? ' is-on' : ''}`} role="img" aria-label={text} />
      <small>{label}</small>
    </span>
  );
}

/** Inhouse (through the dealership; the premium is part of the deal) or
 * Self (the customer arranged it; the premium is not). Inhouse until the
 * PC says otherwise; Self needs a word on how they know. */
function InsuranceSource({ insurance, tenantId, journeyId, accessToken }: {
  insurance: P2DealInsurance; tenantId: string; journeyId: string; accessToken?: string;
}) {
  const refresh = useRefreshDeal(tenantId, journeyId);
  const [choice, setChoice] = useState<P2DealInsurance['source']>(insurance.source);
  const [reason, setReason] = useState('');
  const save = useMutation({
    mutationFn: (command: { source: P2DealInsurance['source']; reason?: string }) =>
      setP2InsuranceSource(tenantId, journeyId, command, accessToken),
    onSuccess: () => { setReason(''); refresh(); },
  });
  const pending = choice === 'SELF' && insurance.source !== 'SELF';
  return (
    <span className="j360-insurance-source" onClick={(event) => event.stopPropagation()}>
      <label>
        <span className="p2w-visually-hidden">Insurance</span>
        <select value={choice} disabled={save.isPending}
          onChange={(event) => {
            const source = event.target.value as P2DealInsurance['source'];
            setChoice(source);
            if (source === 'INHOUSE' && insurance.source !== 'INHOUSE') save.mutate({ source });
          }}>
          <option value="INHOUSE">Inhouse</option>
          <option value="SELF">Self</option>
        </select>
      </label>
      {pending ? (
        <>
          <input type="text" value={reason} placeholder="How do you know? (required)" maxLength={200}
            onChange={(event) => setReason(event.target.value)} />
          <button type="button" className="p2w-button p2w-button--secondary" disabled={reason.trim().length < 5 || save.isPending}
            onClick={() => save.mutate({ source: 'SELF', reason: reason.trim() })}>{save.isPending ? 'Saving…' : 'Confirm Self'}</button>
        </>
      ) : (
        <small>{insurance.source === 'SELF' ? 'Self: premium not in the deal' : 'Inhouse: premium in the deal'}
          {insurance.decidedBy === 'PC' ? ' · confirmed by PC' : ' · assumed'}</small>
      )}
      {save.isError ? <small className="j360-insurance-source__error">{save.error instanceof Error ? save.error.message : 'Could not save.'}</small> : null}
    </span>
  );
}

function Flags({ flags }: { flags: string[] }) {
  if (!flags.length) return null;
  return (
    <span className="j360-flags">
      {flags.map((flag) => <span key={flag} className="p2w-chip p2w-chip--warning">{FLAG_LABELS[flag] ?? humanizeKey(flag)}</span>)}
    </span>
  );
}

function Sources({ row, journeyId }: { row: { sources: P2DealRow['sources'] }; journeyId: string }) {
  if (!row.sources.length) return <p className="p2w-muted">No document reported this value; the standard comes from the price masters.</p>;
  return (
    <ul className="j360-sources">
      {row.sources.map((source, index) => (
        <li key={`${source.documentType}-${index}`}>
          {source.documentId ? (
            <Link className="p2w-link" to={`/p2/journeys/${journeyId}/documents/${source.documentId}`}>{source.document}</Link>
          ) : <span>{source.document}</span>}
          <strong>{money(source.amount)}</strong>
        </li>
      ))}
    </ul>
  );
}

const CHARGE_COLUMNS = [
  ['standard', 'Standard'], ['booking', 'Booking offer'], ['billed', 'Billed'], ['ledger', 'Ledger'],
] as const;

/** A category's charges side by side; used inside the add-on and
 * registration cards, where one category is the whole story. */
export function ChargeTable({ category, journeyId, compact = false }: { category: P2DealCategory; journeyId: string; compact?: boolean }) {
  const [open, setOpen] = useState<string>();
  return (
    <div className="j360-table-wrap">
      <table className="j360-table">
        {compact ? null : <caption>{category.label}</caption>}
        <thead>
          <tr>
            <th scope="col">Component</th>
            {CHARGE_COLUMNS.map(([key, label]) => <th key={key} scope="col" className="is-num">{label}</th>)}
            <th scope="col" className="is-num">Variance</th>
          </tr>
        </thead>
        <tbody>
          {category.components.map((row) => (
            <Fragment key={row.key}>
              <tr className={row.flags.length ? 'is-flagged' : ''}>
                <th scope="row">
                  <button type="button" className="j360-rowbtn" aria-expanded={open === row.key}
                    onClick={() => setOpen(open === row.key ? undefined : row.key)}>
                    <span>{row.label}</span>
                    <Flags flags={row.flags} />
                  </button>
                </th>
                {CHARGE_COLUMNS.map(([key, label]) => (
                  <td key={key} className={`is-num${row[key] === null ? ' is-blank' : ''}`} data-label={label}>{money(row[key])}</td>
                ))}
                <td className={`is-num j360-variance ${varianceTone(row.variance)}${signedMoney(row.variance) === '—' ? ' is-blank' : ''}`} data-label="Variance">{signedMoney(row.variance)}</td>
              </tr>
              {open === row.key ? (
                <tr className="j360-detail"><td colSpan={6}><Sources row={row} journeyId={journeyId} /></td></tr>
              ) : null}
            </Fragment>
          ))}
        </tbody>
        {category.components.length > 1 ? (
          <tfoot>
            <tr>
              <th scope="row">Subtotal</th>
              {CHARGE_COLUMNS.map(([key, label]) => (
                <td key={key} className={`is-num${category.totals[key] === null ? ' is-blank' : ''}`} data-label={label}>{money(category.totals[key])}</td>
              ))}
              <td />
            </tr>
          </tfoot>
        ) : null}
      </table>
    </div>
  );
}

export function DiscountTable({ rows, journeyId, caption = 'Discounts and scheme benefits' }: { rows: P2DiscountRow[]; journeyId: string; caption?: string }) {
  const [open, setOpen] = useState<string>();
  if (!rows.length) return null;
  return (
    <div className="j360-table-wrap">
      <table className="j360-table">
        <caption>{caption}</caption>
        <thead>
          <tr>
            <th scope="col">Discount</th>
            <th scope="col" className="is-num">Entitled</th>
            <th scope="col" className="is-num">Booking offer</th>
            <th scope="col" className="is-num">Billed</th>
            <th scope="col" className="is-num">Variance</th>
            <th scope="col">Eligibility</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <Fragment key={row.key}>
              <tr className={row.flags.length ? 'is-flagged' : ''}>
                <th scope="row">
                  <button type="button" className="j360-rowbtn" aria-expanded={open === row.key}
                    onClick={() => setOpen(open === row.key ? undefined : row.key)}>
                    <span>{row.label}</span>
                    {row.scheme?.name ? <small className="p2w-muted">{row.scheme.name}{row.scheme.version ? ` · v${row.scheme.version}` : ''}</small> : null}
                    <Flags flags={row.flags} />
                  </button>
                </th>
                <td className={`is-num${row.entitled === null ? ' is-blank' : ''}`} data-label="Entitled">{money(row.entitled)}</td>
                <td className={`is-num${row.booking === null ? ' is-blank' : ''}`} data-label="Booking offer">{money(row.booking)}</td>
                <td className={`is-num${(row.billed ?? row.effective) === null ? ' is-blank' : ''}`} data-label="Billed">{money(row.billed ?? row.effective)}</td>
                <td className={`is-num j360-variance ${varianceTone(row.variance, 'discount')}${signedMoney(row.variance) === '—' ? ' is-blank' : ''}`} data-label="Variance">{signedMoney(row.variance)}</td>
                <td data-label="Eligibility"><Eligibility row={row} /></td>
              </tr>
              {open === row.key ? (
                <tr className="j360-detail">
                  <td colSpan={6}>
                    <SchemeNote row={row} />
                    <Sources row={row} journeyId={journeyId} />
                  </td>
                </tr>
              ) : null}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Eligibility({ row }: { row: P2DiscountRow }) {
  return (
    <>
      {row.eligibility ? <span className={`p2w-chip p2w-chip--${row.eligibility === 'ELIGIBLE' ? 'success' : 'warning'}`}>{humanizeKey(row.eligibility)}</span> : <span className="p2w-muted">—</span>}
      {row.proof ? (
        <span className={`j360-proof ${row.proof.onFile ? 'is-ok' : 'is-missing'}`}>
          {row.proof.onFile ? `${row.proof.document} on file` : `Needs ${row.proof.document}`}
        </span>
      ) : null}
    </>
  );
}

function SchemeNote({ row }: { row: P2DiscountRow }) {
  if (!row.scheme) return <p className="p2w-muted">No published scheme entitles this discount for the SKU and date.</p>;
  return (
    <p className="p2w-muted">
      Scheme {row.scheme.code}{row.scheme.category ? ` (${humanizeKey(row.scheme.category)})` : ''}
      {row.scheme.validFrom ? `, valid ${row.scheme.validFrom}${row.scheme.validTo ? ` to ${row.scheme.validTo}` : ''}` : ''}
      {row.scheme.combinability ? `, ${humanizeKey(row.scheme.combinability)}` : ''}.
    </p>
  );
}

// ── the price sheet ─────────────────────────────────────────────────────────
function num(value: Money | number | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : null;
}

/** Where the offer stands against the standard, as a slider: the track runs
 * to the standard (the dark tick), the fill is what the customer is offered
 * (the invoice where one exists, else the booking), and a hollow marker
 * shows the booking when the invoice moved away from it. For a discount the
 * standard is the entitlement and a fill past the tick is an over-grant. */
export function OfferBar({ standard, booking, billed, kind = 'charge', large = false }: {
  standard: Money; booking: Money; billed: Money; kind?: 'charge' | 'discount'; large?: boolean;
}) {
  const std = num(standard);
  const bk = num(booking);
  const bl = num(billed);
  const offered = bl ?? bk;
  if (std === null && offered === null) return <span className="p2w-muted">—</span>;
  const scale = Math.max(std ?? 0, offered ?? 0, bk ?? 0, 1);
  const pct = (value: number | null) => (value === null ? null : Math.max(0, Math.min(100, (value / scale) * 100)));
  const fill = pct(offered);
  const tick = pct(std);
  const bkPos = bl !== null && bk !== null && bk !== bl ? pct(bk) : null;
  const tone = std !== null && offered !== null ? varianceTone(offered - std, kind) : '';
  const ratio = std && offered !== null ? Math.round((offered / std) * 100) : null;
  const text = std === null ? `Offered ${money(offered)}, no ${kind === 'discount' ? 'entitlement' : 'standard'}`
    : offered === null ? (kind === 'discount' ? 'Not given' : 'Not priced yet')
      : ratio === 100 ? (kind === 'discount' ? 'As entitled' : 'At standard')
        : `${ratio}% of ${kind === 'discount' ? 'entitlement' : 'standard'}`;
  return (
    <div className={`j360-offer${large ? ' j360-offer--large' : ''} ${tone}`} role="img" aria-label={text}>
      <span className="j360-offer__track">
        {fill !== null ? <span className="j360-offer__fill" style={{ width: `${fill}%` }} /> : null}
        {tick !== null ? <i className="j360-offer__std" style={{ left: `${tick}%` }} title={`${kind === 'discount' ? 'Entitled' : 'Standard'} ${money(standard)}`} /> : null}
        {bkPos !== null ? <i className="j360-offer__bk" style={{ left: `${bkPos}%` }} title={`Booking ${money(booking)}`} /> : null}
      </span>
      <small>{text}</small>
    </div>
  );
}

const SHEET_COLUMNS = 6;

function ComponentRow({ row, journeyId, open, onToggle }: { row: P2DealRow; journeyId: string; open: boolean; onToggle: () => void }) {
  return (
    <Fragment>
      <tr className={`${row.flags.length ? 'is-flagged' : ''}${row.excluded ? ' is-excluded' : ''}`}>
        <th scope="row">
          <button type="button" className="j360-rowbtn" aria-expanded={open} onClick={onToggle}>
            <span>{row.label}</span>
            {row.excluded ? <small className="p2w-muted">Self insurance, not in the deal</small> : null}
            <Flags flags={row.flags} />
          </button>
        </th>
        <td className={`is-num${row.standard === null ? ' is-blank' : ''}`} data-label="Price master">{money(row.standard)}</td>
        <td data-label="Opted" className="j360-opted-cell"><Opted opted={row.opted} /></td>
        <td className={`is-num${row.booking === null ? ' is-blank' : ''}`} data-label="Booking">{money(row.booking)}</td>
        <td className={`is-num is-truth${row.billed === null ? ' is-blank' : ''}`} data-label="Invoice">{money(row.billed)}</td>
        <td className={`is-num j360-variance ${varianceTone(row.variance)}${signedMoney(row.variance) === '—' ? ' is-blank' : ''}`} data-label="Variance">{signedMoney(row.variance)}</td>
      </tr>
      {open ? (
        <tr className="j360-detail">
          <td colSpan={SHEET_COLUMNS}>
            {row.ledger !== null || row.quote ? (
              <p className="p2w-muted">
                {row.ledger !== null ? `Customer ledger ${money(row.ledger)}` : ''}
                {row.ledger !== null && row.quote ? ' · ' : ''}
                {row.quote ? `Cost sheet ${money(row.quote)}` : ''}
              </p>
            ) : null}
            <Sources row={row} journeyId={journeyId} />
          </td>
        </tr>
      ) : null}
    </Fragment>
  );
}

function DiscountRow({ row, journeyId, open, onToggle }: { row: P2DiscountRow; journeyId: string; open: boolean; onToggle: () => void }) {
  return (
    <Fragment>
      <tr className={row.flags.length ? 'is-flagged' : ''}>
        <th scope="row">
          <button type="button" className="j360-rowbtn" aria-expanded={open} onClick={onToggle}>
            <span>{row.label}</span>
            {row.scheme?.name ? <small className="p2w-muted">{row.scheme.name}{row.scheme.version ? ` · v${row.scheme.version}` : ''}</small> : null}
            <Flags flags={row.flags} />
          </button>
        </th>
        <td className={`is-num${row.entitled === null ? ' is-blank' : ''}`} data-label="Entitled">{money(row.entitled)}</td>
        <td data-label="Opted" className="j360-opted-cell"><Opted opted={row.opted} /></td>
        <td className={`is-num${row.booking === null ? ' is-blank' : ''}`} data-label="Booking">{money(row.booking)}</td>
        <td className={`is-num is-truth${row.billed === null ? ' is-blank' : ''}`} data-label="Invoice">{money(row.billed)}</td>
        <td className={`is-num j360-variance ${varianceTone(row.variance, 'discount')}${signedMoney(row.variance) === '—' ? ' is-blank' : ''}`} data-label="Variance">{signedMoney(row.variance)}</td>
      </tr>
      {open ? (
        <tr className="j360-detail">
          <td colSpan={SHEET_COLUMNS}>
            <p><Eligibility row={row} /></p>
            <SchemeNote row={row} />
            <Sources row={row} journeyId={journeyId} />
          </td>
        </tr>
      ) : null}
    </Fragment>
  );
}

function netOf(gross: Money, discounts: Money): Money {
  const g = num(gross);
  if (g === null) return null;
  return String(g - (num(discounts) ?? 0));
}

/** The deal as one price sheet: what the price master says each component
 * and discount should be, what the booking form offered (temporary), what
 * the invoices bill (the source of truth, retail and tax invoices
 * consolidated), and a slider per line showing where the offer landed. */
export default function DealTab({ deal, journeyId, tenantId, accessToken }: {
  deal: P2Deal; journeyId: string; tenantId: string; accessToken?: string;
}) {
  const { summary } = deal;
  const [open, setOpen] = useState<string>();
  const toggle = (key: string) => setOpen(open === key ? undefined : key);
  const pricing = <PricingPanel tenantId={tenantId} journeyId={journeyId} accessToken={accessToken} />;
  if (!deal.categories.length && !deal.discounts.length) {
    return (
      <div className="j360-stack">
        {pricing}
        <div className="p2w-empty">
          No prices yet. The standard prices come from the price master once the vehicle model is identified: pick the model above if it is not.
        </div>
      </div>
    );
  }
  const netBilled = netOf(summary.gross.billed, summary.discounts.billed);
  const variance = summary.variance.currentVsStandard;
  const invoiced = summary.invoicedComponents;
  const partly = invoiced > 0 && invoiced < summary.components;
  const due = num(summary.balanceDue);
  const entitledTotal = num(summary.discounts.standard);
  const givenTotal = num(summary.discounts.current);

  return (
    <div className="j360-stack">
      {pricing}

      <section className="j360-card" aria-label="Price sheet summary">
        <dl className="j360-tiles">
          <div>
            <dt>Price master</dt>
            <dd>{money(summary.net.standard)}</dd>
            <small>{money(summary.gross.standard)} less {money(summary.discounts.standard ?? '0')} entitled</small>
          </div>
          <div>
            <dt>Booking offer</dt>
            <dd>{money(summary.net.booking)}</dd>
            <small>Temporary, from the booking form</small>
          </div>
          <div className="is-truth">
            <dt>Invoice</dt>
            <dd>{money(netBilled)}</dd>
            <small>{invoiced ? `${invoiced} of ${summary.components} components invoiced` : 'No invoice read yet'}</small>
          </div>
          <div className={`is-offer ${varianceTone(variance)}`}>
            <dt>Offered to customer</dt>
            <dd>{money(summary.net.current)}</dd>
            <small>{signedMoney(variance) === '—' ? 'At the price master' : `${signedMoney(variance)} against the price master`}</small>
          </div>
        </dl>
        <OfferBar standard={summary.net.standard} booking={summary.net.booking} billed={invoiced ? summary.net.current : null} large />
        <p className="j360-sheet__legend">
          <span><i className="j360-offer__std" /> Price master</span>
          <span><i className="j360-offer__bk" /> Booking, where the invoice moved</span>
          <span>Fill: what the customer is offered{partly ? ` (invoice where billed, booking for the other ${summary.components - invoiced})` : invoiced ? ' (the invoice)' : ' (the booking, until an invoice is read)'}</span>
        </p>
        <dl className="j360-paid">
          <div><dt>Received</dt><dd>{money(summary.paid.total)}</dd><small>{money(summary.paid.receipts)} receipts · {money(summary.paid.loan)} loan</small></div>
          <div className={due !== null && due > 0 ? 'is-due' : 'is-clear'}><dt>Balance due</dt><dd>{money(summary.balanceDue)}</dd><small>against {money(summary.payable)} payable</small></div>
          <div><dt>Discounts given</dt><dd>{money(summary.discounts.current)}</dd>
            <small>{entitledTotal !== null && givenTotal !== null ? (givenTotal > entitledTotal ? `${money(String(givenTotal - entitledTotal))} more than entitled` : `within the ${money(summary.discounts.standard)} entitled`) : 'no scheme entitlement recorded'}</small></div>
          <div><dt>Lines to look at</dt><dd>{deal.flagged}</dd><small>{deal.flagged ? 'priced away from the master or the booking' : 'every line as expected'}</small></div>
        </dl>
      </section>

      <section className="j360-card" aria-label="Price sheet">
        <div className="j360-table-wrap">
          <table className="j360-table j360-sheet">
            <caption>Price sheet · tap a line to see which document reported each value</caption>
            <thead>
              <tr>
                <th scope="col">Component</th>
                <th scope="col" className="is-num">Price master</th>
                <th scope="col" className="j360-opted-cell">Opted</th>
                <th scope="col" className="is-num">Booking</th>
                <th scope="col" className="is-num">Invoice</th>
                <th scope="col" className="is-num">Variance</th>
              </tr>
            </thead>
            {deal.categories.map((category) => (
              <tbody key={category.code} className={category.excluded ? 'is-excluded' : ''}>
                <tr className="j360-sheet__group">
                  <th scope="rowgroup" colSpan={SHEET_COLUMNS}>
                    {category.label}
                    {category.code === 'INSURANCE' && deal.insurance ? (
                      <InsuranceSource insurance={deal.insurance} tenantId={tenantId} journeyId={journeyId} accessToken={accessToken} />
                    ) : null}
                  </th>
                </tr>
                {category.components.map((row) => (
                  <ComponentRow key={row.key} row={row} journeyId={journeyId} open={open === row.key} onToggle={() => toggle(row.key)} />
                ))}
                {category.components.length > 1 ? (
                  <tr className="is-total">
                    <th scope="row">{category.label} subtotal</th>
                    <td className="is-num" data-label="Price master">{money(category.totals.standard)}</td>
                    <td />
                    <td className="is-num" data-label="Booking">{money(category.totals.booking)}</td>
                    <td className="is-num is-truth" data-label="Invoice">{money(category.totals.billed)}</td>
                    <td />
                  </tr>
                ) : null}
              </tbody>
            ))}
            {deal.discounts.length ? (
              <tbody>
                <tr className="j360-sheet__group"><th scope="rowgroup" colSpan={SHEET_COLUMNS}>Less discounts and scheme benefits <small>entitled · booking · invoice</small></th></tr>
                {deal.discounts.map((row) => (
                  <DiscountRow key={row.key} row={row} journeyId={journeyId} open={open === `d:${row.key}`} onToggle={() => toggle(`d:${row.key}`)} />
                ))}
              </tbody>
            ) : null}
            <tfoot>
              <tr>
                <th scope="row">Net payable</th>
                <td className="is-num" data-label="Price master">{money(summary.net.standard)}</td>
                <td />
                <td className="is-num" data-label="Booking">{money(summary.net.booking)}</td>
                <td className="is-num is-truth" data-label="Invoice">{money(netBilled)}</td>
                <td className={`is-num j360-variance ${varianceTone(variance)}`} data-label="Variance">{signedMoney(variance)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <p className="p2w-muted j360-footnote">
          The invoice is the source of truth: where a component has been invoiced its billed value stands, the booking figure holds only until then.
          Opted: the optional lines (insurance, accessories, extended warranty, every discount) show whether the customer took them, per the invoice once one is read, else per the booking form; insurance follows the Inhouse / Self choice. Mandatory lines have nothing to opt.
          Variances compare a line only where both sides price it.
          {deal.insurance?.source === 'SELF' ? ' The customer arranged their own insurance: the premium is shown but kept out of every total.' : ''}
          {summary.variance.billedVsBooking && Number(summary.variance.billedVsBooking) !== 0
            ? ` Invoiced lines differ from the booking by ${signedMoney(summary.variance.billedVsBooking)}.` : ''}
        </p>
      </section>

      {deal.invoices?.length ? (
        <section className="j360-card" aria-label="Invoices in this sheet">
          <div className="j360-card__head">
            <h3 className="j360-h3">Invoices consolidated in this sheet</h3>
            <Link className="p2w-link" to={`/p2/journeys/${journeyId}/overview?tab=invoices`}>See every line item</Link>
          </div>
          <ul className="j360-invoices">
            {deal.invoices.map((invoice) => (
              <li key={invoice.documentId}>
                <Link className="p2w-link" to={`/p2/journeys/${journeyId}/documents/${invoice.documentId}`}>{invoice.label}</Link>
                <span className="p2w-muted">{[invoice.number && String(invoice.number), invoice.date && recordField('invoice_date', invoice.date)].filter(Boolean).join(' · ')}</span>
                <b>{money(invoice.total)}</b>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {deal.declared.length ? (
        <section className="j360-card" aria-label="Totals written on the documents">
          <h3 className="j360-h3">Totals as written on the documents</h3>
          <dl className="j360-facts">
            {deal.declared.map((item) => (
              <div key={item.key}>
                <dt>{item.label}</dt>
                <dd>{[item.booking && `Booking ${money(item.booking)}`, item.billed && `Invoice ${money(item.billed)}`,
                  item.ledger && `Ledger ${money(item.ledger)}`].filter(Boolean).join(' · ') || '—'}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}
    </div>
  );
}
