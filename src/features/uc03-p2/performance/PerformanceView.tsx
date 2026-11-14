import { Fragment, useMemo, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';

import SectionCard from '../../../components/SectionCard';
import Dashboard, { viewHas, viewLabel, type View } from './Dashboard';
import FailedUploads from './FailedUploads';
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
  type Channel,
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
/** The detail behind a dashboard tab: read only when it is opened (product owner 2026-11-13: "I
 *  don't want all to be shown in one"). */
export type Tab = 'backlog' | 'bookings' | 'deliveries' | 'uploads' | 'quality' | 'failed' | 'tasks' | 'trend' | 'efficiency' | 'duties';
/** mine: what the button reads for a PC or Reviewer, whose detail is their own row. own: read from
 *  its own report, not from a Performance section (the section only says whether the role sees it). */
const TABS: Array<{ key: Tab; label: string; mine?: string; section: SectionKey; own?: true }> = [
  { key: 'backlog', label: 'Each kind with what is over 3 days', mine: 'As a table', section: 'pending' },
  { key: 'bookings', label: 'Bookings by outlet', section: 'flow' },
  { key: 'deliveries', label: 'Deliveries by outlet', section: 'flow' },
  { key: 'uploads', label: 'Uploads by person and day', mine: 'My uploads, day by day', section: 'uploads' },
  { key: 'quality', label: 'Failures and duplicates by person', mine: 'As a table', section: 'quality' },
  // Each failed upload and why (product owner 2026-11-13), from the Project Tracker, which repeated
  // the rest of Performance: what failed after every retry, was not read in time, or never arrived.
  { key: 'failed', label: 'Why each upload failed', mine: 'Why my uploads failed', section: 'quality', own: true },
  { key: 'tasks', label: 'Tasks by outlet and person', mine: 'My tasks, day by day', section: 'tasks' },
  { key: 'trend', label: 'Each person, day by day', mine: 'My figures, day by day', section: 'trend' },
  { key: 'efficiency', label: 'The counts behind it', mine: 'The counts behind it', section: 'efficiency' },
  { key: 'duties', label: 'Duties by person', mine: 'As a table', section: 'duties' },
];
/** The dashboard, a tab at a time (product owner 2026-11-13: "can you make tabs to it instead of
 *  showing in one page all"), and the detail each tab can open. */
const VIEWS: Array<{ key: View; details: Tab[] }> = [
  { key: 'overview', details: ['bookings', 'deliveries', 'trend'] },
  { key: 'pending', details: ['backlog'] },
  { key: 'team', details: [] },
  { key: 'efficiency', details: ['efficiency'] },
  { key: 'uploads', details: ['uploads', 'quality', 'failed'] },
  { key: 'tasks', details: ['tasks'] },
  { key: 'duties', details: ['duties'] },
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
        <table className="p2w-table p2mw-table p2pf-table p2pf-table--num" aria-label="Bookings uploaded">
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
          <table className="p2w-table p2mw-table p2pf-table p2pf-table--num" aria-label="Deliveries per period">
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
          <table className="p2w-table p2mw-table p2pf-table p2pf-table--num" aria-label="Deliveries by dealership or outlet">
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

const CHANNELS: Array<{ key: Channel; label: string }> = [
  { key: 'direct', label: 'Direct' }, { key: 'bulk', label: 'Bulk upload' }, { key: 'drive', label: 'Google Drive' },
];

function sumIssues(all: Array<Record<Channel, number> | undefined>): Record<Channel, number> {
  const out: Record<Channel, number> = { direct: 0, bulk: 0, drive: 0 };
  for (const x of all) for (const c of CHANNELS) out[c.key] += x?.[c.key] ?? 0;
  return out;
}

function Uploads({ data, periods }: { data: Performance; periods: Period[] }) {
  const up = data.uploads!;
  const { level, setLevel, levels } = useLevels(up.outlets.length > 0, new Set(up.outlets.map((o) => o.dealerId)).size > 1);
  const add = (items: ChannelRow[]): ChannelRow => ({
    direct: data.days.map((_, i) => items.reduce((n, x) => n + (x.direct[i] ?? 0), 0)),
    bulk: data.days.map((_, i) => items.reduce((n, x) => n + (x.bulk[i] ?? 0), 0)),
    drive: data.days.map((_, i) => items.reduce((n, x) => n + (x.drive[i] ?? 0), 0)),
    duplicates: sumIssues(items.map((x) => x.duplicates)),
    errors: sumIssues(items.map((x) => x.errors)),
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
      <Section title="How files are uploaded" about="Files uploaded one by one (app or web), in a bulk folder upload, and through Google Drive; for each, the duplicates found and the files with errors."
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
          <table className="p2w-table p2mw-table p2pf-table p2pf-table--num" aria-label="Files by how they were uploaded, with duplicates and errors">
            <thead>
              <tr>
                <th scope="col" rowSpan={2}>{levels.find((l) => l.key === level)?.label}</th>
                {CHANNELS.map((c) => <th key={c.key} scope="colgroup" colSpan={3} className="p2pf-group">{c.label}</th>)}
                <th scope="col" rowSpan={2}>Total files</th>
                <th scope="col" rowSpan={2} title="Duplicates and files with errors, of all files plus duplicates">Issue share</th>
              </tr>
              <tr>
                {CHANNELS.map((c) => (
                  <Fragment key={c.key}>
                    <th scope="col">Files</th>
                    <th scope="col" title="Files found to be a copy: set aside, or deleted as the same booking uploaded again">Duplicates</th>
                    <th scope="col" title="Files with a page that failed, was not read in time or was rejected on quality, or whose upload failed">Errors</th>
                  </Fragment>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const files = { direct: r.d, bulk: r.b, drive: r.g };
                const issues = CHANNELS.reduce((n, c) => n + (r.row.duplicates?.[c.key] ?? 0) + (r.row.errors?.[c.key] ?? 0), 0);
                return (
                  <tr key={r.id}>
                    <th scope="row">{r.name}{r.sub ? <div className="p2w-muted p2pf-sub">{r.sub}</div> : null}</th>
                    {CHANNELS.map((c) => {
                      const dup = r.row.duplicates?.[c.key] ?? 0;
                      const err = r.row.errors?.[c.key] ?? 0;
                      return (
                        <Fragment key={c.key}>
                          <td className={files[c.key] ? undefined : 'p2pf-zero'}>{files[c.key]}</td>
                          <td className={dup ? 'p2pf-warn' : 'p2pf-zero'}>{dup}</td>
                          <td className={err ? 'p2pf-low' : 'p2pf-zero'}>{err}</td>
                        </Fragment>
                      );
                    })}
                    <td><strong>{r.d + r.b + r.g}</strong></td>
                    <td>{pct(issues, r.d + r.b + r.g + CHANNELS.reduce((n, c) => n + (r.row.duplicates?.[c.key] ?? 0), 0))}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Section>
      <Section title={`Per ${periods[0]?.indexes.length === 1 ? 'day' : 'week'}`} about="All the people and outlets you read, together.">
        <div className="p2pt-scroll">
          <table className="p2w-table p2mw-table p2pf-table p2pf-table--num" aria-label="Files by channel per period">
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
        <table className="p2w-table p2mw-table p2pf-table p2pf-table--num" aria-label="Duplicates and quality issues">
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
          <table className="p2w-table p2mw-table p2pf-table p2pf-table--num" aria-label="Tasks">
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
          <table className="p2w-table p2mw-table p2pf-table p2pf-table--num" aria-label="New and closed tasks per period">
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

function Trend({ data, periods, mode, range, today }: { data: Performance; periods: Period[]; mode: Mode; range: string; today: string }) {
  const roles = ROLE_TABS.filter((r) => data.people.some((p) => p.role === r.key));
  const [role, setRole] = useState(roles[0]?.key ?? 'PC');
  const current = roles.find((r) => r.key === role) ?? roles[0];
  const measures = current ? measuresFor(data.measures, [current.key]) : [];
  const [measureKey, setMeasureKey] = useState<string>('');
  const measure: Measure | undefined = measures.find((m) => m.key === measureKey) ?? measures[0];
  if (!current || !measure) return null;
  const people = data.people.filter((p) => p.role === current.key);
  // Today (or this week) is still going on: never marked, and not in the average until it has work
  // (2026-11-14, a Saturday morning showed every PC marked red).
  const inProgress = periods.map((per) => per.indexes.some((i) => (data.days[i] ?? '') >= today));
  const rows = people.map((p) => {
    const cells = periods.map((per) => sumAt(p.series[measure.key], per.indexes));
    const total = cells.reduce((a, b) => a + b, 0);
    // The average of the days worked: weekly offs and today count only when they have work.
    const counted = cells.filter((v, i) => v > 0 || (!periods[i].off && !inProgress[i])).length;
    return { p, cells, total, average: counted ? total / counted : 0 };
  }).sort((a, b) => (measure.lowerIsBetter ? a.total - b.total : b.total - a.total) || (a.p.name ?? '').localeCompare(b.p.name ?? ''));
  const column = periods.map((_, i) => rows.reduce((n, r) => n + r.cells[i], 0));
  return (
    <Section title={`${mode === 'DAILY' ? 'Day to day' : 'Week to week'} · ${range}`}
      about={`Each person's ${measure.label.toLowerCase()} per ${mode === 'DAILY' ? 'day' : 'week'}, for the dates chosen at the top. A figure under half of the person's own average is marked; today is not, while it is still going on.`}
      controls={roles.length > 1 ? <Segment label="Role" value={current.key} options={roles} onChange={setRole} /> : undefined}>
      <Segment label="Figure" value={measure.key} options={measures.map((m) => ({ key: m.key, label: m.label }))} onChange={setMeasureKey} />
      <div className="p2pt-scroll">
        <table className="p2w-table p2mw-table p2pf-table p2pf-table--num" aria-label={`${measure.label} per ${mode === 'DAILY' ? 'day' : 'week'}`}>
          <thead>
            <tr>
              <th scope="col">{current.label}</th>
              {periods.map((p) => <th key={p.key} scope="col">{p.label}</th>)}
              <th scope="col">Total</th><th scope="col" title="Per day worked: weekly offs and today count only when they have work">Average</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ p, cells, total, average }) => (
              <tr key={p.actorId}>
                <th scope="row">{p.name || 'Name not recorded'}</th>
                {cells.map((v, i) => {
                  const low = !measure.lowerIsBetter && !periods[i].off && !inProgress[i] && average >= 2 && v < average / 2;
                  const high = Boolean(measure.lowerIsBetter) && !inProgress[i] && v >= 3 && v > average * 2;
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
        <table className="p2w-table p2mw-table p2pf-table p2pf-table--num" aria-label="PC efficiency">
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

const detailLabel = (key: Tab, own: boolean) => { const t = TABS.find((x) => x.key === key)!; return own ? t.mine ?? t.label : t.label; };
const shortDate = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });

/**
 * Performance (product owner 2026-11-13): the dashboard of the reader's role over a date range, a
 * tab at a time -- overview, pending, the team, uploads and quality, tasks, duties -- and under
 * each tab the detail by outlet and person, read only when it is opened. A PC or Reviewer sees
 * their own. A SuperAdmin chooses the blocks and the detail each role sees.
 */
export default function PerformanceView({ tenantId, accessToken, today, initialView = 'overview', initialDetail = null }: {
  tenantId: string; accessToken: string | undefined; today: string; initialView?: View; initialDetail?: Tab | null;
}) {
  const [from, setFrom] = useState(addDays(today, -6));
  const [to, setTo] = useState(today);
  const [modePicked, setModePicked] = useState<Mode | null>(null);
  const [view, setView] = useState<View>(initialView);
  const [detail, setDetail] = useState<Tab | null>(initialDetail);
  const span = daysBetween(from, to);
  const valid = from <= to && to <= today && span <= 92;
  const mode = modePicked ?? defaultMode(span);
  const enabled = Boolean(tenantId && accessToken && valid);
  // The server keeps the figures two minutes; asking more often gains nothing.
  const dashboard = useQuery({
    queryKey: ['p2-performance', tenantId, from, to, 'dashboard'],
    queryFn: () => getPerformance(tenantId, from, to, 'dashboard', accessToken),
    enabled, staleTime: 120_000, refetchOnWindowFocus: false,
  });
  const open = detail ? TABS.find((t) => t.key === detail) ?? null : null;
  const query = useQuery({
    queryKey: ['p2-performance', tenantId, from, to, open?.section],
    queryFn: () => getPerformance(tenantId, from, to, open!.section, accessToken),
    enabled: enabled && Boolean(open) && !open?.own, staleTime: 120_000, refetchOnWindowFocus: false,
  });
  const board = dashboard.data?.dashboard;
  const data = query.data;
  const days = dashboard.data?.days ?? data?.days;
  const periods = useMemo(() => (days ? periodsOf(days, mode) : []), [days, mode]);
  const sections = dashboard.data?.sections ?? data?.sections;
  const own = dashboard.data?.own ?? data?.own ?? false;
  const allowed = (t: Tab) => {
    const section = TABS.find((x) => x.key === t)!.section;
    return !sections || (sections.some((x) => x.key === section) && (!own || section !== 'flow'));
  };
  // A tab is there while it has a block of the dashboard or a detail switched on for the role.
  const views = VIEWS.filter((v) => (!dashboard.data && !data) || (board ? viewHas(board, v.key) : false) || v.details.some(allowed));
  const current = views.find((v) => v.key === view) ?? views[0];
  const details = current ? current.details.filter(allowed) : [];
  const range = from === to ? shortDate(from) : `${shortDate(from)} to ${shortDate(to)}`;
  const pick = (f: string, t: string) => { setFrom(f); setTo(t); setModePicked(null); };
  const shown = open && data && details.includes(open.key) ? open.key : null;

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
        {views.map((v) => (
          <button key={v.key} type="button" role="tab" aria-selected={current?.key === v.key}
            className={current?.key === v.key ? 'is-active' : undefined}
            // A tab with no block of the dashboard for this role opens straight on its detail.
            onClick={() => { setView(v.key); setDetail(board && !viewHas(board, v.key) ? v.details.find(allowed) ?? null : null); }}>{viewLabel(v.key, board)}</button>
        ))}
      </div>

      {dashboard.isLoading ? <SectionCard><p className="p2w-muted">Counting…</p></SectionCard> : null}
      {dashboard.isError ? (
        <SectionCard>
          <div className="p2w-alert p2w-alert--error" role="alert">
            The dashboard could not be loaded.{' '}
            <button type="button" className="p2w-button p2w-button--ghost" onClick={() => dashboard.refetch()}>Try again</button>
          </div>
        </SectionCard>
      ) : null}
      {dashboard.data && !views.length ? <SectionCard><p className="p2w-muted">Nothing is switched on for your role here.</p></SectionCard> : null}
      {board && current ? <Dashboard board={board} view={current.key} periods={periods} asOf={dashboard.data!.asOfUtc} /> : null}

      {details.length ? (
        <div className="p2db-details" role="group" aria-label="More detail">
          <span>More detail</span>
          {details.map((key) => (
            <button key={key} type="button" aria-pressed={detail === key} className={`p2w-button p2w-button--ghost${detail === key ? ' is-on' : ''}`}
              onClick={() => setDetail(detail === key ? null : key)}>{detailLabel(key, own)}</button>
          ))}
        </div>
      ) : null}
      {open?.key === 'failed' && details.includes('failed') && valid ? (
        <SectionCard>
          <div className="p2w-card__title">
            <h3>Why each upload failed</h3>
            <p className="p2w-muted">Files uploaded {range} with a page that failed after every retry, was not read in time, never arrived, or was rejected on image quality.</p>
          </div>
          <FailedUploads tenantId={tenantId} accessToken={accessToken} first={from} last={to} />
        </SectionCard>
      ) : null}
      {open && !open.own && details.includes(open.key) && query.isLoading ? <SectionCard><p className="p2w-muted">Counting…</p></SectionCard> : null}
      {open && !open.own && details.includes(open.key) && query.isError ? (
        <SectionCard>
          <div className="p2w-alert p2w-alert--error" role="alert">
            The figures could not be loaded.{' '}
            <button type="button" className="p2w-button p2w-button--ghost" onClick={() => query.refetch()}>Try again</button>
          </div>
        </SectionCard>
      ) : null}
      {shown && data ? (
        <>
          {data.own && data.people && !data.people.length ? <SectionCard><p className="p2w-muted">No outlet is mapped to you in this Project.</p></SectionCard> : null}
          {shown === 'backlog' && data.pending ? <Pending data={data} own={data.own} /> : null}
          {shown === 'bookings' && data.flow?.outlets.length ? <Bookings data={data} periods={periods} /> : null}
          {shown === 'deliveries' && data.flow?.outlets.length ? <Deliveries data={data} periods={periods} /> : null}
          {shown === 'uploads' && data.uploads ? <Uploads data={data} periods={periods} /> : null}
          {shown === 'quality' && data.quality ? <Quality data={data} range={range} /> : null}
          {shown === 'tasks' && data.tasks ? <Tasks data={data} periods={periods} /> : null}
          {shown === 'trend' && data.people?.length ? <Trend data={data} periods={periods} mode={mode} range={range} today={today} /> : null}
          {shown === 'efficiency' && data.efficiency ? <Efficiency data={data} range={range} /> : null}
          {shown === 'duties' && data.delinquency ? <Delinquency data={data} /> : null}
        </>
      ) : null}
    </>
  );
}
