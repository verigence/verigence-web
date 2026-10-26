import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

import {
  actOnTmTask, getTmTask, type TaskManagerMode, type TmAction, type TmContext, type TmTask,
} from '../../services/audit-core/taskManager';
import {
  durationLabel, flagsOf, formatWhen, kindLabel, personName, roleLabel, statusChip,
} from './tmFormat';

function errorText(cause: unknown): string {
  return cause instanceof Error && cause.message ? cause.message : 'The action could not be completed.';
}

const ACTION_BUTTONS: Record<TmAction, { label: string; tone: string; needsComment: boolean; done: string }> = {
  START: { label: 'Start', tone: 'secondary', needsComment: false, done: 'Marked as started.' },
  COMPLETE_ACTION: { label: 'Mark as done', tone: 'confirm', needsComment: true, done: 'Completed.' },
  ACCEPT: { label: 'Accept and close', tone: 'confirm', needsComment: false, done: 'Accepted. The task is closed.' },
  REJECT: { label: 'Send back', tone: 'danger', needsComment: true, done: 'Sent back with your comment.' },
  ADD_COMMENT: { label: 'Add comment', tone: 'ghost', needsComment: true, done: 'Comment added.' },
  REASSIGN: { label: 'Reassign', tone: 'secondary', needsComment: false, done: 'Reassigned.' },
  CANCEL: { label: 'Cancel task', tone: 'ghost', needsComment: true, done: 'Task cancelled.' },
};

const EVENT_LABELS: Record<string, string> = {
  RAISED: 'Raised', STARTED: 'Started', COMPLETE_ACTION: 'Completed', ACCEPT: 'Accepted', REJECT: 'Sent back',
  ADD_COMMENT: 'Comment', REASSIGNED: 'Reassigned', CANCELLED: 'Cancelled', COMPLETED: 'Closed by the system',
  INCOMPLETE: 'Marked incomplete',
};

export default function TmTaskItem({ task, mode, tenantId, accessToken, context, open, onToggle, onDone }: {
  task: TmTask;
  mode: TaskManagerMode;
  tenantId: string;
  accessToken?: string;
  context?: TmContext;
  open: boolean;
  onToggle: () => void;
  onDone: (message: string) => void;
}) {
  const queryClient = useQueryClient();
  const [comment, setComment] = useState('');
  const [reassignTo, setReassignTo] = useState('');
  const [error, setError] = useState<string>();
  const status = statusChip(task);
  const flags = flagsOf(task);
  const detail = useQuery({
    queryKey: ['tm-task', mode, tenantId, task.taskId],
    queryFn: () => getTmTask(mode, tenantId, task.taskId, accessToken),
    enabled: open,
    staleTime: 5_000,
  });
  const run = useMutation({
    mutationFn: (action: TmAction) => actOnTmTask(
      mode, tenantId, task.taskId, action, accessToken, comment.trim() || undefined,
      action === 'REASSIGN' ? { assigneeActorId: reassignTo } : {},
    ),
    onSuccess: (_, action) => {
      setComment('');
      setReassignTo('');
      setError(undefined);
      void queryClient.invalidateQueries({ queryKey: ['tm-tasks', mode, tenantId] });
      void queryClient.invalidateQueries({ queryKey: ['tm-task', mode, tenantId, task.taskId] });
      void queryClient.invalidateQueries({ queryKey: ['tm-badge'] });
      onDone(ACTION_BUTTONS[action].done);
    },
    onError: (cause) => setError(errorText(cause)),
  });
  const trigger = (action: TmAction) => {
    if (ACTION_BUTTONS[action].needsComment && !comment.trim()) {
      setError(action === 'COMPLETE_ACTION' ? 'Say what was done in the comment box first.'
        : action === 'REJECT' ? 'Say what is still missing in the comment box first.'
        : action === 'CANCEL' ? 'Give the reason for cancelling in the comment box first.'
        : 'Write a comment first.');
      return;
    }
    if (action === 'REASSIGN' && !reassignTo) {
      setError('Choose who the task goes to.');
      return;
    }
    run.mutate(action);
  };
  const actions = task.myActions.filter((a) => a !== 'REASSIGN');
  const canReassign = task.myActions.includes('REASSIGN') && (context?.assignees.length ?? 0) > 0;
  const assignee = task.assignedActorId
    ? personName(task.assignedName, task.assignedActorId)
    : `${task.outletName ? `${task.outletName} · ` : ''}any ${roleLabel(task.assignedRole)}`;
  const reviewer = task.completionProtocol === 'SYSTEM_VERIFIED' ? 'The system (gate pass finished)'
    : task.completionProtocol === 'SELF_CLOSING' ? 'None — closes when completed'
    : task.reviewerActorId ? personName(task.reviewerName, task.reviewerActorId) : `Any ${roleLabel(task.reviewerRole)}`;

  return (
    <li className={`p2w-task p2w-task--${task.priority.toLowerCase()} tm-task${open ? ' is-open' : ''}`}>
      <button type="button" className="p2w-task__row" aria-expanded={open} onClick={onToggle}>
        <span className="p2w-task__main">
          <span className="p2w-task__kind">{kindLabel(task)}{task.occurrenceDate ? ` · ${task.occurrenceDate}` : ''}</span>
          <strong>{task.title}</strong>
          {!open ? <span className="p2w-task__why">{assignee}{task.raisedByName || task.raisedByRole ? ` · from ${personName(task.raisedByName, null, task.raisedByRole)}` : ''}</span> : null}
        </span>
        <span className="p2w-task__meta">
          {task.priority === 'HIGH' || task.priority === 'URGENT' ? <span className="p2w-chip p2w-chip--sev-high">High</span> : null}
          <span className={`p2w-chip p2w-chip--${status.tone}`}>{status.label}</span>
          {flags.map((f) => <span key={f.label} className={`p2w-chip p2w-chip--${f.tone}`}>{f.label}</span>)}
          <span className="p2w-muted">Due {formatWhen(task.dueAtUtc)}</span>
          {task.commentCount ? <span className="p2w-muted">{task.commentCount} comment{task.commentCount === 1 ? '' : 's'}</span> : null}
        </span>
      </button>
      {open ? (
        <div className="p2w-task__detail">
          <p className="p2w-task__description">{task.description}</p>
          <dl className="tm-facts">
            <div><dt>Assigned to</dt><dd>{assignee}</dd></div>
            <div><dt>Raised by</dt><dd>{personName(task.raisedByName, task.raisedByActorId, task.raisedByRole)}{task.raisedByRole ? ` (${roleLabel(task.raisedByRole)})` : ''}</dd></div>
            <div><dt>Reviewer</dt><dd>{reviewer}</dd></div>
            <div><dt>Expected time</dt><dd>{durationLabel(task.expectedCloseMinutes)} · due {formatWhen(task.dueAtUtc)}</dd></div>
            {task.reviewDueAtUtc ? <div><dt>Review due</dt><dd>{formatWhen(task.reviewDueAtUtc)}</dd></div> : null}
            {task.completedAtUtc ? <div><dt>Completed</dt><dd>{formatWhen(task.completedAtUtc)}{task.completedByName ? ` by ${task.completedByName}` : ''}</dd></div> : null}
            {task.sendBacks ? <div><dt>Sent back</dt><dd>{task.sendBacks} time{task.sendBacks === 1 ? '' : 's'}</dd></div> : null}
            {task.kind === 'GATE_PASS' && typeof task.reference.businessDate === 'string' ? (
              <div><dt>Gate pass</dt><dd><Link className="p2w-link" to="/p2/gate-pass">Open the Daily Gate Pass screen</Link></dd></div>
            ) : null}
          </dl>
          {actions.length || canReassign ? (
            <label className="p2w-task__comment">
              <span>Comment</span>
              <textarea rows={2} value={comment} maxLength={4000} onChange={(e) => { setComment(e.target.value); setError(undefined); }}
                placeholder={actions.includes('COMPLETE_ACTION') ? 'What was done (needed to complete)' : 'Add a note'} />
            </label>
          ) : null}
          {canReassign ? (
            <div className="tm-reassign">
              <select value={reassignTo} onChange={(e) => { setReassignTo(e.target.value); setError(undefined); }}>
                <option value="">Reassign to…</option>
                {context!.assignees.filter((p) => p.actorId !== task.assignedActorId).map((p) => (
                  <option key={p.actorId} value={p.actorId}>{personName(p.displayName, p.actorId)} · {roleLabel(p.roleCode)}</option>
                ))}
              </select>
              <button type="button" className="p2w-button p2w-button--secondary" disabled={run.isPending || !reassignTo}
                onClick={() => trigger('REASSIGN')}>Reassign</button>
            </div>
          ) : null}
          {error ? <div className="p2w-alert p2w-alert--error" role="alert">{error}</div> : null}
          {actions.length ? (
            <div className="p2w-task__actions">
              {actions.map((action) => (
                <button key={action} type="button" className={`p2w-button p2w-button--${ACTION_BUTTONS[action].tone}`}
                  disabled={run.isPending} onClick={() => trigger(action)}>
                  {run.isPending && run.variables === action ? 'Working…' : ACTION_BUTTONS[action].label}
                </button>
              ))}
            </div>
          ) : null}
          {detail.data?.events.length ? (
            <details className="p2w-disclosure" open>
              <summary>History ({detail.data.events.length})</summary>
              <ol className="p2w-history">
                {detail.data.events.map((event, index) => (
                  <li key={`${event.atUtc}-${index}`}>
                    <span>{EVENT_LABELS[event.eventType] ?? event.eventType}</span>
                    <span className="p2w-muted">
                      {personName(event.actorName, event.actorId === 'SYSTEM' ? 'System' : event.actorId)}
                      {event.actorRole && event.actorRole !== 'SYSTEM' ? ` (${roleLabel(event.actorRole)})` : ''} · {formatWhen(event.atUtc)}
                    </span>
                    {event.comment ? <q>{event.comment}</q> : null}
                  </li>
                ))}
              </ol>
            </details>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}
