import '../styles/uc03-p2.css';
import '../styles/uc03-p2-workspace.css';
import '../styles/uc03-p2-daily-report.css';

import BackLink from '../components/BackLink';
import PageHeader from '../components/PageHeader';
import DiDashboard from '../features/task-manager/DiDashboard';
import { useProjectContextStore } from '../store/projectContextStore';
import { useSessionStore } from '../store/sessionStore';

/** Document Intelligence dashboard of the selected Project (Executive only; the server enforces it). */
export default function P2DiDashboardPage() {
  const tenantId = useProjectContextStore((s) => s.selectedProject?.tenantId);
  const operatingRole = useProjectContextStore((s) => s.selectedProject?.operatingRole);
  const accessToken = useSessionStore((s) => s.accessToken);
  return (
    <div className="screen-stack p2-screen p2w">
      <BackLink fallbackTo="/dashboard" fallbackLabel="Overview" />
      <PageHeader
        eyebrow="Document Intelligence"
        title="DI dashboard"
        description="Files and pages uploaded, what was read the first time or after retries, bad scans, failures and why, and how long files took."
      />
      {operatingRole !== 'EXECUTIVE' ? (
        <div className="p2w-alert p2w-alert--error" role="alert">This dashboard is for Executives and Superadmin.</div>
      ) : tenantId ? <DiDashboard mode="project" tenantId={tenantId} accessToken={accessToken} /> : null}
    </div>
  );
}
