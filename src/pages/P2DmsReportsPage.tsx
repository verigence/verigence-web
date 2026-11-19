import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import '../styles/uc03-p2.css';
import '../styles/uc03-p2-workspace.css';
import '../styles/uc03-p2-data-uploads.css';

import PageHeader from '../components/PageHeader';
import SectionCard from '../components/SectionCard';
import GenerateDmsReport from '../features/uc03-p2/dms/GenerateDmsReport';
import { getDmsSetup, listDmsDumps } from '../services/audit-core/uc03DmsDumps';
import { downloadGeneratedDmsReport, getDmsReport, listDmsReports } from '../services/audit-core/uc03DmsIntimations';
import { istMonth, monthLabel, monthsUpTo } from '../services/audit-core/uc03ProjectTracker';
import { useProjectContextStore } from '../store/projectContextStore';
import { useSessionStore } from '../store/sessionStore';

function when(value: string | undefined): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    .format(new Date(value));
}

function save(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * The DMS report in Reports (product owner 18 Nov 2026: "this report should move to the reports
 * section and it can be generated only by Reviewer and above"). Generated from the day's DMS dumps
 * and the PCs' intimation marks, kept as generated; with the statement of missing gate register
 * days and outlets whose PC was not available.
 */
export default function P2DmsReportsPage() {
  const tenantId = useProjectContextStore((s) => s.selectedProject?.tenantId);
  const accessToken = useSessionStore((s) => s.accessToken) ?? undefined;
  const queryClient = useQueryClient();
  const currentMonth = useMemo(() => istMonth(), []);
  const months = useMemo(() => monthsUpTo(currentMonth), [currentMonth]);
  const [month, setMonth] = useState(currentMonth);
  const [params, setParams] = useSearchParams();
  const selected = params.get('report');
  const [error, setError] = useState<string | null>(null);
  const [pickedDay, setPickedDay] = useState('');
  const enabled = Boolean(tenantId && accessToken);

  const setup = useQuery({ queryKey: ['dms-setup', tenantId], queryFn: () => getDmsSetup(tenantId!, accessToken), enabled });
  const dumps = useQuery({ queryKey: ['dms-dumps', tenantId, currentMonth, ''], queryFn: () => listDmsDumps(tenantId!, currentMonth, accessToken), enabled });
  const days = [...new Set((dumps.data?.items ?? []).filter((d) => d.status === 'ACTIVE').map((d) => d.businessDate))].sort().reverse();
  const reportDay = pickedDay && days.includes(pickedDay) ? pickedDay : days[0] ?? '';
  const reports = useQuery({ queryKey: ['dms-reports', tenantId, month], queryFn: () => listDmsReports(tenantId!, month, accessToken), enabled });
  const report = useQuery({
    queryKey: ['dms-report', tenantId, selected],
    queryFn: () => getDmsReport(tenantId!, selected!, accessToken),
    enabled: enabled && Boolean(selected),
  });
  const choose = (id: string | null) => {
    const next = new URLSearchParams(params);
    if (id) next.set('report', id); else next.delete('report');
    setParams(next, { replace: true });
  };
  const download = async (id: string, date: string) => {
    setError(null);
    try {
      save(await downloadGeneratedDmsReport(tenantId!, id, accessToken), `DMS-Report_${date}.xlsx`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The report could not be downloaded.');
    }
  };
  const f = report.data?.figures ?? {};

  return (
    <div className="screen-stack p2-screen p2w">
      <PageHeader
        eyebrow="Reports"
        title="DMS report"
        description="The day's DMS booking and delivery dumps against Verigence, from the PCs' intimation marks: what is synced, what was intimated to the PC and is pending with them, and what was never intimated. With the days each outlet's gate register is missing and the outlets whose PC was not available."
        actions={setup.isError ? undefined : (
          <GenerateDmsReport tenantId={tenantId} accessToken={accessToken} day={reportDay} days={days} onDay={setPickedDay}
            onError={setError}
            onGenerated={(id) => { setMonth(currentMonth); choose(id); void queryClient.invalidateQueries({ queryKey: ['dms-reports', tenantId] }); }} />
        )}
      />
      {error ? <div className="p2w-alert p2w-alert--error" role="alert">{error}</div> : null}
      {setup.isError ? <div className="p2w-alert p2w-alert--error" role="alert">{setup.error instanceof Error ? setup.error.message : 'Not available.'}</div> : null}

      {selected && report.data ? (
        <SectionCard>
          <div className="p2w-card__title">
            <h3>Report of {report.data.date}</h3>
            <p className="p2w-muted">Generated by {report.data.generatedBy} · {when(report.data.generatedAtUtc)}</p>
          </div>
          <div className="p2du-toolbar">
            <button type="button" className="p2w-button p2w-button--primary" onClick={() => void download(report.data!.reportId, report.data!.date)}>
              Download Excel
            </button>
            <button type="button" className="p2w-link" onClick={() => choose(null)}>Close</button>
          </div>
          <div className="p2du-tiles">
            <div className="p2du-tile"><span>Bookings in DMS</span><strong>{f.bookingDms ?? 0}</strong><small>{f.bookingSynced ?? 0} synced</small></div>
            <div className="p2du-tile p2du-tile--warn"><span>Booking intimated to PC</span><strong>{f.bookingIntimated ?? 0}</strong><small>not in Verigence · pending with PC</small></div>
            <div className="p2du-tile p2du-tile--bad"><span>Booking not intimated</span><strong>{f.bookingNotIntimated ?? 0}</strong><small>pending with dealership</small></div>
            <div className="p2du-tile"><span>Deliveries in dump</span><strong>{f.deliveryDump ?? 0}</strong><small>{f.deliverySynced ?? 0} synced</small></div>
            <div className="p2du-tile p2du-tile--warn"><span>Delivery intimated to PC</span><strong>{f.deliveryIntimated ?? 0}</strong><small>not uploaded · pending with PC</small></div>
            <div className="p2du-tile p2du-tile--bad"><span>Delivery not intimated</span><strong>{f.deliveryNotIntimated ?? 0}</strong><small>pending with dealership</small></div>
            <div className="p2du-tile"><span>Dump deliveries Inscope</span><strong>{f.dumpInscope ?? 0}</strong><small>{f.dumpOutscope ?? 0} Outscope{f.dumpOtherDealType ? ` · ${f.dumpOtherDealType} MR / Lease / Bulk` : ''}{f.dumpDealTypePending ? ` · ${f.dumpDealTypePending} pending` : ''}</small></div>
          </div>
          {report.data.nameDiffers?.length ? (
            <div className="dmsr-review">
              <h4>Matched, but the customer name differs ({report.data.nameDiffers.length})</h4>
              <p className="p2w-muted">The chassis, booking number or mobile agree; the customer does not. Check whether the right papers are on the journey.</p>
              <div className="p2du-scroll">
                <table className="p2du-table">
                  <thead><tr><th>Dealership</th><th>Dump</th><th>Date</th><th>DMS customer</th><th>Verigence customer</th><th>Journey</th><th>Journey outlet</th><th>Matched on</th></tr></thead>
                  <tbody>
                    {report.data.nameDiffers.map((r, i) => (
                      <tr key={i}>
                        <td>{r.dealerName}</td><td>{r.kind}</td><td>{r.eventDate ?? '—'}</td><td>{r.dmsCustomer ?? '—'}</td>
                        <td>{r.journeyCustomer ?? '—'}</td><td>{r.journeyReference ?? '—'}</td><td>{r.journeyOutlet ?? '—'}</td>
                        <td>{r.matchedOn ?? '—'}{r.matchedOn === 'Chassis' && r.chassis ? ` ${r.chassis}` : ''}{r.matchedOn === 'Mobile' && r.mobile ? ` ${r.mobile}` : ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
          <div className="dmsr-statement">
            <h4>Statement</h4>
            {(report.data.statementLines ?? []).map((line, i) => (
              line.startsWith('*') ? <p key={i}>{line}</p> : <p key={i} className="dmsr-statement__dealer">{line}</p>
            ))}
          </div>
          <div className="p2du-scroll">
            <table className="p2du-table">
              <thead><tr><th>Dealership</th><th>Booking dump</th><th>Delivery dump</th><th className="num">Bookings</th><th className="num">Synced</th>
                <th className="num">Intimated</th><th className="num">Not intimated</th><th className="num">Deliveries</th><th className="num">Synced</th>
                <th className="num">Intimated</th><th className="num">Not intimated</th><th className="num">Inscope</th><th className="num">Outscope</th><th className="num">Gate register</th><th className="num">Registers missed</th></tr></thead>
              <tbody>
                {report.data.dealers.map((d) => (
                  <tr key={d.dealerId}>
                    <td>{d.dealerName}</td><td>{d.bookingDumpDate ?? '—'}</td><td>{d.deliveryDumpDate ?? '—'}</td>
                    <td className="num">{d.figures.bookingDms ?? 0}</td><td className="num">{d.figures.bookingSynced ?? 0}</td>
                    <td className="num">{d.figures.bookingIntimated ?? 0}</td><td className="num">{d.figures.bookingNotIntimated ?? 0}</td>
                    <td className="num">{d.figures.deliveryDump ?? 0}</td><td className="num">{d.figures.deliverySynced ?? 0}</td>
                    <td className="num">{d.figures.deliveryIntimated ?? 0}</td><td className="num">{d.figures.deliveryNotIntimated ?? 0}</td>
                    <td className="num">{d.figures.dumpInscope ?? 0}</td><td className="num">{d.figures.dumpOutscope ?? 0}</td>
                    <td className="num">{d.figures.gateRegister ?? 0}</td><td className="num">{d.figures.registersMissed ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      ) : selected && report.isLoading ? <p className="p2w-muted">Loading…</p> : null}

      <SectionCard>
        <div className="p2w-card__title"><h3>Reports generated</h3></div>
        <div className="p2du-toolbar">
          <label>Month
            <select value={month} onChange={(e) => setMonth(e.target.value)}>
              {months.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </label>
        </div>
        {reports.data && !reports.data.items.length ? <p className="p2w-empty">No report generated for {monthLabel(month)} yet.</p> : null}
        {reports.data?.items.length ? (
          <div className="p2du-scroll">
            <table className="p2du-table">
              <thead><tr><th>Dumps of</th><th>Generated by</th><th>At</th><th className="num">Bookings not intimated</th><th className="num">Deliveries not intimated</th><th /></tr></thead>
              <tbody>
                {reports.data.items.map((r) => (
                  <tr key={r.reportId} className={`is-clickable${selected === r.reportId ? ' is-selected' : ''}`} onClick={() => choose(r.reportId)}>
                    <td>{r.date}</td><td>{r.generatedBy}</td><td>{when(r.generatedAtUtc)}</td>
                    <td className="num">{r.figures.bookingNotIntimated ?? 0}</td><td className="num">{r.figures.deliveryNotIntimated ?? 0}</td>
                    <td><button type="button" className="p2w-link" onClick={(e) => { e.stopPropagation(); void download(r.reportId, r.date); }}>Excel</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </SectionCard>
    </div>
  );
}
