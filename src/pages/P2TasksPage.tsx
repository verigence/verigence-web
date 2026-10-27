import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import '../styles/uc03-p2.css';
import '../styles/uc03-p2-workspace.css';

import BackLink from '../components/BackLink';
import PageHeader from '../components/PageHeader';
import RaiseTaskDialog from '../features/uc03-p2/tasks/RaiseTaskDialog';
import TaskManagerPanel from '../features/task-manager/TaskManagerPanel';
import RemovePageDialog, { removablePages, removalPagesText, removeOptions, type RemovablePage } from '../features/uc03-p2/workspace/RemovePageDialog';
import {
  DOCUMENT_CATEGORIES, documentCategoryLabel, documentCounts, documentFilter, documentOpenLink, pagesText, visibleTasks,
  type DocumentFilter,
} from '../features/uc03-p2/tasks/documentGroups';
import {
  groupByJourney, taskPlan, vehicleIdentityError, type TaskAction, type VehicleIdentity,
} from '../features/uc03-p2/tasks/p2TaskPlan';
import { formatDateTime, humanizeKey, relativeDue, taskStatus } from '../features/uc03-p2/workspace/p2Format';
import {
  getP2Task, getP2Tasks, removeP2Page, submitP2TaskAction, type P2Task, type P2TaskTab,
} from '../services/audit-core/uc03P2';
import { getTmTasks } from '../services/audit-core/taskManager';
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

function ManagementReferralForm({ busy, proposedAmount, proposedReason, onSubmit }: {
  busy: boolean; proposedAmount?: string; proposedReason?: string; onSubmit: (values: { amount: string; reason: string }) => void;
}) {
  const [amount, setAmount] = useState(proposedAmount ?? '');
  const [reason, setReason] = useState(proposedReason ?? '');
  return (
    <form className="p2w-vehicle-id" onSubmit={(event) => { event.preventDefault(); onSubmit({ amount: String(Number(amount)), reason: reason.trim() }); }}>
      <p className="p2w-muted">Completing this task enables the Management Referral discount on the journey for the amount below.</p>
      <div className="p2w-vehicle-id__fields">
        <label><span>Approved amount (₹)</span><input type="number" min={1} step="1" value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
        <label><span>Reason</span><input value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} placeholder="Why this referral" /></label>
      </div>
      <button type="submit" className="p2w-button p2w-button--confirm" disabled={busy || !(Number(amount) > 0) || reason.trim().length < 5}>
        {busy ? 'Enabling…' : 'Enable MR'}
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
  const navigate = useNavigate();
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
      if (task.task_type === 'SKU_CLOSEST_MATCH_CONFIRM' && action.action === 'REJECT') {
        // Rejected: pick the SKU by hand in the journey's model picker.
        navigate(`/p2/journeys/${task.journey_id}/documents?resolveSku=1`);
        return;
      }
      onDone(action.action === 'ADD_COMMENT' ? 'Comment added.'
        : action.action === 'CLOSE_TASK' ? 'Task closed.'
        : task.task_type === 'SKU_CLOSEST_MATCH_CONFIRM' ? 'Vehicle confirmed. The deal is now checked against its price.'
        : task.task_type === 'SKU_OTHER_MONTH_PRICE_LIST' && action.action === 'ACCEPT' ? 'Approved. The journey is now priced on that list and its SKU resolved there.'
        : task.task_type === 'SKU_OTHER_MONTH_PRICE_LIST' ? 'Rejected. The PC picks the SKU by hand.'
        : task.task_type === 'MODEL_CHANGED_BY_INVOICE' ? 'Noted.'
        : action.action === 'PROVIDE_VEHICLE_ID' ? 'Vehicle number saved. The task closes itself once it is checked.'
        : task.task_type === 'TL_MANAGEMENT_REFERRAL' && action.action === 'COMPLETE_ACTION' ? 'Management Referral enabled on the journey.'
        : task.task_type === 'DELIVERY_REVIEW' ? 'Delivery marked as reviewed.'
        : action.action === 'CONFIRM_BREACH' ? 'Breach confirmed. The finding is closed with your verdict.'
        : action.action === 'MARK_FALSE_POSITIVE' ? 'Rejected as a false positive. The finding is closed.'
        : action.details && 'answer' in action.details ? 'Answer recorded. The task closes itself once it is checked.'
        : action.action === 'ACCEPT_EXCEPTION' ? 'Accepted as an exception.'
          : task.completion_protocol === 'MACHINE_VERIFIED' && !['APPROVE_CORRECTION', 'REJECT_CORRECTION'].includes(action.action!)
            ? 'Sent for re-check. The task closes itself once the check passes.'
            : 'Done.');
    },
    onError: (cause) => setError(errorText(cause)),
  });

  const trigger = (action: TaskAction) => {
    if (action.requiresComment && !comment.trim()) {
      setError(action.action === 'ADD_COMMENT' ? 'Write a comment first.'
        : action.action === 'CLOSE_TASK' ? 'Write a comment in the comment box to close this task.'
        : task.task_type === 'INSURANCE_SOURCE_CONFIRM' ? 'Write the Agent code / MISP code in the comment box first.'
        : 'Add a short reason in the comment box first.');
      return;
    }
    run.mutate(action);
  };

  const buttons = [plan.primary, ...plan.secondary].filter((item): item is TaskAction => Boolean(item));
  const ref = task.reference ?? {};
  // A file's refused or failed pages (2026-10-21): once the re-scan is uploaded,
  // each page is taken off the booking from here, and the task closes. The
  // "Document to resubmit" task has the same buttons for its failed pages
  // (2026-10-22): the day-end sweep hides a failed page from the page list, so
  // this is where the PC removes it. Nothing is offered on a closed task.
  const [removing, setRemoving] = useState<RemovablePage>();
  const { pages: refused, fallbackLink } = removeOptions(task, Boolean(plan.primary));
  const removePage = useMutation({
    mutationFn: ({ queueId, reason }: { queueId: string; reason: string }) =>
      removeP2Page(tenantId, task.journey_id, queueId, reason, accessToken),
    onSuccess: (_, { queueId }) => {
      setRemoving(undefined);
      void queryClient.invalidateQueries({ queryKey: ['p2-tasks', tenantId] });
      void queryClient.invalidateQueries({ queryKey: ['p2-task', tenantId, task.task_id] });
      const pages = refused.find((item) => item.queueId === queueId)?.pages;
      const label = pages ? removalPagesText(pages) : 'the page';
      onDone(`${label.charAt(0).toUpperCase()}${label.slice(1)} removed from the booking.${refused.length <= 1 ? ' The task closes.' : ''}`);
    },
    onError: (cause) => { setRemoving(undefined); setError(errorText(cause)); },
  });

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
      {plan.managementReferral ? (
        <ManagementReferralForm busy={run.isPending}
          proposedAmount={typeof ref.proposedAmount === 'string' ? ref.proposedAmount : undefined}
          proposedReason={typeof ref.reason === 'string' ? ref.reason : undefined}
          onSubmit={(values) => run.mutate({ label: 'Enable MR', action: 'COMPLETE_ACTION', tone: 'confirm', details: values })} />
      ) : null}
      {task.source_system !== 'LEGACY' ? (
        <label className="p2w-task__comment">
          <span>Comment</span>
          <textarea rows={2} value={comment} onChange={(event) => { setComment(event.target.value); setError(undefined); }}
            placeholder={buttons.some((item) => item.action === 'CLOSE_TASK')
              ? 'Add a note for your team. Closing the task needs a comment.' : 'Add a note for your team'} />
        </label>
      ) : null}
      {error ? <div className="p2w-alert p2w-alert--error" role="alert">{error}</div> : null}
      {refused.length || fallbackLink ? (
        <div className="p2w-task__actions">
          {refused.map((item) => (
            <button key={item.queueId} type="button" className="p2w-button p2w-button--danger" disabled={removePage.isPending}
              title="Once the re-scan is uploaded, take the page off the booking."
              onClick={() => setRemoving(item)}>
              Remove {removalPagesText(item.pages)}
            </button>
          ))}
          {fallbackLink ? (
            <Link className="p2w-link" to={`/p2/journeys/${task.journey_id}/documents`}>Remove the refused page on Upload / Edit Documents</Link>
          ) : null}
        </div>
      ) : null}
      {removing ? (
        <RemovePageDialog pageLabel={`${removalPagesText(removing.pages)} of ${String(ref.filename ?? 'the file')}`} busy={removePage.isPending}
          onCancel={() => setRemoving(undefined)}
          onConfirm={(reason) => removePage.mutate({ queueId: removing.queueId, reason })} />
      ) : null}
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

// Documents holds every piece of document work in four categories (product
// owner 2026-10-21), field reviews included; Confirmations keeps what is
// left of the old Manual Verification tab (SKU, vehicle, answers to checks).
const TABS: Array<{ key: P2TaskTab; label: string; hint?: string }> = [
  { key: 'DOCUMENTS', label: 'Documents', hint: 'Manual verification, failed to read, image quality and missing documents' },
  { key: 'MANUAL_VERIFICATION', label: 'Confirmations', hint: 'SKU, vehicle and answers the checks need: not about a document page' },
  { key: 'ALL', label: 'All' },
];

/** How serious a task is, as a chip the PC can read at a glance. */
function severityChip(severity?: string | null): { label: string; tone: 'critical' | 'high' | 'medium' | 'low' | 'info' } {
  // Soft tones on purpose (2026-09-30): a queue full of red is hard on
  // the eyes; the chip ranks tasks, it does not shout.
  switch (String(severity || '').toUpperCase()) {
    case 'CRITICAL': return { label: 'Critical', tone: 'critical' };
    case 'HIGH': return { label: 'High', tone: 'high' };
    case 'LOW': return { label: 'Low', tone: 'low' };
    case 'INFO': return { label: 'Info', tone: 'info' };
    default: return { label: 'Medium', tone: 'medium' };
  }
}

function TaskRow({ task, open, onToggle, view, tenantId, accessToken, operatingRole, onDone }: {
  task: P2Task; open: boolean; onToggle: () => void; view: View; tenantId?: string; accessToken?: string;
  operatingRole?: string; onDone: (message: string) => void;
}) {
  const status = taskStatus(task.task_status);
  const due = relativeDue(task.due_at_utc);
  const plan = taskPlan(task, operatingRole);
  const openDocument = documentOpenLink(task);
  return (
    <li className={`p2w-task p2w-task--${(task.priority || 'NORMAL').toLowerCase()} p2w-task--${taskKind(task).key}${open ? ' is-open' : ''}`}>
      <button type="button" className="p2w-task__row" aria-expanded={open} onClick={onToggle}>
        <span className="p2w-task__main">
          <span className="p2w-task__kind">{taskKind(task).label}</span>
          <strong>{task.title}</strong>
          {task.document ? <DocumentLine task={task} /> : null}
          {!open && !task.document ? <span className="p2w-task__why">{task.description}</span> : null}
        </span>
        <span className="p2w-task__meta">
          <span className={`p2w-chip p2w-chip--sev-${severityChip(task.severity).tone}`} title="Severity">
            {severityChip(task.severity).label}
          </span>
          <span className={`p2w-chip p2w-chip--${status.tone}`}>
            {['VERIFYING', 'ACTION_COMPLETED'].includes(task.task_status) ? <i className="p2w-spinner" aria-hidden="true" /> : null}
            {status.label}
          </span>
          {view === 'open' ? <span className={due.overdue ? 'p2w-tone p2w-tone--danger' : 'p2w-muted'}>{due.label}</span> : null}
          <span className="p2w-muted">
            {task.source_system === 'LEGACY' ? 'Phase 1 · ' : ''}{task.assigned_role_code}
            {task.origin_kind === 'HUMAN' && task.raised_by_role_code ? ` · raised by ${task.raised_by_role_code}` : ''}
          </span>
          {task.comment_count ? <span className="p2w-muted">{task.comment_count} comment{task.comment_count === 1 ? '' : 's'}</span> : null}
        </span>
      </button>
      {!open && (plan.primary?.to || openDocument) ? (
        <div className="p2w-task__quick">
          {plan.primary?.to ? <Link className="p2w-button p2w-button--primary" to={plan.primary.to}>{plan.primary.label}</Link> : null}
          {openDocument && openDocument !== plan.primary?.to?.split('?')[0] ? (
            <Link className="p2w-link" to={openDocument}>Open document</Link>
          ) : null}
        </div>
      ) : null}
      {open && tenantId ? (
        <TaskDetail task={task} tenantId={tenantId} accessToken={accessToken} operatingRole={operatingRole} onDone={onDone} />
      ) : null}
    </li>
  );
}

/** A document task's file, page(s) and reason, in plain words. */
function DocumentLine({ task }: { task: P2Task }) {
  const doc = task.document!;
  const where = [doc.file, pagesText(doc.pages)].filter(Boolean).join(' · ');
  return (
    <span className="p2w-task__doc">
      {where ? <b>{where}</b> : null}
      {doc.reason ? <span>{doc.reason}</span> : null}
    </span>
  );
}

/** What kind of work a task is, for the colour on its card: document work
 * (by its Documents category), a value to confirm, data the audit could not
 * find, or a check that failed. */
function taskKind(task: P2Task): { key: 'documents' | 'verify' | 'data' | 'check'; label: string } {
  if (task.task_type === 'TL_MANAGEMENT_REFERRAL') return { key: 'check', label: 'System task' };
  if (task.task_type === 'TL_DATA_VIOLATION') return { key: 'check', label: 'Data violation' };
  if (task.task_type === 'MODEL_CHANGED_BY_INVOICE') return { key: 'check', label: 'Information' };
  if (task.document_category) {
    return {
      key: task.document_category === 'MANUAL_VERIFICATION' ? 'verify' : 'documents',
      label: documentCategoryLabel(task.document_category),
    };
  }
  if (task.queue_tab === 'MANUAL_VERIFICATION') return { key: 'verify', label: 'Confirmation' };
  if (task.queue_tab === 'DOCUMENTS') return { key: 'documents', label: 'Document' };
  const text = `${task.task_type} ${task.category}`.toUpperCase();
  if (/MISSING|GAP|EMPTY|DATA/.test(text)) return { key: 'data', label: 'Data missing' };
  return { key: 'check', label: 'Check failed' };
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
  const docFilter: DocumentFilter = tab === 'DOCUMENTS' ? documentFilter(search.get('doc')) : 'ALL';
  const [view, setView] = useState<View>('open');
  const [mine, setMine] = useState(true);
  const [expanded, setExpanded] = useState<string | undefined>(search.get('task') ?? undefined);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState<string>();
  const [raising, setRaising] = useState(false);
  const supervisor = operatingRole === 'TL' || operatingRole === 'PM';
  // Two classifications (product owner 2026-10-27): Journey tasks (with the
  // document grouping under them) and Task Manager tasks (not tied to a booking:
  // raised to a person, recurring, the daily gate pass). A booking's own queue
  // only has Journey tasks.
  const taskManagerScope = !journeyId && search.get('scope') === 'tm';
  const setScope = (next: 'journey' | 'tm') => {
    const params = new URLSearchParams(search);
    if (next === 'tm') { params.set('scope', 'tm'); params.delete('tab'); params.delete('doc'); }
    else params.delete('scope');
    setSearch(params, { replace: true });
  };
  const taskManagerCounts = useQuery({
    queryKey: ['tm-badge', tenantId, operatingRole],
    queryFn: () => getTmTasks('project', tenantId!, 'mine', 'open', accessToken),
    enabled: Boolean(tenantId && accessToken && !journeyId),
    staleTime: 60_000,
    refetchInterval: 120_000,
  });
  const taskManagerCount = taskManagerCounts.data?.counts?.ACTION;

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
  const tasks = useMemo(() => visibleTasks(all, tab, docFilter), [all, tab, docFilter]);
  const docCounts = documentCounts(all, query.data?.documentCounts);
  const docCountsByJourney = query.data?.documentCountsByJourney;
  // A link can name the kind(s) of task to open (the Upload / Edit banner
  // opens the file's "pages to upload again" or image-quality task): expand
  // the first one.
  const openType = search.get('open');
  useEffect(() => {
    if (!openType || expanded || !all.length) return;
    const types = openType.split(',');
    const wanted = all.find((t) => types.includes(t.task_type));
    if (wanted) setExpanded(wanted.task_id);
  }, [openType, expanded, all]);
  const groups = useMemo(() => groupByJourney(tasks), [tasks]);
  const counts = query.data?.counts;
  const overdue = view === 'open' ? tasks.filter((task) => relativeDue(task.due_at_utc).overdue).length : 0;
  const setTab = (next: P2TaskTab) => {
    const params = new URLSearchParams(search);
    if (next === 'ALL') params.delete('tab'); else params.set('tab', next);
    if (next !== 'DOCUMENTS') params.delete('doc');
    setSearch(params, { replace: true });
  };
  const setDocFilter = (next: DocumentFilter) => {
    const params = new URLSearchParams(search);
    params.set('tab', 'DOCUMENTS');
    if (next === 'ALL') params.delete('doc'); else params.set('doc', next);
    setSearch(params, { replace: true });
  };
  const toggleGroup = (id: string) => setCollapsed((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  return (
    <div className="screen-stack p2-screen p2w">
      <BackLink fallbackTo={journeyId ? `/p2/journeys/${journeyId}/overview` : '/p2/bookings'}
        fallbackLabel={journeyId ? 'Journey 360' : 'Booking & Delivery'} />
      <PageHeader
        eyebrow="Task Queue"
        title={journeyId ? 'Tasks for this booking' : 'Task Queue'}
        description={taskManagerScope
          ? 'Tasks not tied to a booking: raised to you or by you, recurring tasks and the daily gate pass. Each has an expected time to close.'
          : 'Everything that needs your action, grouped by booking, most urgent first. Tasks raised by the audit close themselves once the fix is verified.'}
        actions={(
          <div className="p2w-header-links">
            {supervisor && tenantId && !taskManagerScope ? (
              <button type="button" className="p2w-button p2w-button--primary" onClick={() => setRaising(true)}>Raise a task</button>
            ) : null}
            {journeyId ? <Link className="p2w-link" to={`/p2/journeys/${journeyId}/documents`}>Documents</Link> : null}
            {journeyId ? <Link className="p2w-link" to="/p2/tasks">All tasks</Link> : null}
          </div>
        )}
      />
      {raising && tenantId ? (
        <RaiseTaskDialog tenantId={tenantId} accessToken={accessToken} journeyId={journeyId}
          onClose={() => setRaising(false)} onRaised={(message) => { setRaising(false); setNotice(message); }} />
      ) : null}

      {!journeyId ? (
        <div className="p2w-segment p2w-tabs-main p2w-task-scope" role="tablist" aria-label="Task classification">
          <button type="button" role="tab" aria-selected={!taskManagerScope} className={!taskManagerScope ? 'is-active' : ''}
            title="Tasks on bookings and deliveries: documents, confirmations and checks" onClick={() => setScope('journey')}>
            Journey tasks{counts ? <b>{counts.ALL ?? 0}</b> : null}
          </button>
          <button type="button" role="tab" aria-selected={taskManagerScope} className={taskManagerScope ? 'is-active' : ''}
            title="Tasks raised to people, recurring tasks and the daily gate pass" onClick={() => setScope('tm')}>
            Task Manager tasks{typeof taskManagerCount === 'number' ? <b>{taskManagerCount}</b> : null}
          </button>
        </div>
      ) : null}

      {taskManagerScope && tenantId ? (
        <TaskManagerPanel mode="project" tenantId={tenantId} accessToken={accessToken} />
      ) : (<>
      <div className="p2w-segment p2w-tabs-main" role="tablist" aria-label="Task type">
        {TABS.map((item) => (
          <button key={item.key} type="button" role="tab" aria-selected={tab === item.key} title={item.hint}
            className={tab === item.key ? 'is-active' : ''} onClick={() => setTab(item.key)}>
            {item.label}{counts ? <b>{counts[item.key] ?? 0}</b> : null}
          </button>
        ))}
      </div>

      {tab === 'DOCUMENTS' ? (
        <div className="p2w-doc-cats" role="tablist" aria-label="Document task category">
          <button type="button" role="tab" aria-selected={docFilter === 'ALL'} className={docFilter === 'ALL' ? 'is-active' : ''}
            onClick={() => setDocFilter('ALL')}>
            All documents <b>{docCounts.TOTAL}</b>
          </button>
          {DOCUMENT_CATEGORIES.map((item) => (
            <button key={item.key} type="button" role="tab" aria-selected={docFilter === item.key} title={item.hint}
              className={docFilter === item.key ? 'is-active' : ''}
              onClick={() => setDocFilter(item.key)}>
              {item.label} <b>{docCounts[item.key]}</b>
            </button>
          ))}
        </div>
      ) : null}

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
                  {tab === 'DOCUMENTS' && docFilter === 'ALL' && docCountsByJourney?.[group.journeyId]
                    ? DOCUMENT_CATEGORIES.filter((item) => docCountsByJourney[group.journeyId][item.key] > 0).map((item) => (
                      <span key={item.key} className="p2w-chip p2w-chip--neutral" title={item.hint}>
                        {item.label} {docCountsByJourney[group.journeyId][item.key]}
                      </span>
                    ))
                    : null}
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
          <div className="p2w-empty p2w-empty--success">
            {view === 'open'
              ? (docFilter !== 'ALL' ? `No ${DOCUMENT_CATEGORIES.find((item) => item.key === docFilter)?.label.toLowerCase()} tasks right now.` : 'Nothing to do right now.')
              : 'No tasks were completed in the last 14 days.'}
          </div>
        ) : null}
        {query.isLoading ? <div className="p2w-skeleton">Loading tasks…</div> : null}
      </div>
      </>)}
    </div>
  );
}
