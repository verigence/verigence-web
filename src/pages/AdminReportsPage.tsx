import { Fragment, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import PageHeader from '../components/PageHeader';
import {
  getJourneyReview,
  type JourneyReviewRow,
  type ReviewInvoice,
} from '../services/audit-core/adminReports';
import { cell, INVOICE_COLUMNS, reviewCsv } from '../features/admin/reports/reviewCsv';
import { listProjects } from '../services/audit-core/uc02Admin';
import { useSessionStore } from '../store/sessionStore';

type Cell = string | number | null;

const REPORTS = [
  {
    key: 'journey-review',
    title: 'Journey review',
    description:
      'For every Journey: the SKU and its price-list ex-showroom, the booking, each invoice as read, insurance, discounts against the SKU, scrappage and credit notes, and the cost sheet / ledger / bank letter / no-dues figures. Facts as held by the system; nothing is calculated here.',
  },
] as const;

function downloadCsv(rows: readonly JourneyReviewRow[]) {
  const blob = new Blob([`﻿${reviewCsv(rows)}`], { type: 'text/csv;charset=utf-8' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `verigence-journey-review-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function Detail({ row }: { row: JourneyReviewRow }) {
  const fields = Object.entries(row).filter(([k, v]) => k !== 'invoices' && v !== null && v !== '');
  return (
    <div className="oem-masters__table-wrap">
      <table className="oem-masters__table">
        <tbody>
          {fields.map(([k, v]) => (
            <tr key={k}><th scope="row">{k}</th><td>{cell(v as Cell)}</td></tr>
          ))}
        </tbody>
      </table>
      {row.invoices.length ? (
        <table className="oem-masters__table">
          <thead><tr>{INVOICE_COLUMNS.map((c) => <th key={c}>{c}</th>)}</tr></thead>
          <tbody>
            {row.invoices.map((inv, i) => (
              <tr key={`${cell(inv.doc)}-${i}`}>{INVOICE_COLUMNS.map((c) => <td key={c}>{cell(inv[c])}</td>)}</tr>
            ))}
          </tbody>
        </table>
      ) : <p>No invoice documents on this Journey.</p>}
    </div>
  );
}

export default function AdminReportsPage() {
  const accessToken = useSessionStore((state) => state.accessToken);
  const [tenantId, setTenantId] = useState('');
  const [reportKey, setReportKey] = useState<(typeof REPORTS)[number]['key']>('journey-review');
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState<string>();

  const projectsQuery = useQuery({
    queryKey: ['admin-reports-projects'],
    queryFn: () => listProjects(accessToken),
    enabled: Boolean(accessToken),
    staleTime: 30_000,
    retry: 1,
  });
  const reviewQuery = useQuery({
    queryKey: ['admin-report-journey-review', tenantId],
    queryFn: () => getJourneyReview(tenantId, accessToken!),
    enabled: Boolean(tenantId && accessToken),
    staleTime: 60_000,
    retry: 1,
  });

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const all = reviewQuery.data?.journeys ?? [];
    return needle
      ? all.filter((r) => [r.ref, r.customer, r.outlet, r.pc, r.sku_code, r.booked_model]
        .some((v) => cell(v as Cell).toLowerCase().includes(needle)))
      : all;
  }, [reviewQuery.data, search]);

  const report = REPORTS.find((r) => r.key === reportKey) ?? REPORTS[0];

  return (
    <section className="admin-landing screen-stack">
      <PageHeader
        eyebrow="Administration · Reports"
        title="Reports"
        description="SuperAdmin reports, read live from a Project's records. They only read; nothing here changes a Journey."
      />
      <div className="uc01-admin-config-grid">
        <article className="uc01-admin-config-card">
          <span className="eyebrow">Report</span>
          <label className="uc03-booking-field">
            <span>Report</span>
            <select value={reportKey} onChange={(e) => setReportKey(e.target.value as typeof reportKey)}>
              {REPORTS.map((r) => <option key={r.key} value={r.key}>{r.title}</option>)}
            </select>
          </label>
          <p>{report.description}</p>
          <label className="uc03-booking-field">
            <span>Project / Tenant</span>
            <select value={tenantId} disabled={projectsQuery.isPending} onChange={(e) => { setTenantId(e.target.value); setOpen(undefined); }}>
              <option value="">Select Project</option>
              {(projectsQuery.data ?? []).map((p) => (
                <option key={p.tenantId} value={p.tenantId}>{p.projectName} · {p.projectCode}</option>
              ))}
            </select>
          </label>
          {projectsQuery.isError ? <div className="uc01-admin-message uc01-admin-message--error">Projects could not be loaded.</div> : null}
        </article>
      </div>

      {tenantId && reviewQuery.isPending ? <p>Reading every Journey in the Project. This can take a minute.</p> : null}
      {reviewQuery.isError ? <div className="uc01-admin-message uc01-admin-message--error">The report could not be loaded. Try again; if it repeats, the Project is too large for one read.</div> : null}

      {reviewQuery.data ? (
        <article className="uc01-admin-config-card">
          <span className="eyebrow">{report.title}</span>
          <p>
            {reviewQuery.data.journeyCount} Journeys · read {new Date(reviewQuery.data.generatedAtUtc).toLocaleString()}
          </p>
          <div>
            <input
              type="search"
              placeholder="Search reference, customer, outlet, PC, SKU, model"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search the report"
            />{' '}
            <button type="button" className="uc01-admin-button" onClick={() => downloadCsv(rows)} disabled={!rows.length}>
              Download ({rows.length}) as CSV
            </button>
          </div>
          <div className="oem-masters__table-wrap">
            <table className="oem-masters__table">
              <thead>
                <tr>
                  <th>Journey</th><th>Customer</th><th>Outlet</th><th>Stage</th><th>Booked vehicle</th>
                  <th>SKU</th><th>Price-list ex-showroom</th><th>Deal ex-showroom</th><th>Invoices</th>
                  <th>Insurer</th><th>Insurance source</th><th>Scrappage</th><th>Credit notes</th><th />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <Fragment key={r.ref}>
                    <tr>
                      <td>{r.ref}</td><td>{cell(r.customer as Cell)}</td><td>{cell(r.outlet as Cell)}</td>
                      <td>{cell(r.stage as Cell)}</td>
                      <td>{[cell(r.booked_model as Cell), cell(r.booked_variant as Cell)].filter(Boolean).join(' ')}</td>
                      <td>{cell(r.sku_code as Cell) || '—'}</td>
                      <td>{cell(r.std_ex_showroom as Cell) || '—'}</td>
                      <td>{cell(r.deal_ex_showroom as Cell) || '—'}</td>
                      <td>{r.invoices.length}</td>
                      <td>{cell(r.insurer_name as Cell) || '—'}</td>
                      <td>{cell(r.insurance_source as Cell) || '—'}</td>
                      <td>{cell(r.scrappage_certs as Cell)}</td><td>{cell(r.credit_notes as Cell)}</td>
                      <td>
                        <button type="button" className="p2w-link" aria-expanded={open === r.ref} onClick={() => setOpen(open === r.ref ? undefined : r.ref)}>
                          {open === r.ref ? 'Hide' : 'All facts'}
                        </button>
                      </td>
                    </tr>
                    {open === r.ref ? <tr><td colSpan={14}><Detail row={r} /></td></tr> : null}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      ) : null}
    </section>
  );
}
