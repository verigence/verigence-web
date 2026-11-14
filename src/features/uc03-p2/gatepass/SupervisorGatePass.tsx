import { useState } from 'react';

import { Segment } from '../my-work/MyWorkParts';
import DailyTasksList from './DailyTasksList';
import GatePassCalendar from './GatePassCalendar';
import GatePassSummary from './GatePassSummary';

type View = 'outlets' | 'calendar';
const VIEWS: Array<{ key: View; label: string }> = [
  { key: 'outlets', label: 'Outlet-wise, day by day' },
  { key: 'calendar', label: 'Calendar' },
];

/**
 * The Gate Register of a Team Lead, PM or Executive (product owner 2026-11-14: "Deliveries and
 * delivery files is actually Gate Register"; "you removed daily status of outlet wise, it is
 * required, i asked you to merge not to remove duplicates entirely"). One tab, two ways to read
 * the same register, one at a time so no figure is shown twice:
 * - Outlet-wise, day by day (the default): each outlet over a date range -- register against
 *   the tool, not intimated, pending with the PC, stock transfers, gate passes done, who uploaded
 *   it, each day's status and its photos;
 * - Calendar: a month, day by day, for all outlets, a dealership or one outlet.
 * Then the tasks raised from the gate passes, to mark done.
 */
export default function SupervisorGatePass({ tenantId, accessToken }: { tenantId: string; accessToken: string }) {
  const [view, setView] = useState<View>('outlets');
  const [refreshKey, setRefreshKey] = useState(0);
  const refresh = () => setRefreshKey((k) => k + 1);
  return (
    <div className="screen-stack p2gp">
      <Segment label="Gate Register" value={view} options={VIEWS} onChange={setView} />
      {view === 'outlets'
        ? <GatePassSummary tenantId={tenantId} accessToken={accessToken} refreshKey={refreshKey} />
        : <GatePassCalendar tenantId={tenantId} accessToken={accessToken} refreshKey={refreshKey} />}
      <DailyTasksList tenantId={tenantId} accessToken={accessToken} onChanged={refresh} />
    </div>
  );
}
