import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import '../styles/uc03-p2.css';

import PageHeader from '../components/PageHeader';
import SectionCard from '../components/SectionCard';
import StatusPill from '../components/StatusPill';
import { getP2Tasks, submitP2TaskAction, type P2Task } from '../services/audit-core/uc03P2';
import { useProjectContextStore } from '../store/projectContextStore';
import { useSessionStore } from '../store/sessionStore';

function dueLabel(value?: string | null) {
  if (!value) return 'No SLA';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  }).format(date);
}

const DOCUMENT_NAVIGATION_ACTIONS = new Set([
  'REVIEW_DOCUMENT',
  'CORRECT_EXTRACTED_FIELD',
  'UPLOAD_DOCUMENT',
  'REUPLOAD_DOCUMENT',
  'ADD_EVIDENCE',
]);

function primaryAction(task: P2Task): string | undefined {
  if (task.source_system !== 'P2') return undefined;
  return task.allowed_actions.find((action) => ![
    'ADD_COMMENT',
    'PROVIDE_FEEDBACK',
    'REJECT',
    'REJECT_CORRECTION',
  ].includes(action));
}

function rejectAction(task: P2Task): string | undefined {
  return task.allowed_actions.find((action) => action === 'REJECT' || action === 'REJECT_CORRECTION');
}

function actionLabel(action: string): string {
  if (action === 'ACCEPT') return 'Accept';
  if (action === 'APPROVE_CORRECTION') return 'Approve correction';
  if (action === 'REJECT_CORRECTION') return 'Reject correction';
  return action.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (character) => character.toUpperCase());
}

function priorityLabel(task: P2Task): string {
  if (task.source_system === 'LEGACY') {
    return task.priority_rank !== null && task.priority_rank !== undefined
      ? `Priority ${task.priority_rank}`
      : 'Existing priority';
  }
  return task.priority || 'NORMAL';
}

function referenceValue(reference: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = reference[key];
    if (typeof value === 'string' && value.trim()) return value;
  }
  return undefined;
}

function shortId(value?: string | null): string | undefined {
  if (!value) return undefined;
  return value.length > 10 ? value.slice(0, 8) : value;
}

function referenceSummary(task: P2Task): string {
  const reference = task.reference || {};
  const documentType = referenceValue(reference, 'documentTypeKey', 'documentType', 'document_type');
  const documentId = referenceValue(reference, 'documentId', 'document_id');
  const field = referenceValue(reference, 'fieldKey', 'field_key');
  const finding = referenceValue(reference, 'findingId', 'finding_id');
  const rule = task.source_code || referenceValue(reference, 'ruleCode', 'ruleKey', 'rule_code');

  const parts = [
    documentType ? documentType.replaceAll('_', ' ') : undefined,
    field ? `Field: ${field.replaceAll('_', ' ')}` : undefined,
    rule ? `Rule: ${rule.replaceAll('_', ' ')}` : undefined,
    finding ? `Finding: ${shortId(finding)}` : undefined,
    !documentType && documentId ? `Document: ${shortId(documentId)}` : undefined,
  ].filter((value): value is string => Boolean(value));

  return parts.length ? parts.join(' · ') : task.source_type.replaceAll('_', ' ');
}

function ownerLabel(task: P2Task): string {
  const role = task.assigned_role_code?.replaceAll('_', ' ') || 'Unassigned';
  return task.assigned_actor_id ? `${role} · assigned user` : role;
}

function documentActionPath(task: P2Task): string {
  const documentId = referenceValue(task.reference, 'documentId', 'document_id');
  const fieldKey = referenceValue(task.reference, 'fieldKey', 'field_key');
  if (documentId) {
    const suffix = fieldKey ? `?focusField=${encodeURIComponent(fieldKey)}` : '';
    return `/p2/journeys/${task.journey_id}/documents/${encodeURIComponent(documentId)}${suffix}`;
  }
  return `/p2/journeys/${task.journey_id}/documents`;
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

  const runPrimary = (task: P2Task, actionName: string) => {
    if (DOCUMENT_NAVIGATION_ACTIONS.has(actionName)) {
      navigate(documentActionPath(task));
      return;
    }
    action.mutate({ taskId: task.task_id, actionName, note: comment || undefined });
  };

  return (
    <div className="screen-stack p2-screen">
      <PageHeader
        eyebrow="Phase 2"
        title={journeyId ? 'Journey Tasks' : 'Tasks'}
        description="Work requiring attention, ordered around urgency, due date and the action needed."
        actions={<Link className="text-link" to={journeyId ? `/p2/journeys/${journeyId}/overview` : '/p2/bookings'}>Back</Link>}
      />

      {query.isError ? (
        <div className="form-alert form-alert--error">
          {query.error instanceof Error ? query.error.message : 'Tasks could not be loaded.'}
        </div>
      ) : null}

      <SectionCard>
        <div className="p2-table-wrap">
          <table className="p2-table p2-task-table">
            <thead>
              <tr>
                <th>Priority</th>
                <th>Severity</th>
                <th>Task / Why</th>
                <th>Journey / Customer</th>
                <th>Owner / SLA</th>
                <th>Status</th>
                <th aria-label="Action" />
              </tr>
            </thead>
            <tbody>
              {(query.data?.items ?? []).map((task) => {
                const primary = primaryAction(task);
                const reject = rejectAction(task);
                const expanded = openTask === task.task_id;
                return [
                  <tr key={task.task_id}>
                    <td>
                      {task.source_system === 'P2'
                        ? <StatusPill value={priorityLabel(task)} compact />
                        : <span className="p2-native-priority">{priorityLabel(task)}</span>}
                    </td>
                    <td><StatusPill value={task.severity} compact /></td>
                    <td>
                      <strong>{task.title}</strong>
                      <small>{task.description}</small>
                      <small className="p2-reference-line">{referenceSummary(task)}</small>
                    </td>
                    <td>
                      <strong>{task.customer_name || 'Journey'}</strong>
                      <small>{task.vehicle || `Journey ${shortId(task.journey_id)}`}</small>
                      {task.dealer_name || task.outlet_name
                        ? <small>{[task.dealer_name, task.outlet_name].filter(Boolean).join(' · ')}</small>
                        : null}
                    </td>
                    <td>
                      <strong>{ownerLabel(task)}</strong>
                      <small>{dueLabel(task.due_at_utc)}</small>
                    </td>
                    <td><StatusPill value={task.task_status} compact /></td>
                    <td className="p2-table__action">
                      <div className="p2-task-row-actions">
                        {task.source_system === 'LEGACY' ? (
                          <Link className="p2-primary-link" to={task.legacy_queue_url || '/reviews'}>Open Task</Link>
                        ) : primary ? (
                          <button
                            type="button"
                            className="p2-primary-action"
                            disabled={action.isPending}
                            onClick={() => runPrimary(task, primary)}
                          >
                            {actionLabel(primary)}
                          </button>
                        ) : null}
                        <button
                          className="p2-link-button"
                          type="button"
                          onClick={() => {
                            setOpenTask(expanded ? undefined : task.task_id);
                            setComment('');
                          }}
                        >
                          {expanded ? 'Close' : 'Details'}
                        </button>
                      </div>
                    </td>
                  </tr>,
                  expanded ? (
                    <tr className="p2-task-detail" key={`${task.task_id}-detail`}>
                      <td colSpan={7}>
                        <div className="p2-task-detail__body p2-task-detail__body--clean">
                          <div className="p2-task-context">
                            <div>
                              <span>Origin</span>
                              <strong>{task.origin_kind} · {task.source_type.replaceAll('_', ' ')}</strong>
                            </div>
                            <div>
                              <span>Reference</span>
                              <strong>{referenceSummary(task)}</strong>
                            </div>
                            <div>
                              <span>Task lineage</span>
                              <strong>Round {task.round_number}{task.root_task_id ? ` · Root ${shortId(task.root_task_id)}` : ''}</strong>
                            </div>
                          </div>

                          {task.source_system === 'LEGACY' ? (
                            <div className="p2-task-detail__actions">
                              <p className="p2-note">This task stays on the existing Verigence workflow so its established business action and completion behavior are preserved.</p>
                              <Link className="text-link" to={`/p2/journeys/${task.journey_id}/overview`}>Open Journey 360</Link>
                            </div>
                          ) : (
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
                                {reject ? (
                                  <button
                                    type="button"
                                    className="p2-secondary-action"
                                    disabled={!comment.trim() || action.isPending}
                                    title={!comment.trim() ? 'A rejection comment is required.' : undefined}
                                    onClick={() => action.mutate({ taskId: task.task_id, actionName: reject, note: comment })}
                                  >
                                    {actionLabel(reject)}
                                  </button>
                                ) : null}
                              </div>
                              <Link className="text-link" to={`/p2/journeys/${task.journey_id}/overview`}>Open Journey 360</Link>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  ) : null,
                ];
              })}
              {!query.isLoading && (query.data?.items.length ?? 0) === 0 ? (
                <tr><td colSpan={7} className="p2-empty">No tasks require attention.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}
