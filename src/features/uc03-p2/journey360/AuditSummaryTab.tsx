import type { ReactNode } from 'react';

import type { P2AuditConclusion, P2AuditRow, P2AuditSummary } from '../../../services/audit-core/uc03P2';
import { money, signedMoney } from './j360Format';

/**
 * Audit summary (product owner 2026-10-29): every financial fact of the
 * journey on one page, as an auditor reads it -- what the customer owes, the
 * benefits given, the products sold, how it was paid and where the documents
 * disagree -- each row with its conclusion and the rule it rests on. Built on
 * demand when the tab is opened; the detail stays in the other tabs.
 */

const CONCLUSION: Record<P2AuditConclusion, { label: string; tone: string }> = {
  OK: { label: 'OK', tone: 'success' },
  EXCEPTION: { label: 'Exception', tone: 'danger' },
  UNSUPPORTED: { label: 'Unsupported', tone: 'danger' },
  DISPUTED: { label: 'Documents disagree', tone: 'warning' },
  CANNOT_DETERMINE: { label: 'Cannot conclude', tone: 'neutral' },
  INFO: { label: 'For information', tone: 'neutral' },
};

const VERDICT: Record<P2AuditSummary['verdict']['status'], { label: string; tone: string; text: string }> = {
  CLEAN: { label: 'Clean', tone: 'success', text: 'Every line concludes and none is an exception.' },
  EXCEPTIONS: { label: 'Exceptions found', tone: 'danger', text: 'At least one line is an exception, unsupported or disputed.' },
  INCOMPLETE: { label: 'Incomplete', tone: 'warning', text: 'No exception so far, but some lines cannot be concluded yet.' },
};

const IMPACT = { CUSTOMER: 'customer pays more', COMPANY: 'dealership gives more' } as const;

const BILLED_SOURCE: Record<string, string> = {
  ACCOUNT_STATEMENT: 'the account statement (NDC), else the cost sheet',
  INVOICE: 'the invoices',
};

export function conclusionLabel(row: Pick<P2AuditRow, 'conclusion' | 'impact'>): string {
  const base = CONCLUSION[row.conclusion]?.label ?? row.conclusion;
  return row.impact && row.conclusion === 'EXCEPTION' ? `${base} · ${IMPACT[row.impact]}` : base;
}

function Conclusion({ row, rules }: { row: Pick<P2AuditRow, 'conclusion' | 'impact' | 'rule' | 'reason'>; rules: Record<string, string> }) {
  const tone = CONCLUSION[row.conclusion]?.tone ?? 'neutral';
  return (
    <div className="asum-conclusion">
      <span className={`p2w-chip p2w-chip--${tone}`}>{conclusionLabel(row)}</span>
      {row.reason ? <small>{row.reason}</small> : null}
      {row.rule ? <small className="asum-rule" title={rules[row.rule]}>{row.rule}</small> : null}
    </div>
  );
}

function Billed({ row }: { row: P2AuditRow }) {
  return (
    <>
      {money(row.billed)}
      {row.billed && row.billedFrom ? <small className="asum-from">{row.billedFrom}</small> : null}
    </>
  );
}

function Proof({ row }: { row: P2AuditRow }) {
  if (!row.proof) return <>—</>;
  return (
    <span className={row.proof.onFile ? 'asum-proof is-on-file' : 'asum-proof is-missing'}>
      {row.proof.onFile ? 'On file' : 'Not on file'}
      {row.proof.amount ? <small>{money(row.proof.amount)}</small> : null}
    </span>
  );
}

function Section({ number, title, note, children }: { number: number; title: string; note?: string; children: ReactNode }) {
  return (
    <section className="j360-card asum-section" aria-labelledby={`asum-${number}`}>
      <div className="asum-section__head">
        <h3 className="j360-h3" id={`asum-${number}`}><span className="asum-num">{number}</span>{title}</h3>
        {note ? <p className="p2w-muted">{note}</p> : null}
      </div>
      {children}
    </section>
  );
}

function RowTable({ rows, caption, entitledLabel, billedLabel, rules, product = false }: {
  rows: P2AuditRow[]; caption: string; entitledLabel: string; billedLabel: string;
  rules: Record<string, string>; product?: boolean;
}) {
  if (!rows.length) return <p className="p2w-muted">Nothing on record.</p>;
  return (
    <div className="j360-table-wrap">
      <table className="j360-table asum-table">
        <caption className="visually-hidden">{caption}</caption>
        <thead>
          <tr>
            <th scope="col">Line</th>
            {product ? <th scope="col">Taken</th> : null}
            <th scope="col" className="is-num">{entitledLabel}</th>
            <th scope="col" className="is-num">Booked</th>
            <th scope="col" className="is-num">{billedLabel}</th>
            <th scope="col">Proof</th>
            <th scope="col" className="is-num">Difference</th>
            <th scope="col">Conclusion</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.section}-${row.key}`} className={['EXCEPTION', 'UNSUPPORTED'].includes(row.conclusion) ? 'is-flagged' : ''}>
              <th scope="row">{row.label}{row.category && !product ? <small className="p2w-muted">{row.category}</small> : null}</th>
              {product ? <td data-label="Taken">{row.taken === true ? 'Yes' : row.taken === false ? 'No' : '—'}</td> : null}
              <td className="is-num" data-label={entitledLabel}>{money(row.entitled)}</td>
              <td className="is-num" data-label="Booked">{money(row.booked)}</td>
              <td className="is-num" data-label={billedLabel}><Billed row={row} /></td>
              <td data-label="Proof"><Proof row={row} /></td>
              <td className="is-num" data-label="Difference">{signedMoney(row.difference)}</td>
              <td data-label="Conclusion"><Conclusion row={row} rules={rules} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Fact({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: string }) {
  return (
    <div className={tone ? `asum-fact is-${tone}` : 'asum-fact'}>
      <dt>{label}</dt>
      <dd>{value}{sub ? <small>{sub}</small> : null}</dd>
    </div>
  );
}

function when(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export default function AuditSummaryTab({ data, onRegenerate, regenerating }: {
  data: P2AuditSummary; onRegenerate: () => void; regenerating: boolean;
}) {
  const v = data.verdict;
  const verdict = VERDICT[v.status];
  const flagged = v.counts.EXCEPTION + v.counts.UNSUPPORTED + v.counts.DISPUTED;
  const f = data.funding;
  const s = data.settlement;
  return (
    <div className="j360-stack asum">
      <header className="j360-card asum-report">
        <div>
          <span className="j360-label">Audit summary</span>
          <h2 className="asum-title">Financial audit of this journey</h2>
          <p className="p2w-muted">
            Prepared {when(data.generatedAtUtc)} · Tolerance ±₹{data.tolerance} either way
            {data.billedSource ? ` · Billed figures from ${BILLED_SOURCE[data.billedSource] ?? data.billedSource}` : ''}
          </p>
        </div>
        <button type="button" className="p2w-button p2w-button--secondary" onClick={onRegenerate} disabled={regenerating}>
          {regenerating ? 'Preparing…' : 'Prepare again'}
        </button>
      </header>

      <section className={`j360-card asum-verdict is-${verdict.tone}`} aria-label="Verdict">
        <div className="asum-verdict__status">
          <span className="j360-label">Verdict</span>
          <strong>{verdict.label}</strong>
          <p>{verdict.text}</p>
        </div>
        <dl className="asum-facts">
          <Fact label="Customer overcharged" value={money(v.amountAtRisk.customerOvercharged)} tone={Number(v.amountAtRisk.customerOvercharged) ? 'danger' : undefined} />
          <Fact label="Dealership gave more" value={money(v.amountAtRisk.companyLeakage)} tone={Number(v.amountAtRisk.companyLeakage) ? 'danger' : undefined} />
          <Fact label="Lines flagged" value={flagged} sub={`${v.counts.EXCEPTION} exception · ${v.counts.UNSUPPORTED} unsupported · ${v.counts.DISPUTED} disputed`} />
          <Fact label="Lines concluded OK" value={v.counts.OK} sub={`${v.counts.CANNOT_DETERMINE} cannot be concluded yet`} />
        </dl>
        {v.missing.length ? (
          <div className="asum-missing">
            <span className="j360-label">Needed to conclude</span>
            <ul>{v.missing.map((m) => <li key={m}>{m}</li>)}</ul>
          </div>
        ) : null}
      </section>

      <Section number={1} title="What the customer owes" note="Each charge against its standard figure, or against its own proof document for road tax, registration and insurance.">
        <RowTable rows={data.deal.charges} caption="Charges" entitledLabel="Standard" billedLabel="Billed" rules={data.rules} />
        <dl className="asum-facts asum-facts--totals">
          <Fact label="Gross billed" value={money(data.deal.gross)} />
          <Fact label="Discounts billed" value={money(data.deal.discounts)} />
          <Fact label="Net payable" value={money(data.deal.netPayable)} />
        </dl>
      </Section>

      <Section number={2} title="Benefits given" note="Each discount or offer against its entitlement (scheme or policy) and, where the benefit needs one, its proof document.">
        <RowTable rows={data.benefits} caption="Benefits" entitledLabel="Entitled" billedLabel="Given" rules={data.rules} />
      </Section>

      <Section number={3} title="Products sold" note="Insurance, extended warranty, RSA, FASTag and accessories: charged against standard, with the document that proves the product.">
        <p className="asum-line">Insurance: <strong>{f.insurance.by}</strong>{f.insurance.basis ? <span className="p2w-muted"> · {f.insurance.basis}</span> : null}</p>
        <RowTable rows={data.products} caption="Products sold" entitledLabel="Standard" billedLabel="Charged" rules={data.rules} product />
      </Section>

      <Section number={4} title="How it was paid">
        <dl className="asum-facts">
          <Fact label="Customer receipts" value={money(f.receipts)} />
          <Fact label="Loan received" value={f.loanDisbursed ? money(f.loanDisbursed) : f.loans.length ? 'Not on file' : '—'}
            sub={[f.loanSource ? `per ${f.loanSource}` : '', f.loanNote ?? ''].filter(Boolean).join(' · ') || undefined} />
          {f.refunds ? <Fact label="Refunded / adjusted" value={`− ${money(f.refunds)}`}
            sub={f.refundsSource ? `per ${f.refundsSource}` : undefined} /> : null}
          <Fact label="Total received" value={money(f.received)} />
          <Fact label="Verified with bank statement" value={money(f.bankCheck.verified)}
            sub={[Number(f.bankCheck.cash) ? `${money(f.bankCheck.cash)} cash` : '',
              Number(f.bankCheck.notFound) ? `${money(f.bankCheck.notFound)} not found on the statement` : '',
              Number(f.bankCheck.noStatement) ? `${money(f.bankCheck.noStatement)} with no statement` : ''].filter(Boolean).join(' · ') || undefined} />
        </dl>
        <div className="asum-checks">
          <div className="asum-check"><span>Payments verified with bank statement</span><Conclusion row={{ ...f.bankCheck, impact: null }} rules={data.rules} /></div>
          {f.loans.map((loan, i) => (
            <div className="asum-check" key={i}>
              <span>Loan · {loan.lender || 'lender not named'}<small className="p2w-muted">
                Sanctioned {money(loan.sanctioned)} · Disbursed {money(loan.disbursed)}{loan.deliveryOrder ? ` · DO ${loan.deliveryOrder}` : ''}</small></span>
              <Conclusion row={{ ...loan, impact: null }} rules={data.rules} />
            </div>
          ))}
          {!f.loans.length ? <div className="asum-check"><span>Loan</span><span className="p2w-muted">No loan on record</span></div> : null}
        </div>
        <dl className="asum-facts">
          <Fact label="Bank approval letter" value={f.bankApprovalOnFile ? 'On file' : 'Not on file'} />
          <Fact label="Delivery order" value={f.deliveryOrderOnFile ? 'On file' : 'Not on file'} />
          <Fact label="Exchange (old vehicle)"
            value={f.exchange.actualValue ? money(f.exchange.actualValue) : f.exchange.bookedValue ? money(f.exchange.bookedValue) : f.exchange.applicable === false ? 'Not applicable' : '—'}
            sub={[f.exchange.quotedValue ? `quoted ${money(f.exchange.quotedValue)}` : '',
              f.exchange.valuationReports ? `${f.exchange.valuationReports} valuation report${f.exchange.valuationReports === 1 ? '' : 's'}` : ''].filter(Boolean).join(' · ') || undefined} />
          <Fact label="Scrappage certificates" value={f.scrappage.certificates || 'None'} />
          <Fact label="Credit notes" value={f.creditNotes.count ? money(f.creditNotes.total) : 'None'}
            sub={f.creditNotes.count ? `${f.creditNotes.count} on file` : undefined} />
        </dl>
      </Section>

      <Section number={5} title="Settlement" note="Money received (receipts and loan, less refunds) against the net payable.">
        <dl className="asum-facts">
          <Fact label="Net payable" value={money(s.payable)} />
          <Fact label="Received" value={money(s.received)} />
          <Fact label="Balance" value={money(s.balance)}
            tone={s.status === 'SETTLED' ? 'success' : s.status ? 'danger' : undefined}
            sub={s.status === 'SETTLED' ? 'Settled' : s.status === 'SHORT' ? 'Short' : s.status === 'EXCESS' ? 'Excess received' : undefined} />
        </dl>
        <div className="asum-checks"><div className="asum-check"><span>Money received against net payable</span>
          <Conclusion row={{ ...s, impact: null }} rules={data.rules} /></div></div>
      </Section>

      <Section number={6} title="Documents that disagree" note="Lines two documents print with figures more than the tolerance apart.">
        {data.disputed.length ? (
          <ul className="asum-disputed">
            {data.disputed.map((d) => (
              <li key={d.label}><strong>{d.label}</strong>
                <span>{d.documents.map((doc) => `${doc.document ?? 'Document'} ${money(doc.amount)}`).join(' · ')}</span></li>
            ))}
          </ul>
        ) : <p className="p2w-muted">None: every line printed by more than one document agrees.</p>}
      </Section>

      <Section number={7} title="Documents required to complete the file"
        note={(() => {
          const docs = data.requiredDocuments ?? [];
          const missingCount = docs.filter((d) => !d.onFile).length;
          return docs.length
            ? `${docs.length - missingCount} of ${docs.length} on file${missingCount ? ` · ${missingCount} still needed` : ' · the file is complete'}. Mandatory documents, and conditional ones this deal's own documents make mandatory.`
            : 'No required documents for this journey.';
        })()}>
        {data.requiredDocuments?.length ? (
          <table className="asum-docs">
            <caption className="visually-hidden">Documents required to complete the file</caption>
            <thead><tr><th scope="col">Document</th><th scope="col">Stage</th><th scope="col">Why it is required</th><th scope="col">Status</th></tr></thead>
            <tbody>
              {data.requiredDocuments.map((d) => (
                <tr key={`${d.stage}:${d.key}`} className={d.onFile ? '' : 'is-missing'}>
                  <td data-label="Document">{d.label}</td>
                  <td data-label="Stage">{d.stage === 'BOOKING' ? 'Booking' : 'Delivery'}</td>
                  <td data-label="Why">{d.requirement === 'MANDATORY' ? 'Mandatory' : (d.reason ?? 'Conditional')}</td>
                  <td data-label="Status">{d.onFile
                    ? <span className="asum-doc-ok">On file{d.count > 1 ? ` (${d.count})` : ''}</span>
                    : <span className="asum-doc-missing">Missing</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </Section>

      <footer className="j360-card asum-basis">
        <span className="j360-label">Basis of preparation</span>
        <p>Prepared from the figures in the Deal, Payments, Add-ons and Trade-in tabs; nothing is estimated, and a figure not on file is shown as —.
          A billed figure the Deal does not have is taken from the first document that prints it: account statement, cost sheet, customer ledger, then invoice.
          A difference of up to ₹{data.tolerance} either way is no difference.</p>
        <dl className="asum-rules">
          {Object.entries(data.rules).map(([code, text]) => <div key={code}><dt>{code}</dt><dd>{text}</dd></div>)}
        </dl>
      </footer>
    </div>
  );
}
