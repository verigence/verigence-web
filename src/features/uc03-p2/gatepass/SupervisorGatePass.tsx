import { useState } from 'react';

import DailyTasksList from './DailyTasksList';
import GatePassCalendar from './GatePassCalendar';
import GatePassSummary from './GatePassSummary';

/**
 * The Daily gate pass of a Team Lead, PM or Executive: the Team Lead's daily tasks, the
 * consolidated view across every outlet (satellites included) and the calendar with each
 * outlet's registers. Shown as the Project Tracker's "Daily gate pass" tab (product owner
 * 2026-11-09: one place); each part keeps its own date and month controls.
 */
export default function SupervisorGatePass({ tenantId, accessToken }: { tenantId: string; accessToken: string }) {
  const [refreshKey, setRefreshKey] = useState(0);
  const refresh = () => setRefreshKey((k) => k + 1);
  return (
    <div className="screen-stack p2gp">
      <DailyTasksList tenantId={tenantId} accessToken={accessToken} onChanged={refresh} />
      <GatePassSummary tenantId={tenantId} accessToken={accessToken} refreshKey={refreshKey} />
      <GatePassCalendar tenantId={tenantId} accessToken={accessToken} refreshKey={refreshKey} />
    </div>
  );
}
