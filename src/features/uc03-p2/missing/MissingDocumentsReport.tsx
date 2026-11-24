import { Fragment, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import '../../../styles/uc03-p2-missing-documents.css';

import {
  getMissingDocuments,
  type MissingDocumentsJourney,
  type MissingDocumentsReport as Report,
} from '../../../services/audit-core/uc03MissingDocuments';

type View = 'document' | 'outlet';

/** Dealership, then its outlets, then each outlet's delivery files with what they miss. */
export function groupByOutlet(report: Report | undefined) {
  const dealers = new Map<string, { name: string; outlets: Map<string, { name: string; journeys: MissingDocumentsJourney[] }> }>();
  for (const day of report?.days ?? []) {
    for (const j of day.journeys) {
      const dealer = dealers.get(j.dealerId) ?? { name: j.dealerName ?? '—', outlets: new Map() };
      dealers.set(j.dealerId, dealer);
      const outlet = dealer.outlets.get(j.outletId) ?? { name: j.outletName ?? '—', journeys: [] };
      dealer.outlets.set(j.outletId, outlet);
      outlet.journeys.push(j);
    }
  }
  const byName = <T extends { name: string }>(a: T, b: T) => a.name.localeCompare(b.name);
  return [...dealers.entries()].map(([dealerId, d]) => {
    const outlets = [...d.outlets.entries()].map(([outletId, o]) => ({
      outletId, name: o.name,
      journeys: [...o.journeys].sort((a, b) => b.documents.length - a.documents.length || a.customer.localeCompare(b.customer)),
      documents: o.journeys.reduce((n, j) => n + j.documents.length, 0),
    })).sort(byName);
    return { dealerId, name: d.name, outlets,
      journeys: outlets.reduce((n, o) => n + o.journeys.length, 0), documents: outlets.reduce((n, o) => n + o.documents, 0) };
  }).sort(byName);
}

/**
 * Missing documents, kept simple (product owner 2026-11-24: "we have defined list of documents..
 * can we just aggregate as per our list and put a number in front of it... and on click we can
 * see it dealership wise and outlet.. and another view ... dealership wise, outlet wise list of
 * missing documents and its count and journey id and customer name.. and link to get more
 * details.. why making it complex").
 */
export default function MissingDocumentsReport({ tenantId, accessToken, from, to, initialView = 'document', initialOpen = null }: {
  tenantId: string; accessToken?: string; from: string; to: string;
  initialView?: View; initialOpen?: string | null;
}) {
  const [view, setView] = useState<View>(initialView);
  const [open, setOpen] = useState<string | null>(initialOpen);
  const query = useQuery({
    queryKey: ['p2-missing-documents', tenantId, from, to, null, null],
    queryFn: () => getMissingDocuments(tenantId, { from, to }, accessToken),
    enabled: Boolean(tenantId && accessToken),
    staleTime: 30_000,
  });
  const report = query.data;
  const dealers = useMemo(() => groupByOutlet(report), [report]);

  return (
    <div className="p2md">
      <div className="p2md-bar">
        <div className="p2w-segment" role="tablist" aria-label="View">
          <button type="button" role="tab" aria-selected={view === 'document'} className={view === 'document' ? 'is-active' : undefined}
            onClick={() => setView('document')}>By document</button>
          <button type="button" role="tab" aria-selected={view === 'outlet'} className={view === 'outlet' ? 'is-active' : undefined}
            onClick={() => setView('outlet')}>By dealership and outlet</button>
        </div>
        <span className="p2w-muted">
          {query.isFetching ? 'Refreshing…'
            : report ? `${report.totals.journeys} delivery ${report.totals.journeys === 1 ? 'file' : 'files'} · ${report.totals.documents} documents missing` : ''}
        </span>
      </div>

      {query.isError ? (
        <div className="p2w-alert p2w-alert--error" role="alert">
          <span>Missing documents could not be loaded.</span>
          <button type="button" className="p2w-link" onClick={() => void query.refetch()}>Try again</button>
        </div>
      ) : null}
      {query.isLoading ? <div className="p2w-skeleton">Loading…</div> : null}
      {report && report.totals.journeys === 0 ? (
        <div className="p2w-empty p2w-empty--success">No missing documents on delivered journeys in this period.</div>
      ) : null}

      {report && report.totals.journeys > 0 && view === 'document' ? (
        <div className="p2md-scroll">
          <table className="p2w-table p2md-table" aria-label="Missing documents by document">
            <thead><tr><th>Document</th><th className="p2md-num">Delivery files missing it</th></tr></thead>
            <tbody>
              {report.byDocument.map((d) => {
                const isOpen = open === d.requirementKey;
                return (
                  <Fragment key={d.requirementKey}>
                    <tr className={isOpen ? 'is-open' : undefined}>
                      <td>
                        <button type="button" className="p2md-toggle" aria-expanded={isOpen}
                          onClick={() => setOpen(isOpen ? null : d.requirementKey)}>
                          <span aria-hidden="true">{isOpen ? '▾' : '▸'}</span> {d.name}
                        </button>
                      </td>
                      <td className="p2md-num"><b>{d.count}</b></td>
                    </tr>
                    {isOpen ? (d.byOutlet ?? []).map((o) => (
                      <tr key={o.outletId} className="p2md-sub">
                        <td>{o.dealerName ?? '—'} · {o.outletName ?? '—'}</td>
                        <td className="p2md-num">{o.count}</td>
                      </tr>
                    )) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      {report && report.totals.journeys > 0 && view === 'outlet' ? dealers.map((dealer) => (
        <section key={dealer.dealerId} className="p2md-dealer" aria-label={dealer.name}>
          <h3>{dealer.name} <span className="p2w-muted">{dealer.journeys} delivery files · {dealer.documents} documents missing</span></h3>
          {dealer.outlets.map((outlet) => (
            <details key={outlet.outletId} className="p2md-day" open={dealer.outlets.length === 1}>
              <summary>
                <strong>{outlet.name}</strong>
                <span className="p2w-muted">{outlet.journeys.length} delivery {outlet.journeys.length === 1 ? 'file' : 'files'} · {outlet.documents} documents missing</span>
              </summary>
              <div className="p2md-scroll">
                <table className="p2w-table p2md-table p2md-table--wide">
                  <colgroup><col className="c-ref" /><col className="c-customer" /><col /><col className="c-count" /><col className="c-link" /></colgroup>
                  <thead><tr><th>Journey ID</th><th>Customer</th><th>Missing documents</th><th className="p2md-num">Count</th><th aria-label="Details" /></tr></thead>
                  <tbody>
                    {outlet.journeys.map((j) => (
                      <tr key={j.journeyId}>
                        <td data-label="Journey ID">{j.reference}</td>
                        <td data-label="Customer">{j.customer}</td>
                        <td data-label="Missing">{j.documents.join(', ')}</td>
                        <td data-label="Count" className="p2md-num">{j.documents.length}</td>
                        <td><Link className="p2w-link" to={`/p2/journeys/${j.journeyId}/documents`}>Details</Link></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          ))}
        </section>
      )) : null}
    </div>
  );
}
