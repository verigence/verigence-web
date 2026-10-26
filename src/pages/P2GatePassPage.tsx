import { useState } from 'react';
import '../styles/uc03-p2.css';
import '../styles/uc03-p2-workspace.css';
import '../styles/uc03-p2-gate-pass.css';

import PageHeader from '../components/PageHeader';
import DailyTasksList from '../features/uc03-p2/gatepass/DailyTasksList';
import GatePassCalendar from '../features/uc03-p2/gatepass/GatePassCalendar';
import GatePassWizard from '../features/uc03-p2/gatepass/GatePassWizard';
import { useProjectContextStore } from '../store/projectContextStore';
import { useSessionStore } from '../store/sessionStore';

/** Daily Gate Pass: the PC uploads and reconciles; the Team Lead, PM and Executive see the calendar and the tasks raised. */
export default function P2GatePassPage() {
  const project = useProjectContextStore((s) => s.selectedProject);
  const accessToken = useSessionStore((s) => s.accessToken);
  const role = useSessionStore((s) => s.role);
  const tenantId = project?.tenantId;
  const [refreshKey, setRefreshKey] = useState(0);
  const refresh = () => setRefreshKey((k) => k + 1);
  const isPc = role === 'PC';

  return (
    <div className="screen-stack p2-screen p2w p2gp">
      <PageHeader
        eyebrow="Daily Tasks"
        title="Daily gate pass"
        description={isPc
          ? 'Upload the gate pass photo, enter the day’s movements, and check them against the delivery files.'
          : 'Deliveries done against delivery files uploaded, by day, and the tasks raised from the gate passes.'}
      />
      {!tenantId || !accessToken ? (
        <div className="p2w-alert p2w-alert--error" role="alert">Select a project to continue.</div>
      ) : (
        <>
          {isPc ? <GatePassWizard tenantId={tenantId} accessToken={accessToken} onChanged={refresh} /> : null}
          {!isPc ? <DailyTasksList tenantId={tenantId} accessToken={accessToken} onChanged={refresh} /> : null}
          <GatePassCalendar tenantId={tenantId} accessToken={accessToken} refreshKey={refreshKey} />
        </>
      )}
    </div>
  );
}
