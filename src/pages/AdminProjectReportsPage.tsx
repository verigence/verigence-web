import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import '../styles/uc03-p2.css';
import '../styles/uc03-p2-workspace.css';
import '../styles/uc03-p2-daily-report.css';
import '../styles/task-manager.css';

import PageHeader from '../components/PageHeader';
import DiDashboard from '../features/task-manager/DiDashboard';
import EngagementDashboard from '../features/task-manager/EngagementDashboard';
import { listProjects } from '../services/audit-core/uc02Admin';
import { getLoginActivity, type LoginPerson } from '../services/security/loginActivity';
import { useSessionStore } from '../store/sessionStore';

/**
 * Superadmin's own view of the employee engagement and DI dashboards, one
 * Project at a time (product owner 2026-10-27).
 */
export default function AdminProjectReportsPage({ report }: { report: 'engagement' | 'di' }) {
  const accessToken = useSessionStore((s) => s.accessToken);
  const [tenantId, setTenantId] = useState('');
  const projects = useQuery({
    queryKey: ['admin-task-manager-projects'],
    queryFn: () => listProjects(accessToken),
    enabled: Boolean(accessToken),
    staleTime: 60_000,
  });
  // Sign-in counts are Security's, all time; Superadmin only.
  const logins = useQuery({
    queryKey: ['security', 'login-activity'],
    queryFn: () => getLoginActivity(accessToken!),
    enabled: Boolean(accessToken) && report === 'engagement',
    retry: false,
    staleTime: 5 * 60_000,
  });
  const byUser = useMemo(() => {
    const map = new Map<string, LoginPerson>();
    for (const p of logins.data?.people ?? []) map.set(p.userId, p);
    return map;
  }, [logins.data]);
  const engagement = report === 'engagement';
  return (
    <div className="screen-stack p2-screen p2w">
      <PageHeader
        eyebrow={engagement ? 'Administration · Employee engagement' : 'Administration · DI dashboard'}
        title={engagement ? 'Employee engagement' : 'DI dashboard'}
        description={engagement
          ? 'Time on Verigence, sessions, output and work of each person, day by day, week by week or month by month, one Project at a time.'
          : 'Files and pages uploaded, what was read the first time or after retries, bad scans, failures and why, and how long files took, one Project at a time.'}
      />
      <div className="tm-admin-picker">
        <label className="p2w-raise__field">
          <span>Project</span>
          <select value={tenantId} disabled={projects.isPending} onChange={(e) => setTenantId(e.target.value)}>
            <option value="">Select a Project</option>
            {(projects.data ?? []).map((p) => (
              <option key={p.tenantId} value={p.tenantId}>{p.projectName} · {p.projectCode}</option>
            ))}
          </select>
        </label>
      </div>
      {projects.isError ? <div className="p2w-alert p2w-alert--error" role="alert">Projects could not be loaded.</div> : null}
      {tenantId && engagement ? (
        <EngagementDashboard key={tenantId} mode="admin" tenantId={tenantId} accessToken={accessToken}
          logins={logins.data ? byUser : undefined} />
      ) : null}
      {tenantId && !engagement ? <DiDashboard key={tenantId} mode="admin" tenantId={tenantId} accessToken={accessToken} /> : null}
    </div>
  );
}
