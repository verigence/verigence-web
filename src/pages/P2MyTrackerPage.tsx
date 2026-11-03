import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import '../styles/uc03-p2.css';
import '../styles/uc03-p2-workspace.css';
import '../styles/uc03-p2-my-work.css';

import PageHeader from '../components/PageHeader';
import SectionCard from '../components/SectionCard';
import MissingDocumentsPanel from '../features/uc03-p2/missing/MissingDocumentsPanel';
import { GateRegisterTable, PERIODS, PcTracker, STATUS, Segment, Tile } from '../features/uc03-p2/my-work/MyWorkParts';
import {
  getMyWork,
  istDate,
  MAX_RANGE_DAYS,
  periodRange,
  rangeDays,
  type GateRegisterDay,
  type MyWorkGrouping,
  type MyWorkPeriod,
  type PcFigures,
  type PcRow,
  type PcRowFigures,
  type ReviewerFigures,
  type ReviewerOutlet,
  type ReviewerRow,
  type ReviewerRowFigures,
} from '../services/audit-core/uc03MyWork';
import { useProjectContextStore } from '../store/projectContextStore';
import { useSessionStore } from '../store/sessionStore';

type Preset = MyWorkPeriod | 'day' | 'custom';
type Tab = 'updates' | 'register' | 'missing';

const PRESETS: Array<{ key: Preset; label: string }> = [
  ...PERIODS, { key: 'day', label: 'A day' }, { key: 'custom', label: 'Date range' },
];
const GROUPINGS: Array<{ key: MyWorkGrouping; label: string }> = [
  { key: 'day', label: 'Daily' },
  { key: 'week', label: 'Weekly' },
  { key: 'month', label: 'Monthly' },
];
const TABS: Array<{ key: Tab; label: string }> = [
  { key: 'updates', label: 'Daily updates' },
  { key: 'register', label: 'Gate register' },
  { key: 'missing', label: 'Missing documents' },
];

function registerSummary(figures: PcRowFigures, entry: GateRegisterDay | null) {
  if (entry) {
    const status = STATUS[entry.status];
    return (
      <>
        <span className={`p2mw-chip p2mw-chip--${status.tone}`}>{entry.status === 'DONE' ? 'Yes' : status.label}</span>
        {entry.total != null ? (
          <span className="p2w-muted p2mw-sub">{entry.total} total · {entry.intimated ?? 0} intimated · {entry.uploadedInTool} in tool</span>
        ) : null}
      </>
    );
  }
  if (!figures.gateRegisterDays) return <span className="p2w-muted">—</span>;
  const short = figures.gateRegisterUploaded < figures.gateRegisterDays;
  return (
    <>
      <span className={short ? 'p2mw-attn' : undefined}>{figures.gateRegisterUploaded} of {figures.gateRegisterDays}</span>
      <span className="p2w-muted p2mw-sub">
        {figures.registerTotal} total · {figures.registerIntimated} intimated · {figures.uploadedInTool} in tool
      </span>
    </>
  );
}

function PcRowCells({ figures, entry }: { figures: PcRowFigures; entry: GateRegisterDay | null }) {
  return (
    <>
      <td>{figures.journeysUploaded}</td>
      <td>{figures.bookingsUploaded}</td>
      <td>{figures.deliveriesUpdated}</td>
      <td>{figures.journeysCompleted}</td>
      <td>{registerSummary(figures, entry)}</td>
      <td className={figures.pendingDeliveryFiles ? 'p2mw-attn' : undefined}>{figures.pendingDeliveryFiles}</td>
      <td>{figures.tasksWorked}</td>
      <td>{figures.tasksClosed}</td>
    </>
  );
}

/** Date wise across all the PC's outlets (product owner 2026-11-03), a row per day, week or month. */
function PcDateTable({ rows, totals, showOutlets }: { rows: PcRow[]; totals: PcFigures; showOutlets: boolean }) {
  const single = (rows[0]?.outlets.length ?? 0) === 1;
  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="p2w-table p2mw-table" aria-label="Date wise">
        <thead>
          <tr>
            <th>Date</th><th>Journeys uploaded</th><th>Bookings</th><th>Deliveries</th><th>Journeys completed</th>
            <th>Gate register</th><th>Pending delivery files</th><th>Tasks worked</th><th>Tasks closed</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => [
            <tr key={row.from} className="p2mw-day-first">
              <td><strong>{row.label}</strong></td>
              <PcRowCells figures={row.totals} entry={single ? row.outlets[0].gateRegister : null} />
            </tr>,
            ...(showOutlets && !single ? row.outlets.map((o) => (
              <tr key={`${row.from}-${o.outletId}`} className="p2mw-outlet-row">
                <td>{o.outletName}{o.classification === 'SATELLITE' ? <span className="p2w-muted"> · Satellite</span> : null}</td>
                <PcRowCells figures={o} entry={o.gateRegister} />
              </tr>
            )) : []),
          ])}
        </tbody>
        <tfoot>
          <tr>
            <th>Total</th>
            <th>{totals.journeysUploaded}</th><th>{totals.bookingsUploaded}</th><th>{totals.deliveriesUpdated}</th>
            <th>{totals.journeysCompleted}</th>
            <th>{totals.gateRegisterUploaded} of {totals.gateRegisterDays}</th>
            <th>{totals.pendingDeliveryFiles}</th><th>{totals.tasksWorked}</th><th>{totals.tasksClosed}</th>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function ReviewerCells({ figures }: { figures: ReviewerRowFigures }) {
  return (
    <>
      <td>{figures.journeysWorked}</td><td>{figures.reviewsClosed}</td><td>{figures.corrections}</td>
      <td>{figures.tasksWorked}</td><td>{figures.tasksClosed}</td>
    </>
  );
}

function ReviewerDateTable({ rows, totals, showOutlets }: { rows: ReviewerRow[]; totals: ReviewerFigures; showOutlets: boolean }) {
  const single = (rows[0]?.outlets.length ?? 0) === 1;
  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="p2w-table p2mw-table" aria-label="Date wise">
        <thead>
          <tr><th>Date</th><th>Journeys worked</th><th>Reviews closed</th><th>Corrections</th><th>Tasks worked</th><th>Tasks closed</th></tr>
        </thead>
        <tbody>
          {rows.map((row) => [
            <tr key={row.from} className="p2mw-day-first">
              <td><strong>{row.label}</strong></td>
              <ReviewerCells figures={row.totals} />
            </tr>,
            ...(showOutlets && !single
              ? row.outlets.filter((o) => o.journeysWorked || o.reviewsClosed || o.tasksWorked).map((o) => (
                <tr key={`${row.from}-${o.outletId}`} className="p2mw-outlet-row">
                  <td>{o.outletName}</td>
                  <ReviewerCells figures={o} />
                </tr>
              )) : []),
          ])}
        </tbody>
        <tfoot>
          <tr>
            <th>Total</th><th>{totals.journeysWorked}</th><th>{totals.reviewsClosed}</th><th>{totals.corrections}</th>
            <th>{totals.tasksWorked}</th><th>{totals.tasksClosed}</th>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function ReviewerOutletTable({ outlets, totals }: { outlets: ReviewerOutlet[]; totals: ReviewerFigures }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="p2w-table p2mw-table">
        <thead>
          <tr><th>Outlet</th><th>Dealership</th><th>Journeys worked</th><th>Reviews closed</th><th>Tasks closed</th><th>Tasks pending</th></tr>
        </thead>
        <tbody>
          {outlets.map((o) => (
            <tr key={o.outletId}>
              <td>{o.outletName}</td><td>{o.dealerName}</td><td>{o.journeysWorked}</td><td>{o.reviewsClosed}</td>
              <td>{o.tasksClosed}</td>
              <td className={o.tasksPending ? 'p2mw-attn' : undefined}>{o.tasksPending}</td>
            </tr>
          ))}
        </tbody>
        {outlets.length > 1 ? (
          <tfoot>
            <tr>
              <th colSpan={2}>Total</th><th>{totals.journeysWorked}</th><th>{totals.reviewsClosed}</th>
              <th>{totals.tasksClosed}</th><th>{totals.tasksPending}</th>
            </tr>
          </tfoot>
        ) : null}
      </table>
    </div>
  );
}

/**
 * My Tracker (product owner 2026-11-03), its own menu entry for a PC and a Reviewer.
 * Daily updates: date wise across all the outlets they are mapped to, daily, weekly or monthly,
 * for a preset period or a range of dates (up to 92 days), then the same by outlet.
 * Gate register (PC): date wise across their outlets for a day, a past day or a range; the uploaded
 * register opens on click.
 * Missing documents: the delivery files of their outlets still missing documents -- the count of
 * each document type, the files closest to completion (top 20 for a day, 30 for longer), and the
 * list day by day.
 */
export default function P2MyTrackerPage() {
  const project = useProjectContextStore((s) => s.selectedProject);
  const accessToken = useSessionStore((s) => s.accessToken);
  const tenantId = project?.tenantId;
  const role = project?.operatingRole;
  const [searchParams, setSearchParams] = useSearchParams();
  const asked = searchParams.get('tab');
  // A Reviewer has no gate register of their own.
  const tab: Tab = asked === 'missing' ? 'missing' : asked === 'register' && role === 'PC' ? 'register' : 'updates';
  const [preset, setPreset] = useState<Preset>('week');
  const today = istDate();
  const [custom, setCustom] = useState(() => periodRange('month'));
  const [oneDay, setOneDay] = useState(() => periodRange('yesterday').from);
  const [grouping, setGrouping] = useState<MyWorkGrouping>('day');
  const [showOutlets, setShowOutlets] = useState(false);

  const range = preset === 'custom' ? custom : preset === 'day' ? { from: oneDay, to: oneDay } : periodRange(preset);
  const days = rangeDays(range);
  const rangeError = range.from > range.to ? 'The start date is after the end date.'
    : days > MAX_RANGE_DAYS ? `Choose up to ${MAX_RANGE_DAYS} days.` : null;
  const by: MyWorkGrouping = days === 1 ? 'day' : grouping;

  const query = useQuery({
    queryKey: ['p2-my-work', tenantId, range.from, range.to, by],
    queryFn: () => getMyWork(tenantId!, range, accessToken ?? undefined, by),
    enabled: Boolean(tenantId && accessToken && (role === 'PC' || role === 'REVIEWER') && tab !== 'missing' && !rangeError),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
  const data = query.data;
  const severalOutlets = (data?.outlets.length ?? 0) > 1;

  return (
    <div className="screen-stack p2-screen p2w p2mw">
      <PageHeader
        eyebrow="DealGuard"
        title="My Tracker"
        description={role === 'REVIEWER'
          ? 'Journeys you worked, reviews you closed and tasks, date by date across your outlets.'
          : 'Your work date by date across all the outlets you are mapped to, and the delivery files still missing documents.'}
      />
      <Segment label="My Tracker" value={tab} options={role === 'PC' ? TABS : TABS.filter((t) => t.key !== 'register')}
        onChange={(next) => setSearchParams(next === 'updates' ? {} : { tab: next }, { replace: true })} />
      <div className="p2mw-controls">
        <Segment label="Period" value={preset} options={PRESETS} onChange={setPreset} />
        {preset === 'day' ? (
          <span className="p2mw-range">
            <label>Day <input type="date" value={oneDay} max={today}
              onChange={(e) => e.target.value && setOneDay(e.target.value)} /></label>
          </span>
        ) : preset === 'custom' ? (
          <span className="p2mw-range">
            <label>From <input type="date" value={custom.from} max={today}
              onChange={(e) => e.target.value && setCustom((c) => ({ ...c, from: e.target.value }))} /></label>
            <label>To <input type="date" value={custom.to} max={today}
              onChange={(e) => e.target.value && setCustom((c) => ({ ...c, to: e.target.value }))} /></label>
          </span>
        ) : (
          <span className="p2w-muted">{range.from === range.to ? range.from : `${range.from} to ${range.to}`}</span>
        )}
        {tab === 'updates' && days > 1 ? <Segment label="View" value={grouping} options={GROUPINGS} onChange={setGrouping} /> : null}
      </div>
      {rangeError ? <div className="p2w-alert p2w-alert--error" role="alert">{rangeError}</div> : null}

      {role !== 'PC' && role !== 'REVIEWER' ? (
        <SectionCard><p className="p2w-muted">My Tracker is for a PC or a Reviewer.</p></SectionCard>
      ) : null}

      {tab === 'missing' && tenantId && !rangeError ? (
        <SectionCard>
          <div className="p2w-card__title">
            <h3>Missing documents</h3>
            <p className="p2w-muted">Delivery files of your outlets with documents still missing, by delivery day.</p>
          </div>
          <MissingDocumentsPanel tenantId={tenantId} accessToken={accessToken ?? undefined} from={range.from} to={range.to}
            top={days === 1 ? 20 : 30} />
        </SectionCard>
      ) : null}

      {tab === 'register' && data?.role === 'PC' && tenantId ? (
        <SectionCard>
          <div className="p2w-card__title">
            <h3>Gate register</h3>
            <p className="p2w-muted">
              Date wise across your outlets, newest first. Pending with you = intimated to you − uploaded in the tool.
              Open an uploaded register with View.
            </p>
          </div>
          <GateRegisterTable outlets={data.outlets} tenantId={tenantId} accessToken={accessToken ?? undefined} />
          <div className="p2mw-actions">
            <Link className="p2w-button p2w-button--primary" to="/p2/gate-pass">Upload gate register</Link>
          </div>
        </SectionCard>
      ) : null}
      {tab === 'register' && query.isLoading ? <SectionCard><p className="p2w-muted">Loading…</p></SectionCard> : null}

      {tab === 'updates' ? (
        <>
          {query.isLoading ? <SectionCard><p className="p2w-muted">Counting…</p></SectionCard> : null}
          {query.isError ? (
            <SectionCard>
              <div className="p2w-alert p2w-alert--error" role="alert">
                Your figures could not be loaded. <button type="button" className="p2w-button p2w-button--ghost" onClick={() => query.refetch()}>Try again</button>
              </div>
            </SectionCard>
          ) : null}
          {data && data.outlets.length === 0 ? (
            <SectionCard><p className="p2w-muted">No outlet is mapped to you in this Project. Please ask your Team Lead.</p></SectionCard>
          ) : null}

          {data?.role === 'PC' && data.outlets.length ? (
            <>
              <div className="p2mw-tiles">
                <Tile label="Journeys uploaded" value={data.totals.journeysUploaded} hint={`${data.totals.bookingsUploaded} bookings · ${data.totals.deliveriesUpdated} deliveries`} />
                <Tile label="Journeys completed" value={data.totals.journeysCompleted} hint="delivery files closed" />
                <Tile label="Gate register" value={`${data.totals.gateRegisterUploaded}/${data.totals.gateRegisterDays}`} hint="registers uploaded"
                  tone={data.totals.gateRegisterMissed ? 'bad' : data.totals.gateRegisterUploaded < data.totals.gateRegisterDays ? 'warn' : undefined} />
                <Tile label="Delivery files pending" value={data.totals.pendingDeliveryFiles} tone={data.totals.pendingDeliveryFiles ? 'warn' : undefined} />
                <Tile label="Tasks closed" value={data.totals.tasksClosed} hint={`${data.totals.tasksWorked} worked`} />
                <Tile label="Tasks open now" value={data.totals.tasksPending} tone={data.totals.tasksPending ? 'warn' : undefined} />
              </div>
              <SectionCard>
                <div className="p2w-card__title p2mw-title-row">
                  <h3>Date wise</h3>
                  {severalOutlets ? (
                    <label className="p2mw-toggle">
                      <input type="checkbox" checked={showOutlets} onChange={(e) => setShowOutlets(e.target.checked)} /> Show each outlet
                    </label>
                  ) : null}
                </div>
                <PcDateTable rows={data.periods ?? []} totals={data.totals} showOutlets={showOutlets} />
              </SectionCard>
              <SectionCard>
                <div className="p2w-card__title"><h3>By outlet</h3><p className="p2w-muted">The whole period. Tasks pending is what is open now.</p></div>
                <PcTracker outlets={data.outlets} totals={data.totals} />
              </SectionCard>
              <div className="p2mw-actions">
                <Link className="p2w-button p2w-button--secondary" to="/p2/tracker?tab=missing">Missing documents</Link>
                <Link className="p2w-button p2w-button--secondary" to="/p2/tasks">Open Task Queue</Link>
              </div>
            </>
          ) : null}

          {data?.role === 'REVIEWER' && data.outlets.length ? (
            <>
              <div className="p2mw-tiles">
                <Tile label="Journeys worked" value={data.totals.journeysWorked} />
                <Tile label="Reviews closed" value={data.totals.reviewsClosed} hint="Booking and Delivery reviewed marks" />
                <Tile label="Tasks closed" value={data.totals.tasksClosed} hint={`${data.totals.tasksWorked} worked`} />
                <Tile label="Tasks pending" value={data.totals.tasksPending} hint="Yours and the Team Lead's, for your outlets"
                  tone={data.totals.tasksPending ? 'warn' : undefined} />
              </div>
              <SectionCard>
                <div className="p2w-card__title p2mw-title-row">
                  <h3>Date wise</h3>
                  {severalOutlets ? (
                    <label className="p2mw-toggle">
                      <input type="checkbox" checked={showOutlets} onChange={(e) => setShowOutlets(e.target.checked)} /> Show each outlet
                    </label>
                  ) : null}
                </div>
                <ReviewerDateTable rows={data.periods ?? []} totals={data.totals} showOutlets={showOutlets} />
              </SectionCard>
              <SectionCard>
                <div className="p2w-card__title"><h3>By outlet</h3></div>
                <ReviewerOutletTable outlets={data.outlets} totals={data.totals} />
              </SectionCard>
            </>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
