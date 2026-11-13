import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import SectionCard from '../../../components/SectionCard';
import { Segment, Tile } from '../my-work/MyWorkParts';
import {
  dutySummary,
  getPerformance,
  measuresFor,
  ROLE_GROUPS,
  sparkPoints,
  STANDING_LABEL,
  trend,
  valueText,
  type Measure,
  type Performance,
  type PerformancePerson,
  type RoleGroup,
  type Standing,
} from '../../../services/audit-core/uc03Performance';
import { hasNextPeriod, shiftPeriod, trackerLabel } from '../../../services/audit-core/uc03ProjectTracker';
import '../../../styles/uc03-p2-performance.css';

const WINDOWS: Array<{ key: '7' | '14' | '30'; label: string }> = [
  { key: '7', label: '7 days' }, { key: '14', label: '14 days' }, { key: '30', label: '30 days' },
];
const ROLE_LABEL: Record<string, string> = { PC: 'PC', REVIEWER: 'Reviewer', TL: 'TL', PM: 'PM', EXECUTIVE: 'Executive', CRM: 'CRM' };
const FREQUENCY: Record<string, string> = { DAILY: 'Daily', WEEKLY: 'Weekly', MONTHLY: 'Monthly' };

function Spark({ series, label }: { series: number[]; label: string }) {
  if (series.every((v) => v === 0)) return <span className="p2pf-spark p2pf-spark--empty" aria-hidden="true" />;
  return (
    <svg className="p2pf-spark" viewBox="0 0 72 20" width="72" height="20" role="img" aria-label={label}>
      <polyline points={sparkPoints(series)} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function StandingChip({ standing }: { standing: Standing }) {
  if (!standing) return null;
  const tone = standing === 'above' ? 'ok' : standing === 'below' ? 'bad' : 'open';
  return <span className={`p2mw-chip p2mw-chip--${tone}`}>{STANDING_LABEL[standing]}</span>;
}

function Trend({ measure, today, usual }: { measure: Measure; today: number; usual: number | null }) {
  const t = trend(measure, today, usual);
  if (!t) return null;
  const arrow = t.dir === 'up' ? '▲' : t.dir === 'down' ? '▼' : '=';
  const tone = t.good == null ? 'level' : t.good ? 'good' : 'poor';
  return (
    <span className={`p2pf-trend p2pf-trend--${tone}`} title={`Usual: ${valueText(measure, usual)}`}>
      <span aria-hidden="true">{arrow}</span> usual {valueText(measure, usual)}
    </span>
  );
}

function DutyCell({ person }: { person: PerformancePerson }) {
  const today = dutySummary(person.dutiesToday);
  const all = dutySummary(person.dutiesWindow);
  if (!all.due) return <span className="p2w-muted">—</span>;
  const done = today.onTime + today.late;
  return (
    <>
      <strong className={today.notDone ? 'p2mw-attn' : undefined}>{today.due ? `${done} / ${today.due}` : '—'}</strong>
      <div className="p2w-muted p2pf-sub">
        {all.onTime + all.late} of {all.due} in the period{all.late ? ` · ${all.late} late` : ''}{all.notDone ? ` · ${all.notDone} not done` : ''}
      </div>
    </>
  );
}

type Sort = { key: string; dir: 1 | -1 } | null;

function TeamTable({ data, people, measures, peerRole }: {
  data: Performance; people: PerformancePerson[]; measures: Measure[]; peerRole: string | null;
}) {
  const [sort, setSort] = useState<Sort>(null);
  const rows = useMemo(() => {
    const copy = [...people];
    if (sort) copy.sort((a, b) => ((a.today[sort.key as Measure['key']] ?? 0) - (b.today[sort.key as Measure['key']] ?? 0)) * sort.dir);
    return copy;
  }, [people, sort]);
  const peer = peerRole ? data.peers[peerRole] : undefined;
  return (
    <div className="p2pt-scroll">
      <table className="p2w-table p2mw-table p2pf-table" aria-label="Performance by person">
        <thead>
          <tr>
            <th scope="col" className="p2pt-name">Person</th>
            {measures.map((m) => (
              <th key={m.key} scope="col" aria-sort={sort?.key === m.key ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
                <button type="button" className="p2pt-sort"
                  onClick={() => setSort((s) => (s?.key === m.key ? (s.dir === -1 ? { key: m.key, dir: 1 } : null) : { key: m.key, dir: -1 }))}>
                  {m.label}{m.lowerIsBetter ? ' (fewer is better)' : ''}
                  <span aria-hidden="true">{sort?.key === m.key ? (sort.dir === 1 ? ' ▲' : ' ▼') : ''}</span>
                </button>
              </th>
            ))}
            <th scope="col">Duties today</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.actorId} className={p.activeToday ? undefined : 'p2pf-idle'}>
              <th scope="row" className="p2pt-name">
                {p.name || 'Name not recorded'}
                {peerRole ? null : <span className="p2pt-role">{ROLE_LABEL[p.role] ?? p.role}</span>}
                {p.activeToday ? null : <div className="p2w-muted p2pf-sub">Nothing recorded this day</div>}
              </th>
              {measures.map((m) => (
                <td key={m.key}>
                  {m.roles.includes(p.role) ? (
                    <>
                      <div className="p2pf-value">
                        <strong>{valueText(m, p.today[m.key])}</strong>
                        <Spark series={p.series[m.key]} label={`${m.label} over the period`} />
                      </div>
                      <div className="p2pf-meta">
                        <Trend measure={m} today={p.today[m.key]} usual={p.usual[m.key]} />
                        <StandingChip standing={p.standing[m.key]} />
                      </div>
                    </>
                  ) : <span className="p2w-muted">—</span>}
                </td>
              ))}
              <td><DutyCell person={p} /></td>
            </tr>
          ))}
        </tbody>
        {peer ? (
          <tfoot>
            <tr>
              <th scope="row" className="p2pt-name">Peers' median <span className="p2w-muted">({peer.activeToday} of {peer.people} active)</span></th>
              {measures.map((m) => (
                <td key={m.key}>
                  <strong>{valueText(m, peer.median[m.key])}</strong>
                  <div className="p2w-muted p2pf-sub">usual {valueText(m, peer.usualMedian[m.key])}</div>
                </td>
              ))}
              <td />
            </tr>
          </tfoot>
        ) : null}
      </table>
    </div>
  );
}

function TeamTiles({ data, people, measures }: { data: Performance; people: PerformancePerson[]; measures: Measure[] }) {
  const active = people.filter((p) => p.activeToday).length;
  const duties = people.reduce((acc, p) => {
    const d = dutySummary(p.dutiesToday);
    return { due: acc.due + d.due, done: acc.done + d.onTime + d.late, notDone: acc.notDone + d.notDone };
  }, { due: 0, done: 0, notDone: 0 });
  return (
    <div className="p2mw-tiles">
      <Tile label="Active this day" value={`${active} / ${people.length}`} hint="people with anything recorded"
        tone={people.length && active < people.length / 2 ? 'warn' : undefined} />
      {measures.map((m) => {
        const total = people.reduce((sum, p) => sum + (m.roles.includes(p.role) ? p.today[m.key] : 0), 0);
        const usual = people.reduce((sum, p) => sum + (m.roles.includes(p.role) ? p.usual[m.key] ?? 0 : 0), 0);
        const t = trend(m, total, data.days.length > 1 ? usual : null);
        const shown = m.unit === 'MINUTES' && active ? total / active : total;
        return (
          <Tile key={m.key} label={m.unit === 'MINUTES' ? `${m.label} (average)` : m.label} value={valueText(m, shown)}
            hint={`team's usual ${valueText(m, m.unit === 'MINUTES' && people.length ? usual / people.length : usual)}${t && t.dir !== 'level' ? (t.dir === 'up' ? ' ▲' : ' ▼') : ''}`}
            tone={t && t.good === false ? 'warn' : undefined} />
        );
      })}
      <Tile label="Duties done" value={duties.due ? `${duties.done} / ${duties.due}` : '—'}
        hint={duties.notDone ? `${duties.notDone} not done` : 'daily and weekly duties due this day'}
        tone={duties.notDone ? 'bad' : undefined} />
    </div>
  );
}

function OwnCards({ data, me }: { data: Performance; me: PerformancePerson }) {
  const measures = measuresFor(data.measures, [me.role]);
  const peer = data.peers[me.role];
  return (
    <div className="p2pf-cards">
      {measures.map((m) => (
        <div key={m.key} className="p2pf-card">
          <span className="p2mw-tile__label">{m.label}{m.lowerIsBetter ? ' (fewer is better)' : ''}</span>
          <div className="p2pf-value">
            <strong className="p2mw-tile__value">{valueText(m, me.today[m.key])}</strong>
            <Spark series={me.series[m.key]} label={`${m.label} over the period`} />
          </div>
          <div className="p2pf-meta">
            <Trend measure={m} today={me.today[m.key]} usual={me.usual[m.key]} />
            <StandingChip standing={me.standing[m.key]} />
          </div>
          <span className="p2w-muted p2pf-sub">Peers' median {valueText(m, peer?.median[m.key])}</span>
        </div>
      ))}
    </div>
  );
}

function Duties({ data, people }: { data: Performance; people: PerformancePerson[] }) {
  if (!data.schedules.length && !data.plannedDuties.length) return null;
  return (
    <SectionCard>
      <div className="p2w-card__title">
        <h3>Daily and weekly duties</h3>
        <p className="p2w-muted">Every recurring task of the Task Manager. A new duty appears here once its schedule is created.</p>
      </div>
      <div className="p2pt-scroll">
        <table className="p2w-table p2mw-table" aria-label="Duties">
          <thead><tr><th>Duty</th><th>How often</th><th>This day</th><th>In the period</th><th>Late</th><th>Not done</th></tr></thead>
          <tbody>
            {data.schedules.map((s) => {
              const sum = (pick: 'dutiesToday' | 'dutiesWindow') => people.reduce((acc, p) => {
                const d = p[pick][s.scheduleId];
                return d ? { due: acc.due + d.due, done: acc.done + d.onTime + d.late, late: acc.late + d.late, notDone: acc.notDone + d.notDone } : acc;
              }, { due: 0, done: 0, late: 0, notDone: 0 });
              const today = sum('dutiesToday');
              const all = sum('dutiesWindow');
              return (
                <tr key={s.scheduleId}>
                  <td>{s.title}{s.status === 'PAUSED' ? <span className="p2w-muted"> · paused</span> : null}</td>
                  <td>{FREQUENCY[s.frequency] ?? s.frequency}</td>
                  <td>{today.due ? `${today.done} / ${today.due}` : '—'}</td>
                  <td>{all.due ? `${all.done} / ${all.due}` : '—'}</td>
                  <td>{all.late}</td>
                  <td className={all.notDone ? 'p2mw-attn' : undefined}>{all.notDone}</td>
                </tr>
              );
            })}
            {data.plannedDuties.map((d) => (
              <tr key={d.title} className="p2pf-idle">
                <td>{d.title}</td><td>{FREQUENCY[d.frequency] ?? d.frequency}</td>
                <td colSpan={4}><span className="p2w-muted">Not set up yet</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}

/**
 * Performance (product owner 2026-11-13): how the team and each person is doing on a day --
 * against the person's own usual and against peers of the same role -- and the daily and weekly
 * duties. A Team Lead, PM or Executive sees their people by name; a PC or Reviewer their own
 * figures and the unnamed peer median.
 */
export default function PerformanceView({ tenantId, accessToken, today }: {
  tenantId: string; accessToken: string | undefined; today: string;
}) {
  const [date, setDate] = useState(today);
  const [windowDays, setWindowDays] = useState<'7' | '14' | '30'>('14');
  const [group, setGroup] = useState<RoleGroup>('PC');
  const query = useQuery({
    queryKey: ['p2-performance', tenantId, date, windowDays],
    queryFn: () => getPerformance(tenantId, date, Number(windowDays), accessToken),
    enabled: Boolean(tenantId && accessToken),
    // The server keeps the figures two minutes; asking more often gains nothing.
    staleTime: 120_000,
    refetchOnWindowFocus: false,
  });
  const data = query.data;
  const groups = data ? ROLE_GROUPS.filter((g) => data.people.some((p) => g.roles.includes(p.role))) : [];
  const current = groups.find((g) => g.key === group) ?? groups[0];
  const people = data && current ? data.people.filter((p) => current.roles.includes(p.role)) : [];
  const measures = data && current ? measuresFor(data.measures, current.roles) : [];
  const me = data?.own ? data.people[0] : undefined;

  return (
    <>
      <div className="p2mw-controls">
        <span className="p2mw-range">
          <button type="button" className="p2w-button p2w-button--ghost" aria-label="Previous day"
            onClick={() => setDate(shiftPeriod('DAY', date, -1))}>‹</button>
          <label>Day <input type="date" value={date} max={today} onChange={(e) => e.target.value && setDate(e.target.value)} /></label>
          <button type="button" className="p2w-button p2w-button--ghost" aria-label="Next day"
            disabled={!hasNextPeriod('DAY', date, today)} onClick={() => setDate(shiftPeriod('DAY', date, 1))}>›</button>
          <strong>{trackerLabel('DAY', date)}</strong>
          {date !== today ? <button type="button" className="p2w-button p2w-button--secondary" onClick={() => setDate(today)}>Today</button> : null}
        </span>
        <Segment label="Compared over" value={windowDays} options={WINDOWS} onChange={setWindowDays} />
      </div>

      {query.isLoading ? <SectionCard><p className="p2w-muted">Counting…</p></SectionCard> : null}
      {query.isError ? (
        <SectionCard>
          <div className="p2w-alert p2w-alert--error" role="alert">
            The performance figures could not be loaded.{' '}
            <button type="button" className="p2w-button p2w-button--ghost" onClick={() => query.refetch()}>Try again</button>
          </div>
        </SectionCard>
      ) : null}

      {data && data.own ? (
        me ? (
          <>
            <SectionCard>
              <div className="p2w-card__title">
                <h3>My day</h3>
                <p className="p2w-muted">Your figures for the day, against your own usual over the last {data.days.length} days and against the middle of your peers. Nobody else is named.</p>
              </div>
              <OwnCards data={data} me={me} />
            </SectionCard>
            <Duties data={data} people={[me]} />
          </>
        ) : <SectionCard><p className="p2w-muted">No outlet is mapped to you in this Project.</p></SectionCard>
      ) : null}

      {data && !data.own ? (
        <>
          {groups.length > 1 ? <Segment label="Team" value={current?.key ?? 'PC'} options={groups} onChange={setGroup} /> : null}
          {current ? <TeamTiles data={data} people={people} measures={measures} /> : null}
          <SectionCard>
            <div className="p2w-card__title">
              <h3>{current ? current.label : 'People'}</h3>
              <p className="p2w-muted">
                Each figure is the day's; the line is the last {data.days.length} days; ▲ ▼ compare with the person's own usual;
                the tag compares with peers of the same role. Click a column to sort.
              </p>
            </div>
            {people.length ? (
              <TeamTable data={data} people={people} measures={measures} peerRole={current && current.roles.length === 1 ? current.roles[0] : null} />
            ) : <p className="p2w-muted">Nobody is mapped to your outlets in this Project.</p>}
          </SectionCard>
          <Duties data={data} people={data.people} />
        </>
      ) : null}

      {data ? (
        <SectionCard>
          <details>
            <summary><strong>How each figure is counted</strong></summary>
            <ul className="p2pt-notes">{data.notes.map((note) => <li key={note}>{note}</li>)}</ul>
          </details>
        </SectionCard>
      ) : null}
    </>
  );
}
