import { useMemo, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';

import SectionCard from '../../../components/SectionCard';
import { Segment } from '../my-work/MyWorkParts';
import {
  addPending,
  datesText,
  flowOf,
  getPerformance,
  measuresFor,
  MODE_DAYS,
  pendingOf,
  periodsOf,
  sumAt,
  valueText,
  type Measure,
  type Mode,
  type PendingCounts,
  type Performance,
  type Period,
  type SectionKey,
} from '../../../services/audit-core/uc03Performance';
import { hasNextPeriod, shiftPeriod, trackerLabel } from '../../../services/audit-core/uc03ProjectTracker';
import '../../../styles/uc03-p2-performance.css';

const MODES: Array<{ key: Mode; label: string }> = [
  { key: 'DAILY', label: 'Day by day (7 days)' },
  { key: 'WEEKLY', label: 'Week by week (6 weeks)' },
];
type Level = 'dealer' | 'outlet' | 'person';
const ROLE_TABS: Array<{ key: string; label: string }> = [
  { key: 'PC', label: 'PCs' }, { key: 'REVIEWER', label: 'Reviewers' }, { key: 'TL', label: 'Team Leads' }, { key: 'PM', label: 'PMs' },
];
const FREQUENCY: Record<string, string> = { DAILY: 'Daily', WEEKLY: 'Weekly', MONTHLY: 'Monthly' };

function Section({ title, about, controls, children }: { title: string; about: string; controls?: ReactNode; children: ReactNode }) {
  return (
    <SectionCard>
      <div className="p2w-card__title p2mw-title-row">
        <div><h3>{title}</h3><p className="p2w-muted">{about}</p></div>
        {controls}
      </div>
      {children}
    </SectionCard>
  );
}

// ---------------------------------------------------------------- 1. pending work

type PendingRow = { id: string; name: string; sub?: string; counts: PendingCounts };

function PendingCell({ counts, kind }: { counts: PendingCounts; kind: string }) {
  const { total, old } = pendingOf(counts, kind);
  if (!total) return <td className="p2pf-zero">0</td>;
  return (
    <td>
      <strong>{total}</strong>
      {old ? <span className="p2pf-old" title="Older than 3 days"> {old} older than 3 days</span> : null}
    </td>
  );
}

function Pending({ data, own }: { data: Performance; own: boolean }) {
  const pending = data.pending!;
  const [level, setLevel] = useState<Level>(pending.outlets.length ? 'outlet' : 'person');
  const levels: Array<{ key: Level; label: string }> = [
    ...(new Set(pending.outlets.map((o) => o.dealerId)).size > 1 ? [{ key: 'dealer' as Level, label: 'Dealership' }] : []),
    ...(pending.outlets.length ? [{ key: 'outlet' as Level, label: 'Outlet' }] : []),
    { key: 'person', label: 'Person' },
  ];
  const rows: PendingRow[] = useMemo(() => {
    if (level === 'person') {
      return pending.people.map((p) => ({ id: p.actorId, name: p.name || 'Name not recorded', sub: p.role === 'PC' ? undefined : p.role, counts: p.counts }));
    }
    if (level === 'outlet') {
      return pending.outlets.map((o) => ({ id: o.outletId, name: o.outletName, sub: o.dealerName, counts: o.counts }));
    }
    const dealers = new Map<string, { name: string; all: PendingCounts[] }>();
    for (const o of pending.outlets) {
      const d = dealers.get(o.dealerId) ?? { name: o.dealerName, all: [] };
      d.all.push(o.counts);
      dealers.set(o.dealerId, d);
    }
    return [...dealers.entries()].map(([id, d]) => ({ id, name: d.name, counts: addPending(d.all) }));
  }, [pending, level]);
  // People carry only their own work, so the person view leaves out what belongs to an outlet.
  const kinds = pending.kinds.filter((k) => level !== 'person' || k.key !== 'awaitingReview');
  const weight = (r: PendingRow) => kinds.reduce((n, k) => n + pendingOf(r.counts, k.key).total, 0);
  const sorted = [...rows].filter((r) => own || weight(r) > 0).sort((a, b) => weight(b) - weight(a) || a.name.localeCompare(b.name));
  const total = addPending((pending.outlets.length ? pending.outlets : pending.people).map((x) => x.counts));
  return (
    <Section title="Pending work" about="What is waiting right now, and how much of it has waited more than three days."
      controls={levels.length > 1 ? <Segment label="Pending by" value={level} options={levels} onChange={setLevel} /> : undefined}>
      <div className="p2mw-tiles">
        {pending.kinds.map((k) => {
          const t = pendingOf(total, k.key);
          return (
            <div key={k.key} className={`p2mw-tile${t.old ? ' p2mw-tile--warn' : ''}`}>
              <span className="p2mw-tile__label">{k.label}</span>
              <strong className="p2mw-tile__value">{t.total}</strong>
              <span className="p2mw-tile__hint">{t.old ? `${t.old} older than 3 days` : 'none older than 3 days'}</span>
            </div>
          );
        })}
      </div>
      {sorted.length ? (
        <div className="p2pt-scroll">
          <table className="p2w-table p2mw-table p2pf-table" aria-label="Pending work">
            <thead><tr><th scope="col">{levels.find((l) => l.key === level)?.label}</th>{kinds.map((k) => <th key={k.key} scope="col">{k.label}</th>)}</tr></thead>
            <tbody>
              {sorted.map((r) => (
                <tr key={r.id}>
                  <th scope="row">{r.name}{r.sub ? <div className="p2w-muted p2pf-sub">{r.sub}</div> : null}</th>
                  {kinds.map((k) => <PendingCell key={k.key} counts={r.counts} kind={k.key} />)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className="p2pf-allgood">Nothing is pending.</p>}
    </Section>
  );
}

// ---------------------------------------------------------------- 2. bookings and deliveries

function Flow({ data, periods }: { data: Performance; periods: Period[] }) {
  const outlets = data.flow!.outlets;
  const manyDealers = new Set(outlets.map((o) => o.dealerId)).size > 1;
  const [level, setLevel] = useState<'dealer' | 'outlet'>(manyDealers ? 'dealer' : 'outlet');
  const groups = useMemo(() => {
    if (level === 'outlet') return outlets.map((o) => ({ id: o.outletId, name: o.outletName, sub: o.dealerName, outlets: [o] }));
    const map = new Map<string, { id: string; name: string; sub?: string; outlets: typeof outlets }>();
    for (const o of outlets) {
      const g = map.get(o.dealerId) ?? { id: o.dealerId, name: o.dealerName, outlets: [] };
      g.outlets.push(o);
      map.set(o.dealerId, g);
    }
    return [...map.values()];
  }, [outlets, level]);
  const daysOf = (p: Period) => p.indexes.map((i) => data.days[i]);
  const shown = periods.flatMap(daysOf);
  const rows = groups.map((g) => ({ ...g, total: flowOf(g.outlets, shown) }))
    .sort((a, b) => (b.total.bookings + b.total.deliveries) - (a.total.bookings + a.total.deliveries) || a.name.localeCompare(b.name));
  const all = flowOf(outlets, shown);
  return (
    <Section title="Bookings and deliveries" about="Journeys uploaded as bookings (B) and as deliveries (D), and the deliveries on the gate register against those in Verigence."
      controls={manyDealers ? <Segment label="By" value={level} options={[{ key: 'dealer', label: 'Dealership' }, { key: 'outlet', label: 'Outlet' }]} onChange={setLevel} /> : undefined}>
      <div className="p2pt-scroll">
        <table className="p2w-table p2mw-table p2pf-table" aria-label="Bookings and deliveries">
          <thead>
            <tr>
              <th scope="col" rowSpan={2}>{level === 'dealer' ? 'Dealership' : 'Outlet'}</th>
              {periods.map((p) => <th key={p.key} scope="col" rowSpan={2}>{p.label}</th>)}
              <th scope="col" rowSpan={2}>Total</th>
              <th scope="colgroup" colSpan={4} className="p2pf-group">Gate register</th>
            </tr>
            <tr><th scope="col">On register</th><th scope="col">In Verigence</th><th scope="col">Not uploaded</th><th scope="col">Registers missed</th></tr>
          </thead>
          <tbody>
            {rows.map((g) => {
              const gap = g.total.onRegister - g.total.inTool;
              return (
                <tr key={g.id}>
                  <th scope="row">{g.name}{g.sub ? <div className="p2w-muted p2pf-sub">{g.sub}</div> : null}</th>
                  {periods.map((p) => {
                    const f = flowOf(g.outlets, daysOf(p));
                    return f.bookings + f.deliveries ? <td key={p.key}><span className="p2pf-b">B {f.bookings}</span> <span className="p2pf-d">D {f.deliveries}</span></td>
                      : <td key={p.key} className="p2pf-zero">—</td>;
                  })}
                  <td><strong>B {g.total.bookings} · D {g.total.deliveries}</strong></td>
                  <td>{g.total.onRegister}</td>
                  <td>{g.total.inTool}</td>
                  <td className={gap > 0 ? 'p2mw-attn' : undefined}>{Math.max(0, gap)}{g.total.notNotified ? <span className="p2w-muted p2pf-sub"> ({g.total.notNotified} not notified to PC)</span> : null}</td>
                  <td className={g.total.registerMissing ? 'p2mw-attn' : undefined}>{g.total.registerMissing}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">Total</th>
              {periods.map((p) => { const f = flowOf(outlets, daysOf(p)); return <td key={p.key}>{f.bookings + f.deliveries ? `B ${f.bookings} D ${f.deliveries}` : '—'}</td>; })}
              <td><strong>B {all.bookings} · D {all.deliveries}</strong></td>
              <td>{all.onRegister}</td><td>{all.inTool}</td><td>{Math.max(0, all.onRegister - all.inTool)}</td><td>{all.registerMissing}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </Section>
  );
}

// ---------------------------------------------------------------- 3. day to day, week to week

function Trend({ data, periods, mode }: { data: Performance; periods: Period[]; mode: Mode }) {
  const roles = ROLE_TABS.filter((r) => data.people.some((p) => p.role === r.key));
  const [role, setRole] = useState(roles[0]?.key ?? 'PC');
  const current = roles.find((r) => r.key === role) ?? roles[0];
  const measures = current ? measuresFor(data.measures, [current.key]) : [];
  const [measureKey, setMeasureKey] = useState<string>('');
  const measure: Measure | undefined = measures.find((m) => m.key === measureKey) ?? measures[0];
  if (!current || !measure) return null;
  const people = data.people.filter((p) => p.role === current.key);
  const rows = people.map((p) => {
    const cells = periods.map((per) => sumAt(p.series[measure.key], per.indexes));
    const total = cells.reduce((a, b) => a + b, 0);
    return { p, cells, total, average: periods.length ? total / periods.length : 0 };
  }).sort((a, b) => (measure.lowerIsBetter ? a.total - b.total : b.total - a.total) || (a.p.name ?? '').localeCompare(b.p.name ?? ''));
  const column = periods.map((_, i) => rows.reduce((n, r) => n + r.cells[i], 0));
  return (
    <Section title={mode === 'DAILY' ? 'Day to day' : 'Week to week'}
      about={`Each person's ${measure.label.toLowerCase()} per ${mode === 'DAILY' ? 'day' : 'week'}. A figure under half of the person's own average is marked.`}
      controls={roles.length > 1 ? <Segment label="Role" value={current.key} options={roles} onChange={setRole} /> : undefined}>
      <Segment label="Figure" value={measure.key} options={measures.map((m) => ({ key: m.key, label: m.label }))} onChange={setMeasureKey} />
      <div className="p2pt-scroll">
        <table className="p2w-table p2mw-table p2pf-table" aria-label={`${measure.label} per ${mode === 'DAILY' ? 'day' : 'week'}`}>
          <thead>
            <tr>
              <th scope="col">{current.label}</th>
              {periods.map((p) => <th key={p.key} scope="col">{p.label}</th>)}
              <th scope="col">Total</th><th scope="col">Average</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ p, cells, total, average }) => (
              <tr key={p.actorId}>
                <th scope="row">{p.name || 'Name not recorded'}</th>
                {cells.map((v, i) => {
                  const low = !measure.lowerIsBetter && !periods[i].off && average >= 2 && v < average / 2;
                  const high = Boolean(measure.lowerIsBetter) && v >= 3 && v > average * 2;
                  return <td key={periods[i].key} className={low || high ? 'p2pf-low' : v === 0 ? 'p2pf-zero' : undefined}>{v === 0 ? '—' : valueText(measure, v)}</td>;
                })}
                <td><strong>{valueText(measure, total)}</strong></td>
                <td>{valueText(measure, Math.round(average * 10) / 10)}</td>
              </tr>
            ))}
          </tbody>
          {measure.unit === 'MINUTES' ? null : (
            <tfoot>
              <tr>
                <th scope="row">Total</th>
                {column.map((v, i) => <td key={periods[i].key}>{valueText(measure, v)}</td>)}
                <td><strong>{valueText(measure, column.reduce((a, b) => a + b, 0))}</strong></td><td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </Section>
  );
}

// ---------------------------------------------------------------- 4. PC efficiency

const share = (v: number | null) => (v == null ? '—' : `${v}%`);

function Efficiency({ data, mode }: { data: Performance; mode: Mode }) {
  const rows = [...data.efficiency!.people].sort((a, b) => (b.closedShare ?? -1) - (a.closedShare ?? -1) || (a.name ?? '').localeCompare(b.name ?? ''));
  if (!rows.length) return null;
  return (
    <Section title="PC efficiency" about={`Over the last ${mode === 'DAILY' ? '7 days' : '6 weeks'}: how much of what a PC starts gets finished, how fast, and how clean.`}>
      <div className="p2pt-scroll">
        <table className="p2w-table p2mw-table p2pf-table" aria-label="PC efficiency">
          <thead>
            <tr>
              <th scope="col">PC</th>
              <th scope="col" title="Delivery files closed in the period, of the delivery files first uploaded in it">Delivery files closed</th>
              <th scope="col" title="From the first delivery upload to the file closing">Days to close</th>
              <th scope="col" title="Pages not rejected on image quality">Pages right first time</th>
              <th scope="col" title="Tasks with a due time closed by it">Tasks closed in time</th>
              <th scope="col">Journeys a working day</th>
              <th scope="col">Days worked</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.actorId}>
                <th scope="row">{r.name || 'Name not recorded'}</th>
                <td className={r.closedShare != null && r.closedShare < 50 ? 'p2pf-low' : undefined}>
                  <strong>{share(r.closedShare)}</strong><span className="p2w-muted p2pf-sub"> {r.deliveryClosed} of {r.deliveryStarted}</span>
                </td>
                <td className={r.daysToClose != null && r.daysToClose > 3 ? 'p2pf-low' : undefined}>{r.daysToClose == null ? '—' : r.daysToClose.toFixed(1)}</td>
                <td className={r.firstTimeRight != null && r.firstTimeRight < 90 ? 'p2pf-low' : undefined}>
                  <strong>{share(r.firstTimeRight)}</strong><span className="p2w-muted p2pf-sub"> {r.pagesRejected} of {r.pagesUploaded} rejected</span>
                </td>
                <td className={r.tasksInTimeShare != null && r.tasksInTimeShare < 70 ? 'p2pf-low' : undefined}>
                  <strong>{share(r.tasksInTimeShare)}</strong><span className="p2w-muted p2pf-sub"> {r.tasksInTime} of {r.tasksWithDue}</span>
                </td>
                <td>{r.journeysPerDay ?? '—'}</td>
                <td>{r.daysWorked}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

// ---------------------------------------------------------------- 5. delinquencies

function Delinquency({ data }: { data: Performance }) {
  const titles = new Map(data.schedules.map((s) => [s.scheduleId, s]));
  const lines = [...data.delinquency!.lines].sort((a, b) => b.notDone - a.notDone || b.late - a.late || (a.name ?? '').localeCompare(b.name ?? ''));
  return (
    <Section title="Delinquencies" about="Daily and weekly duties per person: due, done on time, done late and missed, with the dates missed.">
      {lines.length ? (
        <div className="p2pt-scroll">
          <table className="p2w-table p2mw-table p2pf-table" aria-label="Delinquencies">
            <thead><tr><th scope="col">Person</th><th scope="col">Duty</th><th scope="col">Due</th><th scope="col">On time</th><th scope="col">Late</th><th scope="col">Missed</th><th scope="col">Dates missed</th></tr></thead>
            <tbody>
              {lines.map((l) => {
                const s = titles.get(l.scheduleId);
                return (
                  <tr key={`${l.actorId}-${l.scheduleId}`}>
                    <th scope="row">{l.name || 'Name not recorded'}</th>
                    <td>{s?.title ?? 'Duty'}<span className="p2w-muted p2pf-sub"> {s ? FREQUENCY[s.frequency] ?? s.frequency : ''}</span></td>
                    <td>{l.due}</td>
                    <td>{l.onTime}</td>
                    <td className={l.late ? 'p2mw-attn' : 'p2pf-zero'}>{l.late}</td>
                    <td className={l.notDone ? 'p2pf-low' : 'p2pf-zero'}>{l.notDone}</td>
                    <td>{l.missedDates.length ? datesText(l.missedDates) : <span className="p2w-muted">—</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : <p className="p2w-muted">No duty fell due in this period.</p>}
      {data.plannedDuties.length ? (
        <p className="p2w-muted p2pf-planned">Not set up yet: {data.plannedDuties.map((d) => `${d.title} (${(FREQUENCY[d.frequency] ?? d.frequency).toLowerCase()})`).join(', ')}.</p>
      ) : null}
    </Section>
  );
}

/**
 * Performance (product owner 2026-11-13), the five things a lead manages by: how much work is
 * pending; bookings and deliveries per dealership and outlet; how each PC, Reviewer and Team Lead
 * did day to day or week to week; the efficiency of each PC; and the delinquencies in daily and
 * weekly duties. A PC or Reviewer sees their own. A SuperAdmin chooses the sections each role sees.
 */
export default function PerformanceView({ tenantId, accessToken, today, initialMode = 'DAILY' }: {
  tenantId: string; accessToken: string | undefined; today: string; initialMode?: Mode;
}) {
  const [date, setDate] = useState(today);
  const [mode, setMode] = useState<Mode>(initialMode);
  const query = useQuery({
    queryKey: ['p2-performance', tenantId, date, String(MODE_DAYS[mode])],
    queryFn: () => getPerformance(tenantId, date, MODE_DAYS[mode], accessToken),
    enabled: Boolean(tenantId && accessToken),
    // The server keeps the figures two minutes; asking more often gains nothing.
    staleTime: 120_000,
    refetchOnWindowFocus: false,
  });
  const data = query.data;
  const periods = useMemo(() => (data ? periodsOf(data.days, mode) : []), [data, mode]);
  const shows = (key: SectionKey) => Boolean(data?.sections?.some((s) => s.key === key));

  return (
    <>
      <div className="p2mw-controls">
        <span className="p2mw-range">
          <button type="button" className="p2w-button p2w-button--ghost" aria-label="Previous day"
            onClick={() => setDate(shiftPeriod('DAY', date, -1))}>‹</button>
          <label>Up to <input type="date" value={date} max={today} onChange={(e) => e.target.value && setDate(e.target.value)} /></label>
          <button type="button" className="p2w-button p2w-button--ghost" aria-label="Next day"
            disabled={!hasNextPeriod('DAY', date, today)} onClick={() => setDate(shiftPeriod('DAY', date, 1))}>›</button>
          <strong>{trackerLabel('DAY', date)}</strong>
          {date !== today ? <button type="button" className="p2w-button p2w-button--secondary" onClick={() => setDate(today)}>Today</button> : null}
        </span>
        <Segment label="Period" value={mode} options={MODES} onChange={setMode} />
      </div>

      {query.isLoading ? <SectionCard><p className="p2w-muted">Counting…</p></SectionCard> : null}
      {query.isError ? (
        <SectionCard>
          <div className="p2w-alert p2w-alert--error" role="alert">
            The figures could not be loaded.{' '}
            <button type="button" className="p2w-button p2w-button--ghost" onClick={() => query.refetch()}>Try again</button>
          </div>
        </SectionCard>
      ) : null}

      {data ? (
        <>
          {data.own && !data.people.length ? <SectionCard><p className="p2w-muted">No outlet is mapped to you in this Project.</p></SectionCard> : null}
          {shows('pending') && data.pending ? <Pending data={data} own={data.own} /> : null}
          {shows('flow') && data.flow?.outlets.length ? <Flow data={data} periods={periods} /> : null}
          {shows('trend') && data.people.length ? <Trend data={data} periods={periods} mode={mode} /> : null}
          {shows('efficiency') && data.efficiency ? <Efficiency data={data} mode={mode} /> : null}
          {shows('duties') && data.delinquency ? <Delinquency data={data} /> : null}
          {data.sections && !data.sections.length ? <SectionCard><p className="p2w-muted">Nothing is switched on for your role here.</p></SectionCard> : null}
        </>
      ) : null}
    </>
  );
}
