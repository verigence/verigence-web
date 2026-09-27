import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import '../styles/uc03-p2.css';
import '../styles/uc03-p2-workspace.css';

import PageHeader from '../components/PageHeader';
import { compareTasks, taskPlan, type TaskAction } from '../features/uc03-p2/tasks/p2TaskPlan';
import { formatDateTime, humanizeKey, relativeDue, taskStatus } from '../features/uc03-p2/workspace/p2Format';
import { getP2Task, getP2Tasks, submitP2TaskAction, type P2Task } from '../services/audit-core/uc03P2';
import { useProjectContextStore } from '../store/projectContextStore';
import { useSessionStore } from '../store/sessionStore';

type View = 'open' | 'done';

function errorText(cause: unknown): string {
  return cause instanceof Error && cause.message ? cause.message : 'The action could not be completed.';
}

function TaskDetail({ task, tenantId, accessToken, operatingRole, onDone }: {
  task: P2Task;
  tenantId: string;
  accessToken?: string;
  operatingRole?: string;
  onDone: (message: string) => void;
}) {
  const queryClient = useQueryClient();
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string>();
  const detail = useQuery({
    queryKey: ['p2-task', tenantId, task.task_id],
    queryFn: () => getP2Task(tenantId, task.task_id, accessToken),
    enabled: task.source_system !== 'LEGACY',
    staleTime: 5_000,
  });
  const plan = taskPlan(task, operatingRole);
  const run = useMutation({
    mutationFn: (action: TaskAction) =>
      submitP2TaskAction(tenantId, task.task_id, action.action!, accessToken, comment.trim() || undefined),
    onSuccess: (_, action) => {
      setComment('');
      setError(undefined);
      void queryClient.invalidateQueries({ queryKey: ['p2-tasks', tenantId] });
      void queryClient.invalidateQueries({ queryKey: ['p2-task', tenantId, task.task_id] });
      onDone(action.action === 'ADD_COMMENT' ? 'Comment added.'
        : action.action === 'ACCEPT_EXCEPTION' ? 'Accepted as an exception.'
          : task.completion_protocol === 'MACHINE_VERIFIED' && !['APPROVE_CORRECTION', 'REJECT_CORRECTION'].includes(action.action!)
            ? 'Sent for re-check. The task closes itself once the check passes.'
            : 'Done.');
    },
    onError: (cause) => setError(errorText(cause)),
  });

  const trigger = (action: TaskAction) => {
    if (action.requiresComment && !comment.trim()) {
      setError(action.action === 'ADD_COMMENT' ? 'Write a comment first.' : 'Add a short reason in the comment box first.');
      return;
    }
    run.mutate(action);
  };

  const buttons = [plan.primary, ...plan.secondary].filter((item): item is TaskAction => Boolean(item));
  const ref = task.reference ?? {};

  return (
    <div className="p2w-task__detail">
      <p className="p2w-task__description">{task.description}</p>
      {typeof ref.leftValue !== 'undefined' || typeof ref.rightValue !== 'undefined' ? (
        <dl className="p2w-task__compare">
          <div><dt>Found</dt><dd>{String(ref.leftValue ?? '—')}</dd></div>
          <div><dt>Compared with</dt><dd>{String(ref.rightValue ?? '—')}</dd></div>
        </dl>
      ) : null}
      {task.source_code ? <p className="p2w-muted">Reference: {humanizeKey(task.source_code)} · round {task.round_number}</p> : null}
      {plan.waiting ? <div className="p2w-alert" role="status"><i className="p2w-spinner" aria-hidden="true" /> {plan.waiting}</div> : null}
      {task.source_system !== 'LEGACY' ? (
        <label className="p2w-task__comment">
          <span>Comment</span>
          <textarea rows={2} value={comment} onChange={(event) => { setComment(event.target.value); setError(undefined); }}
            placeholder="Add a note for your team" />
        </label>
      ) : null}
      {error ? <div className="p2w-alert p2w-alert--error" role="alert">{error}</div> : null}
      <div className="p2w-task__actions">
        {buttons.map((action) => action.to ? (
          <Link key={action.label} className={`p2w-button p2w-button--${action.tone}`} to={action.to}>{action.label}</Link>
        ) : (
          <button key={action.label} type="button" className={`p2w-button p2w-button--${action.tone}`}
            disabled={run.isPending} onClick={() => trigger(action)}>
            {run.isPending && run.variables?.label === action.label ? 'Working…' : action.label}
          </button>
        ))}
      </div>
      {detail.data?.events.length ? (
        <details className="p2w-disclosure">
          <summary>History ({detail.data.events.length})</summary>
          <ol className="p2w-history">
            {detail.data.events.map((event) => (
              <li key={event.task_event_id}>
                <span>{humanizeKey(event.event_type)}</span>
                <span className="p2w-muted">{event.actor_role_code === 'SYSTEM' ? 'Audit' : event.actor_role_code || ''} · {formatDateTime(event.created_at_utc)}</span>
                {event.comment ? <q>{event.comment}</q> : null}
              </li>
            ))}
          </ol>
        </details>
      ) : null}
    </div>
  );
}

export default function P2TasksPage() {
  const { journeyId: routeJourneyId } = useParams();
  const [search] = useSearchParams();
  const journeyId = routeJourneyId ?? search.get('journey') ?? undefined;
  const tenantId = useProjectContextStore((s) => s.selectedProject?.tenantId);
  const operatingRole = useProjectContextStore((s) => s.selectedProject?.operatingRole);
  const accessToken = useSessionStore((s) => s.accessToken);
  const [view, setView] = useState<View>('open');
  const [mine, setMine] = useState(true);
  const [includeLegacy, setIncludeLegacy] = useState(false);
  const [expanded, setExpanded] = useState<string | undefined>(search.get('task') ?? undefined);
  const [notice, setNotice] = useState<string>();

  const query = useQuery({
    queryKey: ['p2-tasks', tenantId, journeyId, view, mine ? operatingRole : 'all', includeLegacy],
    queryFn: () => getP2Tasks(tenantId!, accessToken, journeyId, {
      view, role: mine && operatingRole ? operatingRole : undefined, includeLegacy,
    }),
    enabled: Boolean(tenantId && accessToken),
    staleTime: 5_000,
    // Verification runs in the background: refresh while anything is being checked.
    refetchInterval: (state) => (state.state.data?.items.some((t) => ['VERIFYING', 'ACTION_COMPLETED'].includes(t.task_status)) ? 4_000 : false),
  });
  const tasks = useMemo(() => [...(query.data?.items ?? [])].sort((a, b) => compareTasks(a, b)), [query.data]);
  const overdue = view === 'open' ? tasks.filter((task) => relativeDue(task.due_at_utc).overdue).length : 0;

  return (
    <div className="screen-stack p2-screen p2w">
      <PageHeader
        eyebrow="Task Queue"
        title={journeyId ? 'Tasks for this booking' : 'Task Queue'}
        description="Everything that needs your action, most urgent first. Tasks raised by the audit close themselves once the fix is verified."
        actions={journeyId ? (
          <div className="p2w-header-links">
            <Link className="p2w-link" to={`/p2/journeys/${journeyId}/documents`}>Documents</Link>
            <Link className="p2w-link" to="/p2/tasks">All tasks</Link>
          </div>
        ) : undefined}
      />

      <div className="p2w-listbar">
        <div className="p2w-segment" role="tablist" aria-label="Task view">
          <button type="button" role="tab" aria-selected={view === 'open'} className={view === 'open' ? 'is-active' : ''} onClick={() => setView('open')}>
            To do {view === 'open' ? <b>{tasks.length}</b> : null}
          </button>
          <button type="button" role="tab" aria-selected={view === 'done'} className={view === 'done' ? 'is-active' : ''} onClick={() => setView('done')}>
            Done recently
          </button>
        </div>
        <div className="p2w-filters">
          {operatingRole ? (
            <label className="p2w-check"><input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} /> Only {operatingRole} tasks</label>
          ) : null}
          <label className="p2w-check"><input type="checkbox" checked={includeLegacy} onChange={(e) => setIncludeLegacy(e.target.checked)} /> Include legacy tasks</label>
        </div>
      </div>

      {overdue ? <div className="p2w-alert p2w-alert--error" role="status">{overdue} task{overdue === 1 ? ' is' : 's are'} past the due time.</div> : null}
      {notice ? (
        <div className="p2w-alert p2w-alert--success" role="status">
          {notice}<button type="button" className="p2w-link" onClick={() => setNotice(undefined)} aria-label="Dismiss">×</button>
        </div>
      ) : null}
      {query.isError ? (
        <div className="p2w-alert p2w-alert--error" role="alert">
          Tasks could not be loaded. {errorText(query.error)}
          <button type="button" className="p2w-link" onClick={() => void query.refetch()}>Try again</button>
        </div>
      ) : null}

      <ul className="p2w-tasks">
        {tasks.map((task) => {
          const status = taskStatus(task.task_status);
          const due = relativeDue(task.due_at_utc);
          const open = expanded === task.task_id;
          const plan = taskPlan(task, operatingRole);
          return (
            <li key={task.task_id} className={`p2w-task p2w-task--${(task.priority || 'NORMAL').toLowerCase()}${open ? ' is-open' : ''}`}>
              <button type="button" className="p2w-task__row" aria-expanded={open} onClick={() => setExpanded(open ? undefined : task.task_id)}>
                <span className="p2w-task__main">
                  <strong>{task.title}</strong>
                  <span>{[task.customer_name, task.vehicle, task.outlet_name].filter(Boolean).join(' · ') || 'Journey'}</span>
                  {!open ? <span className="p2w-task__why">{task.description}</span> : null}
                </span>
                <span className="p2w-task__meta">
                  <span className={`p2w-chip p2w-chip--${status.tone}`}>
                    {['VERIFYING', 'ACTION_COMPLETED'].includes(task.task_status) ? <i className="p2w-spinner" aria-hidden="true" /> : null}
                    {status.label}
                  </span>
                  {view === 'open' ? <span className={due.overdue ? 'p2w-tone p2w-tone--danger' : 'p2w-muted'}>{due.label}</span> : null}
                  <span className="p2w-muted">{humanizeKey(task.priority || 'normal')} · {task.assigned_role_code}</span>
                  {task.comment_count ? <span className="p2w-muted">{task.comment_count} comment{task.comment_count === 1 ? '' : 's'}</span> : null}
                </span>
              </button>
              {!open && plan.primary?.to ? (
                <div className="p2w-task__quick"><Link className="p2w-button p2w-button--primary" to={plan.primary.to}>{plan.primary.label}</Link></div>
              ) : null}
              {open && tenantId ? (
                <TaskDetail task={task} tenantId={tenantId} accessToken={accessToken} operatingRole={operatingRole}
                  onDone={(message) => setNotice(message)} />
              ) : null}
            </li>
          );
        })}
        {!query.isLoading && !tasks.length && !query.isError ? (
          <li className="p2w-empty p2w-empty--success">{view === 'open' ? 'Nothing to do right now.' : 'No tasks were completed in the last 14 days.'}</li>
        ) : null}
        {query.isLoading ? <li className="p2w-skeleton">Loading tasks…</li> : null}
      </ul>
    </div>
  );
}
