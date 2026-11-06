import '../styles/uc03-p2.css';
import '../styles/uc03-p2-workspace.css';

import BackLink from '../components/BackLink';
import PageHeader from '../components/PageHeader';
import LocationChecksLog from '../features/dealguard-presence/LocationChecksLog';
import { useProjectContextStore } from '../store/projectContextStore';
import { useSessionStore } from '../store/sessionStore';

const VIEWERS = new Set(['EXECUTIVE']);

/** DealGuard location checks of the Project's PCs, day by day (Executive only, product owner 2026-11-06; the server enforces it). */
export default function P2LocationChecksPage() {
  const tenantId = useProjectContextStore((s) => s.selectedProject?.tenantId);
  const operatingRole = useProjectContextStore((s) => s.selectedProject?.operatingRole);
  const accessToken = useSessionStore((s) => s.accessToken);
  return (
    <div className="screen-stack p2-screen p2w">
      <BackLink fallbackTo="/dashboard" fallbackLabel="Overview" />
      <PageHeader
        eyebrow="DealGuard"
        title="Location checks"
        description="Where each PC was when DealGuard checked their location: at their outlet, away from it, or not clear. Checks only inform; nobody is stopped from working."
      />
      {!VIEWERS.has(String(operatingRole)) ? (
        <div className="p2w-alert p2w-alert--error" role="alert">Location checks are for Team Leads, Project Managers, Executives and SuperAdmin.</div>
      ) : tenantId ? <LocationChecksLog mode="project" tenantId={tenantId} accessToken={accessToken} /> : null}
    </div>
  );
}
