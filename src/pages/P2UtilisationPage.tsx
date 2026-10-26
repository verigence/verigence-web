import '../styles/uc03-p2.css';
import '../styles/uc03-p2-workspace.css';
import '../styles/uc03-p2-daily-report.css';

import BackLink from '../components/BackLink';
import PageHeader from '../components/PageHeader';
import UtilisationDashboard from '../features/task-manager/UtilisationDashboard';
import { useProjectContextStore } from '../store/projectContextStore';
import { useSessionStore } from '../store/sessionStore';

/** Employee utilisation of the selected Project, by day or week (Executive only; the server enforces it). */
export default function P2UtilisationPage() {
  const tenantId = useProjectContextStore((s) => s.selectedProject?.tenantId);
  const operatingRole = useProjectContextStore((s) => s.selectedProject?.operatingRole);
  const accessToken = useSessionStore((s) => s.accessToken);
  return (
    <div className="screen-stack p2-screen p2w">
      <BackLink fallbackTo="/dashboard" fallbackLabel="Overview" />
      <PageHeader
        eyebrow="Employee utilisation"
        title="Employee utilisation"
        description="What each person in this Project did, and how much of the time Verigence was open they were actually using it."
      />
      {operatingRole !== 'EXECUTIVE' ? (
        <div className="p2w-alert p2w-alert--error" role="alert">This dashboard is for Executives and Superadmin.</div>
      ) : tenantId ? <UtilisationDashboard mode="project" tenantId={tenantId} accessToken={accessToken} /> : null}
    </div>
  );
}
