import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import '../styles/uc03-p2.css';
import '../styles/uc03-p2-workspace.css';
import '../styles/uc03-p2-daily-report.css';
import '../styles/task-manager.css';

import PageHeader from '../components/PageHeader';
import TaskManagerPanel from '../features/task-manager/TaskManagerPanel';
import TaskStatusSections from '../features/task-manager/TaskStatusSections';
import { istToday } from '../features/task-manager/tmFormat';
import { getTmTaskStatus } from '../services/audit-core/taskManager';
import { listProjects } from '../services/audit-core/uc02Admin';
import { useSessionStore } from '../store/sessionStore';

type Section = 'tasks' | 'status';

function DailyStatus({ tenantId, accessToken }: { tenantId: string; accessToken?: string }) {
  const [day, setDay] = useState(istToday());
  const status = useQuery({
    queryKey: ['tm-status', 'admin', tenantId, day],
    queryFn: () => getTmTaskStatus('admin', tenantId, day, accessToken),
    enabled: Boolean(tenantId && accessToken),
  });
  return (
    <>
      <div className="p2w-listbar">
        <label>Day <input type="date" value={day} max={istToday()} onChange={(e) => setDay(e.target.value || istToday())} /></label>
      </div>
      {status.isError ? <div className="p2w-alert p2w-alert--error" role="alert">The daily status could not be loaded.</div> : null}
      {status.isLoading ? <div className="p2w-skeleton">Loading…</div> : null}
      {status.data ? <TaskStatusSections status={status.data} journeyLinks={false} /> : null}
    </>
  );
}

/**
 * Superadmin's own view of the Task Manager, one Project at a time: raise and
 * follow tasks, manage recurring tasks and the daily status. Employee
 * engagement is under Reports with DI (product owner 2026-10-27).
 */
export default function AdminTaskManagerPage() {
  const accessToken = useSessionStore((s) => s.accessToken);
  const [tenantId, setTenantId] = useState('');
  const [section, setSection] = useState<Section>('tasks');
  const projects = useQuery({
    queryKey: ['admin-task-manager-projects'],
    queryFn: () => listProjects(accessToken),
    enabled: Boolean(accessToken),
    staleTime: 60_000,
  });
  return (
    <div className="screen-stack p2-screen p2w">
      <PageHeader
        eyebrow="Administration · Task Manager"
        title="Task Manager"
        description="Assign and follow tasks, set up recurring tasks, and see the daily status of one Project at a time. Employee engagement is under Reports."
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
        {tenantId ? (
          <div className="p2w-segment" role="tablist" aria-label="Section">
            {([['tasks', 'Tasks'], ['status', 'Daily status']] as const).map(([key, label]) => (
              <button key={key} type="button" role="tab" aria-selected={section === key} className={section === key ? 'is-active' : ''}
                onClick={() => setSection(key)}>{label}</button>
            ))}
          </div>
        ) : null}
      </div>
      {projects.isError ? <div className="p2w-alert p2w-alert--error" role="alert">Projects could not be loaded.</div> : null}
      {tenantId && section === 'tasks' ? <TaskManagerPanel key={tenantId} mode="admin" tenantId={tenantId} accessToken={accessToken} /> : null}
      {tenantId && section === 'status' ? <DailyStatus key={tenantId} tenantId={tenantId} accessToken={accessToken} /> : null}
    </div>
  );
}
