import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

import SectionCard from '../../components/SectionCard';
import { getEngagementPersonDay, type BlockState, type TaskManagerMode } from '../../services/audit-core/taskManager';
import { minutesText, personName, roleLabel } from './tmFormat';

/**
 * One person's day, minute by minute (product owner 2026-10-28): the screens
 * and journey tabs used, what they saved, the longest stretch with no output,
 * and the day in 20-minute blocks. Superadmin and Executive only; the person
 * sees nothing of it.
 */
export const BLOCK_LABELS: Record<BlockState, string> = {
  WORKING: 'Working',
  ACTIVE_NO_OUTPUT: 'Active, no output',
  IDLE: 'Idle',
  AWAY: 'Away',
};

export default function PersonDayPanel({ mode, tenantId, accessToken, actorId, day, onClose }: {
  mode: TaskManagerMode; tenantId: string; accessToken?: string; actorId: string; day: string; onClose: () => void;
}) {
  const report = useQuery({
    queryKey: ['tm-person-day', mode, tenantId, actorId, day],
    queryFn: () => getEngagementPersonDay(mode, tenantId, actorId, day, accessToken),
    enabled: Boolean(tenantId && accessToken && actorId && day),
    refetchInterval: 60_000,
  });
  const data = report.data;
  const a = data?.analysis;
  return (
    <SectionCard>
      <div className="p2w-card__title tm-personday__title">
        <h3>{data ? `${personName(data.name, data.actorId)} · ${roleLabel(data.role)}` : 'Person'} · {day}</h3>
        <button type="button" className="p2w-button p2w-button--ghost" onClick={onClose}>Close</button>
      </div>
      {report.isLoading ? <div className="p2w-skeleton">Loading…</div> : null}
      {report.isError ? <div className="p2w-alert p2w-alert--error" role="alert">Could not load this day.</div> : null}
      {data ? (
        <>
          <dl className="tm-tiles">
            <div><dt>Active</dt><dd>{minutesText(data.activeMinutes)}</dd><span>idle {minutesText(data.idleMinutes)} · hidden {minutesText(data.hiddenMinutes)}</span></div>
            <div><dt>Output</dt><dd>{data.outputCount}</dd><span>{data.journeysTouched} journeys touched</span></div>
            {data.role === 'REVIEWER' ? (
              <div><dt>Reviewed</dt><dd>{data.journeysReviewed}</dd><span>{data.documentsOpened} documents opened</span></div>
            ) : null}
            <div>
              <dt>Longest with no output</dt>
              <dd>{a?.longestNoOutput ? minutesText(a.longestNoOutput.minutes) : '—'}</dd>
              <span>{a?.longestNoOutput ? `${a.longestNoOutput.from}–${a.longestNoOutput.to} · ${minutesText(a.longestNoOutput.activeMinutes)} active in it` : ''}</span>
            </div>
            {a ? (
              <div>
                <dt>20-minute blocks</dt>
                <dd>{a.blockCounts.WORKING}<span> working</span></dd>
                <span>{a.blockCounts.ACTIVE_NO_OUTPUT} active with no output · {a.blockCounts.IDLE} idle · {a.blockCounts.AWAY} away</span>
              </div>
            ) : null}
          </dl>
          {!data.minuteDetail ? (
            <p className="p2w-muted">No minute-by-minute record for this day: it is sent from 28 Oct 2026, by the web app updated that day, and not by an Android app older than 1.2.0.</p>
          ) : null}

          {a?.blocks.length ? (
            <>
              <h4>The day in 20-minute blocks</h4>
              <div className="tm-blocks" role="list">
                {a.blocks.map((b) => (
                  <span key={b.from} role="listitem" className={`tm-block tm-block--${b.state.toLowerCase()}`}
                    title={`${b.from}–${b.to}: ${BLOCK_LABELS[b.state]} · ${b.outputs} output · ${b.activeMinutes} min active · ${b.idleMinutes} min idle · ${b.hiddenMinutes} min hidden`}>
                    {b.from}
                  </span>
                ))}
              </div>
              <p className="tm-blocks__legend">
                {(Object.keys(BLOCK_LABELS) as BlockState[]).map((s) => (
                  <span key={s}><i className={`tm-block tm-block--${s.toLowerCase()}`} /> {BLOCK_LABELS[s]}</span>
                ))}
              </p>
            </>
          ) : null}

          {a?.scrollOnly.length ? (
            <p className="tm-warn">Scrolling with no click for 10 minutes or more: {a.scrollOnly.map((r) => `${r.from}–${r.to} (${r.minutes} min)`).join(', ')}</p>
          ) : null}

          <div className="tm-grid-2">
            <div>
              <h4>What was saved</h4>
              {data.outputs.length ? (
                <div className="p2dr-scroll">
                  <table className="p2dr-table">
                    <thead><tr><th>Time</th><th>What</th><th>Journey</th><th>Detail</th></tr></thead>
                    <tbody>
                      {data.outputs.map((o, i) => (
                        <tr key={`${o.at}-${i}`} className={o.countsAsOutput ? '' : 'p2w-muted'}>
                          <td>{o.time}</td>
                          <td>{o.label}{o.countsAsOutput ? '' : ' (not counted for this role)'}</td>
                          <td>{o.journeyId ? <Link to={`/p2/journeys/${o.journeyId}/overview`}>{o.journeyReference ?? 'Open'}</Link> : '—'}</td>
                          <td className="p2w-muted">{o.detail ?? ''}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <p className="tm-warn">Nothing saved this day.</p>}
            </div>
            <div>
              <h4>Active time by screen</h4>
              {data.minutesByScreen.length ? (
                <table className="p2dr-table">
                  <tbody>
                    {data.minutesByScreen.map((m) => (
                      <tr key={m.screen}><td>{m.screen}</td><td>{minutesText(m.activeMinutes)}</td></tr>
                    ))}
                  </tbody>
                </table>
              ) : <p className="p2w-muted">No screens recorded.</p>}
            </div>
          </div>

          <h4>Screens and tabs opened</h4>
          {data.screens.length ? (
            <div className="p2dr-scroll tm-personday__screens">
              <table className="p2dr-table">
                <thead><tr><th>Time</th><th>Screen</th><th>Journey</th><th>Until next</th></tr></thead>
                <tbody>
                  {data.screens.map((s, i) => (
                    <tr key={`${s.at}-${i}`}>
                      <td>{s.time}</td>
                      <td>{s.screen}</td>
                      <td>{s.journeyId ? <Link to={`/p2/journeys/${s.journeyId}/overview`}>{s.journeyReference ?? 'Open'}</Link> : '—'}</td>
                      <td>{minutesText(s.minutes)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="p2w-muted">No screens recorded.</p>}
          <ul className="p2dr-notes">{data.notes.map((n) => <li key={n}>{n}</li>)}</ul>
        </>
      ) : null}
    </SectionCard>
  );
}
