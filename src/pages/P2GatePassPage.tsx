import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import '../styles/uc03-p2.css';
import '../styles/uc03-p2-workspace.css';
import '../styles/uc03-p2-gate-pass.css';

import PageHeader from '../components/PageHeader';
import DailyTasksList from '../features/uc03-p2/gatepass/DailyTasksList';
import GatePassSummary from '../features/uc03-p2/gatepass/GatePassSummary';
import GatePassCalendar from '../features/uc03-p2/gatepass/GatePassCalendar';
import GatePassWizard from '../features/uc03-p2/gatepass/GatePassWizard';
import { useProjectContextStore } from '../store/projectContextStore';
import { useSessionStore } from '../store/sessionStore';

/** Daily Gate Pass: the PC uploads and reconciles; the Team Lead, PM and Executive see the calendar and the tasks raised. */
export default function P2GatePassPage() {
  const project = useProjectContextStore((s) => s.selectedProject);
  const accessToken = useSessionStore((s) => s.accessToken);
  const tenantId = project?.tenantId;
  const [refreshKey, setRefreshKey] = useState(0);
  // ?edit=<gate pass>: correct the counts of a register uploaded today (2026-11-03).
  const [searchParams] = useSearchParams();
  const editGatePassId = searchParams.get('edit');
  const refresh = () => setRefreshKey((k) => k + 1);
  // The Project's operating role, as everywhere else: the session role is only a
  // default ('PC') until a Project is chosen, so it showed the PC's upload form to
  // a Team Lead, PM or Executive, whose Security permissions refuse the upload
  // (Permission denied).
  const isPc = project?.operatingRole === 'PC';

  return (
    <div className="screen-stack p2-screen p2w p2gp">
      <PageHeader
        eyebrow="Daily Tasks"
        title="Daily gate pass"
        description={isPc
          ? 'Upload the gate register photo, enter the total deliveries and how many were intimated to you, and see what is still to upload.'
          : 'Deliveries done against delivery files uploaded, by day, and the tasks raised from the gate passes.'}
      />
      {!tenantId || !accessToken ? (
        <div className="p2w-alert p2w-alert--error" role="alert">Select a project to continue.</div>
      ) : (
        <>
          {isPc ? <GatePassWizard key={editGatePassId ?? 'new'} tenantId={tenantId} accessToken={accessToken} onChanged={refresh} editGatePassId={editGatePassId} /> : null}
          {!isPc ? <DailyTasksList tenantId={tenantId} accessToken={accessToken} onChanged={refresh} /> : null}
          {/* TL, PM and Executive: every outlet at once, satellites included (product owner 2026-11-02). */}
          {!isPc ? <GatePassSummary tenantId={tenantId} accessToken={accessToken} refreshKey={refreshKey} /> : null}
          <GatePassCalendar tenantId={tenantId} accessToken={accessToken} refreshKey={refreshKey} />
        </>
      )}
    </div>
  );
}
