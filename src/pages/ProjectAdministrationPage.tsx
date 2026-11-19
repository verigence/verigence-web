import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import '../styles/uc03-p2.css';
import '../styles/uc03-p2-workspace.css';
import '../styles/task-manager.css';
import '../styles/hr.css';
import '../styles/hr-attendance.css';
import '../styles/duties.css';
import '../styles/admin-reports.css';

import PageHeader from '../components/PageHeader';
import ProjectVersionPolicyPanel from '../features/appVersion/ProjectVersionPolicyPanel';
import { policyKey } from '../features/appVersion/appVersionPolicyFormat';
import DutyListPanel from '../features/duties/DutyListPanel';
import {
  PROJECT_ADMIN_SECTIONS, PROJECT_ONBOARDING_PATH, isProjectAdminSection, type ProjectAdminSection,
} from '../features/project-admin/projectAdministrationPaths';
import TmSchedules from '../features/task-manager/TmSchedules';
import { getTmContext } from '../services/audit-core/taskManager';
import { listProjects } from '../services/audit-core/uc02Admin';
import { getAppVersionPolicy } from '../services/security/appVersion';
import { useSessionStore } from '../store/sessionStore';

function RecurringTasks({ tenantId, accessToken }: { tenantId: string; accessToken?: string }) {
  const [notice, setNotice] = useState<string>();
  const context = useQuery({
    queryKey: ['tm-context', 'admin', tenantId],
    queryFn: () => getTmContext('admin', tenantId, accessToken),
    enabled: Boolean(tenantId && accessToken),
    staleTime: 60_000,
  });
  if (context.isError) return <div className="p2w-alert p2w-alert--error" role="alert">The recurring tasks could not be loaded.</div>;
  if (!context.data) return <div className="p2w-skeleton">Loading…</div>;
  return (
    <div className="tm-panel">
      {notice ? (
        <div className="p2w-alert p2w-alert--success" role="status">
          {notice}<button type="button" className="p2w-link" onClick={() => setNotice(undefined)} aria-label="Dismiss">×</button>
        </div>
      ) : null}
      <TmSchedules mode="admin" tenantId={tenantId} accessToken={accessToken} context={context.data} onNotice={setNotice} />
    </div>
  );
}

function AppVersion({ tenantId, projectName, accessToken }: { tenantId: string; projectName: string; accessToken?: string }) {
  const policy = useQuery({
    queryKey: policyKey,
    queryFn: () => getAppVersionPolicy(accessToken!),
    enabled: Boolean(accessToken),
    retry: false,
  });
  if (policy.isLoading) return <div className="p2w-skeleton">Loading…</div>;
  if (policy.isError || !policy.data) return <div className="p2w-alert p2w-alert--error" role="alert">The app version rule could not be loaded.</div>;
  return (
    <ProjectVersionPolicyPanel accessToken={accessToken} tenantId={tenantId} projectName={projectName}
      current={policy.data.projects?.find((p) => p.tenantId === tenantId)}
      everyoneMinimum={policy.data.inForce ? policy.data.minimumVersion : null} />
  );
}

/**
 * SuperAdmin: the running settings of one Project, in one place (product owner, 19 Nov 2026: "all
 * project specific tasks should be under project administration ... otherwise superadmin will get
 * lost"). Setting a Project up -- dealers, outlets, people, roles, masters -- is Project
 * Onboarding. What the team does day by day is read in the Task Manager and the Project Tracker.
 */
export default function ProjectAdministrationPage() {
  const accessToken = useSessionStore((s) => s.accessToken);
  const [params, setParams] = useSearchParams();
  const tenantId = params.get('project') ?? '';
  const asked = params.get('section');
  const section: ProjectAdminSection = isProjectAdminSection(asked) ? asked : 'duties';
  const projects = useQuery({
    queryKey: ['admin-task-manager-projects'],
    queryFn: () => listProjects(accessToken),
    enabled: Boolean(accessToken),
    staleTime: 60_000,
  });
  const project = (projects.data ?? []).find((p) => p.tenantId === tenantId);
  const go = (next: { project?: string; section?: ProjectAdminSection }) => {
    const query = new URLSearchParams();
    const chosen = next.project ?? tenantId;
    if (chosen) query.set('project', chosen);
    query.set('section', next.section ?? section);
    setParams(query, { replace: true });
  };

  return (
    <div className="screen-stack p2-screen p2w">
      <PageHeader
        eyebrow="Administration"
        title="Project Administration"
        description="The running settings of one Project: the PCs' daily duties, its recurring tasks and the oldest app version its people may use. Setting a Project up is under Project Onboarding."
        actions={<Link to={PROJECT_ONBOARDING_PATH} className="uc01-admin-button">Project Onboarding</Link>}
      />
      <div className="tm-admin-picker">
        <label className="p2w-raise__field">
          <span>Project</span>
          <select value={tenantId} disabled={projects.isPending} onChange={(e) => go({ project: e.target.value })}>
            <option value="">Select a Project</option>
            {(projects.data ?? []).map((p) => (
              <option key={p.tenantId} value={p.tenantId}>{p.projectName} · {p.projectCode}</option>
            ))}
          </select>
        </label>
        {tenantId ? (
          <div className="p2w-segment" role="tablist" aria-label="Setting">
            {PROJECT_ADMIN_SECTIONS.map((s) => (
              <button key={s.key} type="button" role="tab" aria-selected={section === s.key} className={section === s.key ? 'is-active' : ''}
                onClick={() => go({ section: s.key })}>{s.label}</button>
            ))}
          </div>
        ) : null}
      </div>
      {projects.isError ? <div className="p2w-alert p2w-alert--error" role="alert">Projects could not be loaded.</div> : null}
      {!tenantId && !projects.isError ? <p className="p2w-muted">Select a Project to see its settings.</p> : null}
      {tenantId && section === 'duties' ? (
        <>
          <p className="p2w-muted">The duty list and its switch. How each PC is doing day by day is under <Link to="/admin/task-manager">Task Manager</Link>, Daily duties.</p>
          <DutyListPanel key={tenantId} mode="admin" tenantId={tenantId} accessToken={accessToken} />
        </>
      ) : null}
      {tenantId && section === 'recurring' ? (
        <>
          <p className="p2w-muted">Tasks raised on a schedule for this Project. The tasks themselves are followed under <Link to="/admin/task-manager">Task Manager</Link>.</p>
          <RecurringTasks key={tenantId} tenantId={tenantId} accessToken={accessToken} />
        </>
      ) : null}
      {tenantId && section === 'app' ? (
        <div className="ar-report">
          <AppVersion key={tenantId} tenantId={tenantId} projectName={project?.projectName ?? 'this Project'} accessToken={accessToken} />
        </div>
      ) : null}
    </div>
  );
}
