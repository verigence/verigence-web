import { Fragment, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import type { JourneyReview as Report, JourneyReviewRow, ReviewInvoice } from '../../../services/audit-core/adminReports';
import { cell, reviewCsv } from './reviewCsv';
import {
  amountAt, discountLine, docCounts, money, needsLook, parts, searchRows, signals, sourceLabel, stageCounts, stageLabel, stageTone, text,
} from './journeyReviewLogic';

/** Every Journey of a Project with the facts the system holds for it --
 * readable at a glance, every fact one click away (redesigned 2026-10-31). */

const PAGE = 50;

function downloadCsv(rows: readonly JourneyReviewRow[]) {
  const blob = new Blob([`﻿${reviewCsv(rows)}`], { type: 'text/csv;charset=utf-8' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `verigence-journey-review-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="ar-fact"><dt>{label}</dt><dd>{children || <span className="ar-muted">—</span>}</dd></div>;
}

function Lines({ value, format }: { value: string; format?: (line: string) => string }) {
  const list = parts(value).map((line) => (format ? format(line) : line));
  if (!list.length) return <span className="ar-muted">—</span>;
  return <ul className="ar-lines">{list.map((line, i) => <li key={`${line}-${i}`}>{line}</li>)}</ul>;
}

function InvoiceCard({ invoice }: { invoice: ReviewInvoice }) {
  const v = (k: string) => cell(invoice[k] ?? null);
  const gst = [['CGST', 'cgst_rate', 'cgst_amt'], ['SGST', 'sgst_rate', 'sgst_amt'], ['IGST', 'igst_rate', 'igst_amt']]
    .filter(([, , amt]) => v(amt))
    .map(([name, rate, amt]) => `${name} ${v(rate) ? `${v(rate)}% ` : ''}${money(v(amt))}`);
  const active = v('assoc') === 'ACTIVE';
  return (
    <article className={`ar-invoice${active ? '' : ' is-muted'}`}>
      <header>
        <b>{v('type').replace(/_/g, ' ')}</b>
        <span className={`ar-chip is-${active ? 'ok' : 'muted'}`}>{active ? 'On file' : v('assoc').toLowerCase()}</span>
      </header>
      <dl className="ar-facts">
        <Fact label="Number">{v('inv_no')}</Fact>
        <Fact label="Date">{v('inv_date')}</Fact>
        <Fact label="Gross">{v('gross') && money(v('gross'))}</Fact>
        <Fact label="Discount">{v('discount') && money(v('discount'))}</Fact>
        <Fact label="Taxable">{v('taxable') && money(v('taxable'))}</Fact>
        <Fact label="GST">{gst.join(' · ')}</Fact>
        <Fact label="TCS">{v('tcs') && money(v('tcs'))}</Fact>
        <Fact label="Grand total"><b>{v('grand_total') && money(v('grand_total'))}</b></Fact>
        <Fact label="Model as printed">{[v('model_raw'), v('variant_raw')].filter(Boolean).join(' · ')}</Fact>
        <Fact label="Chassis">{v('chassis')}</Fact>
        <Fact label="Financed by">{v('financed_by')}</Fact>
        <Fact label="Buyer">{v('buyer')}</Fact>
      </dl>
      {v('lines') ? (
        <details className="ar-raw"><summary>Line items as read</summary><code>{v('lines')}</code></details>
      ) : null}
    </article>
  );
}

export function Detail({ row }: { row: JourneyReviewRow }) {
  const t = (k: string) => text(row, k);
  const deal = amountAt(t('deal_ex_showroom'));
  const s = signals(row);
  return (
    <div className="ar-detail">
      <div className="ar-detail__grid">
        <section className="ar-card">
          <h4>Journey</h4>
          <dl className="ar-facts">
            <Fact label="Reference">{t('ref')}</Fact>
            <Fact label="Customer">{t('customer')}</Fact>
            <Fact label="PC">{t('pc')}</Fact>
            <Fact label="Outlet">{t('outlet')}</Fact>
            <Fact label="Created">{t('created')}</Fact>
            <Fact label="Booking date">{t('booking_date')}</Fact>
            <Fact label="Priced on">{t('pricing_on')}</Fact>
          </dl>
        </section>
        <section className="ar-card">
          <h4>Vehicle and price</h4>
          <dl className="ar-facts">
            <Fact label="Booked">{[t('booked_model'), t('booked_variant')].filter(Boolean).join(' · ')}</Fact>
            <Fact label="SKU">{t('sku_code')}</Fact>
            <Fact label="SKU match">{[t('sel_status'), t('sel_method'), t('sel_score') && `score ${t('sel_score')}`].filter(Boolean).join(' · ')}</Fact>
            <Fact label="Category">{t('category')}</Fact>
            <Fact label="Price list">{t('pl_version') && `v${t('pl_version')} from ${t('pl_from')}`}</Fact>
            <Fact label="Price-list ex-showroom">{t('std_ex_showroom') && money(t('std_ex_showroom'))}</Fact>
            <Fact label="Deal ex-showroom">{deal.amount !== null ? `${money(deal.amount)}${deal.source ? ` (${deal.source})` : ''}` : ''}</Fact>
            <Fact label="Difference">{s.exShowroomGap !== null ? money(s.exShowroomGap) : ''}</Fact>
            <Fact label="Every document's figure"><Lines value={t('ex_showroom_sources')} /></Fact>
          </dl>
        </section>
        <section className="ar-card">
          <h4>Insurance</h4>
          <dl className="ar-facts">
            <Fact label="Insurer">{t('insurer_name')}</Fact>
            <Fact label="Policy">{t('policy_reference')}</Fact>
            <Fact label="Arranged by">{[t('insurance_by'), t('insurance_source')].filter(Boolean).join(' · ')}</Fact>
            <Fact label="Premium">{[t('record_premium') && `${money(t('record_premium'))} charged`, t('std_premium') && `${money(t('std_premium'))} standard`].filter(Boolean).join(' · ')}</Fact>
            <Fact label="Intermediary">{t('record_intermediary')}</Fact>
            <Fact label="Cover note as read"><Lines value={t('cover_doc')} /></Fact>
          </dl>
        </section>
        <section className="ar-card">
          <h4>Discounts</h4>
          <dl className="ar-facts">
            <Fact label="Against the SKU"><Lines value={t('applications')} format={discountLine} /></Fact>
            <Fact label="By document"><Lines value={t('discount_sources')} /></Fact>
            <Fact label="Booking docket"><Lines value={t('booking_discounts')} /></Fact>
            <Fact label="Cost sheet"><Lines value={t('cost_sheet_discounts')} /></Fact>
            <Fact label="Scrappage certificates">{t('scrappage_certs')}</Fact>
            <Fact label="Credit notes">{t('credit_notes')}</Fact>
          </dl>
        </section>
        <section className="ar-card">
          <h4>Documents on file</h4>
          <ul className="ar-doclist">
            {docCounts(t('active_docs')).map(([name, n]) => <li key={name}>{name}<b>{n}</b></li>)}
          </ul>
          {t('other_docs') ? <p className="ar-muted">Also: {t('other_docs')}</p> : null}
          {t('notable_files') ? <p className="ar-muted">Files: {t('notable_files')}</p> : null}
        </section>
        <section className="ar-card">
          <h4>Figures read from other documents</h4>
          <dl className="ar-facts">
            <Fact label="Cost sheet"><Lines value={t('cost_sheet')} /></Fact>
            <Fact label="NDC / ledger"><Lines value={t('ledger')} /></Fact>
            <Fact label="Booking docket"><Lines value={t('booking_docket')} /></Fact>
            <Fact label="Bank letter"><Lines value={t('bank_letter')} /></Fact>
            <Fact label="No dues"><Lines value={t('no_dues')} /></Fact>
          </dl>
        </section>
      </div>
      <h4 className="ar-detail__title">Invoices ({row.invoices.length})</h4>
      {row.invoices.length ? (
        <div className="ar-invoices">{row.invoices.map((inv, i) => <InvoiceCard key={`${cell(inv.doc ?? null)}-${i}`} invoice={inv} />)}</div>
      ) : <p className="ar-muted">No invoice documents on this Journey.</p>}
    </div>
  );
}

export default function JourneyReview({ report }: { report: Report }) {
  const [search, setSearch] = useState('');
  const [stage, setStage] = useState('');
  const [onlyLook, setOnlyLook] = useState(false);
  const [open, setOpen] = useState<string>();
  const [shown, setShown] = useState(PAGE);

  const stages = useMemo(() => stageCounts(report.journeys), [report.journeys]);
  const rows = useMemo(() => searchRows(report.journeys, search)
    .filter((r) => !stage || text(r, 'stage') === stage)
    .filter((r) => !onlyLook || needsLook(r)), [report.journeys, search, stage, onlyLook]);
  const totals = useMemo(() => {
    const all = report.journeys;
    return {
      sku: all.filter((r) => text(r, 'sku_code')).length,
      gap: all.filter((r) => { const g = signals(r).exShowroomGap; return g !== null && Math.abs(g) > 100; }).length,
      invoices: all.filter((r) => r.invoices.length).length,
      look: all.filter((r) => needsLook(r)).length,
    };
  }, [report.journeys]);
  const n = report.journeys.length;

  return (
    <div className="ar-report">
      <div className="ar-kpis">
        <div className="ar-kpi"><span className="ar-kpi__label">Journeys</span><strong>{report.journeyCount}</strong>
          <span className="ar-kpi__sub">read {new Date(report.generatedAtUtc).toLocaleString('en-IN')}</span></div>
        <div className="ar-kpi is-ok"><span className="ar-kpi__label">SKU identified</span><strong>{totals.sku}</strong>
          <span className="ar-kpi__sub">{n ? Math.round((totals.sku / n) * 100) : 0}% of Journeys</span></div>
        <div className="ar-kpi is-info"><span className="ar-kpi__label">With an invoice</span><strong>{totals.invoices}</strong>
          <span className="ar-kpi__sub">{n - totals.invoices} without</span></div>
        <button type="button" className={`ar-kpi is-warn${onlyLook ? ' is-active' : ''}`} onClick={() => setOnlyLook(!onlyLook)}>
          <span className="ar-kpi__label">Worth a look</span><strong>{totals.look}</strong>
          <span className="ar-kpi__sub">no SKU, no invoice at delivery, or ex-showroom off the price list ({totals.gap})</span>
        </button>
      </div>

      <div className="ar-toolbar">
        <input type="search" className="ar-search" placeholder="Search reference, customer, outlet, PC, SKU, model"
          value={search} onChange={(e) => { setSearch(e.target.value); setShown(PAGE); }} aria-label="Search Journeys" />
        <div className="ar-segment" role="tablist" aria-label="Stage">
          <button type="button" role="tab" aria-selected={!stage} className={!stage ? 'is-active' : ''}
            onClick={() => { setStage(''); setShown(PAGE); }}>All stages {n}</button>
          {stages.map(([code, count]) => (
            <button key={code} type="button" role="tab" aria-selected={stage === code}
              className={stage === code ? 'is-active' : ''} onClick={() => { setStage(code); setShown(PAGE); }}>
              {stageLabel(code)} {count}
            </button>
          ))}
        </div>
        <label className="ar-check">
          <input type="checkbox" checked={onlyLook} onChange={(e) => setOnlyLook(e.target.checked)} />
          <span>Only worth a look</span>
        </label>
        <button type="button" className="ar-button" onClick={() => downloadCsv(rows)} disabled={!rows.length}>
          Download CSV ({rows.length})
        </button>
      </div>

      <div className="ar-table-wrap">
        <table className="ar-table">
          <thead>
            <tr>
              <th scope="col">Journey</th>
              <th scope="col">Outlet · PC</th>
              <th scope="col">Stage</th>
              <th scope="col">Vehicle</th>
              <th scope="col" className="is-num">Ex-showroom</th>
              <th scope="col">Insurance</th>
              <th scope="col">Documents</th>
              <th scope="col"><span className="ar-sr">Details</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, shown).map((r) => {
              const t = (k: string) => text(r, k);
              const s = signals(r);
              const deal = amountAt(t('deal_ex_showroom'));
              const isOpen = open === r.ref;
              return (
                <Fragment key={r.ref}>
                  <tr className={isOpen ? 'is-open' : undefined}>
                    <th scope="row" data-label="Journey">
                      <span className="ar-version">
                        {t('journey_id')
                          ? <Link className="ar-link" to={`/p2/journeys/${t('journey_id')}/overview`}>{r.ref}</Link>
                          : <b>{r.ref}</b>}
                        <small>{t('customer')}</small>
                      </span>
                    </th>
                    <td data-label="Outlet · PC">
                      <span className="ar-version"><span>{t('outlet') || '—'}</span><small>{t('pc')}</small></span>
                    </td>
                    <td data-label="Stage"><span className={`ar-chip is-${stageTone(t('stage'))}`}>{stageLabel(t('stage'))}</span></td>
                    <td data-label="Vehicle">
                      <span className="ar-version">
                        <span>{[t('booked_model'), t('booked_variant')].filter(Boolean).join(' · ') || '—'}</span>
                        {s.noSku ? <small className="is-warn">SKU not identified</small> : <small>{t('sku_code')}</small>}
                      </span>
                    </td>
                    <td data-label="Ex-showroom" className="is-num">
                      <span className="ar-version is-right">
                        <b>{deal.amount !== null ? money(deal.amount) : '—'}</b>
                        <small>{deal.source ? `per ${deal.source}` : ''}</small>
                        {s.exShowroomGap !== null && Math.abs(s.exShowroomGap) > 100
                          ? <small className="is-warn">{s.exShowroomGap > 0 ? '+' : ''}{money(s.exShowroomGap)} vs price list</small>
                          : t('std_ex_showroom') ? <small>price list {money(t('std_ex_showroom'))}</small> : null}
                      </span>
                    </td>
                    <td data-label="Insurance">
                      <span className="ar-version">
                        <span>{t('insurer_name') || '—'}</span>
                        <small>{t('insurance_source') ? sourceLabel(t('insurance_source').toLowerCase()) : ''}</small>
                      </span>
                    </td>
                    <td data-label="Documents">
                      <span className="ar-badges">
                        <span className={`ar-tag${r.invoices.length ? '' : s.noInvoiceAtDelivery ? ' is-warn' : ''}`}>
                          {r.invoices.length} invoice{r.invoices.length === 1 ? '' : 's'}</span>
                        {Number(t('credit_notes')) > 0 ? <span className="ar-tag">{t('credit_notes')} credit note</span> : null}
                        {Number(t('scrappage_certs')) > 0 ? <span className="ar-tag">{t('scrappage_certs')} scrappage</span> : null}
                      </span>
                    </td>
                    <td data-label="Details">
                      <button type="button" className="ar-link" aria-expanded={isOpen}
                        onClick={() => setOpen(isOpen ? undefined : r.ref)}>{isOpen ? 'Hide' : 'All facts'}</button>
                    </td>
                  </tr>
                  {isOpen ? <tr className="ar-expand"><td colSpan={8}><Detail row={r} /></td></tr> : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      {!rows.length ? <p className="ar-muted">No Journey matches.</p> : null}
      {rows.length > shown ? (
        <button type="button" className="ar-button ar-more" onClick={() => setShown(shown + PAGE)}>
          Show {Math.min(PAGE, rows.length - shown)} more of {rows.length - shown}
        </button>
      ) : null}
    </div>
  );
}
