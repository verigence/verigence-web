import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

import PageHeader from '../components/PageHeader';
import SectionCard from '../components/SectionCard';
import StatusPill from '../components/StatusPill';
import VerigenceButton from '../components/VerigenceButton';
import { runtimeConfig } from '../services/runtime';
import { loadTasks } from '../services/webRepository';
import { taskAction } from '../services/audit-core/operations';
import { useSessionStore } from '../store/sessionStore';

export default function TasksPage() {
  const accessToken = useSessionStore((s) => s.accessToken);
  const queryClient = useQueryClient();
  const [message, setMessage] = useState('');
  const query = useQuery({ queryKey: ['tasks'], queryFn: () => loadTasks({ accessToken }) });
  const action = useMutation({
    mutationFn: async ({ taskId, kind }: { taskId: string; kind: 'claim' | 'start' | 'complete' }) =>
      taskAction(runtimeConfig.tenantId, taskId, kind, accessToken),
    onSuccess: (_, variables) => {
      setMessage(`Task ${variables.kind} action completed.`);
      void queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });

  return (
    <div className="screen-stack">
      <PageHeader eyebrow="Workflow" title="My work" description="Claim, start and complete assigned workflow tasks. Role and business-scope authorization remains enforced by Audit Core." backing={query.data?.backing} />
      {message && <div className="form-alert form-alert--success">{message}</div>}
      <SectionCard>
        <div className="task-board">
          {(query.data?.items || []).map((task) => (
            <article className="task-card" key={task.taskId}>
              <div className="task-card__top"><span className="document-mark">WK</span><StatusPill value={task.status} compact /></div>
              <h3>{task.taskType.replaceAll('_', ' ')}</h3>
              <p>{task.customerName || 'Workflow task'}{task.journeyReference ? ` · ${task.journeyReference}` : ''}</p>
              <div className="task-card__meta"><span>Role <strong>{task.assignedRole || '—'}</strong></span><span>Due <strong>{task.dueAtUtc ? new Date(task.dueAtUtc).toLocaleString('en-IN') : 'No due date'}</strong></span></div>
              <div className="task-card__actions">
                {task.journeyId && <Link className="text-link" to={`/journeys/${task.journeyId}`}>Open journey</Link>}
                <div className="button-row"><VerigenceButton fill="outline" size="small" onClick={() => action.mutate({ taskId: task.taskId, kind: 'claim' })}>Claim</VerigenceButton><VerigenceButton size="small" onClick={() => action.mutate({ taskId: task.taskId, kind: task.status === 'IN_PROGRESS' ? 'complete' : 'start' })}>{task.status === 'IN_PROGRESS' ? 'Complete' : 'Start'}</VerigenceButton></div>
              </div>
            </article>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}
