import { Fragment, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import '../../../styles/uc03-p2-gate-pass.css';
import '../../../styles/uc03-p2-day-stats.css';

import SectionCard from '../../../components/SectionCard';
import { gatePassErrorText } from '../../../services/audit-core/uc03GatePass';
import { istToday, min, rangeFor, rangeLabel, stepAnchor, type Period } from './dayStatsRange';
import {
  getP2DayStats, type DayStats, type DayStatsDealer, type DayStatsFigures, type DayStatsGatePassDay, type DayStatsOutlet,
  type DayStatsPc,
} from '../../../services/audit-core/uc03DayStats';

/**
 * The day-stats card of the Employee (PC) and Team Lead dashboards (product
 * owner 2026-10-30): files uploaded (Booking / Delivery), tasks closed
 * (Journey / Task Manager), the daily gate pass, and the deliveries-versus-
 * gate-pass block, for a day, the week or the month. A PC sees their own day
 * and their outlets' gate pass; a TL, PM or Executive sees every PC, outlet
 * and dealership in scope, rolled up by dealership, and their own line.
 * Every number comes from one read (reports/day-stats) built on what is
 * already stored; each block links to the page that owns its figures.
 */
type Props = { tenantId: string; accessToken?: string; role?: string | null };

type Level = 'pc' | 'outlet' | 'dealer';

const GATE_PASS_STATUS: Record<DayStatsGatePassDay['status'], { label: string; tone: string }> = {
  NOT_UPLOADED: { label: 'Not uploaded', tone: 'p2ds-pill--bad' },
  COUNTS_PENDING: { label: 'Counts not entered', tone: 'p2ds-pill--warn' },
  ANSWER_PENDING: { label: 'Answer pending', tone: 'p2ds-pill--warn' },
  DONE: { label: 'Uploaded', tone: 'p2ds-pill--ok' },
};

/** What the gate pass block says for a single day across the outlets in view. */
function gatePassDayWord(outlets: DayStatsOutlet[]): { label: string; tone: string } | null {
  const applicable = outlets.filter((o) => o.gatePassApplicable && o.gatePassDays.length);
  if (!applicable.length) return null;
  if (applicable.length === 1) {
    const day = applicable[0].gatePassDays[0];
    return GATE_PASS_STATUS[day.status];
  }
  const done = applicable.filter((o) => o.gatePassDays[0].status === 'DONE').length;
  const missing = applicable.filter((o) => o.gatePassDays[0].status === 'NOT_UPLOADED').length;
  return {
    label: `${done} of ${applicable.length} done`,
    tone: missing ? 'p2ds-pill--bad' : done === applicable.length ? 'p2ds-pill--ok' : 'p2ds-pill--warn',
  };
}

function Num({ value, warn, bad }: { value: number; warn?: boolean; bad?: boolean }) {
  return <td className={`p2gp-num${bad && value ? ' p2gp-num--bad' : warn && value ? ' p2gp-num--warn' : ''}`}>{value}</td>;
}

function FigureCells({ f, gatePass = true }: { f: DayStatsFigures; gatePass?: boolean }) {
  return (
    <>
      <td className="p2gp-num">{f.uploads.files}<small>{f.uploads.booking} B · {f.uploads.delivery} D</small></td>
      <td className="p2gp-num">{f.tasks.closed}<small>{f.tasks.journey} J · {f.tasks.taskManager} TM{f.tasks.closedLate ? ` · ${f.tasks.closedLate} late` : ''}</small></td>
      {gatePass ? (
        <td className={`p2gp-num${f.gatePass.missing ? ' p2gp-num--bad' : ''}`}>
          {f.gatePass.days ? <>{f.gatePass.finished} / {f.gatePass.days}{f.gatePass.missing ? <small>{f.gatePass.missing} not uploaded</small> : null}</> : '—'}
        </td>
      ) : <td className="p2gp-num">—</td>}
      <Num value={f.deliveries.asPerRegister} />
      <Num value={f.deliveries.updatedInTool} />
      <td className="p2gp-num">{f.deliveries.backlogCleared}</td>
      <Num value={f.deliveries.notNotifiedToPc} warn />
      <Num value={f.deliveries.pendingDueToPc} bad />
    </>
  );
}

function PcCells({ p }: { p: DayStatsPc }) {
  return (
    <>
      <td className="p2gp-num">{p.uploads.files}<small>{p.uploads.booking} B · {p.uploads.delivery} D</small></td>
      <td className="p2gp-num">{p.tasks.closed}<small>{p.tasks.journey} J · {p.tasks.taskManager} TM{p.tasks.closedLate ? ` · ${p.tasks.closedLate} late` : ''}</small></td>
      <td className="p2gp-num">{p.gatePass.uploaded || '—'}</td>
      <td className="p2gp-num">—</td><td className="p2gp-num">—</td><td className="p2gp-num">—</td><td className="p2gp-num">—</td><td className="p2gp-num">—</td>
    </>
  );
}

export default function DayStatsCard({ tenantId, accessToken, role }: Props) {
  const today = istToday();
  const supervisor = role === 'TL' || role === 'PM' || role === 'EXECUTIVE';
  const [period, setPeriod] = useState<Period>('day');
  const [anchor, setAnchor] = useState(today);
  const [level, setLevel] = useState<Level>(role === 'TL' ? 'outlet' : 'dealer');
  const range = useMemo(() => rangeFor(period, anchor, today), [period, anchor, today]);
  const query = useQuery({
    queryKey: ['p2-day-stats', tenantId, range.from, range.to],
    queryFn: () => getP2DayStats(tenantId, range.from, range.to, accessToken),
    enabled: Boolean(tenantId && accessToken),
    staleTime: 60_000,
  });
  const stats: DayStats | undefined = query.data;
  const t = stats?.totals;
  const single = period === 'day';
  const gatePassWord = stats && single ? gatePassDayWord(stats.outlets) : null;
  const canForward = rangeFor(period, stepAnchor(period, anchor, 1), today).from <= today;

  return (
    <SectionCard className="p2w p2ds">
      <div className="p2w-card__title p2ds__head">
        <div>
          <h3>{supervisor ? 'Day stats across your outlets' : 'Your day'}</h3>
          <p className="p2w-muted">
            {supervisor
              ? 'Files uploaded, tasks closed and the daily gate pass, per PC, outlet and dealership. Each block opens the page its numbers come from.'
              : 'What you uploaded and closed, and your daily gate pass against the deliveries on it.'}
          </p>
        </div>
        <div className="p2ds__controls">
          <div className="p2w-segment" role="tablist" aria-label="Period">
            {(['day', 'week', 'month'] as Period[]).map((p) => (
              <button key={p} type="button" role="tab" aria-selected={period === p} className={period === p ? 'is-active' : ''}
                onClick={() => { setPeriod(p); if (p === 'day' && anchor > today) setAnchor(today); }}>
                {p === 'day' ? 'Day' : p === 'week' ? 'Week' : 'Month'}
              </button>
            ))}
          </div>
          <div className="p2ds__range" aria-label="Range">
            <button type="button" className="p2ds__step" aria-label="Previous" onClick={() => setAnchor(stepAnchor(period, anchor, -1))}>‹</button>
            <label className="p2ds__date">
              <span>{rangeLabel(period, range.from, range.to, today)}</span>
              <input type="date" value={anchor} max={today} onChange={(e) => e.target.value && setAnchor(min(e.target.value, today))} aria-label="Pick a day" />
            </label>
            <button type="button" className="p2ds__step" aria-label="Next" disabled={!canForward} onClick={() => setAnchor(stepAnchor(period, anchor, 1))}>›</button>
          </div>
        </div>
      </div>

      {query.isError ? <div className="p2w-alert p2w-alert--error" role="alert">{gatePassErrorText(query.error, 'The day stats could not be loaded.')}</div> : null}

      <div className="p2ds__blocks">
        <Link className="p2ds__block" to="/p2/bookings">
          <span className="p2ds__eyebrow">Files uploaded</span>
          <b>{t ? t.uploads.files : '—'}</b>
          <span className="p2ds__detail">{t ? <>{t.uploads.booking} booking · {t.uploads.delivery} delivery · {t.uploads.journeys} journey{t.uploads.journeys === 1 ? '' : 's'}</> : 'Loading…'}</span>
        </Link>
        <Link className="p2ds__block" to="/p2/tasks">
          <span className="p2ds__eyebrow">Tasks closed</span>
          <b>{t ? t.tasks.closed : '—'}</b>
          <span className="p2ds__detail">{t ? <>{t.tasks.journey} journey · {t.tasks.taskManager} task manager{t.tasks.closedLate ? <> · <em>{t.tasks.closedLate} late</em></> : null}</> : 'Loading…'}</span>
        </Link>
        <Link className="p2ds__block p2ds__block--gp" to="/p2/gate-pass">
          <span className="p2ds__eyebrow">Daily gate pass</span>
          {single
            ? <b className={gatePassWord ? `p2ds-pill ${gatePassWord.tone}` : ''}>{t ? (gatePassWord?.label ?? 'Not applicable') : '—'}</b>
            : <b>{t ? `${t.gatePass.finished} / ${t.gatePass.days}` : '—'}</b>}
          <span className="p2ds__detail">
            {!t ? 'Loading…'
              : single ? (gatePassWord ? `${stats!.outlets.filter((o) => o.gatePassApplicable).length} onsite outlet${stats!.outlets.filter((o) => o.gatePassApplicable).length === 1 ? '' : 's'}` : 'Satellite outlets only')
                : `${t.gatePass.uploaded} uploaded · ${t.gatePass.missing} not uploaded`}
          </span>
        </Link>
        <Link className="p2ds__block p2ds__block--wide" to="/p2/gate-pass">
          <span className="p2ds__eyebrow">Deliveries vs gate pass</span>
          <span className="p2ds__grid">
            <span><b>{t ? t.deliveries.asPerRegister : '—'}</b><small>As per register</small></span>
            <span><b>{t ? t.deliveries.updatedInTool : '—'}</b><small>Updated in tool</small></span>
            <span><b>{t ? t.deliveries.backlogCleared : '—'}</b><small>Backlog cleared</small></span>
            <span className={t?.deliveries.notNotifiedToPc ? 'is-warn' : ''}><b>{t ? t.deliveries.notNotifiedToPc : '—'}</b><small>Not notified to PC</small></span>
            <span className={t?.deliveries.pendingDueToPc ? 'is-bad' : ''}><b>{t ? t.deliveries.pendingDueToPc : '—'}</b><small>Pending due to PC</small></span>
          </span>
        </Link>
      </div>

      {supervisor && stats ? (
        <p className="p2ds__self">
          <b>You:</b> {stats.self.tasks.taskManager} task manager task{stats.self.tasks.taskManager === 1 ? '' : 's'} closed
          {' · '}{stats.self.tasksReviewed} reviewed
          {' · '}{stats.self.journeyTasksWorked} journey task{stats.self.journeyTasksWorked === 1 ? '' : 's'} worked ({stats.self.journeyTasksWorkedClosed} closed)
        </p>
      ) : null}

      {supervisor && stats ? (
        <div className="p2ds__table">
          <div className="p2w-listbar">
            <div className="p2w-segment" role="tablist" aria-label="Level">
              {(['dealer', 'outlet', 'pc'] as Level[]).map((l) => (
                <button key={l} type="button" role="tab" aria-selected={level === l} className={level === l ? 'is-active' : ''} onClick={() => setLevel(l)}>
                  {l === 'dealer' ? 'Dealership' : l === 'outlet' ? 'Outlet' : 'PC'}
                </button>
              ))}
            </div>
          </div>
          <div className="p2gp-sum-wrap">
            <table className="p2gp-sum p2ds-sum">
              <colgroup><col className="p2gp-sum__name" /><col /><col /><col className="p2ds-sum__gp" /><col /><col /><col /><col /><col /></colgroup>
              <thead>
                <tr>
                  <th className="p2gp-sum__name">{level === 'dealer' ? 'Dealership' : level === 'outlet' ? 'Outlet' : 'PC'}</th>
                  <th>Files<span>booking · delivery</span></th>
                  <th>Tasks closed<span>journey · TM</span></th>
                  <th>Gate pass<span>{level === 'pc' ? 'uploaded' : 'done / days'}</span></th>
                  <th>As per register</th>
                  <th>Updated in tool</th>
                  <th>Backlog cleared</th>
                  <th>Not notified to PC</th>
                  <th>Pending due to PC</th>
                </tr>
              </thead>
              <tbody>
                {level === 'dealer' ? stats.dealers.map((d: DayStatsDealer) => (
                  <tr key={d.dealerId}><td className="p2gp-sum__name"><b>{d.dealerName}</b><small>{d.outlets.length} outlet{d.outlets.length === 1 ? '' : 's'}</small></td><FigureCells f={d} /></tr>
                )) : null}
                {level === 'outlet' ? stats.dealers.map((d: DayStatsDealer) => (
                  <Fragment key={d.dealerId}>
                    <tr className="p2ds-sum__group"><td className="p2gp-sum__name"><b>{d.dealerName}</b></td><FigureCells f={d} /></tr>
                    {d.outlets.map((o: DayStatsOutlet) => (
                      <tr key={o.outletId}>
                        <td className="p2gp-sum__name p2ds-sum__indent">
                          {o.outletName}
                          {single && o.gatePassApplicable && o.gatePassDays[0]
                            ? <small><span className={`p2ds-pill ${GATE_PASS_STATUS[o.gatePassDays[0].status].tone}`}>{GATE_PASS_STATUS[o.gatePassDays[0].status].label}</span>{o.gatePassDays[0].pcName ? ` · ${o.gatePassDays[0].pcName}` : ''}</small>
                            : !o.gatePassApplicable ? <small>Satellite</small> : null}
                        </td>
                        <FigureCells f={o} gatePass={o.gatePassApplicable} />
                      </tr>
                    ))}
                  </Fragment>
                )) : null}
                {level === 'pc' ? stats.pcs.map((p: DayStatsPc) => (
                  <tr key={p.actorId ?? 'unknown'}>
                    <td className="p2gp-sum__name">{p.name || p.actorId || 'Not recorded'}{p.outlets.length ? <small>{p.outlets.join(', ')}</small> : null}</td>
                    <PcCells p={p} />
                  </tr>
                )) : null}
                {level === 'pc' && !stats.pcs.length ? <tr><td colSpan={9} className="p2w-muted">No uploads or closed tasks in this period.</td></tr> : null}
                <tr className="p2ds-sum__total"><td className="p2gp-sum__name"><b>All</b></td><FigureCells f={stats.totals} /></tr>
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </SectionCard>
  );
}
