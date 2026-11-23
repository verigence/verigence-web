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

// The four groups, for bookings and deliveries alike, and the gate register (product owner 23 Nov 2026).
const GROUPS: { key: string; band: string; label: string; act?: boolean }[] = [
  { key: 'bookingSynced', band: 'Bookings', label: 'In Verigence and DMS' },
  { key: 'bookingNotInDms', band: 'Bookings', label: 'In Verigence, not in DMS', act: true },
  { key: 'bookingIntimated', band: 'Bookings', label: 'In DMS, intimated to PC, not in Verigence' },
  { key: 'bookingNotIntimated', band: 'Bookings', label: 'Left over: in DMS, not intimated', act: true },
  { key: 'gateRegister', band: 'Deliveries', label: 'As per gate register' },
  { key: 'deliverySynced', band: 'Deliveries', label: 'In Verigence and DMS' },
  { key: 'deliveryNotInDms', band: 'Deliveries', label: 'In Verigence, not in DMS', act: true },
  { key: 'deliveryIntimated', band: 'Deliveries', label: 'In DMS, intimated to PC, not in Verigence' },
  { key: 'deliveryNotIntimated', band: 'Deliveries', label: 'Left over: in DMS, not intimated', act: true },
];

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
  const download = async (id: string, date: string, format: 'xlsx' | 'pdf' = 'xlsx') => {
    setError(null);
    try {
      save(await downloadGeneratedDmsReport(tenantId!, id, accessToken, format), `DMS-Reconciliation-Report_${date}.${format}`);
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
        description="The day's DMS booking and delivery dumps against Verigence: what is in both, what is in Verigence but not in DMS (for the PC to confirm), what was intimated to a PC but is not in Verigence, and what is left over. Deliveries also against the gate register."
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
            <button type="button" className="p2w-button" onClick={() => void download(report.data!.reportId, report.data!.date, 'pdf')}>
              Download PDF
            </button>
            <button type="button" className="p2w-link" onClick={() => choose(null)}>Close</button>
          </div>
          <div className="p2du-tiles">
            {GROUPS.map((g) => (
              <div key={g.key} className={`p2du-tile${g.act && (f[g.key] ?? 0) > 0 ? ' p2du-tile--bad' : ''}`}>
                <span>{g.band} · {g.label}</span><strong>{f[g.key] ?? 0}</strong>
              </div>
            ))}
          </div>
          <h4 className="dmsr-heading">By dealership</h4>
          <p className="p2w-muted">Bookings and deliveries alike: in Verigence and DMS; in Verigence, not in DMS (the PC confirms each); in DMS, intimated to a PC, not in Verigence; left over (in DMS, not intimated, not in Verigence). Deliveries also as per the gate register. The lists, with the PC names, are in the Excel and PDF.</p>
          <div className="p2du-scroll">
            <table className="p2du-table">
              <thead>
                <tr><th /><th colSpan={4}>Bookings</th><th colSpan={5}>Deliveries</th></tr>
                <tr><th>Dealership</th>{GROUPS.map((g) => <th key={g.key} className="num">{g.label}</th>)}</tr>
              </thead>
              <tbody>
                {report.data.dealers.map((d) => (
                  <tr key={d.dealerId}>
                    <td>{d.dealerName}</td>
                    {GROUPS.map((g) => <td key={g.key} className="num">{d.figures[g.key] ?? 0}</td>)}
                  </tr>
                ))}
                <tr className="is-total">
                  <td><strong>Project total</strong></td>
                  {GROUPS.map((g) => <td key={g.key} className="num"><strong>{f[g.key] ?? 0}</strong></td>)}
                </tr>
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
