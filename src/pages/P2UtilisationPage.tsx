import '../styles/uc03-p2.css';
import '../styles/uc03-p2-workspace.css';
import '../styles/uc03-p2-daily-report.css';

import BackLink from '../components/BackLink';
import PageHeader from '../components/PageHeader';
import EngagementDashboard from '../features/task-manager/EngagementDashboard';
import { useProjectContextStore } from '../store/projectContextStore';
import { useSessionStore } from '../store/sessionStore';

/** Employee engagement of the selected Project, by day, week or month (Executive only; the server enforces it). */
export default function P2UtilisationPage() {
  const tenantId = useProjectContextStore((s) => s.selectedProject?.tenantId);
  const operatingRole = useProjectContextStore((s) => s.selectedProject?.operatingRole);
  const accessToken = useSessionStore((s) => s.accessToken);
  return (
    <div className="screen-stack p2-screen p2w">
      <BackLink fallbackTo="/dashboard" fallbackLabel="Overview" />
      <PageHeader
        eyebrow="Employee engagement"
        title="Employee engagement"
        description="Time on Verigence, sessions, output and work of each person in this Project, day by day, week by week or month by month."
      />
      {operatingRole !== 'EXECUTIVE' ? (
        <div className="p2w-alert p2w-alert--error" role="alert">This dashboard is for Executives and Superadmin.</div>
      ) : tenantId ? <EngagementDashboard mode="project" tenantId={tenantId} accessToken={accessToken} /> : null}
    </div>
  );
}
