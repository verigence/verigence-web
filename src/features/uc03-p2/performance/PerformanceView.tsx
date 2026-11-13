import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import SectionCard from '../../../components/SectionCard';
import { Segment } from '../my-work/MyWorkParts';
import {
  attention,
  getPerformance,
  liveMeasures,
  measuresFor,
  overall,
  personCard,
  sparkPoints,
  STANDING_LABEL,
  trend,
  unitCard,
  valueText,
  type Card,
  type CardMeasure,
  type Performance,
} from '../../../services/audit-core/uc03Performance';
import { hasNextPeriod, shiftPeriod, trackerLabel } from '../../../services/audit-core/uc03ProjectTracker';
import '../../../styles/uc03-p2-performance.css';

const WINDOWS: Array<{ key: '7' | '14' | '30'; label: string }> = [
  { key: '7', label: '7 days' }, { key: '14', label: '14 days' }, { key: '30', label: '30 days' },
];
const FREQUENCY: Record<string, string> = { DAILY: 'Daily', WEEKLY: 'Weekly', MONTHLY: 'Monthly' };

/** The views of a lead: dealerships, outlets, and the people by role (2026-11-13). */
export type Level = 'dealers' | 'outlets' | 'PC' | 'REVIEWER' | 'TL' | 'PM';
const LEVELS: Array<{ key: Level; label: string; one: string }> = [
  { key: 'dealers', label: 'Dealerships', one: 'dealership' },
  { key: 'outlets', label: 'Outlets', one: 'outlet' },
  { key: 'PC', label: 'PCs', one: 'PC' },
  { key: 'REVIEWER', label: 'Reviewers', one: 'Reviewer' },
  { key: 'TL', label: 'Team Leads', one: 'Team Lead' },
  { key: 'PM', label: 'PMs', one: 'PM' },
];

function Spark({ series, label }: { series: number[]; label: string }) {
  if (series.every((v) => v === 0)) return null;
  return (
    <svg className="p2pf-spark" viewBox="0 0 72 20" width="72" height="20" role="img" aria-label={label}>
      <polyline points={sparkPoints(series)} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

const STATUS: Record<string, { label: string; tone: string }> = {
  above: { label: STANDING_LABEL.above, tone: 'ok' },
  with: { label: STANDING_LABEL.with, tone: 'open' },
  below: { label: STANDING_LABEL.below, tone: 'bad' },
  idle: { label: 'Nothing recorded', tone: 'warn' },
};

/** One line of a card: the day's figure as a bar against the largest card, the usual as a tick. */
function MeasureLine({ measure, card, max }: { measure: CardMeasure; card: Card; max: number }) {
  const today = card.today[measure.key] ?? 0;
  const usual = card.usual[measure.key] ?? null;
  const t = trend(measure, today, usual);
  const pct = (v: number) => `${Math.min(100, max > 0 ? (v / max) * 100 : 0).toFixed(1)}%`;
  const tone = t?.good == null ? 'level' : t.good ? 'good' : 'poor';
  return (
    <div className="p2pf-line">
      <span className="p2pf-line__label">{measure.label}</span>
      <strong className="p2pf-line__value">{valueText(measure, today)}</strong>
      <span className={`p2pf-bar p2pf-bar--${measure.lowerIsBetter ? 'quality' : 'output'}`} aria-hidden="true">
        <span className="p2pf-bar__fill" style={{ width: pct(today) }} />
        {usual != null && usual > 0 ? <span className="p2pf-bar__usual" style={{ left: pct(usual) }} title={`Usual ${valueText(measure, usual)}`} /> : null}
      </span>
      <span className={`p2pf-trend p2pf-trend--${tone}`}>
        {t ? <>{t.dir === 'up' ? '▲' : t.dir === 'down' ? '▼' : '='} usual {valueText(measure, usual)}</> : null}
      </span>
    </div>
  );
}

function UnitCard({ card, measures, max, drill, onDrill }: {
  card: Card; measures: CardMeasure[]; max: Record<string, number>; drill?: string; onDrill?: () => void;
}) {
  const state = overall(card, measures);
  const status = state ? STATUS[state] : null;
  const duties = card.dutiesToday;
  const all = card.dutiesWindow;
  const lead = measures[0];
  return (
    <article className={`p2pf-unit${state === 'idle' ? ' p2pf-unit--idle' : ''}`}>
      <header className="p2pf-unit__head">
        <div>
          <h4>{card.name}</h4>
          {card.sub ? <span className="p2w-muted p2pf-sub">{card.sub}</span> : null}
        </div>
        {status ? <span className={`p2mw-chip p2mw-chip--${status.tone}`}>{status.label}</span> : null}
      </header>
      {measures.map((m) => <MeasureLine key={m.key} measure={m} card={card} max={max[m.key] ?? 0} />)}
      <footer className="p2pf-unit__foot">
        {all ? (
          <span className={all.notDone ? 'p2mw-attn' : 'p2w-muted'}>
            Duties {duties && duties.due ? `${duties.onTime + duties.late}/${duties.due} today · ` : ''}
            {all.onTime + all.late}/{all.due} in the period{all.notDone ? ` · ${all.notDone} not done` : ''}
          </span>
        ) : <span />}
        {lead ? <Spark series={card.series[lead.key] ?? []} label={`${lead.label} over the period`} /> : null}
        {drill && onDrill ? <button type="button" className="p2w-button p2w-button--ghost p2pf-drill" onClick={onDrill}>{drill} →</button> : null}
      </footer>
    </article>
  );
}

function Totals({ cards, measures, days }: { cards: Card[]; measures: CardMeasure[]; days: number }) {
  const active = cards.filter((c) => c.activeToday).length;
  return (
    <div className="p2mw-tiles">
      <div className="p2mw-tile">
        <span className="p2mw-tile__label">Active this day</span>
        <strong className="p2mw-tile__value">{active} / {cards.length}</strong>
        <span className="p2mw-tile__hint">with anything recorded</span>
      </div>
      {measures.filter((m) => m.unit !== 'MINUTES').slice(0, 5).map((m) => {
        const today = cards.reduce((sum, c) => sum + (c.today[m.key] ?? 0), 0);
        const usual = cards.reduce((sum, c) => sum + (c.usual[m.key] ?? 0), 0);
        const t = trend(m, today, days > 1 ? usual : null);
        return (
          <div key={m.key} className={`p2mw-tile${t?.good === false ? ' p2mw-tile--warn' : ''}`}>
            <span className="p2mw-tile__label">{m.label}</span>
            <strong className="p2mw-tile__value">{valueText(m, today)}</strong>
            <span className="p2mw-tile__hint">
              {t && t.dir !== 'level' ? (t.dir === 'up' ? '▲ ' : '▼ ') : ''}usual day {valueText(m, Math.round(usual * 10) / 10)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function Attention({ cards, measures }: { cards: Card[]; measures: CardMeasure[] }) {
  const lines = attention(cards, measures);
  if (!lines.length) return <p className="p2pf-allgood">Nothing needs attention here this day.</p>;
  return (
    <ul className="p2pf-attention" aria-label="Needs attention">
      {lines.map((line) => (
        <li key={`${line.id}-${line.why}`} className={`p2pf-attention__item p2pf-attention__item--${line.tone}`}>
          <strong>{line.name}</strong> — {line.why}
        </li>
      ))}
    </ul>
  );
}

function Duties({ data }: { data: Performance }) {
  if (!data.schedules.length && !data.plannedDuties.length) return null;
  return (
    <SectionCard>
      <div className="p2w-card__title">
        <h3>Daily and weekly duties</h3>
        <p className="p2w-muted">Every recurring task of the Task Manager. A new duty appears here once its schedule is created.</p>
      </div>
      <div className="p2pf-duties">
        {data.schedules.map((s) => {
          const sum = data.people.reduce((acc, p) => {
            const d = p.dutiesWindow[s.scheduleId];
            return d ? { due: acc.due + d.due, done: acc.done + d.onTime + d.late, late: acc.late + d.late, notDone: acc.notDone + d.notDone } : acc;
          }, { due: 0, done: 0, late: 0, notDone: 0 });
          return (
            <div key={s.scheduleId} className="p2pf-duty">
              <strong>{s.title}</strong>
              <span className="p2w-muted">{FREQUENCY[s.frequency] ?? s.frequency}{s.status === 'PAUSED' ? ' · paused' : ''}</span>
              <span>{sum.due ? `${sum.done} of ${sum.due} done` : 'None due in the period'}</span>
              {sum.late ? <span className="p2w-muted">{sum.late} late</span> : null}
              {sum.notDone ? <span className="p2mw-attn">{sum.notDone} not done</span> : null}
            </div>
          );
        })}
        {data.plannedDuties.map((d) => (
          <div key={d.title} className="p2pf-duty p2pf-duty--planned">
            <strong>{d.title}</strong>
            <span className="p2w-muted">{FREQUENCY[d.frequency] ?? d.frequency}</span>
            <span className="p2w-muted">Not set up yet</span>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

type Filter = { dealerId?: string; dealerName?: string; outletId?: string; outletName?: string };

/**
 * Performance (product owner 2026-11-13): the day of each dealership, outlet and person against
 * their own usual and their peers, as cards -- "I need to see dealership, PC, outlet views"; a
 * lead also sees the Reviewers, and a PM the Team Leads. A PC or Reviewer sees their own card and
 * nobody else. Open a dealership for its outlets, an outlet for its PCs.
 */
export default function PerformanceView({ tenantId, accessToken, today, initialLevel = 'dealers' }: {
  tenantId: string; accessToken: string | undefined; today: string; initialLevel?: Level;
}) {
  const [date, setDate] = useState(today);
  const [windowDays, setWindowDays] = useState<'7' | '14' | '30'>('14');
  const [level, setLevel] = useState<Level>(initialLevel);
  const [filter, setFilter] = useState<Filter>({});
  const query = useQuery({
    queryKey: ['p2-performance', tenantId, date, windowDays],
    queryFn: () => getPerformance(tenantId, date, Number(windowDays), accessToken),
    enabled: Boolean(tenantId && accessToken),
    // The server keeps the figures two minutes; asking more often gains nothing.
    staleTime: 120_000,
    refetchOnWindowFocus: false,
  });
  const data = query.data;

  const levels = useMemo(() => (data ? LEVELS.filter((l) => {
    if (l.key === 'dealers') return (data.dealers?.length ?? 0) > 1;
    if (l.key === 'outlets') return (data.outlets?.length ?? 0) > 0;
    return data.people.some((p) => p.role === l.key);
  }) : []), [data]);
  const current = levels.find((l) => l.key === level) ?? levels[0];

  const view = useMemo(() => {
    if (!data || !current) return { cards: [] as Card[], measures: [] as CardMeasure[] };
    if (current.key === 'dealers') {
      const cards = (data.dealers ?? []).map((d) => unitCard(d, d.dealerId, d.dealerName, `${d.outlets} outlets · ${d.people} people`));
      return { cards, measures: data.unitMeasures ?? [] };
    }
    if (current.key === 'outlets') {
      const cards = (data.outlets ?? []).filter((o) => !filter.dealerId || o.dealerId === filter.dealerId)
        .map((o) => unitCard(o, o.outletId, o.outletName,
          `${o.dealerName}${o.classification === 'SATELLITE' ? ' · Satellite' : ''} · ${o.people} people`));
      return { cards, measures: data.unitMeasures ?? [] };
    }
    const outletNames = new Map((data.outlets ?? []).map((o) => [o.outletId, o.outletName]));
    const cards = data.people.filter((p) => p.role === current.key)
      .filter((p) => !filter.outletId || (p.outletIds ?? []).includes(filter.outletId))
      .map((p) => personCard(p, (p.outletIds ?? []).map((id) => outletNames.get(id)).filter(Boolean).slice(0, 3).join(', ') || undefined));
    return { cards, measures: measuresFor(data.measures, [current.key]) as CardMeasure[] };
  }, [data, current, filter]);

  const measures = liveMeasures(view.measures, view.cards);
  const lead = measures[0];
  const cards = useMemo(() => [...view.cards].sort((a, b) =>
    Number(b.activeToday) - Number(a.activeToday)
    || (lead ? (b.today[lead.key] ?? 0) - (a.today[lead.key] ?? 0) : 0)
    || a.name.localeCompare(b.name)), [view.cards, lead]);
  const max = Object.fromEntries(measures.map((m) => [m.key,
    Math.max(1, ...cards.map((c) => Math.max(c.today[m.key] ?? 0, c.usual[m.key] ?? 0)))]));
  const me = data?.own && data.people[0] ? personCard(data.people[0]) : undefined;
  const myMeasures = data && me ? liveMeasures(measuresFor(data.measures, [data.people[0].role]) as CardMeasure[], [me]) : [];
  const go = (next: Level, f: Filter = {}) => { setLevel(next); setFilter(f); };

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
        <Segment label="Usual taken over" value={windowDays} options={WINDOWS} onChange={setWindowDays} />
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
          <SectionCard>
            <div className="p2w-card__title">
              <h3>My day</h3>
              <p className="p2w-muted">
                The bar is your day; the tick on it is your own usual over the last {data.days.length} days
                {data.shows?.peers === false ? '' : '; the tag compares you with the middle of your peers'}. Nobody else is named.
              </p>
            </div>
            <div className="p2pf-grid p2pf-grid--one">
              <UnitCard card={me} measures={myMeasures.length ? myMeasures : measuresFor(data.measures, [data.people[0].role]) as CardMeasure[]}
                max={Object.fromEntries(myMeasures.map((m) => [m.key, Math.max(1, me.today[m.key] ?? 0, me.usual[m.key] ?? 0)]))} />
            </div>
          </SectionCard>
        ) : <SectionCard><p className="p2w-muted">No outlet is mapped to you in this Project.</p></SectionCard>
      ) : null}

      {data && !data.own && current ? (
        <>
          <div className="p2pt-tabs" role="tablist" aria-label="Performance of">
            {levels.map((l) => (
              <button key={l.key} type="button" role="tab" aria-selected={current.key === l.key}
                className={current.key === l.key ? 'is-active' : undefined} onClick={() => go(l.key)}>{l.label}</button>
            ))}
          </div>
          {filter.dealerName || filter.outletName ? (
            <p className="p2pf-filter">
              Showing {filter.dealerName ? `the outlets of ${filter.dealerName}` : `the people of ${filter.outletName}`}.{' '}
              <button type="button" className="p2w-button p2w-button--ghost" onClick={() => setFilter({})}>Show all</button>
            </p>
          ) : null}
          <Totals cards={cards} measures={measures} days={data.days.length} />
          <SectionCard>
            <div className="p2w-card__title"><h3>Needs attention</h3></div>
            <Attention cards={cards} measures={measures} />
          </SectionCard>
          <SectionCard>
            <div className="p2w-card__title">
              <h3>{current.label}</h3>
              <p className="p2w-muted">
                The bar is the day's figure; the tick on it is the usual over the last {data.days.length} days
                {data.shows?.peers === false ? '' : `; the tag compares each ${current.one} with the others`}. Best first.
              </p>
            </div>
            {cards.length ? (
              <div className="p2pf-grid">
                {cards.map((card) => (
                  <UnitCard key={card.id} card={card} measures={measures} max={max}
                    drill={current.key === 'dealers' ? 'Outlets' : current.key === 'outlets' ? 'PCs' : undefined}
                    onDrill={current.key === 'dealers' ? () => go('outlets', { dealerId: card.id, dealerName: card.name })
                      : current.key === 'outlets' ? () => go('PC', { outletId: card.id, outletName: card.name }) : undefined} />
                ))}
              </div>
            ) : <p className="p2w-muted">Nobody here.</p>}
          </SectionCard>
        </>
      ) : null}

      {data ? <Duties data={data} /> : null}
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
