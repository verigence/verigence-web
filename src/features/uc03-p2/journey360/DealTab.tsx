import { Fragment, useState } from 'react';
import { Link } from 'react-router-dom';

import type { P2Deal, P2DealCategory, P2DealRow, P2DiscountRow } from '../../../services/audit-core/uc03P2';
import { humanizeKey } from '../workspace/p2Format';
import { PricingPanel } from './DealControls';
import { FLAG_LABELS, money, signedMoney, varianceTone } from './j360Format';

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
                <td data-label="Eligibility">
                  {row.eligibility ? <span className={`p2w-chip p2w-chip--${row.eligibility === 'ELIGIBLE' ? 'success' : 'warning'}`}>{humanizeKey(row.eligibility)}</span> : <span className="p2w-muted">—</span>}
                  {row.proof ? (
                    <span className={`j360-proof ${row.proof.onFile ? 'is-ok' : 'is-missing'}`}>
                      {row.proof.onFile ? `${row.proof.document} on file` : `Needs ${row.proof.document}`}
                    </span>
                  ) : null}
                </td>
              </tr>
              {open === row.key ? (
                <tr className="j360-detail">
                  <td colSpan={6}>
                    {row.scheme ? (
                      <p className="p2w-muted">
                        Scheme {row.scheme.code}{row.scheme.category ? ` (${humanizeKey(row.scheme.category)})` : ''}
                        {row.scheme.validFrom ? `, valid ${row.scheme.validFrom}${row.scheme.validTo ? ` to ${row.scheme.validTo}` : ''}` : ''}
                        {row.scheme.combinability ? `, ${humanizeKey(row.scheme.combinability)}` : ''}.
                      </p>
                    ) : <p className="p2w-muted">No published scheme entitles this discount for the SKU and date.</p>}
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

export default function DealTab({ deal, journeyId, tenantId, accessToken }: {
  deal: P2Deal; journeyId: string; tenantId: string; accessToken?: string;
}) {
  const { summary } = deal;
  const columns = [
    ['standard', 'Standard (masters)'], ['booking', 'Booking offer'], ['current', 'Current deal'],
  ] as const;
  const pricing = <PricingPanel tenantId={tenantId} journeyId={journeyId} accessToken={accessToken} />;
  if (!deal.categories.length && !deal.discounts.length) {
    return (
      <div className="j360-stack">
        {pricing}
        <div className="p2w-empty">
          No prices yet. They appear once the booking form or an invoice has been read and the vehicle model is identified.
        </div>
      </div>
    );
  }
  return (
    <div className="j360-stack">
      {pricing}

      <section className="j360-card" aria-label="Deal summary">
        <div className="j360-table-wrap">
          <table className="j360-table j360-table--summary">
            <thead>
              <tr>
                <th scope="col">Deal</th>
                {columns.map(([key, label]) => <th key={key} scope="col" className="is-num">{label}</th>)}
              </tr>
            </thead>
            <tbody>
              <tr><th scope="row">Charges</th>{columns.map(([key, label]) => <td key={key} className="is-num" data-label={label}>{money(summary.gross[key])}</td>)}</tr>
              <tr><th scope="row">Less discounts</th>{columns.map(([key, label]) => <td key={key} className="is-num" data-label={label}>{money(summary.discounts[key])}</td>)}</tr>
              <tr className="is-total"><th scope="row">Net payable</th>{columns.map(([key, label]) => <td key={key} className="is-num" data-label={label}>{money(summary.net[key])}</td>)}</tr>
              <tr>
                <th scope="row">Variance against standard</th>
                <td className="is-num is-blank" data-label="Standard">—</td>
                <td className={`is-num j360-variance ${varianceTone(summary.variance.bookingVsStandard)}`} data-label="Booking offer">{signedMoney(summary.variance.bookingVsStandard)}</td>
                <td className={`is-num j360-variance ${varianceTone(summary.variance.currentVsStandard)}`} data-label="Current deal">{signedMoney(summary.variance.currentVsStandard)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="p2w-muted j360-footnote">
          Current deal uses the billed value where a component has been invoiced ({summary.invoicedComponents} of {summary.components}),
          and the booking offer elsewhere. Variances compare only lines present on both sides.
          {summary.variance.billedVsBooking && Number(summary.variance.billedVsBooking) !== 0
            ? ` Invoiced lines differ from the booking by ${signedMoney(summary.variance.billedVsBooking)}.` : ''}
        </p>
        <dl className="j360-paid">
          <div><dt>Paid by customer</dt><dd>{money(summary.paid.receipts)}</dd></div>
          <div><dt>Loan disbursed</dt><dd>{money(summary.paid.loan)}</dd></div>
          <div><dt>Total received</dt><dd>{money(summary.paid.total)}</dd></div>
          <div className={Number(summary.balanceDue ?? 0) > 0 ? 'is-due' : 'is-clear'}>
            <dt>Balance due</dt><dd>{money(summary.balanceDue)}</dd>
          </div>
        </dl>
      </section>

      {deal.categories.map((category) => (
        <section key={category.code} className="j360-card" aria-label={category.label}>
          <ChargeTable category={category} journeyId={journeyId} />
        </section>
      ))}

      {deal.discounts.length ? (
        <section className="j360-card" aria-label="Discounts">
          <DiscountTable rows={deal.discounts} journeyId={journeyId} />
        </section>
      ) : null}

      {deal.declared.length ? (
        <section className="j360-card" aria-label="Totals written on the documents">
          <h3 className="j360-h3">Totals written on the documents</h3>
          <p className="p2w-muted">As declared on the forms. Compare them with the computed net payable above.</p>
          <dl className="j360-facts">
            {deal.declared.map((item) => (
              <div key={item.key}>
                <dt>{item.label}</dt>
                <dd>{[item.booking && `Booking ${money(item.booking)}`, item.billed && `Billed ${money(item.billed)}`,
                  item.ledger && `Ledger ${money(item.ledger)}`].filter(Boolean).join(' · ') || '—'}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}
      <p className="p2w-muted j360-footnote">Tap a row to see which document reported each value.</p>
    </div>
  );
}
