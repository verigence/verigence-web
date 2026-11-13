import { useMemo, useState, type ReactNode } from 'react';

import { Chart } from '../../insights/charts/Chart';
import { SERIES } from '../../insights/charts/chartOptions';
import { Segment } from '../my-work/MyWorkParts';
import {
  cardTotals,
  datesText,
  dutyDayState,
  sortRows,
  sparkPoints,
  type DashCard,
  type DashColumn,
  type DashDuty,
  type Dashboard as Board,
  type DutyState,
  type Period,
} from '../../../services/audit-core/uc03Performance';
import { trendOption } from './dashboardCharts';
import '../../../styles/uc03-p2-dashboard.css';

const count = (value: number) => new Intl.NumberFormat('en-IN', { maximumFractionDigits: 1 }).format(value);
const FREQUENCY: Record<string, string> = { DAILY: 'Daily', WEEKLY: 'Weekly', MONTHLY: 'Monthly' };
const TONE_WORD: Record<string, string> = { good: 'Good', warn: 'Watch', bad: 'Act' };
const shortDate = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });
/** The tabs of a dashboard (product owner 2026-11-13: "make tabs to it instead of showing in one page all"). */
export type View = 'overview' | 'pending' | 'team' | 'uploads' | 'tasks' | 'duties';

/** Whether the server sent anything for a tab (a SuperAdmin may have hidden its blocks for the role). */
export function viewHas(board: Board, view: View): boolean {
  if (view === 'overview') return Boolean(board.kpis?.tiles.length || board.attention || board.trend || board.peers);
  if (view === 'pending') return Boolean(board.pending);
  if (view === 'team') return Boolean(board.scorecards?.length);
  if (view === 'uploads') return Boolean(board.channels || board.quality);
  if (view === 'tasks') return Boolean(board.tasks);
  return Boolean(board.duties && (board.duties.rows.length || board.duties.planned.length));
}

export function viewLabel(view: View, board?: Board): string {
  const own = board ? board.view !== 'TEAM' : false;
  if (view === 'overview') return own ? 'What I did' : 'Overview';
  if (view === 'pending') return board?.view === 'PC' ? 'Waiting for me' : board?.view === 'REVIEWER' ? 'Waiting for review' : 'Pending';
  if (view === 'team') return own ? 'My outlets' : 'Team and outlets';
  if (view === 'uploads') return 'Uploads, failures and duplicates';
  if (view === 'tasks') return 'Tasks';
  return own ? 'My duties' : 'Duties';
}

function Panel({ title, about, action, grow = 1, children }: {
  title: string; about?: string; action?: ReactNode; grow?: number; children: ReactNode;
}) {
  return (
    <section className="p2db-panel" style={{ flexGrow: grow }} aria-label={title}>
      <header className="p2db-panel__head">
        <div><h3>{title}</h3>{about ? <p>{about}</p> : null}</div>
        {action}
      </header>
      {children}
    </section>
  );
}

function Tiles({ board }: { board: Board }) {
  const kpis = board.kpis!;
  return (
    <section className="p2db-band" aria-label={kpis.title}>
      <h3 className="p2db-band__title">{kpis.title}</h3>
      <div className="p2db-tiles">
        {kpis.tiles.map((t) => (
          <div key={t.key} className={`p2db-tile${t.tone ? ` p2db-tile--${t.tone}` : ''}`}>
            <span className="p2db-tile__label">{t.label}</span>
            <strong className="p2db-tile__value">{typeof t.value === 'number' ? count(t.value) : t.value}</strong>
            <span className="p2db-tile__hint">
              {t.tone ? <span className={`p2db-flag p2db-flag--${t.tone}`}>{TONE_WORD[t.tone]}</span> : null}{t.hint}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- pending now, by age

function Pending({ board }: { board: Board }) {
  const pending = board.pending!;
  const nothing = pending.kinds.every((k) => !k.total);
  return (
    <>
      {nothing ? <p className="p2db-good">Nothing is waiting.</p> : (
        <>
          <ul className="p2db-legend" aria-label="Age of what is waiting">
            {pending.buckets.map((b, i) => <li key={b}><i className={`p2db-age p2db-age--${i}`} />{b}</li>)}
          </ul>
          <div className="p2db-pending" role="table" aria-label={pending.title}>
            {pending.kinds.map((k) => {
              const old = (k.buckets[2] ?? 0) + (k.buckets[3] ?? 0);
              return (
                <div key={k.key} className={`p2db-pending__row${k.within ? ' is-within' : ''}`} role="row">
                  <span className="p2db-pending__label" role="rowheader">{k.within ? 'of which ' : ''}{k.within ? k.label.toLowerCase() : k.label}</span>
                  <strong className={`p2db-pending__total${k.total ? '' : ' is-zero'}`} role="cell">{count(k.total)}</strong>
                  <span className="p2db-pending__bar" role="cell">
                    {k.total ? k.buckets.map((n, i) => (n ? (
                      <span key={pending.buckets[i]} className={`p2db-age p2db-age--${i}`} style={{ flexGrow: n }}
                        title={`${pending.buckets[i]}: ${n}`}><b>{n}</b></span>
                    ) : null)) : null}
                  </span>
                  <span className={`p2db-pending__old${old ? ' is-old' : ''}`} role="cell">{old ? `${count(old)} over 3 days` : k.total ? 'none over 3 days' : ''}</span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}

// ---------------------------------------------------------------- needs attention

function Attention({ board }: { board: Board }) {
  const { lines, total } = board.attention!;
  if (!lines.length) return <p className="p2db-good">Nothing needs attention.</p>;
  return (
    <>
      <ul className="p2db-attention">
        {lines.map((line, i) => (
          <li key={i} className={`p2db-attention__line p2db-attention__line--${line.tone}`}>
            <span className={`p2db-flag p2db-flag--${line.tone}`}>{TONE_WORD[line.tone]}</span>
            <span><strong>{line.who}</strong> {line.text}</span>
          </li>
        ))}
      </ul>
      {total > lines.length ? <p className="p2db-note">{total - lines.length} more in the tabs above.</p> : null}
    </>
  );
}

// ---------------------------------------------------------------- tasks

function Tasks({ board, periods }: { board: Board; periods: Period[] }) {
  const tasks = board.tasks!;
  const raised = tasks.raised.reduce((a, b) => a + b, 0);
  const closed = tasks.closed.reduce((a, b) => a + b, 0);
  const option = useMemo(() => trendOption([{ name: 'New', data: tasks.raised }, { name: 'Closed', data: tasks.closed }], periods, false), [tasks, periods]);
  return (
    <>
      <dl className="p2db-facts">
        <div><dt>New</dt><dd>{count(raised)}</dd></div>
        <div><dt>Closed</dt><dd>{count(closed)}</dd></div>
        <div><dt>Open now</dt><dd>{count(tasks.open)}</dd></div>
        <div className={tasks.overdue ? 'is-bad' : undefined}><dt>Overdue now</dt><dd>{count(tasks.overdue)}</dd></div>
      </dl>
      <Chart option={option} height={260} label="Tasks new and closed" empty="No task was raised or closed in this period." />
    </>
  );
}

// ---------------------------------------------------------------- scorecards

function Cell({ column, value, max }: { column: DashColumn; value: number | null | undefined; max: number }) {
  if (value == null) return <td className="p2db-zero">—</td>;
  if (column.kind === 'pct') {
    return <td className={value < 70 ? 'p2db-cell--bad' : value < 90 ? 'p2db-cell--warn' : undefined}>{value}%</td>;
  }
  if (column.kind === 'bar') {
    return (
      <td>
        <span className="p2db-barcell">
          <span className="p2db-barcell__n">{count(value)}</span>
          <span className="p2db-barcell__track"><span style={{ width: `${max ? Math.max(value ? 4 : 0, (value / max) * 100) : 0}%` }} /></span>
        </span>
      </td>
    );
  }
  if (!value) return <td className="p2db-zero">0</td>;
  return <td className={column.kind === 'alert' ? 'p2db-cell--bad' : column.kind === 'warn' ? 'p2db-cell--warn' : undefined}>{count(value)}</td>;
}

const ROWS_SHOWN = 12;

function Scorecard({ card }: { card: DashCard }) {
  const [sort, setSort] = useState<{ key: string; descending: boolean }>({ key: card.sort, descending: true });
  const [all, setAll] = useState(false);
  const rows = useMemo(() => sortRows(card.rows, sort.key, sort.descending), [card.rows, sort]);
  const totals = useMemo(() => cardTotals(card), [card]);
  const max = useMemo(() => Object.fromEntries(card.columns.map((c) => [c.key, Math.max(0, ...card.rows.map((r) => r.values[c.key] ?? 0))])), [card]);
  const shown = all ? rows : rows.slice(0, ROWS_SHOWN);
  const head = (key: string, label: string) => (
    <th key={key} scope="col" aria-sort={sort.key === key ? (sort.descending ? 'descending' : 'ascending') : undefined}>
      <button type="button" className="p2db-sort" onClick={() => setSort({ key, descending: sort.key === key ? !sort.descending : key !== 'name' })}>
        {label}{sort.key === key ? <span aria-hidden="true">{sort.descending ? ' ↓' : ' ↑'}</span> : null}
      </button>
    </th>
  );
  return (
    <>
      <div className="p2db-scroll">
        <table className="p2db-table" aria-label={card.title}>
          <thead>
            <tr>
              {head('name', card.title)}
              {card.spark ? <th scope="col" className="p2db-table__spark">{card.spark}</th> : null}
              {card.columns.map((c) => head(c.key, c.label))}
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.id}>
                <th scope="row">{r.name}{r.sub ? <span className="p2db-sub">{r.sub}</span> : null}</th>
                {card.spark ? (
                  <td className="p2db-table__spark">
                    {r.spark?.some((v) => v > 0) ? (
                      <svg viewBox="0 0 96 22" width="96" height="22" role="img" aria-label={`${card.spark}: ${r.spark.map(count).join(', ')}`}>
                        <polyline points={sparkPoints(r.spark, 96, 22)} fill="none" stroke={SERIES[0]} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
                      </svg>
                    ) : <span className="p2db-zero">no activity</span>}
                  </td>
                ) : null}
                {card.columns.map((c) => <Cell key={c.key} column={c} value={r.values[c.key]} max={max[c.key]} />)}
              </tr>
            ))}
          </tbody>
          {card.rows.length > 1 ? (
            <tfoot>
              <tr>
                <th scope="row">All {card.rows.length}</th>
                {card.spark ? <td /> : null}
                {card.columns.map((c) => <td key={c.key}>{totals[c.key] == null ? '' : count(totals[c.key]!)}</td>)}
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>
      {rows.length > ROWS_SHOWN ? (
        <button type="button" className="p2w-button p2w-button--ghost p2db-more" onClick={() => setAll(!all)}>
          {all ? `Show the first ${ROWS_SHOWN}` : `Show all ${rows.length}`}
        </button>
      ) : null}
    </>
  );
}

function Scorecards({ board }: { board: Board }) {
  const cards = board.scorecards!;
  const [picked, setPicked] = useState(cards[0].key);
  const card = cards.find((c) => c.key === picked) ?? cards[0];
  return (
    <Panel title={board.view === 'TEAM' ? 'Who is doing what' : card.title}
      about={board.view === 'TEAM' ? `${board.period}. Work done in the period beside what is waiting now. Click a heading to sort.` : undefined}
      action={cards.length > 1 ? <Segment label="Scorecard of" value={card.key} options={cards.map((c) => ({ key: c.key, label: c.title }))} onChange={setPicked} /> : undefined}>
      <Scorecard key={card.key} card={card} />
    </Panel>
  );
}

// ---------------------------------------------------------------- duties

const DUTY_WORD: Record<DutyState, string> = { none: 'Not due', done: 'Done on time', late: 'Done late', missed: 'Missed', pending: 'Open' };
/** A team's day: several people owe the duty, so the box says how many missed it (or were late). */
const TEAM_DUTY_WORD: Record<DutyState, string> = { none: 'Not due', done: 'All done on time', late: 'Some late (number late)', missed: 'Some missed (number missed)', pending: 'Open' };
const DUTY_MARK: Record<DutyState, string> = { none: '', done: '✓', late: 'L', missed: '✕', pending: '…' };

function Duty({ duty, own }: { duty: DashDuty; own: boolean }) {
  const roomy = duty.days.length <= 16;
  return (
    <div className="p2db-duty">
      <div className="p2db-duty__head">
        <strong>{duty.title}</strong><span className="p2db-tag">{FREQUENCY[duty.frequency] ?? duty.frequency}</span>
        <span className="p2db-duty__sum">
          {duty.onTime} of {duty.due} on time{duty.late ? ` · ${duty.late} late` : ''}
          {duty.notDone ? <b className="p2db-cell--bad"> · {duty.notDone} missed</b> : ' · none missed'}
        </span>
      </div>
      <div className={`p2db-strip${roomy ? ' is-roomy' : ''}`} role="img"
        aria-label={`${duty.title}: ${duty.days.filter((d) => d.due).map((d) => `${shortDate(d.date)} ${DUTY_WORD[dutyDayState(d)].toLowerCase()}`).join(', ')}`}>
        {duty.days.map((d) => {
          const state = dutyDayState(d);
          const several = (d.due ?? 0) > 1;
          return (
            <span key={d.date} className={`p2db-strip__day p2db-strip__day--${state}`}
              title={`${shortDate(d.date)}: ${DUTY_WORD[state]}${several ? ` (${d.onTime ?? 0} on time, ${d.late ?? 0} late, ${d.notDone ?? 0} missed of ${d.due})` : ''}`}>
              {roomy ? <><b>{several && state === 'missed' ? d.notDone : several && state === 'late' ? d.late : DUTY_MARK[state]}</b><i>{new Date(`${d.date}T00:00:00Z`).getUTCDate()}</i></> : null}
            </span>
          );
        })}
      </div>
      {!own && duty.missedBy.length ? (
        <ul className="p2db-missed">
          {duty.missedBy.map((m) => <li key={m.name}><strong>{m.name}</strong> missed {datesText(m.dates, 5)}</li>)}
        </ul>
      ) : null}
    </div>
  );
}

function Duties({ board }: { board: Board }) {
  const duties = board.duties!;
  return (
    <>
      {duties.rows.length ? (
        <>
          <ul className="p2db-legend" aria-label="What a day came to">
            {(['done', 'late', 'missed', 'pending', 'none'] as DutyState[]).map((s) => (
              <li key={s}><i className={`p2db-strip__day p2db-strip__day--${s}`} />{(board.view === 'TEAM' ? TEAM_DUTY_WORD : DUTY_WORD)[s]}</li>
            ))}
          </ul>
          {duties.rows.map((d) => <Duty key={d.title} duty={d} own={board.view !== 'TEAM'} />)}
        </>
      ) : <p className="p2db-note">No duty fell due in this period.</p>}
      {duties.planned.map((p) => (
        <div key={p.title} className="p2db-duty p2db-duty--planned"><strong>{p.title}</strong><span className="p2db-tag">Not set up yet</span></div>
      ))}
    </>
  );
}

// ---------------------------------------------------------------- quality, channels, peers

function Quality({ board }: { board: Board }) {
  const q = board.quality!;
  if (!q.pagesUploaded) return <p className="p2db-note">Nothing was uploaded in this period.</p>;
  const max = Math.max(1, ...q.reasons.map((r) => r.value));
  return (
    <>
      <p className="p2db-headline">
        <strong className={q.rightFirstTime != null && q.rightFirstTime < 90 ? 'p2db-cell--warn' : undefined}>{q.rightFirstTime ?? '—'}%</strong>
        <span>of pages right first time<br />{count(q.rejected)} of {count(q.pagesUploaded)} rejected on image quality</span>
      </p>
      <ul className="p2db-bars">
        {q.reasons.map((r) => (
          <li key={r.key}><span>{r.label}</span><span className="p2db-bars__track"><span style={{ width: `${(r.value / max) * 100}%` }} /></span><b>{count(r.value)}</b></li>
        ))}
      </ul>
      <dl className="p2db-facts p2db-facts--three">
        <div className={q.toReupload ? 'is-bad' : undefined}><dt>Failed, to upload again (now)</dt><dd>{count(q.toReupload ?? 0)}</dd></div>
        <div><dt>Duplicate pages, not read again</dt><dd>{count(q.duplicatePages)}</dd></div>
        <div><dt>Duplicate files removed</dt><dd>{count(q.duplicateFiles)}</dd></div>
      </dl>
    </>
  );
}

const CHANNELS: Array<{ key: 'direct' | 'bulk' | 'drive'; label: string }> = [
  { key: 'direct', label: 'Direct (app or web)' }, { key: 'bulk', label: 'Bulk upload' }, { key: 'drive', label: 'Google Drive' },
];

function Channels({ board }: { board: Board }) {
  const ch = board.channels!;
  const total = ch.direct + ch.bulk + ch.drive;
  if (!total) return <p className="p2db-note">Nothing was uploaded in this period.</p>;
  return (
    <>
      <div className="p2db-share" role="img" aria-label={CHANNELS.map((c) => `${c.label} ${ch[c.key]}`).join(', ')}>
        {CHANNELS.map((c, i) => (ch[c.key] ? <span key={c.key} style={{ flexGrow: ch[c.key], background: SERIES[i] }} title={`${c.label}: ${ch[c.key]}`} /> : null))}
      </div>
      <ul className="p2db-channels">
        {CHANNELS.map((c, i) => (
          <li key={c.key}><i style={{ background: SERIES[i] }} /><span>{c.label}</span><b>{count(ch[c.key])}</b><em>{Math.round((ch[c.key] / total) * 100)}%</em></li>
        ))}
      </ul>
      <p className="p2db-note">{count(total)} files in the period.</p>
    </>
  );
}

function Peers({ board }: { board: Board }) {
  const peers = board.peers!;
  return (
    <>
      <ul className="p2db-peers">
        {peers.rows.map((r) => {
          const max = Math.max(r.me ?? 0, r.peers, 0.1);
          return (
            <li key={r.key}>
              <span className="p2db-peers__label">{r.label}{r.key === 'pagesRejected' ? ' (fewer is better)' : ''}</span>
              <span className="p2db-peers__bar"><em>Me</em><span className="p2db-bars__track"><span style={{ width: `${((r.me ?? 0) / max) * 100}%` }} /></span><b>{count(r.me ?? 0)}</b></span>
              <span className="p2db-peers__bar is-peers"><em>Peers</em><span className="p2db-bars__track"><span style={{ width: `${(r.peers / max) * 100}%` }} /></span><b>{count(r.peers)}</b></span>
            </li>
          );
        })}
      </ul>
      <p className="p2db-note">Average a working day in the period, against the middle of {peers.people} people in the same role. Nobody is named.</p>
    </>
  );
}

// ---------------------------------------------------------------- the dashboard

/**
 * One tab of the dashboard of the reader's role (product owner 2026-11-13). A PC and a Reviewer
 * read their own work: what they did, what waits for them and for how long, how they upload and
 * what failed, their tasks and their duties day by day, and where they stand against unnamed
 * peers. A TL, PM or Executive reads the team: done, what needs attention, pending by age, a
 * scorecard of each person, outlet and dealership, uploads by channel with failures and
 * duplicates, tasks and duties. The server sends only the blocks a SuperAdmin has left on for the
 * role; a panel fills the room a hidden one leaves. At most one chart canvas on a tab.
 */
export default function Dashboard({ board, view, periods, asOf }: { board: Board; view: View; periods: Period[]; asOf: string }) {
  const option = useMemo(() => (view === 'overview' && board.trend ? trendOption(board.trend.series, periods) : null), [view, board.trend, periods]);
  const own = board.view !== 'TEAM';
  const mine = board.view === 'REVIEWER' ? ' at my outlets' : '';
  const stepped = periods.length && periods[0].indexes.length > 1 ? 'week by week' : 'day by day';
  let body: ReactNode = null;
  if (view === 'overview') {
    body = (
      <>
        {board.kpis?.tiles.length ? <Tiles board={board} /> : null}
        {board.trend || board.attention || board.peers ? (
          <div className="p2db-row">
            {board.trend ? (
              <Panel title={board.trend.title} grow={8} about={`${board.period}, ${stepped}.`}>
                <Chart option={option} height={300} label={board.trend.title} empty="Nothing was done in this period." />
              </Panel>
            ) : null}
            {board.attention ? <Panel title="Needs attention" grow={5} about="The outlets and people to speak to first."><Attention board={board} /></Panel> : null}
            {board.peers ? <Panel title={board.peers.title} grow={4}><Peers board={board} /></Panel> : null}
          </div>
        ) : null}
      </>
    );
  } else if (view === 'pending' && board.pending) {
    body = (
      <div className="p2db-row">
        <Panel title={board.pending.title} about="Whatever the dates above: what is waiting right now, and how long it has waited."><Pending board={board} /></Panel>
      </div>
    );
  } else if (view === 'team' && board.scorecards?.length) {
    body = <div className="p2db-row"><Scorecards board={board} /></div>;
  } else if (view === 'uploads') {
    body = (
      <div className="p2db-row">
        {board.channels ? <Panel title={board.view === 'PC' ? 'How I upload' : `How files come in${mine}`} grow={5} about={board.period}><Channels board={board} /></Panel> : null}
        {board.quality ? <Panel title={`Failures and duplicates${mine}`} grow={7} about={`Of the files uploaded ${board.period}.`}><Quality board={board} /></Panel> : null}
      </div>
    );
  } else if (view === 'tasks' && board.tasks) {
    body = <div className="p2db-row"><Panel title={own ? 'My tasks' : 'Tasks'} about={`${board.period}, ${stepped}.`}><Tasks board={board} periods={periods} /></Panel></div>;
  } else if (view === 'duties' && board.duties) {
    body = (
      <div className="p2db-row">
        <Panel title={own ? 'My duties' : 'Daily and weekly duties'} about={`${board.period}. One box a day.`}><Duties board={board} /></Panel>
      </div>
    );
  }
  return (
    <div className="p2db">
      <header className="p2db-head">
        <h2>{board.title}</h2>
        <p>{board.period} · figures as of {new Date(asOf).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</p>
      </header>
      {body}
    </div>
  );
}
