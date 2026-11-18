import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import {
  getTeamDuties, type DutiesMode, type TeamDayClose, type TeamDutyCell, type TeamDutyOutlet, type TeamDutyState,
} from '../../services/audit-core/duties';
import { addDays, dayLabel, istToday, TEAM_STATE_LABEL, teamCellDetail, timeLabel } from './dutiesFormat';
import { dutiesKeys } from './useMyDuties';

const STATE_TAG: Record<TeamDutyState, string> = {
  DONE: 'dty-tag--ok', DONE_LATE: 'dty-tag--info', ON_TRACK: 'dty-tag--ok', PENDING: '', NOT_RECEIVED: 'dty-tag--warn',
  INCOMPLETE: 'dty-tag--bad',
};
const CLOSE_LABEL: Record<TeamDayClose, string> = {
  CLOSED: 'Day closed', NOT_CLOSED: 'Not closed', OPEN: 'Still working', OFF: 'Day off',
};
const CLOSE_TAG: Record<TeamDayClose, string> = { CLOSED: 'dty-tag--ok', NOT_CLOSED: 'dty-tag--bad', OPEN: '', OFF: '' };

function Cell({ cell, day }: { cell: TeamDutyCell; day: string }) {
  const detail = teamCellDetail(cell);
  return (
    <div className="dty-cell">
      <span>
        <span className={`dty-tag ${STATE_TAG[cell.state]}`}>{TEAM_STATE_LABEL[cell.state]}</span>
        {cell.forDate !== day ? <> <span className="dty-tag">for {dayLabel(cell.forDate)}</span></> : null}
        {cell.carriedDays > 0 && cell.state !== 'DONE_LATE' ? <> <span className="dty-tag dty-tag--warn">day {cell.carriedDays + 1}</span></> : null}
        {!cell.mandatory ? <> <span className="dty-tag">Optional</span></> : null}
      </span>
      {detail ? <small>{detail}</small> : null}
    </div>
  );
}

function DayTable({ date, outlets, duties }: {
  date: string; outlets: TeamDutyOutlet[]; duties: Array<{ dutyId: string; title: string }>;
}) {
  const shown = duties.filter((d) => outlets.some((o) => o.items.some((i) => i.dutyId === d.dutyId)));
  return (
    <div className="dty-table-wrap">
      <table className="dty-table">
        <thead>
          <tr>
            <th scope="col">Outlet</th>
            {shown.map((d) => <th key={d.dutyId} scope="col">{d.title}</th>)}
            <th scope="col">PCs</th>
          </tr>
        </thead>
        <tbody>
          {outlets.map((outlet) => (
            <tr key={outlet.outletId}>
              <td><strong>{outlet.outletName}</strong><small>{outlet.dealerName}</small></td>
              {shown.map((d) => {
                const cells = outlet.items.filter((i) => i.dutyId === d.dutyId);
                return (
                  <td key={d.dutyId} data-label={d.title}>
                    {cells.length ? cells.map((c) => <Cell key={c.itemId} cell={c} day={date} />) : <small>Not on the list</small>}
                  </td>
                );
              })}
              <td data-label="PCs">
                <div className="dty-pcs">
                  {outlet.pcs.map((pc) => (
                    <span key={pc.actorId}>
                      {pc.name}
                      <span className={`dty-tag ${CLOSE_TAG[pc.dayClose]}`}>
                        {CLOSE_LABEL[pc.dayClose]}{pc.closedAt ? ` ${timeLabel(pc.closedAt)}` : ''}
                      </span>
                    </span>
                  ))}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * The team's daily duties, day by day (Audit Core GET .../duties/team): every outlet and PC for a
 * Team Lead's outlets, or the whole Project for a PM, Executive or SuperAdmin. Reasons are shown,
 * not approved (product owner 2026-11-18: "lets start with see only").
 */
export default function DutiesTeamPanel({ mode, tenantId, accessToken }: { mode: DutiesMode; tenantId: string; accessToken?: string }) {
  const today = istToday();
  const [range, setRange] = useState({ from: today, to: today });
  const team = useQuery({
    queryKey: dutiesKeys.team(mode, tenantId, range.from, range.to),
    queryFn: () => getTeamDuties(mode, tenantId, range, accessToken),
    enabled: Boolean(tenantId && accessToken),
    staleTime: 30_000,
  });
  const pick = (from: string, to: string) => setRange({ from: from > to ? to : from, to });
  const data = team.data;
  const single = range.from === range.to;

  return (
    <div className="dty-stack">
      <div className="dty-toolbar">
        <label>From <input type="date" value={range.from} max={range.to}
          onChange={(e) => e.target.value && pick(e.target.value < addDays(range.to, -30) ? addDays(range.to, -30) : e.target.value, range.to)} /></label>
        <label>To <input type="date" value={range.to} max={today}
          onChange={(e) => e.target.value && pick(range.from < addDays(e.target.value, -30) ? addDays(e.target.value, -30) : range.from, e.target.value)} /></label>
        <button type="button" className="uc01-admin-button" onClick={() => pick(today, today)}>Today</button>
        <button type="button" className="uc01-admin-button" onClick={() => pick(addDays(today, -1), addDays(today, -1))}>Yesterday</button>
        <button type="button" className="uc01-admin-button" onClick={() => pick(addDays(today, -6), today)}>Last 7 days</button>
        <button type="button" className="uc01-admin-button" disabled={team.isFetching} onClick={() => void team.refetch()}>
          {team.isFetching ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {team.isLoading ? <div className="uc01-admin-state">Loading the team&apos;s duties…</div> : null}
      {team.isError ? (
        <div className="uc01-admin-message uc01-admin-message--error" role="alert">
          The team&apos;s duties could not be loaded. {team.error instanceof Error ? team.error.message : ''}
        </div>
      ) : null}
      {data && !data.enabled ? (
        <div className="uc01-admin-message uc01-admin-message--info" role="status">
          Daily duties are switched off for this Project.{data.canManage ? ' Switch them on under Duty list.' : ' An Executive or SuperAdmin can switch them on.'}
        </div>
      ) : null}

      {data?.enabled && data.totals ? (
        <>
          <div className="dty-tiles">
            {([['Done', data.totals.done], ['Done late', data.totals.doneLate], ['On track', data.totals.onTrack],
              ['Pending now', data.totals.pending], ['Not received', data.totals.notReceived],
              ['Incomplete', data.totals.incomplete]] as const).map(([label, value]) => (
              <div key={label} className="dty-tile"><span>{label}</span><strong>{value}</strong></div>
            ))}
          </div>

          {(data.days ?? []).every((d) => d.outlets.length === 0) ? (
            <div className="uc01-admin-state">No duties on the list for {single ? dayLabel(range.from) : 'these days'}. Check the duty list and that PCs are mapped to outlets.</div>
          ) : null}

          {(data.days ?? []).filter((d) => d.outlets.length > 0).map((day) => (
            <section key={day.date} className="dty-day">
              <h3 className="dty-day__name">{dayLabel(day.date)}{day.date === data.today ? ' · today' : ''}{day.workingDay ? '' : ' · not a working day'}</h3>
              <DayTable date={day.date} outlets={day.outlets} duties={data.byDuty ?? []} />
            </section>
          ))}

          {!single && (data.byDuty?.length ?? 0) > 0 ? (
            <section className="dty-day">
              <h3 className="dty-day__name">By duty, {dayLabel(range.from)} to {dayLabel(range.to)}</h3>
              <div className="dty-table-wrap">
                <table className="dty-table">
                  <thead><tr><th scope="col">Duty</th><th scope="col">Done</th><th scope="col">Done late</th>
                    <th scope="col">Not received (days)</th><th scope="col">Incomplete</th><th scope="col">Pending now</th></tr></thead>
                  <tbody>
                    {(data.byDuty ?? []).map((d) => (
                      <tr key={d.dutyId}>
                        <td><strong>{d.title}</strong></td><td data-label="Done">{d.done}</td><td data-label="Done late">{d.doneLate}</td>
                        <td data-label="Not received (days)">{d.notReceived}</td><td data-label="Incomplete">{d.incomplete}</td>
                        <td data-label="Pending now">{d.pending}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          {!single && (data.byPc?.length ?? 0) > 0 ? (
            <section className="dty-day">
              <h3 className="dty-day__name">Day close by PC</h3>
              <div className="dty-table-wrap">
                <table className="dty-table">
                  <thead><tr><th scope="col">PC</th><th scope="col">Days closed</th><th scope="col">Days not closed</th></tr></thead>
                  <tbody>
                    {(data.byPc ?? []).map((p) => (
                      <tr key={p.actorId}><td><strong>{p.name}</strong></td><td data-label="Days closed">{p.daysClosed}</td>
                        <td data-label="Days not closed">{p.daysNotClosed}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
