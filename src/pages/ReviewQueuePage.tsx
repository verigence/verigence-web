import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';

import PageHeader from '../components/PageHeader';
import { taskAction } from '../services/audit-core/operations';
import { isManualVerificationRule } from '../services/audit-core/manualVerification';
import {
  actOnQueueFinding,
  getReviewQueue,
  getReviewQueueSummary,
  type Uc03FindingClass,
  type Uc03FlagAction,
  type Uc03QueueScope,
  type Uc03QueueSubjectKind,
  type Uc03RejectionCategory,
  type Uc03ReviewQueueItem,
} from '../services/audit-core/uc03Audit';
import { useProjectContextStore } from '../store/projectContextStore';
import { useSessionStore } from '../store/sessionStore';
import '../styles/uc03-review-queue.css';

// A Task's own task_type (category on an EXECUTION_TASK row) -- a human
// label for each of the two kinds this session's backend ever produces.
const TASK_LABEL: Record<string, string> = {
  AUTO_SELF_SERVE: 'Self-serve gap',
  TL_TAKE_ACTION: 'Take Action requested',
};

const CLASS_LABEL: Record<Uc03FindingClass, string> = {
  DATA_GAP: 'Missing data',
  DOCUMENT_GAP: 'Missing document',
  VIOLATION: 'Violation',
};

// 'MANUAL_VERIFICATION' is a client-side-only value -- it's a rule, not a
// finding_class, so it can't be sent as the backend's findingClass filter
// (see classFilterParam below). Kept in the same row as the three real
// classes rather than a separate control: this is the one dimension that
// actually helps a reviewer decide what to work on next. The stage
// (Booking/Delivery) split that used to sit in its own row was dropped
// entirely -- it never helped anyone pick what to work on, per direct
// feedback that it "won't make sense" as a filter here.
const CLASS_FILTERS: { key: 'ALL' | Uc03FindingClass | 'MANUAL_VERIFICATION'; label: string }[] = [
  { key: 'ALL', label: 'Everything' },
  { key: 'DOCUMENT_GAP', label: 'Documents' },
  { key: 'DATA_GAP', label: 'Data' },
  { key: 'VIOLATION', label: 'Violations' },
  { key: 'MANUAL_VERIFICATION', label: 'Manual Verification' },
];

// A self-serve gap's ruleKey stem picks a more specific CTA than the
// generic "Review documents" link -- e.g. MODEL_NOT_IDENTIFIED sends a PC
// straight to the SKU picker on Journey Documents instead of leaving them
// to find it on a page with several other sections.
function ruleKeyStem(ruleKey: string | null | undefined): string | null {
  return ruleKey ? ruleKey.split(':')[0] : null;
}

function friendly(value?: string | null): string {
  if (!value) return '—';
  return value
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function slaLabel(item: Uc03ReviewQueueItem): { text: string; tone: 'ok' | 'soon' | 'late' } {
  if (!item.slaDueAtUtc) return { text: 'No SLA', tone: 'ok' };
  const due = new Date(item.slaDueAtUtc).getTime();
  const diffMs = due - Date.now();
  const hours = Math.round(Math.abs(diffMs) / 3_600_000);
  const human = hours >= 48 ? `${Math.round(hours / 24)}d` : `${Math.max(hours, 1)}h`;
  if (diffMs < 0) return { text: `Overdue ${human}`, tone: 'late' };
  if (diffMs < 4 * 3_600_000) return { text: `Due in ${human}`, tone: 'soon' };
  return { text: `Due in ${human}`, tone: 'ok' };
}

function escalationLabel(item: Uc03ReviewQueueItem): string | null {
  if (item.escalationLevel <= 0) return null;
  const ladder = ['PC', 'TL', 'PM', 'EXECUTIVE'];
  const ownerIdx = ladder.indexOf(item.ownerRoleCode);
  const reached = ladder[Math.min(ownerIdx + item.escalationLevel, ladder.length - 1)];
  return `Escalated to ${friendly(reached)}`;
}

interface DecisionState {
  flagId: string;
  action: Uc03FlagAction;
}

// Required alongside the free-text remark to Mark False Positive -- the
// backend rejects the action outright without one (confirmed live bug:
// this was never being collected/sent at all before).
const REJECTION_CATEGORY_LABEL: Record<Uc03RejectionCategory, string> = {
  NOT_APPLICABLE: 'Not applicable',
  DATA_ALREADY_CORRECT: 'Data is already correct',
  SYSTEM_MISCLASSIFIED: 'System misclassified this',
  DUPLICATE: 'Duplicate of another flag',
  OTHER: 'Other',
};
const SEVERITY_OPTIONS = ['INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;

export default function ReviewQueuePage() {
  const project = useProjectContextStore((state) => state.selectedProject);
  const accessToken = useSessionStore((state) => state.accessToken);
  const queryClient = useQueryClient();

  const role = project?.operatingRole ?? 'PC';
  // Audit View (a read-only view of one journey's findings) links a specific
  // flag here to act on it -- ?findingId=. Land on the broadest scope/filter
  // combination so that one item isn't hidden by whichever bucket/filter
  // happened to be selected, then scroll to and highlight it once loaded.
  const [searchParams] = useSearchParams();
  const findingId = searchParams.get('findingId');
  const [subjectTab, setSubjectTab] = useState<Uc03QueueSubjectKind>('JOURNEY');
  // A PC's 'ALL' and 'MINE' scopes are always the identical item set (see
  // scopeTabs below) and a PC has no 'ALL' tab to land on -- always start a
  // PC on 'MINE', deep link or not.
  const [scope, setScope] = useState<Uc03QueueScope>(role === 'PC' ? 'MINE' : findingId ? 'ALL' : 'MINE');
  const [classFilter, setClassFilter] = useState<'ALL' | Uc03FindingClass | 'MANUAL_VERIFICATION'>('ALL');
  const [decision, setDecision] = useState<DecisionState | null>(null);
  const [reason, setReason] = useState('');
  const [rejectionCategory, setRejectionCategory] = useState<Uc03RejectionCategory | ''>('');
  const [takeActionSeverity, setTakeActionSeverity] = useState<string>('MEDIUM');
  const [banner, setBanner] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);

  const enabled = Boolean(project?.tenantId && accessToken);
  // 'MANUAL_VERIFICATION' is a rule, not a findingClass the backend query
  // understands -- fetch DATA_GAP broadly (every Manual Verification finding
  // is one) and narrow to the rule client-side below.
  const classFilterParam = classFilter === 'ALL' || classFilter === 'MANUAL_VERIFICATION' ? undefined : classFilter;

  const summaryQuery = useQuery({
    queryKey: ['uc03-review-queue-summary', project?.tenantId, subjectTab],
    queryFn: () => getReviewQueueSummary(project!.tenantId, accessToken, subjectTab, true),
    enabled,
  });

  const queueQuery = useQuery({
    queryKey: ['uc03-review-queue', project?.tenantId, subjectTab, scope, classFilterParam],
    queryFn: () =>
      getReviewQueue(
        project!.tenantId,
        {
          scope,
          subjectKind: subjectTab,
          findingClass: classFilterParam,
          includeTasks: true,
        },
        accessToken,
      ),
    enabled,
  });

  const items = (queueQuery.data?.items ?? []).filter(
    (item) => classFilter !== 'MANUAL_VERIFICATION' || isManualVerificationRule(item.ruleKey),
  );
  const roles = queueQuery.data?.roles ?? summaryQuery.data?.roles ?? [];
  const canAdjudicate = roles.some((r) => r === 'TL' || r === 'PM' || r === 'EXECUTIVE');

  const mutation = useMutation({
    mutationFn: ({ item, action }: { item: Uc03ReviewQueueItem; action: Uc03FlagAction }) =>
      actOnQueueFinding(
        project!.tenantId,
        item,
        action,
        reason.trim(),
        accessToken,
        action === 'TAKE_ACTION' ? takeActionSeverity : undefined,
        action === 'MARK_FALSE_POSITIVE' ? (rejectionCategory || undefined) : undefined,
      ),
    onSuccess: (_data, variables) => {
      setBanner({
        tone: 'ok',
        text:
          variables.action === 'CONFIRM_BREACH'
            ? 'Recorded as a confirmed breach.'
            : variables.action === 'MARK_FALSE_POSITIVE'
              ? 'Recorded as a false positive.'
              : variables.action === 'TAKE_ACTION'
                ? 'Task raised for PC.'
                : 'Marked as fixed.',
      });
      setDecision(null);
      setReason('');
      setRejectionCategory('');
      setTakeActionSeverity('MEDIUM');
      void queryClient.invalidateQueries({ queryKey: ['uc03-review-queue'] });
      void queryClient.invalidateQueries({ queryKey: ['uc03-review-queue-summary'] });
    },
    onError: () => {
      setBanner({
        tone: 'err',
        text: 'That decision could not be saved — the item may have changed. Refreshing the queue.',
      });
      void queueQuery.refetch();
    },
  });

  // A Task is self-completed by whoever it's assigned to -- no reviewer
  // gate, and it never touches the Finding it was spawned from (TL/PM
  // still separately decide the Finding's own fate whenever they choose).
  const completeTaskMutation = useMutation({
    mutationFn: (taskId: string) => taskAction(project!.tenantId, taskId, 'complete', accessToken),
    onSuccess: () => {
      setBanner({ tone: 'ok', text: 'Task marked done.' });
      void queryClient.invalidateQueries({ queryKey: ['uc03-review-queue'] });
      void queryClient.invalidateQueries({ queryKey: ['uc03-review-queue-summary'] });
    },
    onError: () => {
      setBanner({
        tone: 'err',
        text: 'That task could not be marked done — it may have changed. Refreshing the queue.',
      });
      void queueQuery.refetch();
    },
  });

  // Escalation only ever flows UP the role ladder (PC -> TL -> PM ->
  // EXECUTIVE) -- nothing is below PC, so nothing can ever be "escalated to"
  // a PC (uc03_finding_routing.py::visible_to_role structurally can't
  // satisfy that for the lowest-ranked role). And because a PC only ever
  // owns/is assigned what a PC can see in the first place, "All in my
  // scope" and "My open items" are mathematically the same set for a PC --
  // showing three tabs where two are always either empty or a duplicate of
  // the first is exactly the "doesn't make sense" confusion reported. A PC
  // gets the one tab that means something; TL/PM/Executive, where escalation
  // and a broader scope are both real and different, keep all three.
  const scopeTabs = useMemo(
    () =>
      role === 'PC'
        ? [{ key: 'MINE' as const, label: 'My open items' }]
        : [
            { key: 'MINE' as const, label: 'Awaiting my decision' },
            { key: 'ESCALATED' as const, label: 'Escalated to me' },
            { key: 'ALL' as const, label: 'All in my scope' },
          ],
    [role],
  );

  const findingTarget = findingId ? items.find((item) => item.flagId === findingId) : undefined;
  useEffect(() => {
    if (!findingId || !findingTarget) return;
    document.getElementById(`revq-item-${findingId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [findingId, findingTarget]);

  // Grouped by Journey by default -- a reviewer working through a deal
  // wants everything raised against it handled together, not scattered
  // across a flat list interleaved with unrelated journeys. Busiest/most
  // urgent journeys first: any overdue item bumps the whole journey to the
  // top, then earliest SLA due date. Daily Operations items have no
  // journey to group by, so that tab stays a flat list.
  const journeyGroups = useMemo(() => {
    if (subjectTab !== 'JOURNEY') return [];
    const byJourney = new Map<string, { journeyId: string; journeyReference: string | null; customerName: string | null; bookingReference: string | null; items: Uc03ReviewQueueItem[] }>();
    for (const item of items) {
      const key = item.journeyId || 'unknown';
      let group = byJourney.get(key);
      if (!group) {
        group = {
          journeyId: item.journeyId || key,
          journeyReference: item.journeyReference,
          customerName: item.customerName,
          bookingReference: item.bookingReference,
          items: [],
        };
        byJourney.set(key, group);
      }
      group.items.push(item);
    }
    return Array.from(byJourney.values()).sort((a, b) => {
      const aOverdue = a.items.some((i) => i.overdue);
      const bOverdue = b.items.some((i) => i.overdue);
      if (aOverdue !== bOverdue) return aOverdue ? -1 : 1;
      const earliestDue = (group: typeof a) =>
        Math.min(...group.items.map((i) => (i.slaDueAtUtc ? new Date(i.slaDueAtUtc).getTime() : Infinity)));
      return earliestDue(a) - earliestDue(b);
    });
  }, [items, subjectTab]);

  if (!project) return null;

  const summary = summaryQuery.data;

  // Same item card either way -- grouping by Journey only changes how
  // items are bucketed above the list, never the card itself or its actions.
  const renderItem = (item: Uc03ReviewQueueItem) => {
    const sla = slaLabel(item);
    const escalated = escalationLabel(item);
    const isTask = item.itemKind === 'EXECUTION_TASK';
    const isAdjudicated = item.resolutionMode === 'ADJUDICATED';
    const isManualVerification = isManualVerificationRule(item.ruleKey);
    const canAccept = item.permittedActions.includes('CONFIRM_BREACH');
    const canResolve = item.permittedActions.includes('RESOLVE');
    const open = decision?.flagId === item.flagId;
    return (
      <li
        key={item.flagId}
        id={`revq-item-${item.flagId}`}
        className={`revq-item revq-item--${item.severity.toLowerCase()}${item.flagId === findingId ? ' revq-item--target' : ''}`}
      >
        <div className="revq-item__head">
          <span className={`revq-sev revq-sev--${item.severity.toLowerCase()}`} aria-label={`${friendly(item.severity)} severity`} />
          {isTask ? (
            <span className="revq-tag revq-tag--task">
              {TASK_LABEL[item.category ?? ''] ?? friendly(item.category)}
            </span>
          ) : (
            <span className={`revq-tag revq-tag--${(item.findingClass ?? '').toLowerCase()}`}>
              {item.findingClass ? CLASS_LABEL[item.findingClass] : friendly(item.category)}
            </span>
          )}
          <span className={`revq-sla revq-sla--${sla.tone}`}>{sla.text}</span>
          {escalated && <span className="revq-escalated">{escalated}</span>}
          <span className="revq-stage">{friendly(item.stage)}</span>
        </div>

        <h3 className="revq-item__title">{item.title}</h3>
        {item.description && item.description !== item.title && (
          <p className="revq-item__desc">{item.description}</p>
        )}

        <div className="revq-item__meta">
          {item.subjectKind === 'DAILY_OPS' ? (
            <>
              <span>{item.outletName || 'Outlet'}</span>
              <span>{item.businessDate ? new Date(item.businessDate).toLocaleDateString('en-IN') : '—'}</span>
            </>
          ) : (
            <>
              <span>{item.customerName || 'Customer'}</span>
              <span>{item.bookingReference || item.journeyReference || '—'}</span>
              <span>{item.outletName || item.dealerName || '—'}</span>
            </>
          )}
          {item.originKind === 'MACHINE' && <span>System check</span>}
        </div>

        <div className="revq-item__actions">
          {item.subjectKind === 'JOURNEY' && (
            // A Finding's "Open case" belongs on Audit Review -- that
            // page IS the finding's own read view (evidence,
            // classification, history). A Task has no per-task content
            // there at all, and Audit Review's own "Take action in
            // Task Queue" link would send it right back here -- send a
            // Task to Journey 360 instead, where there's something to
            // actually look at (documents, payments, overall status).
            <Link
              className="revq-open"
              to={isTask ? `/journeys/${item.journeyId}/overview` : `/audit/${item.journeyId}`}
            >
              Open case
            </Link>
          )}

          {isTask && item.category === 'AUTO_SELF_SERVE' && item.subjectKind === 'JOURNEY' && (
            // Same destination as Manual Verification below, for the
            // same reason: this Task exists because a document/data
            // gap needs fixing, and Journey Documents is where that
            // actually happens. No separate completion step -- fixing
            // it there lets the underlying rule re-check and resolve
            // the Finding on its own, which auto-cancels this Task.
            // A vehicle-model gap has a specific fix (pick the SKU) --
            // send it straight to that picker instead of the generic
            // "review documents" landing.
            <Link
              className="revq-btn revq-btn--accept"
              to={
                ruleKeyStem(item.ruleKey) === 'MODEL_NOT_IDENTIFIED'
                  ? `/journeys/${item.journeyId}/documents?selectSku=1`
                  : `/journeys/${item.journeyId}/documents`
              }
            >
              {ruleKeyStem(item.ruleKey) === 'MODEL_NOT_IDENTIFIED' ? 'Select SKU →' : 'Review documents →'}
            </Link>
          )}

          {isTask && (item.category !== 'AUTO_SELF_SERVE' || item.subjectKind === 'DAILY_OPS') && (
            // Take Action has no auto-resolving rule behind it, and
            // Daily Operations has no document screen a self-serve
            // gap could route to either way -- both self-complete
            // once the requested work is done. Never touches the
            // Finding itself; TL/PM still decide its own verdict
            // separately, whenever they choose.
            <button
              type="button"
              className="revq-btn revq-btn--accept"
              disabled={completeTaskMutation.isPending}
              onClick={() => completeTaskMutation.mutate(item.flagId)}
            >
              {completeTaskMutation.isPending ? 'Marking done…' : 'Mark done'}
            </button>
          )}

          {!isTask && isManualVerification && (
            // Was an inline mini-editor (verify/correct one field at a
            // time, no document preview) duplicating a narrower slice
            // of Journey Documents' own per-field correction screen.
            // Route there instead: every document on the Journey,
            // side by side with its extracted values, corrections
            // split by confidence -- the same page Journey 360 and the
            // unified capture flow already send PCs/TLs to for this
            // exact job, so Manual Verification stops being a second,
            // smaller review surface.
            <Link
              className="revq-btn revq-btn--accept"
              to={`/journeys/${item.journeyId}/documents`}
            >
              Review documents →
            </Link>
          )}

          {!isTask && !isManualVerification && isAdjudicated && canAccept && !open && (
            <>
              <button
                type="button"
                className="revq-btn revq-btn--reject"
                onClick={() => { setDecision({ flagId: item.flagId, action: 'MARK_FALSE_POSITIVE' }); setReason(''); setRejectionCategory(''); }}
              >
                Mark False Positive
              </button>
              <button
                type="button"
                className="revq-btn revq-btn--accept"
                onClick={() => { setDecision({ flagId: item.flagId, action: 'CONFIRM_BREACH' }); setReason(''); }}
              >
                Confirm Breach
              </button>
              {item.permittedActions.includes('TAKE_ACTION') && (
                // Raises a TL_TAKE_ACTION Task assigned to PC (or, when no
                // specific submitter resolves, any PC with business-scope
                // access) -- the bridge from "TL decided this needs work"
                // to an actual Task Queue item, without changing the
                // Finding's own verdict.
                <button
                  type="button"
                  className="revq-btn"
                  onClick={() => { setDecision({ flagId: item.flagId, action: 'TAKE_ACTION' }); setReason(''); setTakeActionSeverity('MEDIUM'); }}
                >
                  Take Action
                </button>
              )}
            </>
          )}

          {!isTask && !isManualVerification && !isAdjudicated && item.subjectKind === 'JOURNEY' && ruleKeyStem(item.ruleKey) === 'MODEL_NOT_IDENTIFIED' && (
            // A bare Finding with no Task yet (e.g. one raised before
            // its self-serve Task existed) would otherwise leave a PC
            // with only "Open case" -> Audit Review, which has no fix
            // action for a self-serve gap. The SKU picker only ever
            // needs the open Finding, not a Task, so route here
            // directly regardless of whether one exists.
            <Link
              className="revq-btn revq-btn--accept"
              to={`/journeys/${item.journeyId}/documents?selectSku=1`}
            >
              Select SKU →
            </Link>
          )}

          {!isTask && !isManualVerification && !isAdjudicated && item.subjectKind === 'JOURNEY' && item.findingClass === 'DOCUMENT_GAP' && ruleKeyStem(item.ruleKey) !== 'MODEL_NOT_IDENTIFIED' && (
            <Link
              className="revq-btn revq-btn--accept"
              to={item.stage === 'DELIVERY' ? `/v2/deliveries/${item.journeyId}` : `/v2/bookings/${item.journeyId}`}
            >
              Upload document →
            </Link>
          )}

          {!isTask && !isManualVerification && !isAdjudicated && item.findingClass !== 'DOCUMENT_GAP' && ruleKeyStem(item.ruleKey) !== 'MODEL_NOT_IDENTIFIED' && canResolve && !open && (
            <button
              type="button"
              className="revq-btn revq-btn--accept"
              onClick={() => { setDecision({ flagId: item.flagId, action: 'RESOLVE' }); setReason(''); }}
            >
              Mark fixed
            </button>
          )}
        </div>

        {open && decision && (
          <form
            className="revq-decide"
            onSubmit={(e) => {
              e.preventDefault();
              if (!reason.trim()) return;
              if (decision.action === 'MARK_FALSE_POSITIVE' && !rejectionCategory) return;
              mutation.mutate({ item, action: decision.action });
            }}
          >
            {decision.action === 'MARK_FALSE_POSITIVE' && (
              <label>
                <span>Why doesn't this apply?</span>
                <select
                  value={rejectionCategory}
                  onChange={(e) => setRejectionCategory(e.target.value as Uc03RejectionCategory)}
                  required
                >
                  <option value="">Select a reason…</option>
                  {Object.entries(REJECTION_CATEGORY_LABEL).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </label>
            )}
            {decision.action === 'TAKE_ACTION' && (
              <label>
                <span>Severity for PC's Task</span>
                <select value={takeActionSeverity} onChange={(e) => setTakeActionSeverity(e.target.value)}>
                  {SEVERITY_OPTIONS.map((value) => <option key={value} value={value}>{friendly(value)}</option>)}
                </select>
              </label>
            )}
            <label>
              <span>
                {decision.action === 'CONFIRM_BREACH'
                  ? 'Why is this a breach?'
                  : decision.action === 'MARK_FALSE_POSITIVE'
                    ? 'Add a short note'
                    : decision.action === 'TAKE_ACTION'
                      ? 'What does PC need to do?'
                      : 'What did you fix?'}
              </span>
              <textarea
                value={reason}
                rows={2}
                maxLength={4000}
                autoFocus
                onChange={(e) => setReason(e.target.value)}
                placeholder="A short note — kept in the audit history"
              />
            </label>
            <div className="revq-decide__actions">
              <button type="button" className="revq-btn" onClick={() => { setDecision(null); setReason(''); setRejectionCategory(''); }}>
                Cancel
              </button>
              <button
                type="submit"
                className={`revq-btn revq-btn--${decision.action === 'MARK_FALSE_POSITIVE' ? 'reject' : 'accept'}`}
                disabled={!reason.trim() || (decision.action === 'MARK_FALSE_POSITIVE' && !rejectionCategory) || mutation.isPending}
              >
                {mutation.isPending
                  ? 'Saving…'
                  : decision.action === 'CONFIRM_BREACH'
                    ? 'Confirm Breach'
                    : decision.action === 'MARK_FALSE_POSITIVE'
                      ? 'Mark False Positive'
                      : decision.action === 'TAKE_ACTION'
                        ? 'Raise Task'
                        : 'Mark fixed'}
              </button>
            </div>
          </form>
        )}
      </li>
    );
  };

  return (
    <div className="screen-stack revq">
      <PageHeader
        eyebrow="Assurance"
        title="Task Queue"
        description={
          canAdjudicate
            ? 'Violations waiting on your Accept / Reject decision, plus Tasks you’ve assigned or that have escalated to you.'
            : 'Everything raised against your journeys — findings to fix and Tasks assigned to you. Fix them here and mark them done.'
        }
      />

      {summary && (
        <div className="revq-kpis" role="group" aria-label="Queue totals">
          <div className={summary.overdue > 0 ? 'is-late' : ''}>
            <span>Overdue</span>
            <strong>{summary.overdue}</strong>
          </div>
          <div>
            <span>{role === 'PC' ? 'Assigned to me' : 'My decisions'}</span>
            <strong>{summary.mine}</strong>
          </div>
          {/* Escalation only ever flows PC -> TL -> PM -> Executive, and a
              PC's own scope is always identical to their own assignments
              (see scopeTabs above) -- both tiles are either always-zero or
              a plain duplicate of "Assigned to me" for a PC, so neither is
              shown to that role. */}
          {role !== 'PC' && (
            <div className={summary.escalatedToMe > 0 ? 'is-escalated' : ''}>
              <span>Escalated to me</span>
              <strong>{summary.escalatedToMe}</strong>
            </div>
          )}
          {role !== 'PC' && (
            <div>
              <span>In my scope</span>
              <strong>{summary.total}</strong>
            </div>
          )}
        </div>
      )}

      {banner && (
        <div className={`revq-banner revq-banner--${banner.tone}`} role="status">
          {banner.text}
        </div>
      )}

      <div className="revq-tabs" role="tablist" aria-label="Queue subject">
        {(['JOURNEY', 'DAILY_OPS'] as const).map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={subjectTab === key}
            className={subjectTab === key ? 'is-active' : ''}
            onClick={() => setSubjectTab(key)}
          >
            {key === 'JOURNEY' ? 'Journey Audits' : 'Daily Operations'}
          </button>
        ))}
      </div>

      <div className="revq-tabs" role="tablist" aria-label="Queue scope">
        {scopeTabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={scope === tab.key}
            className={scope === tab.key ? 'is-active' : ''}
            onClick={() => setScope(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="revq-filters">
        <div className="revq-chips" role="group" aria-label="Type">
          {CLASS_FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              className={classFilter === f.key ? 'is-active' : ''}
              onClick={() => setClassFilter(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {queueQuery.isError && (
        <div className="revq-banner revq-banner--err" role="alert">
          The review queue could not be loaded. <button type="button" onClick={() => void queueQuery.refetch()}>Try again</button>
        </div>
      )}

      {queueQuery.isPending && <div className="revq-empty">Loading your queue…</div>}

      {queueQuery.data && items.length === 0 && (
        <div className="revq-empty">
          {scope === 'ESCALATED'
            ? 'Nothing has escalated to you. '
            : scope === 'MINE'
              ? 'Nothing is waiting on you right now. '
              : 'No open items in your scope. '}
          Nice — you’re clear.
        </div>
      )}

      {queueQuery.data && findingId && !findingTarget && (
        <div className="revq-banner revq-banner--err" role="status">
          That finding isn't in your actionable queue right now — it may already be resolved, or outside your review scope.
        </div>
      )}

      {subjectTab === 'JOURNEY' ? (
        <div className="revq-groups">
          {journeyGroups.map((group) => (
            <section key={group.journeyId} className="revq-group">
              <header className="revq-group__head">
                <Link className="revq-group__title" to={`/journeys/${group.journeyId}/overview`}>
                  {group.customerName || 'Journey'}
                </Link>
                <span className="revq-group__ref">{group.bookingReference || group.journeyReference || '—'}</span>
                <span className="revq-group__count">{group.items.length} item{group.items.length === 1 ? '' : 's'}</span>
                {group.items.some((i) => i.overdue) && <span className="revq-group__overdue">Overdue</span>}
              </header>
              <ul className="revq-list">{group.items.map(renderItem)}</ul>
            </section>
          ))}
        </div>
      ) : (
        <ul className="revq-list">{items.map(renderItem)}</ul>
      )}
    </div>
  );
}
