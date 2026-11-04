import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import '../../../styles/uc03-p2-missing-documents.css';

import SectionCard from '../../../components/SectionCard';
import { filterDaysByDocument, getMissingDocuments } from '../../../services/audit-core/uc03MissingDocuments';
import JourneyClosedBadge from '../workspace/JourneyClosedBadge';

/**
 * Missing documents of the journeys with deliveries in a period (product owner
 * 2026-11-02 / 11-03): the count of each missing document type over the period,
 * a day-by-day summary, and each day's delivery files with what they still miss.
 * The PC's Tracker shows it for the Tracker's period (their outlets); the Team
 * Lead's Missing documents page for the whole Project, with an outlet filter.
 */
export default function MissingDocumentsPanel({ tenantId, accessToken, from, to, supervisor = false, top }: {
  tenantId: string;
  accessToken?: string;
  from: string;
  to: string;
  supervisor?: boolean;
  /** Show the delivery files closest to completion, this many (product owner 2026-11-03: 20 a day, 30 a week). */
  top?: number;
}) {
  const [outletId, setOutletId] = useState('');
  const [documentKey, setDocumentKey] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ['p2-missing-documents', tenantId, from, to, outletId, top ?? null],
    queryFn: () => getMissingDocuments(tenantId, { from, to, outletId: outletId || undefined, top }, accessToken),
    enabled: Boolean(tenantId && accessToken),
    staleTime: 30_000,
  });
  const report = query.data;
  const shown = useMemo(() => filterDaysByDocument(report?.days ?? [], documentKey), [report, documentKey]);
  const anyByUpload = shown.some((day) => day.journeys.some((j) => j.basis === 'UPLOAD'));
  const severalDays = from !== to;
  const openDays = shown.length <= 7;

  return (
    <div className="p2md">
      <div className="p2md-bar">
        {supervisor && (report?.outlets.length ?? 0) > 1 ? (
          <label className="p2md-filter">
            Outlet
            <select value={outletId} onChange={(e) => { setOutletId(e.target.value); setDocumentKey(null); }}>
              <option value="">All outlets</option>
              {report?.outlets.map((o) => (
                <option key={o.outletId} value={o.outletId}>{o.dealerName} · {o.outletName}</option>
              ))}
            </select>
          </label>
        ) : null}
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

      {report && report.byDocument.length > 0 ? (
        <ul className="p2md-chips" aria-label="Missing documents by type">
          {report.byDocument.map((d) => {
            const active = documentKey === d.requirementKey;
            return (
              <li key={d.requirementKey}>
                <button type="button" aria-pressed={active}
                  className={`p2w-chip ${active ? 'p2w-chip--danger' : 'p2w-chip--neutral'}`}
                  onClick={() => setDocumentKey(active ? null : d.requirementKey)}>
                  {d.name} <b>{d.count}</b>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}

      {top && report?.closeToCompletion ? (
        <section className="p2md-close" aria-label="Closest to completion">
          <div>
            <h4>Closest to completion</h4>
            <p className="p2w-muted">
              Delivery files held up only by missing documents, fewest missing first, then the longest waiting
              {report.closeToCompletion.eligible > report.closeToCompletion.journeys.length
                ? ` (top ${report.closeToCompletion.journeys.length} of ${report.closeToCompletion.eligible})` : ''}.
              {report.closeToCompletion.heldByOtherTasks
                ? ` ${report.closeToCompletion.heldByOtherTasks} more also have other document tasks open.` : ''}
            </p>
          </div>
          {report.closeToCompletion.journeys.length === 0 ? (
            <p className="p2w-muted">None in this period.</p>
          ) : (
            <div className="p2md-scroll">
              <table className="p2w-table">
                <thead><tr><th>#</th><th>Customer</th><th>Delivered</th><th>Outlet</th><th>PC</th><th>Missing</th></tr></thead>
                <tbody>
                  {report.closeToCompletion.journeys.map((j, i) => (
                    <tr key={j.journeyId}>
                      <td>{i + 1}</td>
                      <td><Link className="p2w-link" to={`/p2/journeys/${j.journeyId}/documents`}>{j.customer}</Link>
                        {' '}<JourneyClosedBadge closure={j.reviewerClosure} closed={j.closed} /></td>
                      <td data-label="Delivered">{j.deliveryLabel}{j.basis === 'UPLOAD' ? ' *' : ''}</td>
                      <td data-label="Outlet">{j.outletName ?? '—'}</td>
                      <td data-label="PC">{j.pcName ?? '—'}</td>
                      <td data-label="Missing">
                        <ul className="p2md-docs">{j.documents.map((name) => <li key={name}>{name}</li>)}</ul>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}

      {supervisor && report && report.byOutlet.length > 0 && !outletId ? (
        <SectionCard title="By dealership and outlet">
          <div className="p2md-scroll">
            <table className="p2w-table">
              <thead><tr><th>Dealership</th><th>Outlet</th><th>Delivery files</th><th>Documents</th></tr></thead>
              <tbody>
                {report.byOutlet.map((o) => (
                  <tr key={o.outletId}>
                    <td>{o.dealerName ?? '—'}</td>
                    <td>
                      <button type="button" className="p2w-link" onClick={() => { setOutletId(o.outletId ?? ''); setDocumentKey(null); }}>
                        {o.outletName ?? '—'}
                      </button>
                    </td>
                    <td>{o.journeys}</td>
                    <td>{o.documents}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      ) : null}

      {severalDays && shown.length > 1 ? (
        <div className="p2md-scroll">
          <table className="p2w-table" aria-label="Missing documents day by day">
            <thead><tr><th>Delivery day</th><th>Delivery files</th><th>Documents missing</th></tr></thead>
            <tbody>
              {shown.map((day) => (
                <tr key={day.date}>
                  <td>{day.label}</td>
                  <td>{day.journeys.length}</td>
                  <td>{day.journeys.reduce((n, j) => n + j.documents.length, 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {shown.map((day) => (
        <details key={day.date} className="p2md-day" open={openDays}>
          <summary>
            <strong>{day.label}</strong>{' '}
            <span className="p2w-muted">{day.journeys.length} delivery {day.journeys.length === 1 ? 'file' : 'files'}</span>
          </summary>
          <div className="p2md-scroll">
            <table className="p2w-table">
              <thead><tr><th>Customer</th><th>Outlet</th><th>PC</th><th>Missing documents</th></tr></thead>
              <tbody>
                {day.journeys.map((j) => (
                  <tr key={j.journeyId}>
                    <td>
                      <Link className="p2w-link" to={`/p2/journeys/${j.journeyId}/documents`}>{j.customer}</Link>
                      {j.basis === 'UPLOAD' ? <span title="Dated by the day the delivery documents were uploaded"> *</span> : null}
                      {' '}<JourneyClosedBadge closure={j.reviewerClosure} closed={j.closed} />
                    </td>
                    <td data-label="Outlet">{j.outletName ?? '—'}</td>
                    <td data-label="PC">{j.pcName ?? '—'}</td>
                    <td data-label="Missing">
                      <ul className="p2md-docs">{j.documents.map((name) => <li key={name}>{name}</li>)}</ul>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      ))}

      {anyByUpload ? (
        <p className="p2md-note p2w-muted">
          * No readable delivery date on the vehicle gate pass: shown on the day the delivery documents were first uploaded.
        </p>
      ) : null}
      {query.isLoading ? <div className="p2w-skeleton">Loading…</div> : null}
      {report && !query.isLoading && shown.length === 0 && !query.isError ? (
        <div className="p2w-empty p2w-empty--success">No missing documents on delivered journeys in this period.</div>
      ) : null}
    </div>
  );
}
