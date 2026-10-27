import { Navigate } from 'react-router-dom';
import '../styles/uc03-p2.css';
import '../styles/uc03-p2-workspace.css';

import BackLink from '../components/BackLink';
import PageHeader from '../components/PageHeader';
import TaskManagerPanel from '../features/task-manager/TaskManagerPanel';
import { useProjectContextStore } from '../store/projectContextStore';
import { useSessionStore } from '../store/sessionStore';

/** Task Manager for the selected Project: tasks not tied to a booking, recurring tasks and the daily gate pass. */
export default function P2TaskManagerPage() {
  const tenantId = useProjectContextStore((s) => s.selectedProject?.tenantId);
  const operatingRole = useProjectContextStore((s) => s.selectedProject?.operatingRole);
  const accessToken = useSessionStore((s) => s.accessToken);
  // PC, TL and PM see Task Manager tasks as a classification of the Task Queue.
  if (operatingRole === 'PC' || operatingRole === 'TL' || operatingRole === 'PM') {
    return <Navigate to="/p2/tasks?scope=tm" replace />;
  }
  return (
    <div className="screen-stack p2-screen p2w">
      <BackLink fallbackTo="/dashboard" fallbackLabel="Overview" />
      <PageHeader
        eyebrow="Task Manager"
        title="Task Manager"
        description="Tasks raised to people in this Project, recurring tasks and the daily gate pass. Each task has an expected time to close; anything overdue or missed shows in the daily status."
      />
      {tenantId ? <TaskManagerPanel mode="project" tenantId={tenantId} accessToken={accessToken} /> : (
        <div className="p2w-empty">Choose a Project first.</div>
      )}
    </div>
  );
}
