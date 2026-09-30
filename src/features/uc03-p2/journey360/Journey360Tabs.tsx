import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

import {
  getP2VehiclePhotos,
  type P2Addons,
  type P2Compliance360,
  type P2Documents360,
  type P2DuplicatePair,
  type P2InvoiceLine,
  type P2PaymentItem,
  type P2Payments360,
  type P2Record,
  type P2SectionMap,
  type P2StageCompletion,
  type P2TakenAddon,
  type P2Vehicle360,
} from '../../../services/audit-core/uc03P2';
import { VIEW_LABELS } from '../photos/p2PhotoUploader';
import { displayValue, formatDateTime, humanizeKey } from '../workspace/p2Format';
import { ChargeTable, DiscountTable } from './DealTab';
import { LoanDisbursementDialog } from './DealControls';
import { CONTROL_STATUS, eventLabel, money, recordField, signedMoney, varianceTone } from './j360Format';

const NOISE_KEYS = new Set(['label', 'source_kind', 'addon_type_code']);

const isEmpty = (value: unknown) => value === null || value === undefined || value === '' || value === false
  || (Array.isArray(value) && !value.length);

/** Label/value facts. Empty values are left out so a record shows what is
 * known, not a wall of dashes. */
function Facts({ record, labels, skip = [] }: { record: P2Record; labels?: Record<string, string>; skip?: string[] }) {
  const entries = Object.entries(record).filter(([key, value]) => !skip.includes(key) && !NOISE_KEYS.has(key) && !isEmpty(value));
  if (!entries.length) return <p className="p2w-muted">No details read yet.</p>;
  return (
    <dl className="j360-facts">
      {entries.map(([key, value]) => (
        <div key={key}><dt>{labels?.[key] ?? humanizeKey(key)}</dt><dd>{recordField(key, value)}</dd></div>
      ))}
    </dl>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="p2w-empty">{children}</div>;
}

// ── Add-ons ─────────────────────────────────────────────────────────────────
const INSURANCE_LABELS: Record<string, string> = {
  insurer_name: 'Insurer', policy_reference: 'Policy number', cover_note_reference: 'Cover note',
  insurance_by: 'Insurance by', self_insurance_flag: 'Customer arranged', agent_intermediary_name: 'Agent',
  agent_intermediary_code: 'Agent code', misp_code: 'MISP code', standard_premium_amount: 'Standard premium',
  actual_premium_amount: 'Premium charged', add_ons: 'Cover add-ons', actual_status_code: 'Status',
  premium_variance: 'Premium variance',
};
const FINANCE_LABELS: Record<string, string> = {
  finance_type_code: 'Finance type', provider_name: 'Financier', financed_amount: 'Loan amount',
  loan_disbursement_amount: 'Disbursed', loan_disbursement_confidence: 'Disbursement match',
  loan_disbursement_match_basis: 'Matched by', do_reference: 'Delivery order', po_reference: 'Purchase order',
  actual_status_code: 'Status', disbursement_date: 'Disbursed on', disbursement_reference: 'Payment reference',
  disbursement_gap: 'Not yet disbursed',
};

export function AddonsTab({ addons, journeyId, tenantId, accessToken }: {
  addons: P2Addons; journeyId: string; tenantId: string; accessToken?: string;
}) {
  const [loanOpen, setLoanOpen] = useState(false);
  const nothing = !addons.insurance.records.length && !addons.insurance.charges && !addons.accessories.charges
    && !addons.accessories.records.length && !addons.protection.charges && !addons.protection.records.length
    && !addons.finance.records.length && !addons.exchange.records.length && !addons.scrappage.discounts.length;
  if (nothing && !addons.taken) return <Empty>No add-ons yet. Insurance, accessories, warranty, loan and exchange details appear as their documents are read.</Empty>;
  return (
    <div className="j360-stack">
    {addons.taken ? (
      <div className="j360-taken-strip" aria-label="Taken with the car">
        <TakenRow label="Accessories" addon={addons.taken.accessories} />
        <TakenRow label="Insurance" addon={addons.taken.insurance} />
        <TakenRow label="Extended Warranty" addon={addons.taken.warranty} />
      </div>
    ) : null}
    <div className="j360-grid">
      <section className="j360-card" aria-label="Insurance">
        <h3 className="j360-h3">Insurance</h3>
        {addons.insurance.records.length ? addons.insurance.records.map((record, index) => (
          <Facts key={index} record={record} labels={INSURANCE_LABELS} />
        )) : <p className="p2w-muted">No insurance cover read yet.</p>}
        {addons.insurance.charges ? <ChargeTable category={addons.insurance.charges} journeyId={journeyId} compact /> : null}
        {addons.insurance.discount ? <DiscountTable rows={[addons.insurance.discount]} journeyId={journeyId} caption="Insurance discount" /> : null}
      </section>

      <section className="j360-card" aria-label="Loan and finance">
        <header className="j360-docs__head">
          <h3 className="j360-h3">Loan / finance</h3>
          <button type="button" className="p2w-button p2w-button--secondary" onClick={() => setLoanOpen(true)}>Set loan amount</button>
        </header>
        {loanOpen ? <LoanDisbursementDialog tenantId={tenantId} journeyId={journeyId} accessToken={accessToken} onClose={() => setLoanOpen(false)} /> : null}
        {addons.finance.records.length ? addons.finance.records.map((record, index) => (
          <div key={index} className="j360-finance">
            <Facts record={record} labels={FINANCE_LABELS} />
            {Number(record.disbursement_gap ?? 0) > 0 ? (
              <p className="p2w-alert" role="note">{money(record.disbursement_gap as string)} of the loan has not been received yet.</p>
            ) : null}
          </div>
        )) : <p className="p2w-muted">Cash purchase, or no loan documents read yet.</p>}
      </section>

      <section className="j360-card" aria-label="Accessories">
        <h3 className="j360-h3">Accessories</h3>
        {addons.accessories.charges ? <ChargeTable category={addons.accessories.charges} journeyId={journeyId} compact /> : <p className="p2w-muted">No accessories charged.</p>}
        {addons.accessories.records.map((record, index) => <Facts key={index} record={record} skip={['addon_type_code']} />)}
        {addons.accessories.discount ? <DiscountTable rows={[addons.accessories.discount]} journeyId={journeyId} caption="Free accessories" /> : null}
      </section>

      <section className="j360-card" aria-label="Warranty and protection">
        <h3 className="j360-h3">Warranty &amp; protection plans</h3>
        {addons.protection.charges ? <ChargeTable category={addons.protection.charges} journeyId={journeyId} compact /> : <p className="p2w-muted">No extended warranty, RSA or service package charged.</p>}
        {addons.protection.records.map((record, index) => (
          <div key={index} className="j360-addon">
            <strong>{String(record.label ?? '')}</strong>
            <span>{recordField('provider_name', record.provider_name)}</span>
            <span>{money(record.actual_amount as string)} <em className={`j360-variance ${varianceTone(record.variance as string)}`}>{signedMoney(record.variance as string)}</em></span>
          </div>
        ))}
        {addons.protection.discounts.length ? <DiscountTable rows={addons.protection.discounts} journeyId={journeyId} caption="Free warranty" /> : null}
      </section>

      {addons.exchange.records.length || addons.exchange.discount ? (
        <section className="j360-card" aria-label="Exchange">
          <h3 className="j360-h3">Exchange</h3>
          {addons.exchange.records.map((record, index) => <Facts key={index} record={record} />)}
          {addons.exchange.discount ? <DiscountTable rows={[addons.exchange.discount]} journeyId={journeyId} caption="Exchange bonus" /> : null}
        </section>
      ) : null}

      {addons.scrappage.discounts.length ? (
        <section className="j360-card" aria-label="Scrappage">
          <h3 className="j360-h3">Scrappage</h3>
          <DiscountTable rows={addons.scrappage.discounts} journeyId={journeyId} caption="Scrappage bonus" />
        </section>
      ) : null}
    </div>
    </div>
  );
}

// ── Payments ────────────────────────────────────────────────────────────────
const BANK_STATUS: Record<string, { label: string; tone: string }> = {
  MATCHED: { label: 'In bank statement', tone: 'success' },
  UNMATCHED: { label: 'No credit found', tone: 'danger' },
  AMBIGUOUS: { label: 'Several credits match', tone: 'warning' },
  NOT_APPLICABLE: { label: 'Cash', tone: 'neutral' },
  NO_STATEMENT: { label: 'No statement yet', tone: 'neutral' },
};
const BANK_METHOD: Record<string, string> = { REFERENCE: 'by reference', UTR: 'by UTR', AMOUNT_DATE: 'by amount and date' };

function BankCell({ item }: { item: P2PaymentItem }) {
  const match = item.bankStatement;
  if (!match) return <span className="p2w-muted">—</span>;
  const status = BANK_STATUS[match.status] ?? { label: humanizeKey(match.status), tone: 'neutral' };
  return (
    <span className="j360-cell">
      <span className={`p2w-chip p2w-chip--${status.tone}`}>{status.label}</span>
      {match.status === 'MATCHED' ? (
        <small className="j360-bank__ref">
          {[match.date && recordField('transaction_date', match.date), match.reference, match.method && BANK_METHOD[match.method]].filter(Boolean).join(' · ')}
        </small>
      ) : null}
    </span>
  );
}

function CountedCell({ item }: { item: P2PaymentItem }) {
  if (item.counted) return <span className="p2w-chip p2w-chip--success">Counted</span>;
  if (item.duplicateOf) {
    return (
      <span className="j360-cell">
        <span className="p2w-chip p2w-chip--danger">Duplicate</span>
        <small className="j360-bank__ref">{item.notCountedReason}</small>
      </span>
    );
  }
  return (
    <span className="j360-cell">
      <span className="p2w-chip p2w-chip--neutral">Not counted</span>
      {item.notCountedReason ? <small className="j360-bank__ref">{item.notCountedReason}</small> : null}
    </span>
  );
}

/** Every receipt and what it is worth (a duplicate counts once, a removed
 * document counts nothing), then the bank statement entries with the
 * receipt each credit stands for. */
export function PaymentsTab({ payments, journeyId }: { payments: P2Payments360; journeyId: string }) {
  const bank = payments.bankStatement;
  const credits = bank ? bank.lines.filter((line) => line.credit !== null) : [];
  return (
    <div className="j360-stack">
      <dl className="j360-paid j360-card">
        <div><dt>Receipts counted</dt><dd>{money(payments.receiptsTotal)}</dd></div>
        <div><dt>Loan disbursed</dt><dd>{money(payments.loanDisbursed)}</dd></div>
        <div><dt>Total received</dt><dd>{money(payments.paidTotal)}</dd></div>
        {Object.entries(payments.byStage).map(([stage, amount]) => (
          <div key={stage}><dt>{humanizeKey(stage)} receipts</dt><dd>{money(amount)}</dd></div>
        ))}
        {payments.duplicates ? <div className="is-due"><dt>Duplicate receipts</dt><dd>{payments.duplicates} not counted</dd></div> : null}
        {credits.length ? <div className={bank && bank.matched === credits.length ? 'is-clear' : ''}><dt>Bank credits matched</dt><dd>{bank?.matched ?? 0} of {credits.length}</dd></div> : null}
      </dl>
      {payments.items.length ? (
        <div className="j360-card j360-table-wrap">
          <table className="j360-table">
            <caption>Receipts</caption>
            <thead>
              <tr>
                <th scope="col">Receipt</th><th scope="col">Date</th><th scope="col">Mode</th>
                <th scope="col" className="is-num">Amount</th><th scope="col">Bank statement</th><th scope="col">Counted</th>
              </tr>
            </thead>
            <tbody>
              {payments.items.map((item) => (
                <tr key={item.paymentId} className={item.duplicateOf ? 'is-flagged' : item.counted ? '' : 'is-muted'}>
                  <th scope="row">
                    {item.documentId ? <Link className="p2w-link" to={`/p2/journeys/${journeyId}/documents/${item.documentId}`}>{item.receiptNumber || item.document || 'Receipt'}</Link>
                      : item.receiptNumber || 'Receipt'}
                    <small className="p2w-muted">{[item.stage && humanizeKey(item.stage), item.bank, item.reference].filter(Boolean).join(' · ')}</small>
                  </th>
                  <td data-label="Date">{recordField('receipt_date', item.receiptDate)}</td>
                  <td data-label="Mode">{item.mode ? humanizeKey(item.mode) : '—'}</td>
                  <td className="is-num" data-label="Amount">{money(item.amount)}</td>
                  <td data-label="Bank statement"><BankCell item={item} /></td>
                  <td data-label="Counted"><CountedCell item={item} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <Empty>No payments recorded yet. Upload receipts or the customer ledger.</Empty>}
      <section className="j360-card" aria-label="Bank statement">
        <div className="j360-card__head">
          <h3 className="j360-h3">Bank statement</h3>
          {bank && credits.length ? (
            <span className="p2w-muted">{money(bank.matchedTotal)} of {money(bank.creditsTotal)} in credits matched to receipts
              {bank.receiptsWithoutCredit ? ` · ${bank.receiptsWithoutCredit} receipt${bank.receiptsWithoutCredit === 1 ? '' : 's'} without a credit` : ''}</span>
          ) : null}
        </div>
        {bank && bank.lines.length ? (
          <div className="j360-table-wrap">
            <table className="j360-table">
              <thead>
                <tr>
                  <th scope="col">Date</th><th scope="col">Entry</th><th scope="col">Reference</th>
                  <th scope="col" className="is-num">Credit</th><th scope="col" className="is-num">Debit</th><th scope="col">Receipt</th>
                </tr>
              </thead>
              <tbody>
                {bank.lines.map((line) => (
                  <tr key={line.documentId} className={line.credit !== null && !line.matchedPaymentId ? 'is-flagged' : ''}>
                    <th scope="row">
                      <Link className="p2w-link" to={`/p2/journeys/${journeyId}/documents/${line.documentId}`}>{recordField('transaction_date', line.date) || 'Entry'}</Link>
                      <small className="p2w-muted">{[line.bank, line.accountNumber].filter(Boolean).join(' · ')}</small>
                    </th>
                    <td data-label="Entry">{line.description || line.counterparty || <span className="p2w-muted">—</span>}</td>
                    <td data-label="Reference">{line.reference || <span className="p2w-muted">—</span>}</td>
                    <td className="is-num" data-label="Credit">{money(line.credit)}</td>
                    <td className="is-num" data-label="Debit">{money(line.debit)}</td>
                    <td data-label="Receipt">
                      {line.matchedPaymentId ? (
                        <span className="j360-cell">
                          <span className="p2w-chip p2w-chip--success">{line.matchedReceipt || 'Receipt'}</span>
                          {line.matchMethod ? <small className="j360-bank__ref">{BANK_METHOD[line.matchMethod] ?? ''}</small> : null}
                        </span>
                      ) : line.credit !== null ? <span className="p2w-chip p2w-chip--warning">No receipt</span> : <span className="p2w-muted">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="p2w-muted">No bank statement uploaded yet. Once one is read, each credit is matched to its receipt here.</p>}
      </section>
    </div>
  );
}

// ── Documents with every extracted field ────────────────────────────────────
export function DocumentsTab({ data, journeyId }: { data: P2Documents360; journeyId: string }) {
  const [selected, setSelected] = useState(data.documents[0]?.documentId);
  const [query, setQuery] = useState('');
  const document = data.documents.find((d) => d.documentId === selected) ?? data.documents[0];
  const fields = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (document?.fields ?? []).filter((f) => !needle || f.label.toLowerCase().includes(needle)
      || displayValue(f.value).toLowerCase().includes(needle));
  }, [document, query]);
  if (!data.documents.length) return <Empty>No documents yet.</Empty>;
  return (
    <div className="j360-docs">
      <ul className="j360-docs__list" aria-label="Documents">
        {data.documents.map((doc) => (
          <li key={doc.documentId}>
            <button type="button" className={doc.documentId === document?.documentId ? 'is-active' : ''}
              onClick={() => setSelected(doc.documentId)}>
              <strong>{doc.label}</strong>
              <span className="p2w-muted">{humanizeKey(doc.stage)} · {doc.fieldCount} values{doc.pages.length ? ` · page ${doc.pages.join(', ')}` : ''}</span>
              {doc.needsReview ? <span className="p2w-chip p2w-chip--info">{doc.needsReview} to verify</span> : null}
              {doc.corrected ? <span className="p2w-chip p2w-chip--neutral">{doc.corrected} corrected</span> : null}
            </button>
          </li>
        ))}
      </ul>
      {document ? (
        <section className="j360-card j360-docs__fields" aria-label={`${document.label} values`}>
          <header className="j360-docs__head">
            <h3 className="j360-h3">{document.label}</h3>
            <input type="search" placeholder="Find a value" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Find a value" />
            <Link className="p2w-button p2w-button--secondary" to={`/p2/journeys/${journeyId}/documents/${document.documentId}`}>Open with page</Link>
          </header>
          <div className="j360-table-wrap">
            <table className="j360-table">
              <thead><tr><th scope="col">Field</th><th scope="col">Value</th><th scope="col" className="is-num">Confidence</th><th scope="col">Status</th></tr></thead>
              <tbody>
                {fields.map((field) => (
                  <tr key={field.key} className={field.needsReview ? 'is-review' : ''}>
                    <th scope="row">{field.label}{field.keyField ? <small className="p2w-muted">Key field</small> : null}</th>
                    <td data-label="Value" className="j360-value">
                      {displayValue(field.value)}
                      {field.corrected ? <small className="p2w-muted">Read as {displayValue(field.machineValue)}</small> : null}
                    </td>
                    <td className="is-num" data-label="Confidence">{field.confidence === null ? '—' : `${Math.round(field.confidence)}%`}</td>
                    <td data-label="Status">
                      {field.corrected ? <span className="p2w-chip p2w-chip--neutral">Corrected</span>
                        : field.needsReview ? <span className="p2w-chip p2w-chip--info">To verify</span>
                          : field.reviewed ? <span className="p2w-chip p2w-chip--success">Verified</span>
                            : <span className="p2w-chip p2w-chip--success">Read</span>}
                    </td>
                  </tr>
                ))}
                {!fields.length ? <tr><td colSpan={4} className="p2w-muted">No values{query ? ' match' : ' were read from this document'}.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}

// ── Vehicle ─────────────────────────────────────────────────────────────────
const PRODUCT_LABELS: Record<string, string> = {
  model: 'Model', variant: 'Variant', colour: 'Colour', model_code: 'Model code', variant_code: 'Variant code',
  colour_code: 'Colour code', selection_status: 'Identification', selection_method: 'Identified by',
  selection_score: 'Match score', sku_resolution_remarks: 'Notes', sku_code: 'SKU',
};

function TakenRow({ label, addon }: { label: string; addon: P2TakenAddon }) {
  return (
    <div className="j360-taken">
      <div>
        <strong>{label}</strong>
        <small>{addon.taken
          ? `Taken${addon.amount ? ` · ${rupees(addon.amount)}` : ''}${addon.provider ? ` · ${addon.provider}` : ''}`
          : 'Not taken on this deal'}</small>
      </div>
      <span className={`j360-switch${addon.taken ? ' is-on' : ''}`} role="img" aria-label={`${label}: ${addon.taken ? 'taken' : 'not taken'}`} />
    </div>
  );
}

function ItemList({ title, addon }: { title: string; addon: P2TakenAddon }) {
  if (!addon.items.length) return null;
  return (
    <div className="j360-items">
      <span className="j360-items__title">{title}</span>
      <ul>
        {addon.items.map((item, index) => (
          <li key={`${item.documentId}-${index}`}><span>{item.name}</span><b>{rupees(item.amount)}</b></li>
        ))}
      </ul>
    </div>
  );
}

const VEHICLE_FACT_LABELS: Array<[string, string]> = [
  ['model', 'Model'], ['variant', 'Variant'], ['colour', 'Colour'], ['sku_code', 'SKU'],
];
const UNIT_LABELS: Array<[string, string]> = [
  ['vin', 'VIN'], ['chassis_number', 'Chassis no.'], ['dms_reference', 'DMS reference'], ['invoice_reference', 'Invoice reference'],
  ['allocated_at_utc', 'Allocated'],
];
const BOOKING_LABELS: Array<[keyof P2Vehicle360['booking'], string]> = [
  ['bookingDate', 'Booking date'], ['salesConsultant', 'Sales consultant'], ['dealerBranch', 'Dealer branch'],
  ['dealType', 'Deal type'], ['dealSource', 'Deal source'], ['leadSource', 'Lead source'], ['expectedDelivery', 'Expected delivery'],
];
const DELIVERY_LABELS: Array<[string, string]> = [
  ['actual_delivery_status_code', 'Status'], ['planned_delivery_at', 'Planned'], ['delivery_intimated_at', 'Intimated'],
  ['actual_delivered_at', 'Delivered'],
];
const INSURANCE_DETAIL_LABELS: Array<[string, string]> = [
  ['insurerName', 'Insurer'], ['policyNumber', 'Policy no.'], ['policyType', 'Policy type'], ['coverNoteReference', 'Cover note'],
  ['insuranceBy', 'Insurance by'], ['policyStartDate', 'Policy start'], ['policyEndDate', 'Policy end'], ['issueDate', 'Issue date'],
  ['idvAmount', 'IDV'], ['standardPremium', 'Standard premium'], ['actualPremium', 'Premium charged'], ['agentName', 'Agent'],
  ['agentCode', 'Agent code'], ['mispCode', 'MISP code'],
];
const WARRANTY_DETAIL_LABELS: Array<[string, string]> = [
  ['planName', 'Plan'], ['providerName', 'Provider'], ['invoiceNumber', 'Invoice no.'], ['invoiceDate', 'Invoice date'],
  ['coverageStartDate', 'Coverage from'], ['coverageEndDate', 'Coverage to'], ['tenureMonths', 'Tenure (months)'],
];

const ISO_DAY = /^\d{4}-\d{2}-\d{2}(T|$)/;

/** A fact as Phase 1 prints it: dates as "31 Aug 2026", money with paise
 * when the document carries them, and "Not available" for a blank. */
function factText(key: string, value: unknown): React.ReactNode {
  if (isEmpty(value)) return <span className="p2w-muted">Not available</span>;
  if (typeof value === 'string' && ISO_DAY.test(value)) {
    const [y, m, d] = value.slice(0, 10).split('-').map(Number);
    const date = new Date(y, m - 1, d);
    if (!Number.isNaN(date.getTime())) return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  }
  if (Array.isArray(value)) return value.map((v) => (typeof v === 'object' && v ? JSON.stringify(v) : String(v))).join(', ');
  if (/amount|premium|idv|value$/i.test(key) && !Number.isNaN(Number(value))) return rupees(value as string);
  return recordField(key, value);
}

/** Rupees keeping the paise a document printed (₹3,812.01), whole otherwise. */
function rupees(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—';
  const amount = Number(value);
  if (Number.isNaN(amount)) return String(value);
  const whole = Number.isInteger(amount);
  return `₹${amount.toLocaleString('en-IN', { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 })}`;
}

function Fact({ label, value, fieldKey }: { label: string; value: unknown; fieldKey: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{factText(fieldKey, value)}</dd>
    </div>
  );
}

/** One add-on block: taken or not, what the record says, the items bought. */
function AddonBlock({ label, addon, labels, itemsTitle }: {
  label: string; addon: P2TakenAddon; labels: Array<[string, string]>; itemsTitle: string;
}) {
  const known = labels.filter(([key]) => !isEmpty(addon.details[key]));
  return (
    <section className="j360-card" aria-label={label}>
      <div className="j360-taken-strip j360-taken-strip--head"><TakenRow label={label} addon={addon} /></div>
      {known.length ? (
        <dl className="j360-facts j360-facts--customer">
          {known.map(([key, text]) => <Fact key={key} label={text} fieldKey={key} value={addon.details[key]} />)}
        </dl>
      ) : null}
      {addon.details.addOns && !isEmpty(addon.details.addOns) ? (
        <div className="j360-items"><span className="j360-items__title">Add-on covers</span>
          <p className="j360-items__text">{factText('addOns', addon.details.addOns)}</p></div>
      ) : null}
      <ItemList title={itemsTitle} addon={addon} />
      {!addon.taken && !known.length ? <p className="p2w-muted">Not taken on this deal.</p> : null}
    </section>
  );
}

/** Phase 1's Vehicle panel in one view: the vehicle, the allocated unit,
 * the booking facts and the delivery, then what was taken with the car
 * (accessories, insurance, extended warranty), each with its details and
 * the items bought. Delivery documents take precedence over Booking. */
export function VehicleTab({ data, tenantId, journeyId, accessToken }: {
  data: P2SectionMap['vehicle']; tenantId: string; journeyId: string; accessToken?: string;
}) {
  const photos = useQuery({
    queryKey: ['p2-vehicle-photos', tenantId, journeyId],
    queryFn: () => getP2VehiclePhotos(tenantId, journeyId, accessToken),
    staleTime: 60_000,
  });
  const product = data.product ?? {};
  const unit = data.units[0] ?? {};
  return (
    <div className="j360-stack">
      <section className="j360-card" aria-label="Vehicle">
        <div className="j360-card__head">
          <h3 className="j360-h3">Vehicle</h3>
          <span className="p2w-muted">Delivery documents take precedence over Booking.</span>
        </div>
        <dl className="j360-facts j360-facts--customer">
          {VEHICLE_FACT_LABELS.map(([key, label]) => <Fact key={key} label={label} fieldKey={key} value={product[key]} />)}
          {UNIT_LABELS.map(([key, label]) => <Fact key={key} label={label} fieldKey={key} value={unit[key]} />)}
          <Fact label="Registration" fieldKey="registration_number" value={data.journey?.registrationNumber} />
          <Fact label="Financier" fieldKey="financier" value={data.journey?.financier ?? 'Cash / not known'} />
          <Fact label="Insurer" fieldKey="insurer" value={data.journey?.insurer} />
          {BOOKING_LABELS.map(([key, label]) => <Fact key={key} label={label} fieldKey={key} value={data.booking[key]} />)}
          <div><dt>Journey started</dt><dd>{data.journey?.startedAtUtc ? formatDateTime(data.journey.startedAtUtc) : <span className="p2w-muted">Not available</span>}</dd></div>
        </dl>
        {data.product?.selection_status && data.product.selection_status !== 'RESOLVED' ? (
          <p className="p2w-muted">Identification: {humanizeKey(String(data.product.selection_status))}{data.product.sku_resolution_remarks ? ` · ${String(data.product.sku_resolution_remarks)}` : ''}</p>
        ) : null}
        <h4 className="j360-h4">Delivery execution</h4>
        {data.delivery ? (
          <dl className="j360-facts j360-facts--customer">
            {DELIVERY_LABELS.map(([key, label]) => <Fact key={key} label={label} fieldKey={key} value={data.delivery?.[key]} />)}
          </dl>
        ) : <p className="p2w-muted">Delivery has not been recorded yet.</p>}
      </section>
      <div className="j360-taken-strip">
        <TakenRow label="Accessories" addon={data.addons.accessories} />
        <TakenRow label="Insurance" addon={data.addons.insurance} />
        <TakenRow label="Extended Warranty" addon={data.addons.warranty} />
      </div>
      <AddonBlock label="Accessories" addon={data.addons.accessories} itemsTitle="Accessories bought"
        labels={[['invoiceNumbers', 'Invoice no.']]} />
      <AddonBlock label="Insurance" addon={data.addons.insurance} itemsTitle="Insurance lines" labels={INSURANCE_DETAIL_LABELS} />
      <AddonBlock label="Extended Warranty" addon={data.addons.warranty} itemsTitle="Warranty lines" labels={WARRANTY_DETAIL_LABELS} />
      <section className="j360-card" aria-label="Vehicle photos">
        <header className="j360-docs__head">
          <h3 className="j360-h3">Vehicle photos ({photos.data?.photos.length ?? data.photoCount})</h3>
          <Link className="p2w-button p2w-button--secondary" to={`/p2/journeys/${journeyId}/documents?tab=photos`}>Add photos</Link>
        </header>
        {photos.data?.photos.length ? (
          <ul className="p2w-photos__grid">
            {photos.data.photos.map((photo) => (
              <li key={photo.photoId}>
                <a className="p2w-photos__thumb" href={photo.url ?? undefined} target="_blank" rel="noreferrer">
                  {photo.url ? <img src={photo.url} alt={photo.viewCode ? VIEW_LABELS[photo.viewCode] : 'Vehicle photo'} loading="lazy" /> : null}
                </a>
                <span className="p2w-photos__caption"><strong>{photo.viewCode ? VIEW_LABELS[photo.viewCode] : 'Photo'}</strong>
                  <span className="p2w-muted">{formatDateTime(photo.uploadedAtUtc)}</span></span>
              </li>
            ))}
          </ul>
        ) : <p className="p2w-muted">No photos yet.</p>}
      </section>
    </div>
  );
}

const INVOICE_HEADER_LABELS: Array<[string, string]> = [
  ['invoiceNumber', 'Invoice no.'], ['invoiceDate', 'Invoice date'], ['invoiceNature', 'Nature'], ['sourceSystem', 'Source'],
  ['sellerName', 'Seller'], ['sellerGstin', 'Seller GSTIN'], ['buyerName', 'Buyer'], ['buyerGstin', 'Buyer GSTIN'],
  ['financedBy', 'Financed by'], ['modelNameRaw', 'Model'], ['variantRaw', 'Variant'], ['vinNumber', 'VIN'],
  ['chassisNumber', 'Chassis no.'], ['engineNumber', 'Engine no.'], ['vehicleRegistrationNumber', 'Registration'],
  ['planName', 'Plan'], ['coverageStartDate', 'Coverage from'], ['coverageEndDate', 'Coverage to'], ['tenureMonths', 'Tenure (months)'],
];
const INVOICE_TOTAL_LABELS: Array<[string, string]> = [
  ['grossAmountBeforeDiscount', 'Gross'], ['invoiceDiscountAmount', 'Discount'], ['taxableAmount', 'Taxable'], ['cgstAmount', 'CGST'],
  ['sgstAmount', 'SGST'], ['igstAmount', 'IGST'], ['cessAmount', 'Cess'], ['tcsAmount', 'TCS'], ['roundOffAmount', 'Round off'],
  ['grandTotalAmount', 'Grand total'],
];

const LINE_ROWS: Array<[keyof P2InvoiceLine, string, 'text' | 'money' | 'raw']> = [
  ['category', 'Category', 'text'], ['itemCode', 'Item code', 'raw'], ['hsnSac', 'HSN / SAC', 'raw'], ['quantity', 'Qty', 'raw'],
  ['unitRate', 'Rate', 'money'], ['grossAmount', 'Gross', 'money'], ['discountAmount', 'Discount', 'money'],
  ['taxableAmount', 'Taxable', 'money'], ['taxRate', 'Tax rate', 'raw'], ['taxAmount', 'Tax', 'money'], ['netAmount', 'Amount', 'money'],
];

/** The line items of one invoice read top to bottom: the fields down the
 * side, one column per line item, only the fields the invoice printed. */
function LineItems({ lines }: { lines: P2InvoiceLine[] }) {
  const rows = LINE_ROWS.filter(([key]) => lines.some((line) => !isEmpty(line[key])));
  const cell = (line: P2InvoiceLine, key: keyof P2InvoiceLine, kind: 'text' | 'money' | 'raw') => {
    const value = line[key];
    if (isEmpty(value)) return <span className="p2w-muted">—</span>;
    if (kind === 'money') return rupees(value as string);
    if (kind === 'text') return humanizeKey(String(value));
    return key === 'taxRate' ? `${String(value)}%` : String(value);
  };
  return (
    <div className="j360-lines-wrap">
      <table className="j360-lines j360-lines--vertical">
        <thead>
          <tr>
            <th scope="col">Line item</th>
            {lines.map((line, index) => <th key={index} scope="col">{line.description || `Line ${index + 1}`}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map(([key, label, kind]) => (
            <tr key={key} className={key === 'netAmount' ? 'is-total' : ''}>
              <th scope="row">{label}</th>
              {lines.map((line, index) => <td key={index} className={kind === 'money' || key === 'quantity' || key === 'taxRate' ? 'is-num' : ''}>{cell(line, key, kind)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Every invoice read on the Journey with its header, totals and the line
 * items as printed: vehicle, accessories, warranty, RSA, wholesale, credit
 * and debit notes. */
export function InvoicesTab({ data, journeyId }: { data: P2SectionMap['invoices']; journeyId: string }) {
  if (!data.documents.length) return <Empty>No invoices read yet. Upload the customer invoice, Tally invoice or accessory invoices.</Empty>;
  return (
    <div className="j360-stack">
      {data.documents.map((invoice) => {
        const header = INVOICE_HEADER_LABELS.filter(([key]) => !isEmpty(invoice.header[key]));
        const totals = INVOICE_TOTAL_LABELS.filter(([key]) => !isEmpty(invoice.totals[key]));
        return (
          <section key={invoice.documentId} className="j360-card" aria-label={invoice.label}>
            <div className="j360-card__head">
              <h3 className="j360-h3">{invoice.label}{invoice.header.invoiceNumber ? <span className="j360-h3__ref"> · {String(invoice.header.invoiceNumber)}</span> : null}</h3>
              <Link className="p2w-link" to={`/p2/journeys/${journeyId}/documents/${invoice.documentId}`}>Open document</Link>
            </div>
            <dl className="j360-facts j360-facts--customer">
              {header.map(([key, label]) => <Fact key={key} label={label} fieldKey={key} value={invoice.header[key]} />)}
            </dl>
            {invoice.lineItems.length ? <LineItems lines={invoice.lineItems} /> : <p className="p2w-muted">No line items read on this invoice.</p>}
            {typeof invoice.particulars === 'string' && invoice.particulars ? <p className="j360-items__text">{invoice.particulars}</p> : null}
            {totals.length ? (
              <dl className="j360-totals">
                {totals.map(([key, label]) => <div key={key} className={key === 'grandTotalAmount' ? 'is-grand' : undefined}><dt>{label}</dt><dd>{rupees(invoice.totals[key])}</dd></div>)}
              </dl>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}

const CERTIFICATE_LABELS: Array<[string, string]> = [
  ['certificateNumber', 'Certificate no.'], ['certificateIssueDate', 'Issue date'], ['certificateValidUntilDate', 'Valid until'],
  ['oldVehicleRegistrationNumber', 'Old vehicle reg. no.'], ['oldVehicleMake', 'Old vehicle make'], ['oldVehicleModel', 'Old vehicle model'],
  ['oldVehicleType', 'Old vehicle type'], ['oldVehicleFuelType', 'Fuel type'], ['oldVehicleYearOfManufacturing', 'Year of manufacture'],
  ['originalOwnerName', 'Original owner'], ['currentHolderName', 'Current holder'], ['tradeNumber', 'Trade no.'], ['tradeDate', 'Trade date'],
  ['scrappingFacilityName', 'Scrapping facility'], ['rvsfRegistrationNumber', 'RVSF registration no.'], ['stateOfScrapping', 'State of scrapping'],
];
const TRADE_IN_LABELS: Array<[string, string]> = [
  ['actual_status_code', 'Status'], ['old_vehicle_make_model', 'Old vehicle'], ['old_vehicle_registration', 'Registration'],
  ['quoted_value', 'Quoted value'], ['actual_value', 'Actual value'], ['handover_at_utc', 'Handover'], ['payment_at_utc', 'Payment date'],
];
const VALUATION_LABELS: Array<[string, string]> = [
  ['reportNumber', 'Report no.'], ['valuationDate', 'Valuation date'], ['evaluatorName', 'Evaluator'], ['registrationNumber', 'Registration'],
  ['make', 'Make'], ['model', 'Model'], ['variant', 'Variant'], ['fuelType', 'Fuel type'], ['manufactureMonthYear', 'Manufactured'],
  ['odometerKm', 'Odometer (km)'], ['numberOfOwners', 'Owners'], ['overallGrade', 'Grade'], ['baseMarketValue', 'Base market value'],
  ['finalOfferValue', 'Final offer'], ['loanOutstandingOnVehicle', 'Loan outstanding'],
];

/** Trade-in / Scrappage as Phase 1 lays it out: the booking's exchange
 * fields, the trade-in case, every Scrappage Certificate of Deposit and
 * any valuation of the old vehicle. */
export function TradeInTab({ data }: { data: P2SectionMap['tradein'] }) {
  const nothing = !data.tradeIn && !data.certificates.length && !data.valuations.length;
  return (
    <div className="j360-stack">
      <section className="j360-card" aria-label="Trade-in / Scrappage">
        <div className="j360-card__head"><h3 className="j360-h3">Trade-in / Scrappage</h3></div>
        <dl className="j360-facts j360-facts--customer">
          <div><dt>Exchange applicable</dt><dd>{data.exchange.applicable === null ? <span className="p2w-muted">Not available</span> : data.exchange.applicable ? 'Yes' : 'No'}
            {data.tradeIn?.actual_status_code ? <span className="j360-facts__note">{humanizeKey(String(data.tradeIn.actual_status_code))}</span> : null}</dd></div>
          <div><dt>Exchange value</dt><dd>{data.exchange.value ? rupees(data.exchange.value) : '—'}</dd></div>
        </dl>
        {data.tradeIn ? (
          <>
            <h4 className="j360-h4">Trade-in</h4>
            <dl className="j360-facts j360-facts--customer">
              {TRADE_IN_LABELS.map(([key, label]) => <Fact key={key} label={label} fieldKey={key} value={data.tradeIn?.[key]} />)}
            </dl>
          </>
        ) : null}
        {data.certificates.map((certificate, index) => (
          <div key={String(certificate.documentId ?? index)}>
            <h4 className="j360-h4">{certificate.certificateVariant ? String(certificate.certificateVariant) : 'Scrappage certificate'}
              {Array.isArray(certificate.documentIds) && certificate.documentIds.length > 1
                ? <span className="p2w-muted"> · read from {certificate.documentIds.length} uploads, combined</span> : null}</h4>
            <dl className="j360-facts j360-facts--customer">
              {CERTIFICATE_LABELS.map(([key, label]) => <Fact key={key} label={label} fieldKey={key} value={certificate[key]} />)}
            </dl>
          </div>
        ))}
        {data.valuations.map((valuation, index) => (
          <div key={String(valuation.documentId ?? index)}>
            <h4 className="j360-h4">Old vehicle valuation</h4>
            <dl className="j360-facts j360-facts--customer">
              {VALUATION_LABELS.map(([key, label]) => <Fact key={key} label={label} fieldKey={key} value={valuation[key]} />)}
            </dl>
          </div>
        ))}
        {nothing ? <p className="p2w-muted">No trade-in or scrappage record beyond the booking's exchange fields.</p> : null}
      </section>
    </div>
  );
}

// ── Registration and delivery ───────────────────────────────────────────────
const IDENTITY_TEXT: Record<string, string> = {
  DOCUMENT_VERIFIED: 'Document verified', VERIFIED: 'Verified', CONFLICT: 'Conflict', PENDING: 'Pending',
};
const CUSTOMER_TYPE_TEXT: Record<string, string> = { INDIVIDUAL: 'Individual', CORPORATE: 'Corporate', PENDING: 'Pending' };

/** The customer as the KYC establishes them, Phase 1's panel: entered
 * name beside the legal name, PAN, Aadhaar, contact (masked) and address. */
export function CustomerTab({ data }: { data: P2SectionMap['customer'] }) {
  const shown = data.fields.filter((f) => !isEmpty(f.value) || ['enteredName', 'legalName', 'pan', 'aadhaar', 'identityStatus'].includes(f.key));
  const text = (key: string, value: unknown) => {
    if (isEmpty(value)) return <span className="p2w-muted">{key === 'legalName' ? 'Not established yet' : 'Not on file'}</span>;
    if (key === 'identityStatus') return IDENTITY_TEXT[String(value)] ?? String(value);
    if (key === 'customerType') return CUSTOMER_TYPE_TEXT[String(value)] ?? humanizeKey(String(value));
    if (key === 'dateOfBirth' && /^\d{4}-\d{2}-\d{2}/.test(String(value))) {
      const [y, m, d] = String(value).slice(0, 10).split('-').map(Number);
      return new Date(y, m - 1, d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    }
    return recordField(key, value);
  };
  return (
    <div className="j360-stack">
      <section className="j360-card" aria-label="Customer">
        <div className="j360-card__head">
          <h3 className="j360-h3">Customer</h3>
          <span className="p2w-muted">
            {data.identityStatus === 'DOCUMENT_VERIFIED'
              ? 'KYC-reviewed identity is the source of truth.'
              : 'Identity is pending until the PAN or Aadhaar is read.'}
          </span>
        </div>
        <dl className="j360-facts j360-facts--customer">
          {shown.map((field) => (
            <div key={field.key} className={field.key === 'address' ? 'is-wide' : undefined}>
              <dt>{field.label}</dt>
              <dd className={field.key === 'identityStatus' ? `is-${data.identityStatus.toLowerCase()}` : undefined}>{text(field.key, field.value)}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}

export function RegistrationTab({ data, journeyId }: { data: P2SectionMap['registration']; journeyId: string }) {
  return (
    <div className="j360-stack">
      <section className="j360-card" aria-label="Registration">
        <h3 className="j360-h3">Registration</h3>
        {data.records.length ? data.records.map((record, index) => <Facts key={index} record={record} />)
          : <p className="p2w-muted">No RTO documents read yet.</p>}
      </section>
      {data.charges ? <section className="j360-card"><ChargeTable category={data.charges} journeyId={journeyId} /></section> : null}
    </div>
  );
}

// ── Checks (control ledger) ─────────────────────────────────────────────────
export function ChecksTab({ data }: { data: P2Compliance360 }) {
  const [issuesOnly, setIssuesOnly] = useState(true);
  return (
    <div className="j360-stack">
      <label className="p2w-check"><input type="checkbox" checked={issuesOnly} onChange={(e) => setIssuesOnly(e.target.checked)} /> Only checks that need attention</label>
      {(['BOOKING', 'DELIVERY'] as const).map((stage) => {
        const stats = data.statistics[stage];
        const items = data.stages[stage].filter((item) => !issuesOnly || !['PASS', 'NOT_APPLICABLE'].includes(item.status));
        return (
          <section key={stage} className="j360-card" aria-label={`${humanizeKey(stage)} checks`}>
            <header className="j360-docs__head">
              <h3 className="j360-h3">{humanizeKey(stage)} checks</h3>
              <span className="j360-stats">
                <span className="p2w-tone p2w-tone--success">{stats.pass} passed</span>
                {stats.fail ? <span className="p2w-tone p2w-tone--danger">{stats.fail} issues</span> : null}
                <span className="p2w-muted">{stats.waiting} waiting · {stats.notApplicable} n/a{stats.retry + stats.error ? ` · ${stats.retry + stats.error} not run` : ''}</span>
              </span>
            </header>
            <ul className="j360-controls">
              {items.map((item) => {
                const status = CONTROL_STATUS[item.status] ?? { label: humanizeKey(item.status), tone: 'neutral' };
                return (
                  <li key={`${stage}-${item.code}`} className={`is-${status.tone}`}>
                    <span className={`p2w-chip p2w-chip--${status.tone}`}>{status.label}</span>
                    <span className="j360-controls__body">
                      <strong>{item.label}</strong>
                      <span className="p2w-muted">{item.reason}</span>
                      {item.leftValue !== undefined && item.leftValue !== null ? (
                        <span className="j360-compare">Found {displayValue(item.leftValue)} · compared with {displayValue(item.rightValue)}</span>
                      ) : null}
                    </span>
                    <span className="p2w-muted j360-controls__meta">{humanizeKey(item.category)}{item.severity ? ` · ${humanizeKey(item.severity)}` : ''}</span>
                  </li>
                );
              })}
              {!items.length ? <li className="p2w-empty p2w-empty--success">No {humanizeKey(stage).toLowerCase()} check needs attention.</li> : null}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

// ── Audit trail: milestones, tasks and every event, in order ────────────────
function elapsed(hours: number | null | undefined): string {
  if (hours === null || hours === undefined) return '';
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} min`;
  if (hours < 48) return `${hours.toFixed(1)} h`;
  return `${(hours / 24).toFixed(1)} days`;
}

const KIND_LABEL: Record<string, string> = {
  journey: 'Journey', document: 'Documents', review: 'Review', stage: 'Stages', check: 'Checks', task: 'Tasks', other: 'Other',
};

const TASK_STATUS_LABEL: Record<string, string> = {
  READY: 'Open', IN_PROGRESS: 'In progress', RETURNED: 'Returned', VERIFYING: 'Verifying', ACTION_COMPLETED: 'Verifying',
  AWAITING_REQUESTER_REVIEW: 'Awaiting review', VERIFIED_COMPLETE: 'Closed', CANCELLED: 'Cancelled', FAILED: 'Failed', DEAD_LETTER: 'Failed',
};

function eventSummary(event: P2SectionMap['audit']['events'][number]): string {
  const d = event.details ?? {};
  const bits = [
    event.kind === 'task' && event.subject ? event.subject : null,
    event.kind === 'check' && event.subject ? humanizeKey(event.subject) : null,
    typeof d.documentType === 'string' ? humanizeKey(d.documentType) : null,
    typeof d.filename === 'string' ? d.filename : null,
    typeof d.to === 'string' ? `→ ${humanizeKey(d.to)}` : null,
    typeof d.reason === 'string' && d.reason.length < 140 ? d.reason : null,
    typeof d.comment === 'string' ? `“${d.comment}”` : null,
    event.kind === 'stage' && event.subject ? humanizeKey(event.subject) : null,
  ].filter(Boolean);
  return bits.join(' · ');
}

const GATE_STATUS_TEXT: Record<string, string> = { PASS: 'Passed', FAIL: 'Not met', WAITING: 'Waiting' };

/** How a stage completed: which gates the stage engine evaluated and
 * when, and every rule that ran for the stage with what it found. */
function StageCompletion({ stage, data }: { stage: 'booking' | 'delivery'; data: P2StageCompletion }) {
  const title = stage === 'booking' ? 'How the Booking completed' : 'How the Delivery completed';
  const c = data.counts;
  return (
    <section className="j360-card" aria-label={title}>
      <div className="j360-card__head">
        <h3 className="j360-h3">{title}</h3>
        <span className="p2w-muted">{data.completedAtUtc ? `Completed ${formatDateTime(data.completedAtUtc)}` : 'Not completed yet'}</span>
      </div>
      <span className="j360-items__title">Gates</span>
      <ul className="j360-gates">
        {data.gates.map((gate) => (
          <li key={gate.key} className={`is-${gate.status.toLowerCase()}`}>
            <span className="j360-gates__mark" aria-hidden="true">{gate.status === 'PASS' ? '✓' : gate.status === 'FAIL' ? '✕' : '…'}</span>
            <span className="j360-gates__label">{gate.label}</span>
            <span className="p2w-muted">{GATE_STATUS_TEXT[gate.status] ?? gate.status}{gate.evaluatedAtUtc ? ` · ${formatDateTime(gate.evaluatedAtUtc)}` : ''}</span>
          </li>
        ))}
      </ul>
      <span className="j360-items__title">Rules fired · {c.fired}{c.fired ? ` (${c.passed} passed, ${c.failed} failed, ${c.waiting} waiting)` : ''}</span>
      {data.controls.length ? (
        <ul className="j360-gates j360-gates--rules">
          {data.controls.map((rule) => (
            <li key={rule.code} className={`is-${rule.status === 'PASS' ? 'pass' : rule.status === 'FAIL' ? 'fail' : 'waiting'}`}>
              <span className="j360-gates__mark" aria-hidden="true">{rule.status === 'PASS' ? '✓' : rule.status === 'FAIL' ? '✕' : '…'}</span>
              <span className="j360-gates__label">{rule.label}<small> {rule.executor === 'EXTERNAL_RULE_ENGINE' ? 'Rule Engine' : 'Audit Core'} · {rule.code}</small></span>
              <span className="p2w-muted">
                {CONTROL_STATUS[rule.status]?.label ?? humanizeKey(rule.status)}
                {rule.evaluatedAtUtc ? ` · ${formatDateTime(rule.evaluatedAtUtc)}` : ''}
                {rule.evaluations > 1 ? ` · ran ${rule.evaluations} times` : ''}
                {rule.status === 'FAIL' && rule.reason ? <><br />{rule.reason}</> : null}
              </span>
            </li>
          ))}
        </ul>
      ) : <p className="p2w-muted">No rule has run for this stage yet.</p>}
    </section>
  );
}

export function AuditTab({ data }: { data: P2SectionMap['audit'] }) {
  const [kind, setKind] = useState<string>('all');
  const counts = useMemo(() => {
    const out: Record<string, number> = {};
    data.events.forEach((e) => { out[e.kind] = (out[e.kind] ?? 0) + 1; });
    return out;
  }, [data.events]);
  const events = kind === 'all' ? data.events : data.events.filter((e) => e.kind === kind);
  const t = data.tasks.summary;
  const total = data.milestones.length > 1
    ? (new Date(data.milestones[data.milestones.length - 1].atUtc).getTime() - new Date(data.milestones[0].atUtc).getTime()) / 3_600_000
    : null;
  return (
    <div className="j360-stack">
      <div className="j360-grid">
        <section className="j360-card" aria-label="Milestones">
          <h3 className="j360-h3">Milestones{total !== null ? <span className="p2w-muted"> · {elapsed(total)} so far</span> : null}</h3>
          <ol className="j360-miles">
            {data.milestones.map((m) => (
              <li key={m.key} className="is-done">
                <time dateTime={m.atUtc}>{formatDateTime(m.atUtc)}</time>
                <strong>{m.label}</strong>
                <span className="p2w-muted">
                  {m.who ? m.who : ''}{m.who && m.hoursSincePrevious !== null ? ' · ' : ''}
                  {m.hoursSincePrevious !== null ? `${elapsed(m.hoursSincePrevious)} after the previous step` : ''}
                </span>
              </li>
            ))}
            {data.pending.map((m) => (
              <li key={m.key} className="is-todo">
                <time>—</time>
                <strong>{m.label}</strong>
                <span className="p2w-muted">Not yet</span>
              </li>
            ))}
          </ol>
        </section>
        <section className="j360-card" aria-label="Tasks">
          <h3 className="j360-h3">Tasks</h3>
          <dl className="j360-facts">
            <div><dt>Opened</dt><dd>{t.opened}</dd></div>
            <div><dt>Closed</dt><dd>{t.closed}</dd></div>
            <div><dt>Still open</dt><dd>{t.open}</dd></div>
            <div><dt>Avg. time to close</dt><dd>{t.avgHoursToClose === null ? '—' : elapsed(t.avgHoursToClose)}</dd></div>
          </dl>
          {data.tasks.items.length ? (
            <div className="j360-table-wrap">
              <table className="j360-table">
                <thead><tr><th scope="col">Task</th><th scope="col">For</th><th scope="col">Opened</th><th scope="col">Closed</th><th scope="col" className="is-num">Time open</th></tr></thead>
                <tbody>
                  {data.tasks.items.map((task) => (
                    <tr key={task.taskId}>
                      <th scope="row">{task.title}<span className="p2w-muted"> · {TASK_STATUS_LABEL[task.status] ?? humanizeKey(task.status)}</span></th>
                      <td data-label="For">{task.role}{task.raisedBy ? <span className="p2w-muted"> · by {task.raisedBy}</span> : null}</td>
                      <td data-label="Opened">{formatDateTime(task.openedAtUtc)}</td>
                      <td data-label="Closed">{task.closedAtUtc ? formatDateTime(task.closedAtUtc) : '—'}</td>
                      <td className="is-num" data-label="Time open">{task.hoursOpen === null ? 'still open' : elapsed(task.hoursOpen)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="p2w-muted">No tasks were raised on this journey.</p>}
        </section>
      </div>
      {data.stages ? (
        <section className="j360-card" aria-label="Time taken">
          <h3 className="j360-h3">Time taken</h3>
          <div className="j360-grid">
            {(['BOOKING', 'DELIVERY'] as const).map((code) => {
              const stage = data.stages![code];
              return (
                <dl key={code} className="j360-facts j360-facts--customer" aria-label={`${humanizeKey(code)} timing`}>
                  <div><dt>{humanizeKey(code)}{stage.cancelled ? ' · cancelled' : ''}</dt><dd>{stage.status ? humanizeKey(stage.status) : '—'}</dd></div>
                  <div><dt>Started</dt><dd>{formatDateTime(stage.startedAtUtc)}</dd></div>
                  <div><dt>Documents submitted</dt><dd>{formatDateTime(stage.submittedAtUtc)}</dd></div>
                  <div><dt>Completed</dt><dd>{formatDateTime(stage.completedAtUtc)}</dd></div>
                  <div><dt>Time to submit</dt><dd>{stage.hoursToSubmit === null || stage.hoursToSubmit === undefined ? '—' : elapsed(stage.hoursToSubmit)}</dd></div>
                  <div><dt>Time to complete</dt><dd>{stage.hoursToComplete === null || stage.hoursToComplete === undefined ? '—' : elapsed(stage.hoursToComplete)}</dd></div>
                </dl>
              );
            })}
          </div>
          {data.roles?.length ? (
            <div className="j360-table-wrap j360-mt">
              <table className="j360-table">
                <caption>Time by role</caption>
                <thead><tr><th scope="col">Role</th><th scope="col" className="is-num">Tasks</th><th scope="col" className="is-num">Open</th>
                  <th scope="col" className="is-num">Avg. time to close</th><th scope="col" className="is-num">Total time on tasks</th></tr></thead>
                <tbody>
                  {data.roles.map((r) => (
                    <tr key={r.role}>
                      <th scope="row">{r.role}</th>
                      <td className="is-num" data-label="Tasks">{r.tasks}</td>
                      <td className="is-num" data-label="Open">{r.open}</td>
                      <td className="is-num" data-label="Avg. time to close">{r.avgHoursToClose === null ? '—' : elapsed(r.avgHoursToClose)}</td>
                      <td className="is-num" data-label="Total time on tasks">{elapsed(r.totalHours)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>
      ) : null}
      {data.completion ? (
        <div className="j360-grid">
          {(['booking', 'delivery'] as const).map((stage) => <StageCompletion key={stage} stage={stage} data={data.completion![stage]} />)}
        </div>
      ) : null}
      <section className="j360-card" aria-label="Everything that happened">
        <div className="j360-docs__head">
          <h3 className="j360-h3">Everything that happened</h3>
          <div className="p2w-segment" role="tablist" aria-label="Filter events">
            <button type="button" role="tab" aria-selected={kind === 'all'} className={kind === 'all' ? 'is-active' : ''} onClick={() => setKind('all')}>All <b>{data.events.length}</b></button>
            {Object.entries(KIND_LABEL).filter(([key]) => counts[key]).map(([key, label]) => (
              <button key={key} type="button" role="tab" aria-selected={kind === key} className={kind === key ? 'is-active' : ''} onClick={() => setKind(key)}>{label} <b>{counts[key]}</b></button>
            ))}
          </div>
        </div>
        {events.length ? (
          <ol className="j360-timeline">
            {events.map((event, index) => (
              <li key={`${event.atUtc}-${index}`}>
                <time dateTime={event.atUtc}>{formatDateTime(event.atUtc)}</time>
                <strong><span className={`j360-kind is-${event.kind}`}>{KIND_LABEL[event.kind] ?? 'Other'}</span>{eventLabel(event.type)}{event.who ? <span className="p2w-muted"> · {event.who}</span> : null}</strong>
                {eventSummary(event) ? <span className="p2w-muted">{eventSummary(event)}</span> : null}
              </li>
            ))}
          </ol>
        ) : <Empty>Nothing recorded yet.</Empty>}
      </section>
    </div>
  );
}

// ── Duplicate booking banner ────────────────────────────────────────────────
export function DuplicatesBanner({ pairs }: { pairs: P2DuplicatePair[] }) {
  if (!pairs.length) return null;
  return (
    <section className="p2w-alert p2w-alert--error j360-dupes" role="alert" aria-label="Possible duplicate booking">
      <strong>Possible duplicate booking</strong>
      <ul>
        {pairs.map((pair) => (
          <li key={pair.findingId}>
            {pair.role === 'THIS_IS_DUPLICATE' ? 'This booking matches an earlier booking' : 'A later booking matches this one'}
            {' '}— {pair.otherJourney.customer_name ?? 'another customer'}{pair.otherJourney.outlet_name ? `, ${pair.otherJourney.outlet_name}` : ''}
            {' '}({pair.matchBasisLabel ?? humanizeKey(pair.matchBasis ?? 'match')}{pair.matchConfidencePercent ? `, ${pair.matchConfidencePercent}%` : ''}).{' '}
            <Link className="p2w-link" to={`/p2/journeys/${pair.otherJourney.journey_id}/overview`}>Open the other booking</Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
