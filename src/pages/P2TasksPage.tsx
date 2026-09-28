import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import '../styles/uc03-p2.css';
import '../styles/uc03-p2-workspace.css';

import PageHeader from '../components/PageHeader';
import {
  groupByJourney, taskPlan, vehicleIdentityError, type TaskAction, type VehicleIdentity,
} from '../features/uc03-p2/tasks/p2TaskPlan';
import { formatDateTime, humanizeKey, relativeDue, taskStatus } from '../features/uc03-p2/workspace/p2Format';
import { getP2Task, getP2Tasks, submitP2TaskAction, type P2Task, type P2TaskTab } from '../services/audit-core/uc03P2';
import { useProjectContextStore } from '../store/projectContextStore';
import { useSessionStore } from '../store/sessionStore';

type View = 'open' | 'done';

function errorText(cause: unknown): string {
  return cause instanceof Error && cause.message ? cause.message : 'The action could not be completed.';
}

function VehicleIdForm({ busy, onSubmit }: { busy: boolean; onSubmit: (values: VehicleIdentity) => void }) {
  const [values, setValues] = useState<VehicleIdentity>({ vin: '', chassisNumber: '', engineNumber: '' });
  const [error, setError] = useState<string>();
  const field = (key: keyof VehicleIdentity, label: string, hint: string) => (
    <label>
      <span>{label}</span>
      <input value={values[key]} autoComplete="off" spellCheck={false} placeholder={hint}
        onChange={(event) => { setValues({ ...values, [key]: event.target.value }); setError(undefined); }} />
    </label>
  );
  return (
    <form className="p2w-vehicle-id" onSubmit={(event) => {
      event.preventDefault();
      const problem = vehicleIdentityError(values);
      if (problem) { setError(problem); return; }
      onSubmit(values);
    }}>
      <p className="p2w-muted">No pictures? Enter the number from the car instead. The Team Lead sees it in the delivery review.</p>
      <div className="p2w-vehicle-id__fields">
        {field('vin', 'VIN', '17 characters')}
        {field('chassisNumber', 'Chassis number', 'Optional')}
        {field('engineNumber', 'Engine number', 'Optional')}
      </div>
      {error ? <div className="p2w-alert p2w-alert--error" role="alert">{error}</div> : null}
      <button type="submit" className="p2w-button p2w-button--secondary" disabled={busy}>
        {busy ? 'Saving…' : 'Save vehicle number'}
      </button>
    </form>
  );
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
    mutationFn: (action: TaskAction & { details?: Record<string, unknown> }) =>
      submitP2TaskAction(tenantId, task.task_id, action.action!, accessToken, comment.trim() || undefined, action.details),
    onSuccess: (_, action) => {
      setComment('');
      setError(undefined);
      void queryClient.invalidateQueries({ queryKey: ['p2-tasks', tenantId] });
      void queryClient.invalidateQueries({ queryKey: ['p2-task', tenantId, task.task_id] });
      onDone(action.action === 'ADD_COMMENT' ? 'Comment added.'
        : action.action === 'PROVIDE_VEHICLE_ID' ? 'Vehicle number saved. The task closes itself once it is checked.'
        : task.task_type === 'DELIVERY_REVIEW' ? 'Delivery marked as reviewed.'
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
      {plan.vehicleId ? (
        <VehicleIdForm busy={run.isPending}
          onSubmit={(values) => run.mutate({ label: 'Save vehicle number', action: 'PROVIDE_VEHICLE_ID', tone: 'secondary', details: values })} />
      ) : null}
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
      {detail.data?.events?.length ? (
        <details className="p2w-disclosure">
          <summary>History ({detail.data.events?.length})</summary>
          <ol className="p2w-history">
            {(detail.data.events ?? []).map((event) => (
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

const TABS: Array<{ key: P2TaskTab; label: string }> = [
  { key: 'DOCUMENTS', label: 'Documents' },
  { key: 'MANUAL_VERIFICATION', label: 'Manual Verification' },
  { key: 'ALL', label: 'All' },
];

function TaskRow({ task, open, onToggle, view, tenantId, accessToken, operatingRole, onDone }: {
  task: P2Task; open: boolean; onToggle: () => void; view: View; tenantId?: string; accessToken?: string;
  operatingRole?: string; onDone: (message: string) => void;
}) {
  const status = taskStatus(task.task_status);
  const due = relativeDue(task.due_at_utc);
  const plan = taskPlan(task, operatingRole);
  return (
    <li className={`p2w-task p2w-task--${(task.priority || 'NORMAL').toLowerCase()}${open ? ' is-open' : ''}`}>
      <button type="button" className="p2w-task__row" aria-expanded={open} onClick={onToggle}>
        <span className="p2w-task__main">
          <strong>{task.title}</strong>
          {!open ? <span className="p2w-task__why">{task.description}</span> : null}
        </span>
        <span className="p2w-task__meta">
          <span className={`p2w-chip p2w-chip--${status.tone}`}>
            {['VERIFYING', 'ACTION_COMPLETED'].includes(task.task_status) ? <i className="p2w-spinner" aria-hidden="true" /> : null}
            {status.label}
          </span>
          {view === 'open' ? <span className={due.overdue ? 'p2w-tone p2w-tone--danger' : 'p2w-muted'}>{due.label}</span> : null}
          <span className="p2w-muted">{task.source_system === 'LEGACY' ? 'Phase 1 · ' : ''}{task.assigned_role_code}</span>
          {task.comment_count ? <span className="p2w-muted">{task.comment_count} comment{task.comment_count === 1 ? '' : 's'}</span> : null}
        </span>
      </button>
      {!open && plan.primary?.to ? (
        <div className="p2w-task__quick"><Link className="p2w-button p2w-button--primary" to={plan.primary.to}>{plan.primary.label}</Link></div>
      ) : null}
      {open && tenantId ? (
        <TaskDetail task={task} tenantId={tenantId} accessToken={accessToken} operatingRole={operatingRole} onDone={onDone} />
      ) : null}
    </li>
  );
}

export default function P2TasksPage() {
  const { journeyId: routeJourneyId } = useParams();
  const [search, setSearch] = useSearchParams();
  const journeyId = routeJourneyId ?? search.get('journey') ?? undefined;
  const tenantId = useProjectContextStore((s) => s.selectedProject?.tenantId);
  const operatingRole = useProjectContextStore((s) => s.selectedProject?.operatingRole);
  const accessToken = useSessionStore((s) => s.accessToken);
  const requestedTab = search.get('tab') as P2TaskTab | null;
  const tab: P2TaskTab = TABS.some((t) => t.key === requestedTab) ? requestedTab! : 'ALL';
  const [view, setView] = useState<View>('open');
  const [mine, setMine] = useState(true);
  const [expanded, setExpanded] = useState<string | undefined>(search.get('task') ?? undefined);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState<string>();

  const query = useQuery({
    queryKey: ['p2-tasks', tenantId, journeyId, view, mine ? operatingRole : 'all'],
    // All tabs come from one response (the server returns every tab's count);
    // switching tabs filters locally instead of refetching.
    queryFn: () => getP2Tasks(tenantId!, accessToken, journeyId, {
      view, role: mine && operatingRole ? operatingRole : undefined,
    }),
    enabled: Boolean(tenantId && accessToken),
    staleTime: 5_000,
    // Verification runs in the background: refresh while anything is being checked.
    refetchInterval: (state) => (state.state.data?.items.some((t) => ['VERIFYING', 'ACTION_COMPLETED'].includes(t.task_status)) ? 4_000 : false),
  });
  const all = query.data?.items ?? [];
  const tasks = useMemo(() => (tab === 'ALL' ? all : all.filter((t) => t.queue_tab === tab)), [all, tab]);
  const groups = useMemo(() => groupByJourney(tasks), [tasks]);
  const counts = query.data?.counts;
  const overdue = view === 'open' ? tasks.filter((task) => relativeDue(task.due_at_utc).overdue).length : 0;
  const setTab = (next: P2TaskTab) => {
    const params = new URLSearchParams(search);
    if (next === 'ALL') params.delete('tab'); else params.set('tab', next);
    setSearch(params, { replace: true });
  };
  const toggleGroup = (id: string) => setCollapsed((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  return (
    <div className="screen-stack p2-screen p2w">
      <PageHeader
        eyebrow="Task Queue"
        title={journeyId ? 'Tasks for this booking' : 'Task Queue'}
        description="Everything that needs your action, grouped by booking, most urgent first. Tasks raised by the audit close themselves once the fix is verified."
        actions={journeyId ? (
          <div className="p2w-header-links">
            <Link className="p2w-link" to={`/p2/journeys/${journeyId}/documents`}>Documents</Link>
            <Link className="p2w-link" to="/p2/tasks">All tasks</Link>
          </div>
        ) : undefined}
      />

      <div className="p2w-segment p2w-tabs-main" role="tablist" aria-label="Task type">
        {TABS.map((item) => (
          <button key={item.key} type="button" role="tab" aria-selected={tab === item.key}
            className={tab === item.key ? 'is-active' : ''} onClick={() => setTab(item.key)}>
            {item.label}{counts ? <b>{counts[item.key] ?? 0}</b> : null}
          </button>
        ))}
      </div>

      <div className="p2w-listbar">
        <div className="p2w-segment" role="tablist" aria-label="Task view">
          <button type="button" role="tab" aria-selected={view === 'open'} className={view === 'open' ? 'is-active' : ''} onClick={() => setView('open')}>
            To do
          </button>
          <button type="button" role="tab" aria-selected={view === 'done'} className={view === 'done' ? 'is-active' : ''} onClick={() => setView('done')}>
            Done recently
          </button>
        </div>
        <div className="p2w-filters">
          {operatingRole ? (
            <label className="p2w-check"><input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} /> Only {operatingRole} tasks</label>
          ) : null}
          <span className="p2w-muted">{query.isFetching ? 'Refreshing…' : `${tasks.length} task${tasks.length === 1 ? '' : 's'} · ${groups.length} booking${groups.length === 1 ? '' : 's'}`}</span>
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

      <div className="p2w-task-groups">
        {groups.map((group) => {
          const isCollapsed = collapsed.has(group.journeyId);
          return (
            <section key={group.journeyId} className="p2w-task-group" aria-label={group.customerName ?? 'Booking'}>
              <header className="p2w-task-group__head">
                <button type="button" className="p2w-task-group__toggle" aria-expanded={!isCollapsed}
                  onClick={() => toggleGroup(group.journeyId)}>
                  <span aria-hidden="true">{isCollapsed ? '▸' : '▾'}</span>
                  <strong>{group.customerName || 'Booking'}</strong>
                  <span className="p2w-muted">{[group.vehicle, group.outletName, group.reference].filter(Boolean).join(' · ')}</span>
                </button>
                <span className="p2w-task-group__meta">
                  <span className="p2w-chip p2w-chip--neutral">{group.tasks.length} task{group.tasks.length === 1 ? '' : 's'}</span>
                  {group.overdue ? <span className="p2w-chip p2w-chip--danger">{group.overdue} overdue</span> : null}
                  <Link className="p2w-link" to={`/p2/journeys/${group.journeyId}/overview`}>Journey 360</Link>
                  <Link className="p2w-link" to={`/p2/journeys/${group.journeyId}/documents`}>Documents</Link>
                </span>
              </header>
              {!isCollapsed ? (
                <ul className="p2w-tasks">
                  {group.tasks.map((task) => (
                    <TaskRow key={task.task_id} task={task} view={view} tenantId={tenantId} accessToken={accessToken}
                      operatingRole={operatingRole} open={expanded === task.task_id}
                      onToggle={() => setExpanded(expanded === task.task_id ? undefined : task.task_id)}
                      onDone={(message) => setNotice(message)} />
                  ))}
                </ul>
              ) : null}
            </section>
          );
        })}
        {!query.isLoading && !tasks.length && !query.isError ? (
          <div className="p2w-empty p2w-empty--success">{view === 'open' ? 'Nothing to do right now.' : 'No tasks were completed in the last 14 days.'}</div>
        ) : null}
        {query.isLoading ? <div className="p2w-skeleton">Loading tasks…</div> : null}
      </div>
    </div>
  );
}
