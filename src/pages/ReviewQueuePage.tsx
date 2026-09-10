import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

import PageHeader from '../components/PageHeader';
import AttributeEvidenceViewer from '../features/uc03/AttributeEvidenceViewer';
import {
  getManualVerification,
  isManualVerificationRule,
  resolveManualVerification,
  type FieldDecision,
  type ManualVerificationField,
} from '../services/audit-core/manualVerification';
import {
  actOnQueueFinding,
  getReviewQueue,
  getReviewQueueSummary,
  type Uc03FindingClass,
  type Uc03FlagAction,
  type Uc03QueueScope,
  type Uc03QueueSubjectKind,
  type Uc03ReviewQueueItem,
  type Uc03StageCode,
} from '../services/audit-core/uc03Audit';
import {
  getBookingReviewV2,
  getDeliveryReviewV2,
  type ReviewV2Attribute,
  type ReviewV2SourceValue,
  type ReviewV2UnmappedField,
} from '../services/audit-core/uc03DocumentReviewV2';
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

function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  try { return JSON.stringify(value); } catch { return String(value); }
}

function fieldLabel(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// Match a manual-verification field to its review-v2 source (for the boxed viewer).
function sourceFor(
  field: ManualVerificationField,
  diDocumentId: string,
  sources: ReviewV2SourceValue[],
): ReviewV2SourceValue | undefined {
  return sources.find(
    (s) =>
      s.documentId === diDocumentId
      && (s.fieldKey === field.fieldKey
        || (field.canonicalFieldId != null && s.canonicalFieldId === field.canonicalFieldId)),
  );
}

function ManualVerificationPanel({
  item,
  tenantId,
  accessToken,
  onResolved,
}: {
  item: Uc03ReviewQueueItem;
  tenantId: string;
  accessToken?: string;
  onResolved: () => void;
}) {
  // MANUAL_VERIFICATION findings only ever exist on a JOURNEY-subject item
  // (no Daily Ops flag category maps to one) -- the caller only mounts this
  // panel after checking isManualVerificationRule, which never matches a
  // Daily Ops flag's category vocabulary. journeyId is always set here.
  const journeyId = item.journeyId as string;
  const [expanded, setExpanded] = useState(false);
  const [decisions, setDecisions] = useState<Record<string, FieldDecision>>({});
  const [viewer, setViewer] = useState<ReviewV2SourceValue | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mvQuery = useQuery({
    queryKey: ['mv-fields', tenantId, journeyId],
    enabled: expanded && Boolean(accessToken),
    queryFn: () => getManualVerification(tenantId, journeyId, accessToken),
  });
  const reviewQuery = useQuery<{
    attributes: ReviewV2Attribute[];
    unmappedFields: ReviewV2UnmappedField[];
  }>({
    queryKey: ['mv-review', tenantId, journeyId, item.stage],
    enabled: expanded && Boolean(accessToken),
    queryFn: () =>
      item.stage === 'DELIVERY'
        ? getDeliveryReviewV2(tenantId, journeyId, accessToken)
        : getBookingReviewV2(tenantId, journeyId, accessToken),
  });

  const finding = mvQuery.data?.items.find((i) => i.findingId === item.flagId);
  const sources: ReviewV2SourceValue[] = useMemo(() => {
    const data = reviewQuery.data;
    if (!data) return [];
    const fromAttrs = data.attributes.flatMap((a) => a.sources ?? []);
    const fromUnmapped: ReviewV2SourceValue[] = data.unmappedFields.map((f) => ({
      canonicalFieldId: f.canonicalFieldId,
      fieldKey: f.fieldKey,
      value: f.value,
      confidenceScore: f.confidenceScore,
      sourceFactVersion: f.sourceFactVersion,
      reviewState: f.confidenceScore != null && f.confidenceScore >= 0.9 ? 'READY' : 'NEEDS_REVIEW',
      documentId: f.documentId,
      evidenceId: null,
      documentTypeKey: f.documentTypeKey,
      documentLabel: f.documentLabel,
      originalFilename: f.originalFilename,
      contentUrl: null,
      pageNo: f.pageNo,
      evidenceRegion: f.evidenceRegion,
    }));
    return [...fromAttrs, ...fromUnmapped];
  }, [reviewQuery.data]);

  const resolveMutation = useMutation({
    mutationFn: () =>
      resolveManualVerification(
        tenantId,
        journeyId,
        item.flagId,
        Object.values(decisions),
        accessToken,
      ),
    onSuccess: () => {
      setError(null);
      onResolved();
    },
    onError: () => setError('That could not be saved — the queue may have changed. Refresh and try again.'),
  });

  if (!expanded) {
    return (
      <button type="button" className="revq-btn revq-btn--accept" onClick={() => setExpanded(true)}>
        Verify values →
      </button>
    );
  }

  if (mvQuery.isPending || reviewQuery.isPending) {
    return <p className="revq-mv__loading">Loading the values to check…</p>;
  }
  if (!finding) {
    return <p className="revq-mv__loading">These values were already verified. Refresh the queue.</p>;
  }

  const allDecided = finding.fields.every((f) => decisions[f.extractedFieldId]);

  return (
    <div className="revq-mv">
      <ul className="revq-mv__fields">
        {finding.fields.map((field) => {
          const src = sourceFor(field, finding.diDocumentId, sources);
          const decision = decisions[field.extractedFieldId];
          const confPct = field.confidence != null ? Math.round(field.confidence * 100) : null;
          return (
            <li key={field.extractedFieldId} className={decision ? 'is-done' : ''}>
              <div className="revq-mv__field">
                <span className="revq-mv__label">{fieldLabel(field.fieldKey)}</span>
                {confPct != null && <span className="revq-mv__conf">{confPct}%</span>}
              </div>
              <div className="revq-mv__value">
                {decision?.action === 'CORRECT'
                  ? displayValue(decision.effectiveValue)
                  : displayValue(field.effectiveValue ?? field.extractedValue)}
                {src && (
                  <button type="button" className="revq-mv__doc" onClick={() => setViewer(src)}>
                    View on document ↗
                  </button>
                )}
              </div>
              {!decision ? (
                <div className="revq-mv__choose">
                  <button
                    type="button"
                    className="revq-btn revq-btn--accept"
                    onClick={() =>
                      setDecisions((d) => ({
                        ...d,
                        [field.extractedFieldId]: { extractedFieldId: field.extractedFieldId, action: 'CONFIRM' },
                      }))
                    }
                  >
                    Value is right
                  </button>
                  <CorrectField
                    onCorrect={(value) =>
                      setDecisions((d) => ({
                        ...d,
                        [field.extractedFieldId]: {
                          extractedFieldId: field.extractedFieldId,
                          action: 'CORRECT',
                          effectiveValue: value,
                        },
                      }))
                    }
                  />
                </div>
              ) : (
                <button
                  type="button"
                  className="revq-mv__undo"
                  onClick={() =>
                    setDecisions((d) => {
                      const next = { ...d };
                      delete next[field.extractedFieldId];
                      return next;
                    })
                  }
                >
                  {decision.action === 'CORRECT' ? 'Corrected' : 'Confirmed'} · change
                </button>
              )}
            </li>
          );
        })}
      </ul>

      {error && <p className="revq-mv__error" role="alert">{error}</p>}

      <div className="revq-mv__actions">
        <button type="button" className="revq-btn" onClick={() => setExpanded(false)}>Close</button>
        <button
          type="button"
          className="revq-btn revq-btn--accept"
          disabled={!allDecided || resolveMutation.isPending}
          onClick={() => resolveMutation.mutate()}
        >
          {resolveMutation.isPending ? 'Saving…' : `Verify ${finding.fields.length} value${finding.fields.length === 1 ? '' : 's'}`}
        </button>
      </div>

      {viewer && accessToken && (
        <AttributeEvidenceViewer
          tenantId={tenantId}
          journeyId={journeyId}
          accessToken={accessToken}
          source={viewer}
          onClose={() => setViewer(null)}
        />
      )}
    </div>
  );
}

function CorrectField({ onCorrect }: { onCorrect: (value: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  if (!editing) {
    return (
      <button type="button" className="revq-btn revq-btn--reject" onClick={() => setEditing(true)}>
        Correct it
      </button>
    );
  }
  return (
    <form
      className="revq-mv__correct"
      onSubmit={(e) => {
        e.preventDefault();
        if (value.trim()) onCorrect(value.trim());
      }}
    >
      <input
        type="text"
        value={value}
        autoFocus
        placeholder="Correct value"
        onChange={(e) => setValue(e.target.value)}
      />
      <button type="submit" className="revq-btn revq-btn--accept" disabled={!value.trim()}>Save</button>
    </form>
  );
}

export default function ReviewQueuePage() {
  const project = useProjectContextStore((state) => state.selectedProject);
  const accessToken = useSessionStore((state) => state.accessToken);
  const queryClient = useQueryClient();

  const role = project?.operatingRole ?? 'PC';
  const [subjectTab, setSubjectTab] = useState<Uc03QueueSubjectKind>('JOURNEY');
  const [scope, setScope] = useState<Uc03QueueScope>(role === 'PC' ? 'MINE' : 'MINE');
  const [classFilter, setClassFilter] = useState<'ALL' | Uc03FindingClass>('ALL');
  const [stageFilter, setStageFilter] = useState<'ALL' | Uc03StageCode>('ALL');
  const [decision, setDecision] = useState<DecisionState | null>(null);
  const [reason, setReason] = useState('');
  const [banner, setBanner] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);

  const enabled = Boolean(project?.tenantId && accessToken);

  const summaryQuery = useQuery({
    queryKey: ['uc03-review-queue-summary', project?.tenantId, subjectTab],
    queryFn: () => getReviewQueueSummary(project!.tenantId, accessToken, subjectTab),
    enabled,
  });

  const queueQuery = useQuery({
    queryKey: ['uc03-review-queue', project?.tenantId, subjectTab, scope, classFilter, stageFilter],
    queryFn: () =>
      getReviewQueue(
        project!.tenantId,
        {
          scope,
          subjectKind: subjectTab,
          findingClass: classFilter === 'ALL' ? undefined : classFilter,
          stage: subjectTab === 'DAILY_OPS' || stageFilter === 'ALL' ? undefined : stageFilter,
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
        {subjectTab === 'JOURNEY' && (
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
        )}
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
          const isManualVerification = isManualVerificationRule(item.ruleKey);
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
                  <Link className="revq-open" to={`/audit/${item.journeyId}`}>
                    Open case
                  </Link>
                )}

                {isManualVerification && (
                  <ManualVerificationPanel
                    item={item}
                    tenantId={project.tenantId}
                    accessToken={accessToken}
                    onResolved={() => {
                      setBanner({ tone: 'ok', text: 'Values verified.' });
                      void queryClient.invalidateQueries({ queryKey: ['uc03-review-queue'] });
                      void queryClient.invalidateQueries({ queryKey: ['uc03-review-queue-summary'] });
                    }}
                  />
                )}

                {!isManualVerification && isAdjudicated && canAccept && !open && (
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

                {!isManualVerification && !isAdjudicated && item.subjectKind === 'JOURNEY' && item.findingClass === 'DOCUMENT_GAP' && (
                  <Link
                    className="revq-btn revq-btn--accept"
                    to={item.stage === 'DELIVERY' ? `/v2/deliveries/${item.journeyId}` : `/v2/bookings/${item.journeyId}`}
                  >
                    Upload document →
                  </Link>
                )}

                {!isManualVerification && !isAdjudicated && item.findingClass !== 'DOCUMENT_GAP' && canResolve && !open && (
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
