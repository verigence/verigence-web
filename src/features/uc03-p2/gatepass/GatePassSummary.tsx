import { Fragment, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import SectionCard from '../../../components/SectionCard';
import {
  gatePassErrorText, getGatePassSummary, type GatePassSummaryDay, type GatePassSummaryFigures,
} from '../../../services/audit-core/uc03GatePass';

type Props = { tenantId: string; accessToken: string; refreshKey: number };

function istToday(): string {
  return new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
}

function addDays(day: string, days: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function mondayOf(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  return addDays(day, -((d.getUTCDay() + 6) % 7));
}

const STATUS: Record<GatePassSummaryDay['status'], { label: string; tone: string }> = {
  NOT_UPLOADED: { label: 'Not uploaded', tone: 'p2dr-state--bad' },
  COUNTS_PENDING: { label: 'Counts not entered', tone: 'p2dr-state--warn' },
  ANSWER_PENDING: { label: 'Answer pending', tone: 'p2dr-state--warn' },
  DONE: { label: 'Done', tone: 'p2dr-state--ok' },
};

const QUALITY: Record<'BLURRED' | 'TOO_DARK' | 'WASHED_OUT', string> = {
  BLURRED: 'looks blurred', TOO_DARK: 'looks dark', WASHED_OUT: 'looks washed out',
};

function Figures({ f }: { f: GatePassSummaryFigures }) {
  return (
    <>
      <td>{f.asPerRegister}</td>
      <td>{f.updatedInTool}</td>
      <td className={f.pendingDueToClient ? 'p2dr-state p2dr-state--warn' : ''}>{f.pendingDueToClient}</td>
      <td className={f.pendingDueToPc ? 'p2dr-state p2dr-state--bad' : ''}>{f.pendingDueToPc}</td>
      <td className={f.gatePassesMissing ? 'p2dr-state p2dr-state--bad' : ''}>
        {f.gatePassesFinished} / {f.gatePassDays}{f.gatePassesMissing ? ` · ${f.gatePassesMissing} missing` : ''}
      </td>
    </>
  );
}

/**
 * Daily gate pass across every onsite outlet the caller oversees (TL: the outlets
 * under them; PM and Executive: all), product owner 2026-10-27: as per the gate-out
 * register, updated in the tool, and what is pending due to the client or the PC.
 */
export default function GatePassSummary({ tenantId, accessToken, refreshKey }: Props) {
  const today = istToday();
  const [range, setRange] = useState({ from: today, to: today });
  const [lead, setLead] = useState('ALL');
  const [open, setOpen] = useState<string>();
  const quick: Array<[string, string, string]> = [
    ['Today', today, today],
    ['Yesterday', addDays(today, -1), addDays(today, -1)],
    ['This week', mondayOf(today), today],
    ['This month', `${today.slice(0, 7)}-01`, today],
  ];
  const summary = useQuery({
    queryKey: ['gate-pass-summary', tenantId, range.from, range.to, refreshKey],
    queryFn: () => getGatePassSummary(tenantId, range.from, range.to, accessToken),
    staleTime: 30_000,
  });
  const leads = useMemo(() => [...new Set((summary.data?.outlets ?? []).flatMap((o) => o.teamLeads))].sort(),
    [summary.data]);
  const outlets = useMemo(() => (summary.data?.outlets ?? []).filter((o) => lead === 'ALL' || o.teamLeads.includes(lead)),
    [summary.data, lead]);
  const totals = useMemo(() => outlets.reduce<GatePassSummaryFigures>((t, o) => ({
    asPerRegister: t.asPerRegister + o.asPerRegister, updatedInTool: t.updatedInTool + o.updatedInTool,
    pendingDueToClient: t.pendingDueToClient + o.pendingDueToClient, pendingDueToPc: t.pendingDueToPc + o.pendingDueToPc,
    gatePassDays: t.gatePassDays + o.gatePassDays, gatePassesFinished: t.gatePassesFinished + o.gatePassesFinished,
    gatePassesMissing: t.gatePassesMissing + o.gatePassesMissing,
  }), { asPerRegister: 0, updatedInTool: 0, pendingDueToClient: 0, pendingDueToPc: 0, gatePassDays: 0, gatePassesFinished: 0, gatePassesMissing: 0 }),
  [outlets]);

  return (
    <SectionCard>
      <div className="p2w-card__title">
        <h3>All outlets</h3>
        <p className="p2w-muted">Onsite outlets only: the daily gate pass is not taken at a satellite outlet. Open an outlet for each day.</p>
      </div>
      <div className="p2w-listbar">
        <div className="p2w-segment" role="tablist" aria-label="Range">
          {quick.map(([label, from, to]) => {
            const active = range.from === from && range.to === to;
            return <button key={label} type="button" role="tab" aria-selected={active} className={active ? 'is-active' : ''}
              onClick={() => setRange({ from, to })}>{label}</button>;
          })}
        </div>
        <div className="p2w-filters">
          <label>From <input type="date" value={range.from} max={range.to} onChange={(e) => e.target.value && setRange({ ...range, from: e.target.value })} /></label>
          <label>To <input type="date" value={range.to} min={range.from} max={today} onChange={(e) => e.target.value && setRange({ ...range, to: e.target.value })} /></label>
          {leads.length > 1 ? (
            <label>Team Lead <select value={lead} onChange={(e) => setLead(e.target.value)}>
              <option value="ALL">All</option>
              {leads.map((l) => <option key={l} value={l}>{l}</option>)}
            </select></label>
          ) : null}
        </div>
      </div>
      {summary.isError ? <div className="p2w-alert p2w-alert--error" role="alert">{gatePassErrorText(summary.error, 'The gate pass view could not be loaded.')}</div> : null}
      {summary.isLoading ? <p className="p2w-muted">Loading…</p> : null}
      {summary.data && !outlets.length ? <p className="p2w-muted">No onsite outlet in your scope.</p> : null}
      {outlets.length ? (
        <div className="p2dr-scroll">
          <table className="p2dr-table">
            <thead>
              <tr>
                <th>Outlet</th>
                <th title="New deliveries on the gate pass">As per Gate out Register</th>
                <th title="Delivery files uploaded on the days the gate pass covers">Updated in Tool</th>
                <th title="The PC said these deliveries were not notified to them">Pending due to Client</th>
                <th title="The PC holds the files but they are not uploaded, or has not answered yet">Pending due to PC</th>
                <th>Gate passes done</th>
              </tr>
            </thead>
            <tbody>
              {outlets.map((o) => {
                const isOpen = open === o.outletId;
                return (
                  <Fragment key={o.outletId}>
                    <tr>
                      <td>
                        <button type="button" className="p2dr-toggle" aria-expanded={isOpen}
                          onClick={() => setOpen(isOpen ? undefined : o.outletId)}>{isOpen ? '▾' : '▸'}</button>
                        <strong>{o.outletName}</strong>
                        <span className="p2w-muted"> · {o.dealerName}{o.teamLeads.length ? ` · TL ${o.teamLeads.join(', ')}` : ''}</span>
                      </td>
                      <Figures f={o} />
                    </tr>
                    {isOpen ? [...o.days].reverse().map((d) => (
                      <tr key={d.date} className="p2dr-child">
                        <td>
                          <span className="p2gp-summary__day">{d.label}</span>
                          <span className={`p2dr-state ${STATUS[d.status].tone}`}> · {STATUS[d.status].label}</span>
                          {d.pcName ? <span className="p2w-muted"> · {d.pcName}</span> : null}
                          {d.photoQuality && d.photoQuality !== 'GOOD'
                            ? <span className="p2dr-state p2dr-state--warn"> · photo {QUALITY[d.photoQuality]}</span> : null}
                        </td>
                        <td>{d.asPerRegister ?? '—'}</td>
                        <td>{d.updatedInTool}</td>
                        <td>{d.pendingDueToClient}</td>
                        <td>{d.pendingDueToPc}</td>
                        <td />
                      </tr>
                    )) : null}
                  </Fragment>
                );
              })}
            </tbody>
            {outlets.length > 1 ? (
              <tfoot>
                <tr className="p2dr-total"><td>All outlets</td><Figures f={totals} /></tr>
              </tfoot>
            ) : null}
          </table>
        </div>
      ) : null}
      {summary.data ? <ul className="p2dr-notes">{summary.data.notes.map((n) => <li key={n}>{n}</li>)}</ul> : null}
    </SectionCard>
  );
}
