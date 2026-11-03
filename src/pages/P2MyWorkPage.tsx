import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import '../styles/uc03-p2.css';
import '../styles/uc03-p2-workspace.css';
import '../styles/uc03-p2-my-work.css';

import PageHeader from '../components/PageHeader';
import SectionCard from '../components/SectionCard';
import { P2_HOME_PATH } from '../features/uc03-p2/newBookingPath';
import {
  getMyWork,
  periodRange,
  type GateRegisterDay,
  type MyWorkPeriod,
  type PcFigures,
  type PcOutlet,
  type ReviewerFigures,
  type ReviewerOutlet,
} from '../services/audit-core/uc03MyWork';
import { useProjectContextStore } from '../store/projectContextStore';
import { useSessionStore } from '../store/sessionStore';

const PERIODS: Array<{ key: MyWorkPeriod; label: string }> = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'week', label: 'This week' },
  { key: 'lastWeek', label: 'Last week' },
];

const STATUS: Record<GateRegisterDay['status'], { label: string; tone: 'ok' | 'warn' | 'bad' | 'open' }> = {
  DONE: { label: 'Uploaded', tone: 'ok' },
  ANSWER_PENDING: { label: 'Answer pending', tone: 'warn' },
  COUNTS_PENDING: { label: 'Counts pending', tone: 'warn' },
  NOT_UPLOADED: { label: 'Not uploaded', tone: 'open' },
  MISSED: { label: 'Missed', tone: 'bad' },
};

function Tile({ label, value, hint, tone }: { label: string; value: number | string; hint?: string; tone?: 'warn' | 'bad' }) {
  return (
    <div className={`p2mw-tile${tone ? ` p2mw-tile--${tone}` : ''}`}>
      <span className="p2mw-tile__label">{label}</span>
      <strong className="p2mw-tile__value">{value}</strong>
      {hint ? <span className="p2mw-tile__hint">{hint}</span> : null}
    </div>
  );
}

function Segment<T extends string>({ label, value, options, onChange }: {
  label: string; value: T; options: Array<{ key: T; label: string }>; onChange: (next: T) => void;
}) {
  return (
    <div className="p2w-segment" role="tablist" aria-label={label}>
      {options.map((option) => (
        <button key={option.key} type="button" role="tab" aria-selected={value === option.key}
          className={value === option.key ? 'is-active' : ''} onClick={() => onChange(option.key)}>
          {option.label}
        </button>
      ))}
    </div>
  );
}

function registerUploaded(outlet: PcOutlet): string {
  if (!outlet.gateRegisterDays) return '—';
  if (outlet.gateRegisterDays === 1) return outlet.gateRegisterUploaded ? 'Yes' : 'No';
  return `${outlet.gateRegisterUploaded} of ${outlet.gateRegisterDays} days`;
}

/** The PC's gate register, outlet by outlet: each day's status and the numbers behind it. */
function GateRegisterCard({ outlets }: { outlets: PcOutlet[] }) {
  const owing = outlets.flatMap((o) => o.gateRegister.filter((d) => d.status !== 'DONE').map((d) => ({ o, d })));
  return (
    <SectionCard>
      <div className="p2w-card__title">
        <h3>Gate register</h3>
        <p className="p2w-muted">
          Pending with you = intimated to you − uploaded in the tool. A delivery counts when its vehicle gate pass, dated that day,
          is on the journey.
        </p>
      </div>
      {owing.length ? (
        <div className="p2w-alert" role="status">
          {owing.length === 1
            ? `Gate register not finished: ${owing[0].o.outletName}, ${owing[0].d.label}.`
            : `${owing.length} gate registers not finished.`}
          {' '}<Link to="/p2/gate-pass">Upload gate register</Link>
        </div>
      ) : null}
      <div className="p2mw-register">
        {outlets.map((outlet) => (
          <div key={outlet.outletId} className="p2mw-register__outlet">
            <div className="p2mw-register__head">
              <strong>{outlet.outletName}</strong>
              <span className="p2w-muted">{outlet.classification === 'SATELLITE' ? 'Satellite' : 'Onsite'}</span>
            </div>
            {outlet.gateRegister.length === 0 ? <p className="p2w-muted">No gate register day in this period (Sunday is off).</p> : (
              <div style={{ overflowX: 'auto' }}>
                <table className="p2w-table p2mw-table">
                  <thead>
                    <tr>
                      <th>Day</th><th>Status</th><th>Total</th><th>Intimated</th><th>Uploaded</th>
                      <th>Pending with you</th><th>Not intimated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {outlet.gateRegister.map((day) => {
                      const status = STATUS[day.status];
                      return (
                        <tr key={day.date}>
                          <td>{day.label}</td>
                          <td><span className={`p2mw-chip p2mw-chip--${status.tone}`}>{status.label}</span></td>
                          <td>{day.total ?? '—'}</td>
                          <td>{day.intimated ?? '—'}</td>
                          <td>{day.uploadedInTool}</td>
                          <td className={day.pendingWithPc ? 'p2mw-attn' : undefined}>{day.pendingWithPc ?? '—'}</td>
                          <td>{day.notIntimated ?? '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

function PcHome({ outlets, totals }: { outlets: PcOutlet[]; totals: PcFigures }) {
  return (
    <>
      <div className="p2mw-tiles">
        <Tile label="Journeys uploaded" value={totals.journeysUploaded} hint={`${totals.journeysTotal} in total, all time`} />
        <Tile label="Bookings uploaded" value={totals.bookingsUploaded} />
        <Tile label="Deliveries updated" value={totals.deliveriesUpdated} />
        <Tile label="Gate register" value={`${totals.gateRegisterUploaded}/${totals.gateRegisterDays}`}
          hint="registers uploaded" tone={totals.gateRegisterMissed ? 'bad' : totals.gateRegisterUploaded < totals.gateRegisterDays ? 'warn' : undefined} />
        <Tile label="Delivery files pending" value={totals.pendingDeliveryFiles} tone={totals.pendingDeliveryFiles ? 'warn' : undefined} />
        <Tile label="Tasks open" value={totals.tasksPending} hint={`${totals.tasksWorked} worked in this period`}
          tone={totals.tasksPending ? 'warn' : undefined} />
      </div>
      <div className="p2mw-actions">
        <Link className="p2w-button p2w-button--primary" to="/p2/gate-pass">Upload gate register</Link>
        <Link className="p2w-button p2w-button--secondary" to="/p2/tasks">Open Task Queue</Link>
        <Link className="p2w-button p2w-button--secondary" to={P2_HOME_PATH}>Bookings &amp; Deliveries</Link>
      </div>
      {outlets.length > 1 ? (
        <SectionCard>
          <div className="p2w-card__title"><h3>By outlet</h3></div>
          <PcTracker outlets={outlets} totals={totals} compact />
        </SectionCard>
      ) : null}
      <GateRegisterCard outlets={outlets} />
    </>
  );
}

function PcTracker({ outlets, totals, compact = false }: { outlets: PcOutlet[]; totals: PcFigures; compact?: boolean }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="p2w-table p2mw-table">
        <thead>
          <tr>
            <th>Outlet</th>
            {compact ? null : <th>Journeys (all time)</th>}
            <th>Bookings uploaded</th>
            <th>Deliveries updated</th>
            <th>Gate register uploaded</th>
            <th>Pending delivery files</th>
            <th>Tasks worked</th>
            <th>Tasks pending</th>
          </tr>
        </thead>
        <tbody>
          {outlets.map((o) => (
            <tr key={o.outletId}>
              <td>{o.outletName}{o.classification === 'SATELLITE' ? <span className="p2w-muted"> · Satellite</span> : null}</td>
              {compact ? null : <td>{o.journeysTotal}</td>}
              <td>{o.bookingsUploaded}</td>
              <td>{o.deliveriesUpdated}</td>
              <td className={o.gateRegisterUploaded < o.gateRegisterDays ? 'p2mw-attn' : undefined}>{registerUploaded(o)}</td>
              <td className={o.pendingDeliveryFiles ? 'p2mw-attn' : undefined}>{o.pendingDeliveryFiles}</td>
              <td>{o.tasksWorked}</td>
              <td className={o.tasksPending ? 'p2mw-attn' : undefined}>{o.tasksPending}</td>
            </tr>
          ))}
        </tbody>
        {outlets.length > 1 ? (
          <tfoot>
            <tr>
              <th>Total</th>
              {compact ? null : <th>{totals.journeysTotal}</th>}
              <th>{totals.bookingsUploaded}</th>
              <th>{totals.deliveriesUpdated}</th>
              <th>{totals.gateRegisterUploaded} of {totals.gateRegisterDays}</th>
              <th>{totals.pendingDeliveryFiles}</th>
              <th>{totals.tasksWorked}</th>
              <th>{totals.tasksPending}</th>
            </tr>
          </tfoot>
        ) : null}
      </table>
    </div>
  );
}

function ReviewerTracker({ outlets, totals }: { outlets: ReviewerOutlet[]; totals: ReviewerFigures }) {
  return (
    <>
      <div className="p2mw-tiles">
        <Tile label="Journeys worked" value={totals.journeysWorked} />
        <Tile label="Reviews closed" value={totals.reviewsClosed} hint="Booking and Delivery reviewed marks" />
        <Tile label="Tasks closed" value={totals.tasksClosed} hint={`${totals.tasksWorked} worked`} />
        <Tile label="Tasks pending" value={totals.tasksPending} hint="Yours and the Team Lead's, for your outlets"
          tone={totals.tasksPending ? 'warn' : undefined} />
      </div>
      <div className="p2mw-actions">
        <Link className="p2w-button p2w-button--primary" to="/p2/tasks">Open Task Queue</Link>
        <Link className="p2w-button p2w-button--secondary" to="/p2/review">Document Review</Link>
      </div>
      <SectionCard>
        <div className="p2w-card__title"><h3>By outlet</h3></div>
        <div style={{ overflowX: 'auto' }}>
          <table className="p2w-table p2mw-table">
            <thead>
              <tr>
                <th>Outlet</th><th>Dealership</th><th>Journeys worked</th><th>Reviews closed</th>
                <th>Tasks closed</th><th>Tasks pending</th>
              </tr>
            </thead>
            <tbody>
              {outlets.map((o) => (
                <tr key={o.outletId}>
                  <td>{o.outletName}</td>
                  <td>{o.dealerName}</td>
                  <td>{o.journeysWorked}</td>
                  <td>{o.reviewsClosed}</td>
                  <td>{o.tasksClosed}</td>
                  <td className={o.tasksPending ? 'p2mw-attn' : undefined}>{o.tasksPending}</td>
                </tr>
              ))}
            </tbody>
            {outlets.length > 1 ? (
              <tfoot>
                <tr>
                  <th colSpan={2}>Total</th>
                  <th>{totals.journeysWorked}</th><th>{totals.reviewsClosed}</th>
                  <th>{totals.tasksClosed}</th><th>{totals.tasksPending}</th>
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>
      </SectionCard>
    </>
  );
}

/**
 * PC Home (the PC's landing page) and the Tracker tab, for PCs and Reviewers (product owner 2026-11-02).
 * A PC sees the journeys they uploaded, the gate register of every outlet they are mapped to
 * (satellites included) and their tasks, for today, this week or last week; the Tracker tab puts the
 * same per outlet in one table. A Reviewer sees their own tracker: journeys worked, reviews closed,
 * tasks closed and pending.
 */
export default function P2MyWorkPage() {
  const project = useProjectContextStore((s) => s.selectedProject);
  const accessToken = useSessionStore((s) => s.accessToken);
  const tenantId = project?.tenantId;
  const role = project?.operatingRole;
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get('tab') === 'tracker' || role === 'REVIEWER' ? 'tracker' : 'home';
  const [period, setPeriod] = useState<MyWorkPeriod>('today');
  const range = periodRange(period);

  const query = useQuery({
    queryKey: ['p2-my-work', tenantId, range.from, range.to],
    queryFn: () => getMyWork(tenantId!, range, accessToken ?? undefined),
    enabled: Boolean(tenantId && accessToken && (role === 'PC' || role === 'REVIEWER')),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

  const data = query.data;
  return (
    <div className="screen-stack p2-screen p2w p2mw">
      <PageHeader
        eyebrow="DealGuard"
        title={role === 'REVIEWER' ? 'My tracker' : 'Home'}
        description={role === 'REVIEWER'
          ? 'Journeys you worked, reviews you closed, and tasks closed and pending, outlet by outlet.'
          : 'Your journeys, gate register and tasks across the outlets you are mapped to.'}
      />
      <div className="p2mw-controls">
        {role === 'PC' ? (
          <Segment label="View" value={tab} options={[{ key: 'home', label: 'Home' }, { key: 'tracker', label: 'Tracker' }]}
            onChange={(next) => setSearchParams(next === 'tracker' ? { tab: 'tracker' } : {}, { replace: true })} />
        ) : null}
        <Segment label="Period" value={period} options={PERIODS} onChange={setPeriod} />
        <span className="p2w-muted">{range.from === range.to ? range.from : `${range.from} to ${range.to}`}</span>
      </div>

      {role !== 'PC' && role !== 'REVIEWER' ? (
        <SectionCard><p className="p2w-muted">This page is for a PC or a Reviewer.</p></SectionCard>
      ) : null}
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
        tab === 'tracker'
          ? <SectionCard><div className="p2w-card__title"><h3>Tracker</h3></div><PcTracker outlets={data.outlets} totals={data.totals} /></SectionCard>
          : <PcHome outlets={data.outlets} totals={data.totals} />
      ) : null}
      {data?.role === 'REVIEWER' && data.outlets.length ? <ReviewerTracker outlets={data.outlets} totals={data.totals} /> : null}
    </div>
  );
}
