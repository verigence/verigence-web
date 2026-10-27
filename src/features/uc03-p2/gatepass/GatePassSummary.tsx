import { Fragment, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import SectionCard from '../../../components/SectionCard';
import {
  gatePassErrorText, getGatePassImageUrl, getGatePassSummary, type GatePassSummaryDay, type GatePassSummaryFigures,
  type GatePassSummaryOutlet,
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
  NOT_UPLOADED: { label: 'Not uploaded', tone: 'p2gp-pill--bad' },
  COUNTS_PENDING: { label: 'Counts not entered', tone: 'p2gp-pill--warn' },
  ANSWER_PENDING: { label: 'Answer pending', tone: 'p2gp-pill--warn' },
  DONE: { label: 'Done', tone: 'p2gp-pill--ok' },
};

const QUALITY: Record<'BLURRED' | 'TOO_DARK' | 'WASHED_OUT', string> = {
  BLURRED: 'looks blurred', TOO_DARK: 'looks dark', WASHED_OUT: 'looks washed out',
};

const ZERO: GatePassSummaryFigures = {
  asPerRegister: 0, updatedInTool: 0, notNotifiedToPc: 0, pendingDueToPc: 0, gatePassDays: 0, gatePassesFinished: 0,
  gatePassesMissing: 0,
};

function add(t: GatePassSummaryFigures, o: GatePassSummaryFigures): GatePassSummaryFigures {
  return {
    asPerRegister: t.asPerRegister + o.asPerRegister, updatedInTool: t.updatedInTool + o.updatedInTool,
    notNotifiedToPc: t.notNotifiedToPc + o.notNotifiedToPc, pendingDueToPc: t.pendingDueToPc + o.pendingDueToPc,
    gatePassDays: t.gatePassDays + o.gatePassDays, gatePassesFinished: t.gatePassesFinished + o.gatePassesFinished,
    gatePassesMissing: t.gatePassesMissing + o.gatePassesMissing,
  };
}

function Figures({ f }: { f: GatePassSummaryFigures }) {
  return (
    <>
      <td className="p2gp-num">{f.asPerRegister}</td>
      <td className="p2gp-num">{f.updatedInTool}</td>
      <td className={f.notNotifiedToPc ? 'p2gp-num p2gp-num--warn' : 'p2gp-num'}>{f.notNotifiedToPc}</td>
      <td className={f.pendingDueToPc ? 'p2gp-num p2gp-num--bad' : 'p2gp-num'}>{f.pendingDueToPc}</td>
      <td className={f.gatePassesMissing ? 'p2gp-num p2gp-num--bad' : 'p2gp-num'}>
        {f.gatePassesFinished} / {f.gatePassDays}{f.gatePassesMissing ? <small>{f.gatePassesMissing} not uploaded</small> : null}
      </td>
    </>
  );
}

/**
 * Daily gate pass across every onsite outlet the caller oversees (TL: the outlets
 * under them; PM and Executive: all), product owner 2026-10-27: as per the gate-out
 * register, updated in the tool, what was not notified to the PC and what is pending due to the PC,
 * dealership by dealership with sub-totals, and who uploaded each gate pass.
 */
export default function GatePassSummary({ tenantId, accessToken, refreshKey }: Props) {
  const today = istToday();
  const [range, setRange] = useState({ from: today, to: today });
  const [open, setOpen] = useState<string>();
  const [photoError, setPhotoError] = useState<string | null>(null);
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
  const outlets = useMemo(() => summary.data?.outlets ?? [], [summary.data]);
  // Dealership by dealership, each with its sub-total (product owner 2026-10-27).
  const dealers = useMemo(() => {
    const groups = new Map<string, { name: string; outlets: GatePassSummaryOutlet[]; totals: GatePassSummaryFigures }>();
    for (const o of outlets) {
      const g = groups.get(o.dealerId) ?? { name: o.dealerName, outlets: [], totals: ZERO };
      g.outlets.push(o);
      g.totals = add(g.totals, o);
      groups.set(o.dealerId, g);
    }
    return [...groups.entries()].sort((a, b) => a[1].name.localeCompare(b[1].name));
  }, [outlets]);
  const totals = useMemo(() => outlets.reduce<GatePassSummaryFigures>(add, ZERO), [outlets]);

  async function openPage(gatePassId: string, page: number) {
    setPhotoError(null);
    try {
      const { url } = await getGatePassImageUrl(tenantId, gatePassId, accessToken, page);
      window.open(url, '_blank', 'noopener');
    } catch (cause) {
      setPhotoError(gatePassErrorText(cause, 'The gate pass photo could not be opened.'));
    }
  }

  return (
    <SectionCard>
      <div className="p2w-card__title">
        <h3>All outlets</h3>
        <p className="p2w-muted">Onsite outlets only: the daily gate pass is not taken at a satellite outlet. Highlighted: a gate pass not uploaded or not finished. Click an outlet to see its gate pass; open it with ▸ for each day.</p>
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
        </div>
      </div>
      {summary.isError ? <div className="p2w-alert p2w-alert--error" role="alert">{gatePassErrorText(summary.error, 'The gate pass view could not be loaded.')}</div> : null}
      {summary.isLoading ? <p className="p2w-muted">Loading…</p> : null}
      {photoError ? <div className="p2w-alert p2w-alert--error" role="alert">{photoError}</div> : null}
      {summary.data && !outlets.length ? <p className="p2w-muted">No onsite outlet in your scope.</p> : null}
      {outlets.length ? (
        <div className="p2gp-sum-wrap">
          <table className="p2gp-sum">
            <colgroup>
              <col className="p2gp-sum__name" /><col /><col /><col /><col /><col />
            </colgroup>
            <thead>
              <tr>
                <th className="p2gp-sum__name">Dealership / outlet <span>uploaded by</span></th>
                <th title="New deliveries on the gate pass">As per Gate out Register</th>
                <th title="Delivery files uploaded on the days the gate pass covers">Updated in Tool</th>
                <th title="Deliveries the PC said the dealership did not notify to them">Not notified to PC</th>
                <th title="As per register − (updated in tool + not notified to PC): deliveries the PC has not uploaded (the whole gap until the PC answers)">Pending due to PC</th>
                <th title="Gate passes finished (photo and counts) out of the gate pass days in the range; 'not uploaded': days with no photo at all">
                  Gate passes done <span>done / days</span>
                </th>
              </tr>
            </thead>
            {dealers.map(([dealerId, dealer]) => (
              <tbody key={dealerId}>
                <tr className="p2gp-sum__dealer">
                  <td>{dealer.name} <span>{dealer.outlets.length} outlet{dealer.outlets.length === 1 ? '' : 's'}</span></td>
                  <Figures f={dealer.totals} />
                </tr>
                {dealer.outlets.map((o) => {
                  const isOpen = open === o.outletId;
                  // Highlight a gate pass the PC has not uploaded or not finished (product owner 2026-10-27).
                  const owed = o.days.some((d) => d.status === 'NOT_UPLOADED' || d.status === 'COUNTS_PENDING');
                  const single = o.days.length === 1 ? o.days[0] : null;
                  return (
                    <Fragment key={o.outletId}>
                      <tr className={owed ? 'p2gp-sum__outlet p2gp-row--owed' : 'p2gp-sum__outlet'}>
                        <td>
                          <button type="button" className="p2gp-sum__toggle" aria-expanded={isOpen} aria-label={isOpen ? 'Hide days' : 'Show days'}
                            onClick={() => setOpen(isOpen ? undefined : o.outletId)}>{isOpen ? '▾' : '▸'}</button>
                          {single?.gatePassId ? (
                            <button type="button" className="p2w-link p2gp-outlet-link" title="Open the gate pass"
                              onClick={() => void openPage(single.gatePassId!, 1)}>{o.outletName}</button>
                          ) : o.outletName}
                          {single && single.status !== 'DONE' ? (
                            <span className={`p2gp-pill ${STATUS[single.status].tone}`}>{STATUS[single.status].label}</span>
                          ) : null}
                          {single?.gatePassId && (single.pages ?? 1) > 1 ? (
                            <span className="p2gp-pages">
                              {Array.from({ length: (single.pages ?? 1) - 1 }, (_, i) => (
                                <button key={i} type="button" className="p2w-link" onClick={() => void openPage(single.gatePassId!, i + 2)}>
                                  Page {i + 2}
                                </button>
                              ))}
                            </span>
                          ) : null}
                          {o.uploadedBy?.length ? <span className="p2gp-sum__by">{o.uploadedBy.join(', ')}</span> : null}
                        </td>
                        <Figures f={o} />
                      </tr>
                      {isOpen ? [...o.days].reverse().map((d) => (
                        <tr key={d.date}
                          className={d.status === 'NOT_UPLOADED' || d.status === 'COUNTS_PENDING' ? 'p2gp-sum__day p2gp-row--owed' : 'p2gp-sum__day'}>
                          <td>
                            {d.label}
                            <span className={`p2gp-pill ${STATUS[d.status].tone}`}>{STATUS[d.status].label}</span>
                            {d.photoQuality && d.photoQuality !== 'GOOD'
                              ? <span className="p2gp-pill p2gp-pill--warn">photo {QUALITY[d.photoQuality]}</span> : null}
                            {d.pcName ? <span className="p2gp-sum__by">{d.pcName}</span> : null}
                            {d.gatePassId ? (
                              <span className="p2gp-pages">
                                {Array.from({ length: d.pages ?? 1 }, (_, i) => (
                                  <button key={i} type="button" className="p2w-link" onClick={() => void openPage(d.gatePassId!, i + 1)}>
                                    {(d.pages ?? 1) > 1 ? `Page ${i + 1}` : 'Photo'}
                                  </button>
                                ))}
                              </span>
                            ) : null}
                          </td>
                          <td className="p2gp-num">{d.asPerRegister ?? '—'}</td>
                          <td className="p2gp-num">{d.updatedInTool}</td>
                          <td className="p2gp-num">{d.notNotifiedToPc}</td>
                          <td className="p2gp-num">{d.pendingDueToPc}</td>
                          <td />
                        </tr>
                      )) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            ))}
            {dealers.length > 1 || outlets.length > 1 ? (
              <tfoot>
                <tr className="p2gp-sum__total"><td>All outlets</td><Figures f={totals} /></tr>
              </tfoot>
            ) : null}
          </table>
        </div>
      ) : null}
      {summary.data ? <ul className="p2gp-sum__notes">{summary.data.notes.map((n) => <li key={n}>{n}</li>)}</ul> : null}
    </SectionCard>
  );
}
