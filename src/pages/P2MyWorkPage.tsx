import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import '../styles/uc03-p2.css';
import '../styles/uc03-p2-workspace.css';
import '../styles/uc03-p2-my-work.css';

import PageHeader from '../components/PageHeader';
import SectionCard from '../components/SectionCard';
import { GateRegisterTable, PERIODS, PcTracker, Segment, Tile } from '../features/uc03-p2/my-work/MyWorkParts';
import { P2_HOME_PATH } from '../features/uc03-p2/newBookingPath';
import {
  getMyWork,
  periodRange,
  type MyWorkPeriod,
  type PcFigures,
  type PcOutlet,
} from '../services/audit-core/uc03MyWork';
import { useProjectContextStore } from '../store/projectContextStore';
import { useSessionStore } from '../store/sessionStore';

/** The gate register, date wise across the PC's outlets (2026-11-03); the register opens on click. */
function GateRegisterCard({ outlets, tenantId, accessToken, pastLink = true }: {
  outlets: PcOutlet[]; tenantId: string; accessToken?: string; pastLink?: boolean;
}) {
  const owing = outlets.flatMap((o) => o.gateRegister.filter((d) => d.status !== 'DONE').map((d) => ({ o, d })));
  return (
    <SectionCard>
      <div className="p2w-card__title p2mw-title-row">
        <div>
          <h3>Gate register</h3>
          <p className="p2w-muted">
            Pending with you = intimated to you − uploaded in the tool. A delivery counts when its vehicle gate pass, dated that day,
            is on the journey.
          </p>
        </div>
        {pastLink ? <Link className="p2w-link" to="/p2/tracker?tab=register">Past days and date range</Link> : null}
      </div>
      {owing.length ? (
        <div className="p2w-alert" role="status">
          {owing.length === 1
            ? `Gate register not finished: ${owing[0].o.outletName}, ${owing[0].d.label}.`
            : `${owing.length} gate registers not finished.`}
          {' '}<Link to="/p2/gate-pass">Upload gate register</Link>
        </div>
      ) : null}
      <GateRegisterTable outlets={outlets} tenantId={tenantId} accessToken={accessToken} />
    </SectionCard>
  );
}

function PcHome({ outlets, totals, tenantId, accessToken }: {
  outlets: PcOutlet[]; totals: PcFigures; tenantId: string; accessToken?: string;
}) {
  return (
    <>
      <div className="p2mw-tiles">
        <Tile label="Journeys uploaded" value={totals.journeysUploaded} hint={`${totals.journeysTotal} in total, all time`} />
        <Tile label="Bookings uploaded" value={totals.bookingsUploaded} />
        <Tile label="Deliveries updated" value={totals.deliveriesUpdated} />
        <Tile label="Journeys completed" value={totals.journeysCompleted} hint="delivery files closed" />
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
      <GateRegisterCard outlets={outlets} tenantId={tenantId} accessToken={accessToken} />
    </>
  );
}

/**
 * PC Home, the PC's landing page (product owner 2026-11-02): the journeys they uploaded, the gate
 * register of every outlet they are mapped to (satellites included) and their tasks, for a day, a
 * week or a month. The date-wise view is My Tracker (/p2/tracker, 2026-11-03), its own menu entry.
 */
export default function P2MyWorkPage() {
  const project = useProjectContextStore((s) => s.selectedProject);
  const accessToken = useSessionStore((s) => s.accessToken);
  const tenantId = project?.tenantId;
  const role = project?.operatingRole;
  const [searchParams] = useSearchParams();
  const [period, setPeriod] = useState<MyWorkPeriod>('today');
  const range = periodRange(period);

  const query = useQuery({
    queryKey: ['p2-my-work', tenantId, range.from, range.to, 'day'],
    queryFn: () => getMyWork(tenantId!, range, accessToken ?? undefined),
    enabled: Boolean(tenantId && accessToken && role === 'PC'),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

  // The Tracker moved to My Tracker; a Reviewer's page is My Tracker.
  if (role === 'REVIEWER' || searchParams.get('tab') === 'tracker') return <Navigate to="/p2/tracker" replace />;

  const data = query.data;
  return (
    <div className="screen-stack p2-screen p2w p2mw">
      <PageHeader
        eyebrow="DealGuard"
        title="Home"
        description="Your journeys, gate register and tasks across the outlets you are mapped to."
      />
      <div className="p2mw-controls">
        <Segment label="Period" value={period} options={PERIODS} onChange={setPeriod} />
        <span className="p2w-muted">{range.from === range.to ? range.from : `${range.from} to ${range.to}`}</span>
        <Link className="p2w-link" to="/p2/tracker">My Tracker</Link>
      </div>

      {role !== 'PC' ? <SectionCard><p className="p2w-muted">PC Home is for a PC.</p></SectionCard> : null}
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
      {data?.role === 'PC' && data.outlets.length ? <PcHome outlets={data.outlets} totals={data.totals} tenantId={tenantId!} accessToken={accessToken ?? undefined} /> : null}
    </div>
  );
}
