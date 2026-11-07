import '../styles/uc03-p2.css';
import '../styles/uc03-p2-workspace.css';

import BackLink from '../components/BackLink';
import PageHeader from '../components/PageHeader';
import JourneyExportPanel from '../features/uc03-p2/bookings/JourneyExportPanel';
import { useProjectContextStore } from '../store/projectContextStore';
import { useSessionStore } from '../store/sessionStore';

const EXPORTERS = new Set(['TL', 'PM', 'EXECUTIVE']);

/**
 * Every journey as Excel for a date range, a dealership or an outlet: Team Leads and above
 * (product owner 2026-11-06). Its own page in the DealGuard menu, so a Team Lead or an Executive
 * reaches it; the server enforces who may export and which outlets.
 */
export default function P2JourneyExportPage() {
  const tenantId = useProjectContextStore((s) => s.selectedProject?.tenantId);
  const operatingRole = useProjectContextStore((s) => s.selectedProject?.operatingRole);
  const accessToken = useSessionStore((s) => s.accessToken);
  return (
    <div className="screen-stack p2-screen p2w">
      <BackLink fallbackTo="/dashboard" fallbackLabel="Overview" />
      <PageHeader
        eyebrow="DealGuard"
        title="Export to Excel"
        description="Download every booking and delivery in a date range as an Excel file, for all your outlets or one dealership or outlet."
      />
      {EXPORTERS.has(String(operatingRole)) ? (
        <JourneyExportPanel tenantId={tenantId} accessToken={accessToken} />
      ) : (
        <div className="p2w-alert p2w-alert--error" role="alert">The export is for Team Leads and above.</div>
      )}
    </div>
  );
}
