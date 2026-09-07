import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

import PageHeader from '../components/PageHeader';
import {
  actOnQueueFinding,
  getReviewQueue,
  getReviewQueueSummary,
  type Uc03FindingClass,
  type Uc03FlagAction,
  type Uc03QueueScope,
  type Uc03ReviewQueueItem,
  type Uc03StageCode,
} from '../services/audit-core/uc03Audit';
import { useProjectContextStore } from '../store/projectContextStore';
import { useSessionStore } from '../store/sessionStore';
import '../styles/uc03-review-queue.css';

const CLASS_LABEL: Record<Uc03FindingClass, string> = {
  DATA_GAP: 'Missing data',
  DOCUMENT_GAP: 'Missing document',
  VIOLATION: 'Violation',
};

const CLASS_FILTERS: { key: 'ALL' | Uc03FindingClass; label: string }[] = [
  { key: 'ALL', label: 'Everything' },
  { key: 'DOCUMENT_GAP', label: 'Documents' },
  { key: 'DATA_GAP', label: 'Data' },
  { key: 'VIOLATION', label: 'Violations' },
];

const STAGE_FILTERS: { key: 'ALL' | Uc03StageCode; label: string }[] = [
  { key: 'ALL', label: 'All stages' },
  { key: 'BOOKING', label: 'Booking' },
  { key: 'DELIVERY', label: 'Delivery' },
];

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

export default function ReviewQueuePage() {
  const project = useProjectContextStore((state) => state.selectedProject);
  const accessToken = useSessionStore((state) => state.accessToken);
  const queryClient = useQueryClient();

  const role = project?.operatingRole ?? 'PC';
  const [scope, setScope] = useState<Uc03QueueScope>(role === 'PC' ? 'MINE' : 'MINE');
  const [classFilter, setClassFilter] = useState<'ALL' | Uc03FindingClass>('ALL');
  const [stageFilter, setStageFilter] = useState<'ALL' | Uc03StageCode>('ALL');
  const [decision, setDecision] = useState<DecisionState | null>(null);
  const [reason, setReason] = useState('');
  const [banner, setBanner] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);

  const enabled = Boolean(project?.tenantId && accessToken);

  const summaryQuery = useQuery({
    queryKey: ['uc03-review-queue-summary', project?.tenantId],
    queryFn: () => getReviewQueueSummary(project!.tenantId, accessToken),
    enabled,
  });

  const queueQuery = useQuery({
    queryKey: ['uc03-review-queue', project?.tenantId, scope, classFilter, stageFilter],
    queryFn: () =>
      getReviewQueue(
        project!.tenantId,
        {
          scope,
          findingClass: classFilter === 'ALL' ? undefined : classFilter,
          stage: stageFilter === 'ALL' ? undefined : stageFilter,
        },
        accessToken,
      ),
    enabled,
  });

  const items = queueQuery.data?.items ?? [];
  const roles = queueQuery.data?.roles ?? summaryQuery.data?.roles ?? [];
  const canAdjudicate = roles.some((r) => r === 'TL' || r === 'PM' || r === 'EXECUTIVE');

  const mutation = useMutation({
    mutationFn: ({ item, action }: { item: Uc03ReviewQueueItem; action: Uc03FlagAction }) =>
      actOnQueueFinding(project!.tenantId, item, action, reason.trim(), accessToken),
    onSuccess: (_data, variables) => {
      setBanner({
        tone: 'ok',
        text:
          variables.action === 'ACCEPT'
            ? 'Recorded as a confirmed breach.'
            : variables.action === 'REJECT'
              ? 'Recorded as not a breach.'
              : 'Marked as fixed.',
      });
      setDecision(null);
      setReason('');
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

  const scopeTabs = useMemo(
    () => [
      { key: 'MINE' as const, label: role === 'PC' ? 'My open items' : 'Awaiting my decision' },
      { key: 'ESCALATED' as const, label: 'Escalated to me' },
      { key: 'ALL' as const, label: 'All in my scope' },
    ],
    [role],
  );

  if (!project) return null;

  const summary = summaryQuery.data;

  return (
    <div className="screen-stack revq">
      <PageHeader
        eyebrow="Assurance"
        title="Review Queue"
        description={
          canAdjudicate
            ? 'Violations waiting on your Accept / Reject decision, plus anything that has passed its SLA and escalated to you.'
            : 'The data and documents your journeys still need. Fix them here and mark them done.'
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
          <div className={summary.escalatedToMe > 0 ? 'is-escalated' : ''}>
            <span>Escalated to me</span>
            <strong>{summary.escalatedToMe}</strong>
          </div>
          <div>
            <span>In my scope</span>
            <strong>{summary.total}</strong>
          </div>
        </div>
      )}

      {banner && (
        <div className={`revq-banner revq-banner--${banner.tone}`} role="status">
          {banner.text}
        </div>
      )}

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
        <div className="revq-chips" role="group" aria-label="Stage">
          {STAGE_FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              className={stageFilter === f.key ? 'is-active' : ''}
              onClick={() => setStageFilter(f.key)}
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

      <ul className="revq-list">
        {items.map((item) => {
          const sla = slaLabel(item);
          const escalated = escalationLabel(item);
          const isAdjudicated = item.resolutionMode === 'ADJUDICATED';
          const canAccept = item.permittedActions.includes('ACCEPT');
          const canResolve = item.permittedActions.includes('RESOLVE');
          const open = decision?.flagId === item.flagId;
          return (
            <li key={item.flagId} className={`revq-item revq-item--${item.severity.toLowerCase()}`}>
              <div className="revq-item__head">
                <span className={`revq-sev revq-sev--${item.severity.toLowerCase()}`} aria-label={`${friendly(item.severity)} severity`} />
                <span className={`revq-tag revq-tag--${item.findingClass.toLowerCase()}`}>{CLASS_LABEL[item.findingClass]}</span>
                <span className={`revq-sla revq-sla--${sla.tone}`}>{sla.text}</span>
                {escalated && <span className="revq-escalated">{escalated}</span>}
                <span className="revq-stage">{friendly(item.stage)}</span>
              </div>

              <h3 className="revq-item__title">{item.title}</h3>
              {item.description && item.description !== item.title && (
                <p className="revq-item__desc">{item.description}</p>
              )}

              <div className="revq-item__meta">
                <span>{item.customerName || 'Customer'}</span>
                <span>{item.bookingReference || item.journeyReference || '—'}</span>
                <span>{item.outletName || item.dealerName || '—'}</span>
                {item.originKind === 'MACHINE' && <span>System check</span>}
              </div>

              <div className="revq-item__actions">
                <Link className="revq-open" to={`/audit/${item.journeyId}`}>
                  Open case
                </Link>

                {isAdjudicated && canAccept && !open && (
                  <>
                    <button
                      type="button"
                      className="revq-btn revq-btn--reject"
                      onClick={() => { setDecision({ flagId: item.flagId, action: 'REJECT' }); setReason(''); }}
                    >
                      Reject
                    </button>
                    <button
                      type="button"
                      className="revq-btn revq-btn--accept"
                      onClick={() => { setDecision({ flagId: item.flagId, action: 'ACCEPT' }); setReason(''); }}
                    >
                      Accept
                    </button>
                  </>
                )}

                {!isAdjudicated && canResolve && !open && (
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
                    mutation.mutate({ item, action: decision.action });
                  }}
                >
                  <label>
                    <span>
                      {decision.action === 'ACCEPT'
                        ? 'Why is this a breach?'
                        : decision.action === 'REJECT'
                          ? 'Why is this not a breach?'
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
                    <button type="button" className="revq-btn" onClick={() => { setDecision(null); setReason(''); }}>
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className={`revq-btn revq-btn--${decision.action === 'REJECT' ? 'reject' : 'accept'}`}
                      disabled={!reason.trim() || mutation.isPending}
                    >
                      {mutation.isPending
                        ? 'Saving…'
                        : decision.action === 'ACCEPT'
                          ? 'Confirm breach'
                          : decision.action === 'REJECT'
                            ? 'Not a breach'
                            : 'Mark fixed'}
                    </button>
                  </div>
                </form>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
