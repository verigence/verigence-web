import { useMemo, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';

import SectionCard from '../../../components/SectionCard';
import { Segment } from '../my-work/MyWorkParts';
import {
  addDays,
  addPending,
  datesText,
  daysBetween,
  defaultMode,
  flowOf,
  getPerformance,
  measuresFor,
  pendingOf,
  periodsOf,
  sumAt,
  valueText,
  type Measure,
  type Mode,
  type ChannelRow,
  type PendingCounts,
  type Performance,
  type Period,
  type Place,
  type QualityRow,
  type SectionKey,
  type TaskRow,
} from '../../../services/audit-core/uc03Performance';
import '../../../styles/uc03-p2-performance.css';

const MODES: Array<{ key: Mode; label: string }> = [
  { key: 'DAILY', label: 'Day by day' },
  { key: 'WEEKLY', label: 'Week by week' },
];
/** One tab at a time (product owner 2026-11-13: "I don't want all to be shown in one"): each reads its own section. */
export type Tab = 'backlog' | 'bookings' | 'deliveries' | 'uploads' | 'quality' | 'tasks' | 'trend' | 'efficiency' | 'duties';
const TABS: Array<{ key: Tab; label: string; section: SectionKey }> = [
  { key: 'backlog', label: 'Backlog', section: 'pending' },
  { key: 'bookings', label: 'Bookings', section: 'flow' },
  { key: 'deliveries', label: 'Deliveries', section: 'flow' },
  { key: 'uploads', label: 'Uploads', section: 'uploads' },
  { key: 'quality', label: 'Duplicates & quality', section: 'quality' },
  { key: 'tasks', label: 'Tasks', section: 'tasks' },
  { key: 'trend', label: 'Day to day', section: 'trend' },
  { key: 'efficiency', label: 'PC efficiency', section: 'efficiency' },
  { key: 'duties', label: 'Delinquencies', section: 'duties' },
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
    <Section title="Backlog" about="What is waiting right now (whatever the dates above), and how much of it has waited more than three days."
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
      ) : <p className="p2pf-allgood">No backlog.</p>}
    </Section>
  );
}

// ---------------------------------------------------------------- 2. bookings, 3. deliveries

type FlowOutlet = NonNullable<Performance['flow']>['outlets'][number];
type Group<T> = { id: string; name: string; sub?: string; items: T[] };

/** Outlets as they are, or added up into their dealerships. */
function grouped<T extends Place>(outlets: T[], level: 'dealer' | 'outlet'): Array<Group<T>> {
  if (level === 'outlet') return outlets.map((o) => ({ id: o.outletId, name: o.outletName, sub: o.dealerName, items: [o] }));
  const map = new Map<string, Group<T>>();
  for (const o of outlets) {
    const g = map.get(o.dealerId) ?? { id: o.dealerId, name: o.dealerName, items: [] };
    g.items.push(o);
    map.set(o.dealerId, g);
  }
  return [...map.values()];
}

const UNIT_LEVELS: Array<{ key: 'dealer' | 'outlet'; label: string }> = [{ key: 'dealer', label: 'Dealership' }, { key: 'outlet', label: 'Outlet' }];

function Bookings({ data, periods }: { data: Performance; periods: Period[] }) {
  const outlets = data.flow!.outlets;
  const manyDealers = new Set(outlets.map((o) => o.dealerId)).size > 1;
  const [level, setLevel] = useState<'dealer' | 'outlet'>(manyDealers ? 'dealer' : 'outlet');
  const daysOf = (p: Period) => p.indexes.map((i) => data.days[i]);
  const rows = grouped(outlets, level).map((g) => ({ ...g, total: flowOf(g.items, data.days).bookings }))
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
  return (
    <Section title="Bookings" about="Journeys uploaded as bookings (no delivery page in that day's uploads), per day or week."
      controls={manyDealers ? <Segment label="By" value={level} options={UNIT_LEVELS} onChange={setLevel} /> : undefined}>
      <div className="p2pt-scroll">
        <table className="p2w-table p2mw-table p2pf-table" aria-label="Bookings uploaded">
          <thead><tr><th scope="col">{level === 'dealer' ? 'Dealership' : 'Outlet'}</th>{periods.map((p) => <th key={p.key} scope="col">{p.label}</th>)}<th scope="col">Total</th></tr></thead>
          <tbody>
            {rows.map((g) => (
              <tr key={g.id}>
                <th scope="row">{g.name}{g.sub ? <div className="p2w-muted p2pf-sub">{g.sub}</div> : null}</th>
                {periods.map((p) => { const n = flowOf(g.items, daysOf(p)).bookings; return <td key={p.key} className={n ? undefined : 'p2pf-zero'}>{n || '—'}</td>; })}
                <td><strong>{g.total}</strong></td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">Total</th>
              {periods.map((p) => <td key={p.key}>{flowOf(outlets, daysOf(p)).bookings || '—'}</td>)}
              <td><strong>{flowOf(outlets, data.days).bookings}</strong></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </Section>
  );
}

function DeliveryCells({ f }: { f: ReturnType<typeof flowOf> }) {
  return (
    <>
      <td className={f.deliveries ? undefined : 'p2pf-zero'}><strong>{f.deliveries}</strong></td>
      <td className={f.onRegister ? undefined : 'p2pf-zero'}>{f.onRegister}</td>
      <td className={f.notNotified ? 'p2mw-attn' : 'p2pf-zero'}>{f.notNotified}</td>
      <td className={f.notUploaded ? 'p2pf-low' : 'p2pf-zero'}>{f.notUploaded}</td>
      <td className={f.registerMissing ? 'p2pf-low' : 'p2pf-zero'}>{f.registerMissing}</td>
    </>
  );
}
const DELIVERY_HEADS = (
  <>
    <th scope="col" title="Journeys uploaded with a delivery page">Deliveries uploaded</th>
    <th scope="col" title="Deliveries on the gate register">On register</th>
    <th scope="col" title="On the register, not intimated to the PC by the dealership">Not intimated</th>
    <th scope="col" title="Intimated to the PC and not in Verigence">Not uploaded</th>
    <th scope="col" title="Gate register not uploaded by its due time">Registers missed</th>
  </>
);

function Deliveries({ data, periods }: { data: Performance; periods: Period[] }) {
  const outlets = data.flow!.outlets;
  const manyDealers = new Set(outlets.map((o) => o.dealerId)).size > 1;
  const [level, setLevel] = useState<'dealer' | 'outlet'>(manyDealers ? 'dealer' : 'outlet');
  const [scope, setScope] = useState('');
  const groups = grouped<FlowOutlet>(outlets, level);
  const picked = groups.find((g) => g.id === scope);
  const within = picked ? picked.items : outlets;
  const rows = groups.map((g) => ({ ...g, total: flowOf(g.items, data.days) }))
    .sort((a, b) => b.total.notUploaded - a.total.notUploaded || b.total.deliveries - a.total.deliveries || a.name.localeCompare(b.name));
  return (
    <>
      <Section title={`Deliveries per ${periods[0]?.indexes.length === 1 ? 'day' : 'week'}${picked ? `: ${picked.name}` : ''}`}
        about="Deliveries uploaded against the gate register: on the register, not intimated to the PC, and intimated but not uploaded."
        controls={(
          <label className="p2pf-pick">Show{' '}
            <select value={scope} onChange={(e) => setScope(e.target.value)}>
              <option value="">Everything</option>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </label>
        )}>
        <div className="p2pt-scroll">
          <table className="p2w-table p2mw-table p2pf-table" aria-label="Deliveries per period">
            <thead><tr><th scope="col">{periods[0]?.indexes.length === 1 ? 'Day' : 'Week'}</th>{DELIVERY_HEADS}</tr></thead>
            <tbody>
              {periods.map((p) => (
                <tr key={p.key} className={p.off ? 'p2pf-off' : undefined}>
                  <th scope="row">{p.label}</th>
                  <DeliveryCells f={flowOf(within, p.indexes.map((i) => data.days[i]))} />
                </tr>
              ))}
            </tbody>
            <tfoot><tr><th scope="row">Total</th><DeliveryCells f={flowOf(within, data.days)} /></tr></tfoot>
          </table>
        </div>
      </Section>
      <Section title={`Deliveries by ${level === 'dealer' ? 'dealership' : 'outlet'}`} about="The same figures for the whole period. Most not uploaded first."
        controls={manyDealers ? <Segment label="By" value={level} options={UNIT_LEVELS} onChange={(l) => { setLevel(l); setScope(''); }} /> : undefined}>
        <div className="p2pt-scroll">
          <table className="p2w-table p2mw-table p2pf-table" aria-label="Deliveries by dealership or outlet">
            <thead><tr><th scope="col">{level === 'dealer' ? 'Dealership' : 'Outlet'}</th>{DELIVERY_HEADS}</tr></thead>
            <tbody>
              {rows.map((g) => (
                <tr key={g.id}>
                  <th scope="row">{g.name}{g.sub ? <div className="p2w-muted p2pf-sub">{g.sub}</div> : null}</th>
                  <DeliveryCells f={g.total} />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </>
  );
}

// ---------------------------------------------------------------- uploads by channel; duplicates and quality

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const pct = (n: number, of: number) => (of ? `${Math.round((100 * n) / of)}%` : '—');

function useLevels(hasOutlets: boolean, manyDealers: boolean) {
  const [level, setLevel] = useState<Level>(hasOutlets ? 'outlet' : 'person');
  const levels: Array<{ key: Level; label: string }> = [
    ...(manyDealers ? [{ key: 'dealer' as Level, label: 'Dealership' }] : []),
    ...(hasOutlets ? [{ key: 'outlet' as Level, label: 'Outlet' }] : []),
    { key: 'person', label: 'PC' },
  ];
  return { level, setLevel, levels };
}

function Uploads({ data, periods }: { data: Performance; periods: Period[] }) {
  const up = data.uploads!;
  const { level, setLevel, levels } = useLevels(up.outlets.length > 0, new Set(up.outlets.map((o) => o.dealerId)).size > 1);
  const add = (items: ChannelRow[]): ChannelRow => ({
    direct: data.days.map((_, i) => items.reduce((n, x) => n + (x.direct[i] ?? 0), 0)),
    bulk: data.days.map((_, i) => items.reduce((n, x) => n + (x.bulk[i] ?? 0), 0)),
    drive: data.days.map((_, i) => items.reduce((n, x) => n + (x.drive[i] ?? 0), 0)),
  });
  const rows = (level === 'person'
    ? up.people.map((p) => ({ id: p.actorId, name: p.name || 'Name not recorded', sub: undefined as string | undefined, row: p as ChannelRow }))
    : grouped(up.outlets, level === 'dealer' ? 'dealer' : 'outlet').map((g) => ({ id: g.id, name: g.name, sub: g.sub, row: add(g.items) })))
    .map((r) => ({ ...r, d: sum(r.row.direct), b: sum(r.row.bulk), g: sum(r.row.drive) }))
    .sort((a, b) => (b.d + b.b + b.g) - (a.d + a.b + a.g) || a.name.localeCompare(b.name));
  const all = add(up.outlets.length ? up.outlets : up.people);
  const total = sum(all.direct) + sum(all.bulk) + sum(all.drive);
  return (
    <>
      <Section title="How files are uploaded" about="Files uploaded one by one (app or web), in a bulk folder upload, and through Google Drive."
        controls={levels.length > 1 ? <Segment label="By" value={level} options={levels} onChange={setLevel} /> : undefined}>
        <div className="p2mw-tiles">
          {([['Direct', all.direct], ['Bulk upload', all.bulk], ['Google Drive', all.drive]] as Array<[string, number[]]>).map(([label, xs]) => (
            <div key={label} className="p2mw-tile">
              <span className="p2mw-tile__label">{label}</span>
              <strong className="p2mw-tile__value">{sum(xs)}</strong>
              <span className="p2mw-tile__hint">{pct(sum(xs), total)} of {total} files</span>
            </div>
          ))}
        </div>
        <div className="p2pt-scroll">
          <table className="p2w-table p2mw-table p2pf-table" aria-label="Files by how they were uploaded">
            <thead><tr><th scope="col">{levels.find((l) => l.key === level)?.label}</th><th scope="col">Direct</th><th scope="col">Bulk upload</th><th scope="col">Google Drive</th><th scope="col">Total</th><th scope="col">Share not direct</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <th scope="row">{r.name}{r.sub ? <div className="p2w-muted p2pf-sub">{r.sub}</div> : null}</th>
                  <td className={r.d ? undefined : 'p2pf-zero'}>{r.d}</td><td className={r.b ? undefined : 'p2pf-zero'}>{r.b}</td>
                  <td className={r.g ? undefined : 'p2pf-zero'}>{r.g}</td><td><strong>{r.d + r.b + r.g}</strong></td>
                  <td>{pct(r.b + r.g, r.d + r.b + r.g)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
      <Section title={`Per ${periods[0]?.indexes.length === 1 ? 'day' : 'week'}`} about="All the people and outlets you read, together.">
        <div className="p2pt-scroll">
          <table className="p2w-table p2mw-table p2pf-table" aria-label="Files by channel per period">
            <thead><tr><th scope="col" />{periods.map((p) => <th key={p.key} scope="col">{p.label}</th>)}<th scope="col">Total</th></tr></thead>
            <tbody>
              {([['Direct', all.direct], ['Bulk upload', all.bulk], ['Google Drive', all.drive]] as Array<[string, number[]]>).map(([label, xs]) => (
                <tr key={label}><th scope="row">{label}</th>{periods.map((p) => <td key={p.key}>{sumAt(xs, p.indexes) || '—'}</td>)}<td><strong>{sum(xs)}</strong></td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </>
  );
}

const QUALITY_COLUMNS: Array<{ key: keyof QualityRow; label: string; title: string }> = [
  { key: 'blurred', label: 'Blurred', title: 'Pages rejected as blurred' },
  { key: 'faded', label: 'Faded', title: 'Pages rejected as too faded' },
  { key: 'tooSmall', label: 'Too small', title: 'Pages rejected because the image is too small' },
  { key: 'otherQuality', label: 'Other quality', title: 'Pages rejected for another quality reason' },
  { key: 'duplicatePages', label: 'Duplicate pages', title: 'Pages already uploaded: not sent for reading again' },
  { key: 'duplicateFiles', label: 'Duplicate files', title: 'Uploads deleted as the same file uploaded again' },
];

function Quality({ data, range }: { data: Performance; range: string }) {
  const q = data.quality!;
  const { level, setLevel, levels } = useLevels(q.outlets.length > 0, new Set(q.outlets.map((o) => o.dealerId)).size > 1);
  const add = (items: QualityRow[]): QualityRow => {
    const out: QualityRow = { pagesUploaded: 0 };
    for (const x of items) {
      out.pagesUploaded += x.pagesUploaded;
      for (const c of QUALITY_COLUMNS) (out[c.key] as number) = ((out[c.key] as number | undefined) ?? 0) + ((x[c.key] as number | undefined) ?? 0);
    }
    return out;
  };
  const rejected = (r: QualityRow) => (r.blurred ?? 0) + (r.faded ?? 0) + (r.tooSmall ?? 0) + (r.otherQuality ?? 0);
  const rows = (level === 'person'
    ? q.people.map((p) => ({ id: p.actorId, name: p.name || 'Name not recorded', sub: undefined as string | undefined, row: p as QualityRow }))
    : grouped(q.outlets, level === 'dealer' ? 'dealer' : 'outlet').map((g) => ({ id: g.id, name: g.name, sub: g.sub, row: add(g.items) })))
    .filter((r) => r.row.pagesUploaded > 0 || (r.row.duplicateFiles ?? 0) > 0)
    .sort((a, b) => rejected(b.row) - rejected(a.row) || a.name.localeCompare(b.name));
  const all = add(q.outlets.length ? q.outlets : q.people);
  return (
    <Section title="Duplicates and quality issues" about={`Of the files uploaded ${range}: pages rejected on image quality, pages and files uploaded twice. Most rejected first.`}
      controls={levels.length > 1 ? <Segment label="By" value={level} options={levels} onChange={setLevel} /> : undefined}>
      <div className="p2mw-tiles">
        <div className="p2mw-tile"><span className="p2mw-tile__label">Pages uploaded</span><strong className="p2mw-tile__value">{all.pagesUploaded}</strong></div>
        <div className={`p2mw-tile${rejected(all) ? ' p2mw-tile--warn' : ''}`}><span className="p2mw-tile__label">Rejected on quality</span><strong className="p2mw-tile__value">{rejected(all)}</strong><span className="p2mw-tile__hint">{pct(rejected(all), all.pagesUploaded)} of pages</span></div>
        <div className="p2mw-tile"><span className="p2mw-tile__label">Duplicate pages</span><strong className="p2mw-tile__value">{all.duplicatePages ?? 0}</strong></div>
        <div className={`p2mw-tile${all.duplicateFiles ? ' p2mw-tile--warn' : ''}`}><span className="p2mw-tile__label">Duplicate files</span><strong className="p2mw-tile__value">{all.duplicateFiles ?? 0}</strong></div>
      </div>
      <div className="p2pt-scroll">
        <table className="p2w-table p2mw-table p2pf-table" aria-label="Duplicates and quality issues">
          <thead>
            <tr>
              <th scope="col">{levels.find((l) => l.key === level)?.label}</th><th scope="col">Pages uploaded</th>
              {QUALITY_COLUMNS.map((c) => <th key={c.key} scope="col" title={c.title}>{c.label}</th>)}
              <th scope="col" title="Pages rejected on quality, of pages uploaded">Rejected share</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const share = r.row.pagesUploaded ? rejected(r.row) / r.row.pagesUploaded : 0;
              return (
                <tr key={r.id}>
                  <th scope="row">{r.name}{r.sub ? <div className="p2w-muted p2pf-sub">{r.sub}</div> : null}</th>
                  <td>{r.row.pagesUploaded}</td>
                  {QUALITY_COLUMNS.map((c) => { const n = (r.row[c.key] as number | undefined) ?? 0; return <td key={c.key} className={n ? undefined : 'p2pf-zero'}>{n}</td>; })}
                  <td className={share > 0.1 ? 'p2pf-low' : undefined}>{pct(rejected(r.row), r.row.pagesUploaded)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

// ---------------------------------------------------------------- 4. tasks

function Tasks({ data, periods }: { data: Performance; periods: Period[] }) {
  const tasks = data.tasks!;
  const manyDealers = new Set(tasks.outlets.map((o) => o.dealerId)).size > 1;
  const [level, setLevel] = useState<Level>(tasks.outlets.length ? 'outlet' : 'person');
  const levels: Array<{ key: Level; label: string }> = [
    ...(manyDealers ? [{ key: 'dealer' as Level, label: 'Dealership' }] : []),
    ...(tasks.outlets.length ? [{ key: 'outlet' as Level, label: 'Outlet' }] : []),
    { key: 'person', label: 'Person' },
  ];
  const add = (items: TaskRow[]): TaskRow => ({
    raised: data.days.map((_, i) => items.reduce((n, x) => n + (x.raised[i] ?? 0), 0)),
    closed: data.days.map((_, i) => items.reduce((n, x) => n + (x.closed[i] ?? 0), 0)),
    open: items.reduce((n, x) => n + x.open, 0), overdue: items.reduce((n, x) => n + x.overdue, 0),
  });
  const rows = (level === 'person'
    ? tasks.people.map((p) => ({ id: p.actorId, name: p.name || 'Name not recorded', sub: p.role === 'PC' ? undefined : p.role, row: p as TaskRow }))
    : grouped(tasks.outlets, level === 'dealer' ? 'dealer' : 'outlet').map((g) => ({ id: g.id, name: g.name, sub: g.sub, row: add(g.items) })))
    .filter((r) => sum(r.row.raised) + sum(r.row.closed) + r.row.open > 0)
    .sort((a, b) => b.row.open - a.row.open || a.name.localeCompare(b.name));
  const all = add(tasks.outlets.length ? tasks.outlets : tasks.people);
  return (
    <>
      <Section title="Tasks" about="New tasks and tasks closed in the period, and what is open and overdue right now."
        controls={levels.length > 1 ? <Segment label="Tasks by" value={level} options={levels} onChange={setLevel} /> : undefined}>
        <div className="p2mw-tiles">
          <div className="p2mw-tile"><span className="p2mw-tile__label">New in the period</span><strong className="p2mw-tile__value">{sum(all.raised)}</strong></div>
          <div className="p2mw-tile"><span className="p2mw-tile__label">Closed in the period</span><strong className="p2mw-tile__value">{sum(all.closed)}</strong></div>
          <div className={`p2mw-tile${all.open ? ' p2mw-tile--warn' : ''}`}><span className="p2mw-tile__label">Open now (PC tasks)</span><strong className="p2mw-tile__value">{all.open}</strong></div>
          <div className={`p2mw-tile${all.overdue ? ' p2mw-tile--bad' : ''}`}><span className="p2mw-tile__label">Overdue now</span><strong className="p2mw-tile__value">{all.overdue}</strong></div>
        </div>
        <div className="p2pt-scroll">
          <table className="p2w-table p2mw-table p2pf-table" aria-label="Tasks">
            <thead><tr><th scope="col">{levels.find((l) => l.key === level)?.label}</th><th scope="col">New</th><th scope="col">Closed</th><th scope="col">Open now</th><th scope="col">Overdue now</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <th scope="row">{r.name}{r.sub ? <div className="p2w-muted p2pf-sub">{r.sub}</div> : null}</th>
                  <td>{sum(r.row.raised)}</td><td>{sum(r.row.closed)}</td>
                  <td className={r.row.open ? undefined : 'p2pf-zero'}><strong>{r.row.open}</strong></td>
                  <td className={r.row.overdue ? 'p2pf-low' : 'p2pf-zero'}>{r.row.overdue}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
      <Section title={`New and closed per ${periods[0]?.indexes.length === 1 ? 'day' : 'week'}`} about="More new than closed means the backlog grew.">
        <div className="p2pt-scroll">
          <table className="p2w-table p2mw-table p2pf-table" aria-label="New and closed tasks per period">
            <thead><tr><th scope="col" />{periods.map((p) => <th key={p.key} scope="col">{p.label}</th>)}<th scope="col">Total</th></tr></thead>
            <tbody>
              <tr><th scope="row">New</th>{periods.map((p) => <td key={p.key}>{sumAt(all.raised, p.indexes) || '—'}</td>)}<td><strong>{sum(all.raised)}</strong></td></tr>
              <tr><th scope="row">Closed</th>{periods.map((p) => <td key={p.key}>{sumAt(all.closed, p.indexes) || '—'}</td>)}<td><strong>{sum(all.closed)}</strong></td></tr>
              <tr>
                <th scope="row">Backlog change</th>
                {periods.map((p) => { const n = sumAt(all.raised, p.indexes) - sumAt(all.closed, p.indexes); return <td key={p.key} className={n > 0 ? 'p2mw-attn' : undefined}>{n > 0 ? `+${n}` : n}</td>; })}
                <td><strong>{sum(all.raised) - sum(all.closed) > 0 ? '+' : ''}{sum(all.raised) - sum(all.closed)}</strong></td>
              </tr>
            </tbody>
          </table>
        </div>
      </Section>
    </>
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

function Efficiency({ data, range }: { data: Performance; range: string }) {
  const rows = [...data.efficiency!.people].sort((a, b) => (b.closedShare ?? -1) - (a.closedShare ?? -1) || (a.name ?? '').localeCompare(b.name ?? ''));
  if (!rows.length) return null;
  return (
    <Section title="PC efficiency" about={`For ${range}: how much of what a PC starts gets finished, how fast, and how clean.`}>
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

const shortDate = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });

/**
 * Performance (product owner 2026-11-13): what a lead manages by, one tab at a time over a date
 * range -- the backlog; bookings; deliveries against the gate register; tasks new, closed and
 * open; each person day to day or week to week; PC efficiency; and delinquencies in daily and
 * weekly duties. A PC or Reviewer sees their own. A SuperAdmin chooses the
 * tabs each role sees. Only the open tab is read from the server.
 */
export default function PerformanceView({ tenantId, accessToken, today, initialTab = 'backlog' }: {
  tenantId: string; accessToken: string | undefined; today: string; initialTab?: Tab;
}) {
  const [from, setFrom] = useState(addDays(today, -6));
  const [to, setTo] = useState(today);
  const [modePicked, setModePicked] = useState<Mode | null>(null);
  const [tab, setTab] = useState<Tab>(initialTab);
  const span = daysBetween(from, to);
  const valid = from <= to && to <= today && span <= 92;
  const mode = modePicked ?? defaultMode(span);
  const current = TABS.find((t) => t.key === tab) ?? TABS[0];
  const query = useQuery({
    queryKey: ['p2-performance', tenantId, from, to, current.section],
    queryFn: () => getPerformance(tenantId, from, to, current.section, accessToken),
    enabled: Boolean(tenantId && accessToken && valid),
    // The server keeps the figures two minutes; asking more often gains nothing.
    staleTime: 120_000,
    refetchOnWindowFocus: false,
  });
  const data = query.data;
  const periods = useMemo(() => (data ? periodsOf(data.days, mode) : []), [data, mode]);
  const allowed = data?.sections ? TABS.filter((t) => data.sections!.some((s) => s.key === t.section) && (!data.own || t.section !== 'flow')) : TABS;
  const shown = allowed.some((t) => t.key === current.key);
  const range = from === to ? shortDate(from) : `${shortDate(from)} to ${shortDate(to)}`;
  const pick = (f: string, t: string) => { setFrom(f); setTo(t); setModePicked(null); };

  return (
    <>
      <div className="p2mw-controls">
        <span className="p2mw-range">
          <label>From <input type="date" value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} /></label>
          <label>To <input type="date" value={to} min={from} max={today} onChange={(e) => e.target.value && setTo(e.target.value)} /></label>
          <button type="button" className="p2w-button p2w-button--ghost" onClick={() => pick(today, today)}>Today</button>
          <button type="button" className="p2w-button p2w-button--ghost" onClick={() => pick(addDays(today, -6), today)}>Last 7 days</button>
          <button type="button" className="p2w-button p2w-button--ghost" onClick={() => pick(`${today.slice(0, 8)}01`, today)}>This month</button>
        </span>
        <Segment label="Shown" value={mode} options={MODES} onChange={(m) => setModePicked(m)} />
      </div>
      {valid ? null : <div className="p2w-alert p2w-alert--error" role="alert">Choose a range of up to 92 days, ending today or earlier.</div>}

      <div className="p2pt-tabs" role="tablist" aria-label="Performance">
        {allowed.map((t) => (
          <button key={t.key} type="button" role="tab" aria-selected={current.key === t.key}
            className={current.key === t.key ? 'is-active' : undefined} onClick={() => setTab(t.key)}>{t.label}</button>
        ))}
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

      {data && shown ? (
        <>
          {data.own && !data.people.length ? <SectionCard><p className="p2w-muted">No outlet is mapped to you in this Project.</p></SectionCard> : null}
          {tab === 'backlog' && data.pending ? <Pending data={data} own={data.own} /> : null}
          {tab === 'bookings' && data.flow?.outlets.length ? <Bookings data={data} periods={periods} /> : null}
          {tab === 'deliveries' && data.flow?.outlets.length ? <Deliveries data={data} periods={periods} /> : null}
          {tab === 'uploads' && data.uploads ? <Uploads data={data} periods={periods} /> : null}
          {tab === 'quality' && data.quality ? <Quality data={data} range={range} /> : null}
          {tab === 'tasks' && data.tasks ? <Tasks data={data} periods={periods} /> : null}
          {tab === 'trend' && data.people.length ? <Trend data={data} periods={periods} mode={mode} /> : null}
          {tab === 'efficiency' && data.efficiency ? <Efficiency data={data} range={range} /> : null}
          {tab === 'duties' && data.delinquency ? <Delinquency data={data} /> : null}
        </>
      ) : null}
      {data && !shown ? (
        <SectionCard>
          <p className="p2w-muted">
            {allowed.length ? 'This tab is not switched on for your role. Choose another.' : 'Nothing is switched on for your role here.'}
          </p>
        </SectionCard>
      ) : null}
    </>
  );
}
