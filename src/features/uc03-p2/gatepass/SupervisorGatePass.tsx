import { useState } from 'react';

import DailyTasksList from './DailyTasksList';
import GatePassCalendar from './GatePassCalendar';

/**
 * Deliveries and delivery files of a Team Lead, PM or Executive: the calendar of deliveries on the
 * gate register against delivery files uploaded (with each outlet's register photos), and the tasks
 * raised from the gate passes, to mark done. Shown as the Project Tracker's "Deliveries and delivery
 * files" tab (product owner 2026-11-09: one place; 2026-11-13: kept). The all-outlets table that sat
 * between them was dropped (2026-11-13: duplicate information): its register, in-tool, not-intimated
 * and pending figures are this calendar's and Performance's "Deliveries by outlet", and a missed or
 * late register is Performance's Duties.
 */
export default function SupervisorGatePass({ tenantId, accessToken }: { tenantId: string; accessToken: string }) {
  const [refreshKey, setRefreshKey] = useState(0);
  const refresh = () => setRefreshKey((k) => k + 1);
  return (
    <div className="screen-stack p2gp">
      <GatePassCalendar tenantId={tenantId} accessToken={accessToken} refreshKey={refreshKey} />
      <DailyTasksList tenantId={tenantId} accessToken={accessToken} onChanged={refresh} />
    </div>
  );
}
