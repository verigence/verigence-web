import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import '../styles/uc03-p2.css';

import PageHeader from '../components/PageHeader';
import SectionCard from '../components/SectionCard';
import StatusPill from '../components/StatusPill';
import P2JourneyTabs from '../features/uc03-p2/P2JourneyTabs';
import { getP2Tasks, submitP2TaskAction, type P2Task } from '../services/audit-core/uc03P2';
import { useProjectContextStore } from '../store/projectContextStore';
import { useSessionStore } from '../store/sessionStore';

function dueLabel(value?: string | null) {
  if (!value) return 'No SLA';
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  }).format(new Date(value));
}

const DOCUMENT_NAVIGATION_ACTIONS = new Set([
  'REVIEW_DOCUMENT',
  'CORRECT_EXTRACTED_FIELD',
  'UPLOAD_DOCUMENT',
  'REUPLOAD_DOCUMENT',
  'ADD_EVIDENCE',
]);

function primaryAction(task: P2Task): string | undefined {
  return task.allowed_actions.find((action) => ![
    'ADD_COMMENT',
    'PROVIDE_FEEDBACK',
    'REJECT',
  ].includes(action));
}

function referenceValue(reference: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = reference[key];
    if (typeof value === 'string' && value.trim()) return value;
  }
  return undefined;
}

function documentActionPath(task: P2Task): string {
  const params = new URLSearchParams();
  const documentId = referenceValue(task.reference, 'documentId', 'document_id');
  const fieldKey = referenceValue(task.reference, 'fieldKey', 'field_key');
  if (documentId) params.set('focusDocument', documentId);
  if (fieldKey) params.set('focusField', fieldKey);
  const suffix = params.toString() ? `?${params.toString()}` : '';
  return `/p2/journeys/${task.journey_id}/documents${suffix}`;
}

export default function P2TasksPage() {
  const { journeyId } = useParams();
  const tenantId = useProjectContextStore((s) => s.selectedProject?.tenantId);
  const accessToken = useSessionStore((s) => s.accessToken);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [openTask, setOpenTask] = useState<string>();
  const [comment, setComment] = useState('');

  const query = useQuery({
    queryKey: ['p2-tasks', tenantId, journeyId || 'all'],
    queryFn: () => getP2Tasks(tenantId!, accessToken, journeyId),
    enabled: Boolean(tenantId && accessToken),
    staleTime: 10_000,
  });

  const action = useMutation({
    mutationFn: ({ taskId, actionName, note }: { taskId: string; actionName: string; note?: string }) =>
      submitP2TaskAction(tenantId!, taskId, actionName, accessToken, note),
    onSuccess: () => {
      setComment('');
      setOpenTask(undefined);
      void queryClient.invalidateQueries({ queryKey: ['p2-tasks', tenantId] });
    },
  });

  return (
    <div className="screen-stack p2-screen">
      <PageHeader
        eyebrow="Phase 2 · Tasks"
        title={journeyId ? 'Journey Tasks' : 'Task Queue'}
        description="Prioritized work with the reason, source and required action visible in one place."
        actions={<Link className="text-link" to={journeyId ? `/p2/journeys/${journeyId}/overview` : '/p2/work-queue'}>Back</Link>}
      />
      {journeyId ? <P2JourneyTabs /> : null}

      <SectionCard>
        <div className="p2-table-wrap">
          <table className="p2-table p2-task-table">
            <thead>
              <tr>
                <th>Priority</th>
                <th>Severity</th>
                <th>Task / Why</th>
                <th>Source</th>
                <th>SLA</th>
                <th>Status</th>
                <th aria-label="Action" />
              </tr>
            </thead>
            <tbody>
              {(query.data?.items ?? []).map((task) => {
                const primary = primaryAction(task);
                const expanded = openTask === task.task_id;
                return [
                  <tr key={task.task_id}>
                    <td><StatusPill value={task.priority} compact /></td>
                    <td><StatusPill value={task.severity} compact /></td>
                    <td>
                      <strong>{task.title}</strong>
                      <small>{task.description}</small>
                    </td>
                    <td>
                      <strong>{task.origin_kind}</strong>
                      <small>{task.source_code || task.source_type}</small>
                    </td>
                    <td>{dueLabel(task.due_at_utc)}</td>
                    <td><StatusPill value={task.task_status} compact /></td>
                    <td className="p2-table__action">
                      <button className="p2-link-button" type="button" onClick={() => setOpenTask(expanded ? undefined : task.task_id)}>
                        {expanded ? 'Close' : 'Open'}
                      </button>
                    </td>
                  </tr>,
                  expanded ? (
                    <tr className="p2-task-detail" key={`${task.task_id}-detail`}>
                      <td colSpan={7}>
                        <div className="p2-task-detail__body">
                          <div>
                            <span className="eyebrow">Reference</span>
                            <pre>{JSON.stringify(task.reference, null, 2)}</pre>
                          </div>
                          <div className="p2-task-detail__actions">
                            <label>
                              Comment / feedback
                              <textarea value={comment} onChange={(event) => setComment(event.target.value)} rows={3} />
                            </label>
                            <div className="button-row">
                              {task.allowed_actions.includes('ADD_COMMENT') ? (
                                <button
                                  type="button"
                                  className="p2-secondary-action"
                                  disabled={!comment.trim() || action.isPending}
                                  onClick={() => action.mutate({ taskId: task.task_id, actionName: 'ADD_COMMENT', note: comment })}
                                >
                                  Add Comment
                                </button>
                              ) : null}
                              {task.allowed_actions.includes('PROVIDE_FEEDBACK') ? (
                                <button
                                  type="button"
                                  className="p2-secondary-action"
                                  disabled={!comment.trim() || action.isPending}
                                  onClick={() => action.mutate({ taskId: task.task_id, actionName: 'PROVIDE_FEEDBACK', note: comment })}
                                >
                                  Provide Feedback
                                </button>
                              ) : null}
                              {task.allowed_actions.includes('REJECT') ? (
                                <button
                                  type="button"
                                  className="p2-secondary-action"
                                  disabled={!comment.trim() || action.isPending}
                                  title={!comment.trim() ? 'A rejection comment is required.' : undefined}
                                  onClick={() => action.mutate({
                                    taskId: task.task_id,
                                    actionName: 'REJECT',
                                    note: comment,
                                  })}
                                >
                                  Reject
                                </button>
                              ) : null}
                              {primary ? (
                                <button
                                  type="button"
                                  className="p2-primary-action"
                                  disabled={action.isPending}
                                  onClick={() => {
                                    if (DOCUMENT_NAVIGATION_ACTIONS.has(primary)) {
                                      navigate(documentActionPath(task));
                                      return;
                                    }
                                    action.mutate({
                                      taskId: task.task_id,
                                      actionName: primary,
                                      note: comment || undefined,
                                    });
                                  }}
                                >
                                  {primary === 'ACCEPT' ? 'Accept' : primary.replaceAll('_', ' ')}
                                </button>
                              ) : null}
                            </div>
                            {task.journey_id ? (
                              <Link className="text-link" to={`/p2/journeys/${task.journey_id}/overview`}>Open Journey</Link>
                            ) : null}
                          </div>
                        </div>
                      </td>
                    </tr>
                  ) : null,
                ];
              })}
              {!query.isLoading && (query.data?.items.length ?? 0) === 0 ? (
                <tr><td colSpan={7} className="p2-empty">No Phase 2 tasks are waiting.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}
