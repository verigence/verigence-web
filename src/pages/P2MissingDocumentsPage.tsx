import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import '../styles/uc03-p2.css';
import '../styles/uc03-p2-workspace.css';
import '../styles/uc03-p2-missing-documents.css';

import PageHeader from '../components/PageHeader';
import SectionCard from '../components/SectionCard';
import {
  filterDaysByDocument, getMissingDocuments, periodStart,
} from '../services/audit-core/uc03MissingDocuments';
import { useProjectContextStore } from '../store/projectContextStore';
import { useSessionStore } from '../store/sessionStore';

const PERIODS = [
  { days: 7, label: 'Last 7 days' },
  { days: 31, label: 'Last 31 days' },
];

/**
 * Missing documents of the journeys that have deliveries, day by day, just the
 * names (product owner 2026-11-02). A PC sees their own outlets; the Team Lead,
 * PM and Executive the whole Project, with counts per dealership and outlet.
 */
export default function P2MissingDocumentsPage() {
  const project = useProjectContextStore((s) => s.selectedProject);
  const accessToken = useSessionStore((s) => s.accessToken);
  const tenantId = project?.tenantId;
  const supervisor = ['TL', 'PM', 'EXECUTIVE'].includes(String(project?.operatingRole ?? ''));
  const [days, setDays] = useState(31);
  const [outletId, setOutletId] = useState('');
  const [documentKey, setDocumentKey] = useState<string | null>(null);
  const from = periodStart(days);

  const query = useQuery({
    queryKey: ['p2-missing-documents', tenantId, from, outletId],
    queryFn: () => getMissingDocuments(tenantId!, { from, outletId: outletId || undefined }, accessToken),
    enabled: Boolean(tenantId && accessToken),
    staleTime: 30_000,
  });
  const report = query.data;
  const shown = useMemo(() => filterDaysByDocument(report?.days ?? [], documentKey), [report, documentKey]);
  const anyByUpload = shown.some((day) => day.journeys.some((j) => j.basis === 'UPLOAD'));

  return (
    <div className="screen-stack p2-screen p2w p2md">
      <PageHeader
        eyebrow="DealGuard"
        title="Missing documents"
        description={supervisor
          ? 'Documents still missing on the journeys that have deliveries, by delivery day, across the Project.'
          : 'Documents still missing on the journeys of your outlets that have deliveries, by delivery day.'}
      />
      {!tenantId || !accessToken ? (
        <div className="p2w-alert p2w-alert--error" role="alert">Select a project to continue.</div>
      ) : (
        <>
          <div className="p2md-bar">
            <div className="p2w-segment" role="tablist" aria-label="Period">
              {PERIODS.map((p) => (
                <button key={p.days} type="button" role="tab" aria-selected={days === p.days}
                  className={days === p.days ? 'is-active' : undefined} onClick={() => setDays(p.days)}>
                  {p.label}
                </button>
              ))}
            </div>
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
                : report ? `${report.totals.journeys} journeys · ${report.totals.documents} documents` : ''}
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

          {supervisor && report && report.byOutlet.length > 0 && !outletId ? (
            <SectionCard title="By dealership and outlet">
              <div className="p2md-scroll">
                <table className="p2w-table">
                  <thead><tr><th>Dealership</th><th>Outlet</th><th>Journeys</th><th>Documents</th></tr></thead>
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

          {shown.map((day) => (
            <SectionCard key={day.date}>
              <section className="p2md-day" aria-label={day.label}>
                <h3>{day.label} <span className="p2w-muted">{day.journeys.length} {day.journeys.length === 1 ? 'journey' : 'journeys'}</span></h3>
                <div className="p2md-scroll">
                  <table className="p2w-table">
                    <thead><tr><th>Customer</th><th>Outlet</th><th>PC</th><th>Missing documents</th></tr></thead>
                    <tbody>
                      {day.journeys.map((j) => (
                        <tr key={j.journeyId}>
                          <td>
                            <Link className="p2w-link" to={`/p2/journeys/${j.journeyId}/documents`}>{j.customer}</Link>
                            {j.basis === 'UPLOAD' ? <span title="Dated by the day the delivery documents were uploaded"> *</span> : null}
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
              </section>
            </SectionCard>
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
        </>
      )}
    </div>
  );
}
