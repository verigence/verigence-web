import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom';

import PageHeader from '../components/PageHeader';
import StatusPill from '../components/StatusPill';
import AttributeEvidenceViewer, { hasBoxedEvidence } from '../features/uc03/AttributeEvidenceViewer';
import AuditSourceComparisonTable from '../features/uc03/AuditSourceComparisonTable';
import {
  actOnAuditFlag,
  completeStageAudit,
  getAuditSummary,
  getAuditTimeline,
  listAuditFlags,
  raiseAuditFlag,
  type Uc03AuditFlag,
  type Uc03FlagAction,
  type Uc03RejectionCategory,
  type Uc03StageAuditView,
  type Uc03StageCode,
} from '../services/audit-core/uc03Audit';
import { getBookingWorkspace } from '../services/audit-core/uc03Booking';
import { getDeliveryWorkspace } from '../services/audit-core/uc03Delivery';
import {
  getAuditSourceComparisonV2,
  type ReviewV2SourceValue,
} from '../services/audit-core/uc03DocumentReviewV2';
import { useProjectContextStore } from '../store/projectContextStore';
import { useSessionStore } from '../store/sessionStore';
import '../styles/uc03-attribute-audit-review.css';

const FLAG_CATEGORIES = [
  'PHYSICAL_OBSERVATION',
  'DOCUMENT_EXCEPTION',
  'PAYMENT_EXCEPTION',
  'CUSTOMER_IDENTITY_CONCERN',
  'COMMERCIAL_EXCEPTION',
  'PROCESS_NON_COMPLIANCE',
  'DELIVERY_EXCEPTION',
  'OTHER',
] as const;

const SEVERITIES = ['INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;

type StageFilter = 'ALL' | Uc03StageCode;
// System-generated (rule/producer-raised) vs. user-generated (a human's own
// observation) are genuinely different kinds of record -- a reviewer
// working through their own raised flags doesn't want to wade through
// every automatic check, and vice versa. 'ALL' is the combined view,
// available from day one since it costs nothing extra once the split
// exists.
type OriginFilter = 'ALL' | 'MACHINE' | 'HUMAN';

interface EvidenceOption {
  id: string;
  label: string;
  stage: Uc03StageCode;
}

function friendly(value?: string | null): string {
  if (!value) return 'Not started';
  return value
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function actorLabel(flag: Uc03AuditFlag): string {
  if (flag.originKind === 'MACHINE') return 'System check';
  if (flag.originRole) return `Raised by ${friendly(flag.originRole)}`;
  return 'Human observation';
}

// A machine-raised finding's title alone rarely says which rule fired or
// what field it checked -- "Rule: Price Booking Vs Invoice (Vin Number)"
// gives a reviewer something to search/ask about beyond the generic title.
function ruleLabel(ruleKey?: string | null): string | null {
  if (!ruleKey) return null;
  const [stem, detail] = ruleKey.split(':');
  const label = friendly(stem);
  return detail ? `${label} (${friendly(detail)})` : label;
}

const CLASS_LABEL: Record<string, string> = {
  VIOLATION: 'Violation',
  DOCUMENT_GAP: 'Missing document',
  DATA_GAP: 'Missing data',
};
// Fixed, not popularity-ordered -- a reviewer scanning this page repeatedly
// wants the same classification in the same place every time, matching the
// Task Queue and KPI tiles above, which never reorder by count either.
const CLASS_ORDER = ['VIOLATION', 'DOCUMENT_GAP', 'DATA_GAP', 'UNCLASSIFIED'];

/** One group per finding CLASS (Violation / Missing document / Missing
 * data) -- the same three-way classification already shown everywhere
 * else in this app (Task Queue, the KPI tiles above). Grouping by the raw
 * finding_type_code instead (the previous behaviour) fragmented the
 * register into many one-item, jargon-named buckets ("PAYMENT UNVERIFIED",
 * "WRONG DOCUMENT", "DOCUMENT MISSING" as separate headers) with no visible
 * classification at all. Within a class, flags of the same finding type
 * still sort together, then most-recent-first. */
function groupFlagsByClass(flags: Uc03AuditFlag[]): Array<{ findingClass: string; flags: Uc03AuditFlag[] }> {
  const byClass = new Map<string, Uc03AuditFlag[]>();
  for (const flag of flags) {
    const key = flag.findingClass || 'UNCLASSIFIED';
    const bucket = byClass.get(key);
    if (bucket) bucket.push(flag);
    else byClass.set(key, [flag]);
  }
  for (const groupFlags of byClass.values()) {
    groupFlags.sort((a, b) => (
      (a.category || '').localeCompare(b.category || '')
      || new Date(b.createdAtUtc).getTime() - new Date(a.createdAtUtc).getTime()
    ));
  }
  return Array.from(byClass.entries())
    .map(([findingClass, groupFlags]) => ({ findingClass, flags: groupFlags }))
    .sort((a, b) => CLASS_ORDER.indexOf(a.findingClass) - CLASS_ORDER.indexOf(b.findingClass));
}

// Required alongside the free-text remark to Mark False Positive -- the
// backend rejects the action outright without one.
const REJECTION_CATEGORY_LABEL: Record<Uc03RejectionCategory, string> = {
  NOT_APPLICABLE: 'Not applicable',
  DATA_ALREADY_CORRECT: 'Data is already correct',
  SYSTEM_MISCLASSIFIED: 'System misclassified this',
  DUPLICATE: 'Duplicate of another flag',
  OTHER: 'Other',
};

interface FlagDecisionState {
  flagId: string;
  action: Uc03FlagAction;
}

const OWNER_ORDER = ['PC', 'TL', 'PM', 'EXECUTIVE'];
const OWNER_LABEL: Record<string, string> = { PC: 'PC', TL: 'Team Lead', PM: 'Project Manager', EXECUTIVE: 'Executive' };

/** The two data points asked for directly, in one compact strip: who
 * currently owns each open flag (self-serve PC gaps vs. TL/PM-adjudicated
 * violations), and how the whole register breaks down by classification --
 * both computed from the exact same (VOIDED-excluded) list the register
 * below renders, so these numbers can never drift from what's on screen. */
function AuditBreakdown({ flags }: { flags: Uc03AuditFlag[] }) {
  const live = flags.filter((flag) => flag.status !== 'VOIDED');
  const open = live.filter((flag) => flag.status === 'OPEN' || flag.status === 'ACKNOWLEDGED');

  const byOwner = new Map<string, number>();
  for (const flag of open) {
    const owner = (flag.ownerRoleCode || '').toUpperCase();
    byOwner.set(owner, (byOwner.get(owner) || 0) + 1);
  }
  const ownerChips = OWNER_ORDER
    .filter((role) => (byOwner.get(role) || 0) > 0)
    .map((role) => ({ role, count: byOwner.get(role) || 0 }));

  const byClass = new Map<string, number>();
  for (const flag of live) {
    const key = flag.findingClass || 'UNCLASSIFIED';
    byClass.set(key, (byClass.get(key) || 0) + 1);
  }
  const classChips = CLASS_ORDER
    .filter((key) => (byClass.get(key) || 0) > 0)
    .map((key) => ({ key, count: byClass.get(key) || 0 }));

  if (ownerChips.length === 0 && classChips.length === 0) return null;
  return (
    <section className="uc03-c3-breakdown" aria-label="Audit flag breakdown">
      {ownerChips.length > 0 && (
        <div className="uc03-c3-breakdown-group">
          <span>Awaiting action from</span>
          <div className="uc03-c3-breakdown-chips">
            {ownerChips.map(({ role, count }) => (
              <span key={role} className={`uc03-c3-chip uc03-c3-chip--owner-${role.toLowerCase()}`}>
                {OWNER_LABEL[role] || friendly(role)} <strong>{count}</strong>
              </span>
            ))}
          </div>
        </div>
      )}
      {classChips.length > 0 && (
        <div className="uc03-c3-breakdown-group">
          <span>By classification</span>
          <div className="uc03-c3-breakdown-chips">
            {classChips.map(({ key, count }) => (
              <a key={key} href={`#flag-group-${key.toLowerCase()}`} className={`uc03-c3-chip uc03-c3-chip--class-${key.toLowerCase()}`}>
                {CLASS_LABEL[key] || 'Unclassified'} <strong>{count}</strong>
              </a>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function formatTime(value: string, timezoneName: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Time unavailable';
  return new Intl.DateTimeFormat(undefined, {
    timeZone: timezoneName,
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function StageAuditCard({
  stage,
  busy,
  canComplete,
  onComplete,
}: {
  stage: Uc03StageAuditView;
  busy: boolean;
  canComplete: boolean;
  onComplete: (stage: Uc03StageAuditView) => Promise<void>;
}) {
  return (
    <article className="uc03-c3-stage-card">
      <header>
        <div>
          <span>{friendly(stage.stage)}</span>
          <strong>{friendly(stage.businessStatus)}</strong>
        </div>
        <div className="uc03-c3-status-pair">
          <StatusPill value={stage.auditState} compact />
          <StatusPill value={stage.auditStatus} compact />
        </div>
      </header>
      <dl>
        <div><dt>Open</dt><dd>{stage.openFlagCount}</dd></div>
        <div><dt>Resolved</dt><dd>{stage.totalHistoricalFlagCount - stage.openFlagCount}</dd></div>
        <div><dt>Total raised</dt><dd>{stage.totalHistoricalFlagCount}</dd></div>
        <div><dt>Completion guards</dt><dd>{stage.blockingOpenFlagCount}</dd></div>
      </dl>
      {stage.auditState !== 'COMPLETE' && canComplete && (
        <button type="button" className="uc03-c3-primary" disabled={busy} onClick={() => void onComplete(stage)}>
          Complete {friendly(stage.stage)} audit
        </button>
      )}
      {stage.auditState === 'COMPLETE' && stage.auditStatus === 'FLAGS_RAISED' && (
        <p className="uc03-c3-note">Audit work is complete. Every flag raised, open or resolved, remains part of the audit record.</p>
      )}
    </article>
  );
}

interface FlagDecisionFormState extends FlagDecisionState {
  reason: string;
  rejectionCategory: Uc03RejectionCategory | '';
  severity: string;
}

function FlagCard({
  flag,
  journeyId,
  timezoneName,
  permittedActions,
  isTarget,
  decision,
  busy,
  onOpenDecision,
  onChangeDecision,
  onCancelDecision,
  onSubmitDecision,
}: {
  flag: Uc03AuditFlag;
  journeyId: string;
  timezoneName: string;
  permittedActions: string[];
  isTarget: boolean;
  decision: FlagDecisionFormState | null;
  busy: boolean;
  onOpenDecision: (flagId: string, action: Uc03FlagAction) => void;
  onChangeDecision: (patch: Partial<Omit<FlagDecisionFormState, 'flagId' | 'action'>>) => void;
  onCancelDecision: () => void;
  onSubmitDecision: (flag: Uc03AuditFlag) => void;
}) {
  // Per-finding permitted actions from the server (class-aware); fall back to the
  // role-level list. PC never gets any of these (v1.1 design: a PC never acts
  // on a Finding directly, only its own Task) -- CONFIRM_BREACH/MARK_FALSE_
  // POSITIVE/TAKE_ACTION only ever appear in a TL/PM/Executive's own
  // permittedActions, so this stays correctly read-only for PC with no
  // separate role check needed here.
  const canDo = (action: string) =>
    flag.permittedActions.includes(action) || permittedActions.includes(action);
  const isViolation = flag.findingClass === 'VIOLATION';
  const open = ['OPEN', 'ACKNOWLEDGED'].includes(flag.status);
  const canAccept = canDo('CONFIRM_BREACH');
  const canReject = canDo('MARK_FALSE_POSITIVE');
  const canTakeAction = canDo('TAKE_ACTION');
  const actionable = open && (
    canDo('ACKNOWLEDGE') || canAccept || canReject || canDo('RESOLVE')
  );
  // A PC has no RESOLVE permission on a self-serve Finding directly (v1.1
  // design routes that through its Task instead) -- so `actionable` above
  // is false here and this card would otherwise show no action at all.
  // The fix only ever needs the open Finding, so route straight to it.
  const isModelNotIdentified = open && (flag.ruleKey || '').split(':')[0] === 'MODEL_NOT_IDENTIFIED';
  const isOpenDecision = decision?.flagId === flag.flagId;

  const slaText = flag.slaDueAtUtc
    ? (() => {
        const diff = new Date(flag.slaDueAtUtc).getTime() - Date.now();
        const h = Math.max(Math.round(Math.abs(diff) / 3_600_000), 1);
        const human = h >= 48 ? `${Math.round(h / 24)}d` : `${h}h`;
        return diff < 0 ? `Overdue ${human}` : `Due in ${human}`;
      })()
    : null;

  return (
    <article
      id={`audit-finding-${flag.flagId}`}
      className={`uc03-c3-flag-card severity-${flag.severity.toLowerCase()}${isTarget ? ' uc03-c3-flag-card--target' : ''}`}
    >
      <header>
        <div>
          <div className="uc03-c3-flag-meta">
            <span>{friendly(flag.stage)}</span>
            {/* Classification is now the group header above this card --
                repeating it per-card here was redundant clutter. */}
            {flag.category && <span className="uc03-c3-category">{friendly(flag.category)}</span>}
            <span>{actorLabel(flag)}</span>
            {flag.ownerRoleCode && <span>Owner: {friendly(flag.ownerRoleCode)}</span>}
            {slaText && open && <span className={new Date(flag.slaDueAtUtc || 0).getTime() < Date.now() ? 'uc03-c3-sla-late' : 'uc03-c3-sla'}>{slaText}</span>}
            {flag.escalationLevel > 0 && open && <span className="uc03-c3-sla-late">Escalated</span>}
            {flag.evidenceCount > 0 && <span>{flag.evidenceCount} linked evidence</span>}
          </div>
          <h3>{flag.title}</h3>
          {flag.description && <p>{flag.description}</p>}
          {(flag.expectedSummary || flag.observedSummary) && (
            <dl className="uc03-c3-flag-expected-observed">
              {flag.expectedSummary && <div><dt>Expected</dt><dd>{flag.expectedSummary}</dd></div>}
              {flag.observedSummary && <div><dt>Found</dt><dd>{flag.observedSummary}</dd></div>}
            </dl>
          )}
          {ruleLabel(flag.ruleKey) && <p className="uc03-c3-rule-label">Rule: {ruleLabel(flag.ruleKey)}</p>}
          {flag.disposition && (
            <p className="uc03-c3-disposition">
              {flag.disposition === 'CONFIRMED_BREACH' ? 'Confirmed breach' : flag.disposition === 'FALSE_POSITIVE' ? 'Reviewed — false positive' : 'Fixed'}
            </p>
          )}
        </div>
        <div className="uc03-c3-status-pair">
          <StatusPill value={flag.severity} compact />
          <StatusPill value={flag.status} compact />
        </div>
      </header>

      <div className="uc03-c3-flag-footnote">
        <span>Raised {formatTime(flag.createdAtUtc, timezoneName)}</span>
        {flag.blockingCompletion && <strong>Audit completion guard</strong>}
      </div>
      {flag.resolutionReason && <div className="uc03-c3-resolution"><strong>Resolution:</strong> {flag.resolutionReason}</div>}

      {isModelNotIdentified && (
        <Link className="uc03-c3-take-action" to={`/journeys/${journeyId}/documents?selectSku=1`}>
          Select SKU →
        </Link>
      )}

      {/* TL's own verdict on the finding: Accept (Confirm Breach), Reject
          (Mark False Positive), or Take Action (raises a Task for PC) --
          right here in context, not a second trip through Task Queue for
          the exact decision this page already shows every fact needed to
          make. PC never sees any of these (canAccept/canReject/
          canTakeAction all come from the server's own per-finding
          permittedActions, which never grants them to PC). */}
      {!isModelNotIdentified && (canAccept || canReject || canTakeAction) && !isOpenDecision && (
        <div className="uc03-c3-flag-actions">
          {canReject && (
            <button
              type="button"
              className="uc03-c3-decide-btn uc03-c3-decide-btn--reject"
              onClick={() => onOpenDecision(flag.flagId, 'MARK_FALSE_POSITIVE')}
            >
              Reject (False Positive)
            </button>
          )}
          {canAccept && (
            <button
              type="button"
              className="uc03-c3-decide-btn uc03-c3-decide-btn--accept"
              onClick={() => onOpenDecision(flag.flagId, 'CONFIRM_BREACH')}
            >
              Accept
            </button>
          )}
          {canTakeAction && (
            <button
              type="button"
              className="uc03-c3-decide-btn"
              onClick={() => onOpenDecision(flag.flagId, 'TAKE_ACTION')}
            >
              Take Action
            </button>
          )}
        </div>
      )}

      {!isModelNotIdentified && !(canAccept || canReject || canTakeAction) && actionable && (
        <Link className="uc03-c3-take-action" to={`/reviews?findingId=${encodeURIComponent(flag.flagId)}`}>
          Take action in Task Queue →
        </Link>
      )}

      {isOpenDecision && decision && (
        <form
          className="uc03-c3-decide"
          onSubmit={(e) => {
            e.preventDefault();
            if (!decision.reason.trim()) return;
            if (decision.action === 'MARK_FALSE_POSITIVE' && !decision.rejectionCategory) return;
            onSubmitDecision(flag);
          }}
        >
          {decision.action === 'MARK_FALSE_POSITIVE' && (
            <label>
              <span>Why doesn't this apply?</span>
              <select
                value={decision.rejectionCategory}
                onChange={(e) => onChangeDecision({ rejectionCategory: e.target.value as Uc03RejectionCategory })}
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
              <select value={decision.severity} onChange={(e) => onChangeDecision({ severity: e.target.value })}>
                {SEVERITIES.map((value) => <option key={value} value={value}>{friendly(value)}</option>)}
              </select>
            </label>
          )}
          <label>
            <span>
              {decision.action === 'CONFIRM_BREACH'
                ? 'Why is this a breach?'
                : decision.action === 'MARK_FALSE_POSITIVE'
                  ? 'Add a short note'
                  : 'What does PC need to do?'}
            </span>
            <textarea
              value={decision.reason}
              rows={2}
              maxLength={4000}
              autoFocus
              onChange={(e) => onChangeDecision({ reason: e.target.value })}
              placeholder="A short note — kept in the audit history"
            />
          </label>
          <div className="uc03-c3-decide__actions">
            <button type="button" className="uc03-c3-decide-btn" onClick={onCancelDecision}>Cancel</button>
            <button
              type="submit"
              className={`uc03-c3-decide-btn ${decision.action === 'MARK_FALSE_POSITIVE' ? 'uc03-c3-decide-btn--reject' : 'uc03-c3-decide-btn--accept'}`}
              disabled={!decision.reason.trim() || (decision.action === 'MARK_FALSE_POSITIVE' && !decision.rejectionCategory) || busy}
            >
              {busy
                ? 'Saving…'
                : decision.action === 'CONFIRM_BREACH'
                  ? 'Confirm Breach'
                  : decision.action === 'MARK_FALSE_POSITIVE'
                    ? 'Mark False Positive'
                    : 'Raise Task'}
            </button>
          </div>
        </form>
      )}
    </article>
  );
}

export default function AuditReviewPage() {
  const { journeyId } = useParams<{ journeyId: string }>();
  const [searchParams] = useSearchParams();
  const findingId = searchParams.get('findingId');
  const project = useProjectContextStore((state) => state.selectedProject);
  const accessToken = useSessionStore((state) => state.accessToken);
  const [stageFilter, setStageFilter] = useState<StageFilter>('ALL');
  const [originFilter, setOriginFilter] = useState<OriginFilter>('ALL');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();
  const [newStage, setNewStage] = useState<Uc03StageCode>('BOOKING');
  const [newCategory, setNewCategory] = useState<(typeof FLAG_CATEGORIES)[number]>('PHYSICAL_OBSERVATION');
  const [newSeverity, setNewSeverity] = useState<(typeof SEVERITIES)[number]>('MEDIUM');
  const [newSummary, setNewSummary] = useState('');
  const [newRemarks, setNewRemarks] = useState('');
  const [newEvidence, setNewEvidence] = useState<string[]>([]);
  const [selectedSource, setSelectedSource] = useState<ReviewV2SourceValue>();
  const [flagDecision, setFlagDecision] = useState<FlagDecisionFormState | null>(null);

  // PC is redirected away below before rendering anything -- disabled here
  // too, so a PC never fires these fetches at all, not just never sees them.
  const enabled = Boolean(project?.tenantId && journeyId && accessToken && project?.operatingRole !== 'PC');
  const summaryQuery = useQuery({
    queryKey: ['uc03-audit-summary', project?.tenantId, journeyId],
    queryFn: () => getAuditSummary(project!.tenantId, journeyId!, accessToken),
    enabled,
  });
  const flagsQuery = useQuery({
    queryKey: ['uc03-audit-flags', project?.tenantId, journeyId, stageFilter],
    queryFn: () => listAuditFlags(
      project!.tenantId,
      journeyId!,
      accessToken,
      stageFilter === 'ALL' ? undefined : stageFilter,
    ),
    enabled,
  });
  const timelineQuery = useQuery({
    queryKey: ['uc03-audit-timeline', project?.tenantId, journeyId],
    queryFn: () => getAuditTimeline(project!.tenantId, journeyId!, accessToken),
    enabled,
  });
  const bookingWorkspaceQuery = useQuery({
    queryKey: ['uc03-audit-booking-evidence', project?.tenantId, journeyId],
    queryFn: () => getBookingWorkspace(project!.tenantId, journeyId!, accessToken),
    enabled: enabled && Boolean(summaryQuery.data?.booking),
    retry: false,
  });
  const deliveryWorkspaceQuery = useQuery({
    queryKey: ['uc03-audit-delivery-evidence', project?.tenantId, journeyId],
    queryFn: () => getDeliveryWorkspace(project!.tenantId, journeyId!, accessToken),
    enabled: enabled && Boolean(summaryQuery.data?.delivery),
    retry: false,
  });
  const deliveryCompleted = summaryQuery.data?.delivery?.businessStatus === 'DELIVERY_COMPLETED';
  const sourceComparisonQuery = useQuery({
    queryKey: ['uc03-audit-source-comparison-v2', project?.tenantId, journeyId],
    queryFn: () => getAuditSourceComparisonV2(project!.tenantId, journeyId!, accessToken),
    enabled: enabled && deliveryCompleted,
    retry: false,
  });

  const evidenceOptions = useMemo(() => {
    const options: EvidenceOption[] = [];
    const seen = new Set<string>();
    bookingWorkspaceQuery.data?.documents.forEach((document) => {
      if (!document.evidenceId || seen.has(document.evidenceId)) return;
      seen.add(document.evidenceId);
      options.push({
        id: document.evidenceId,
        stage: 'BOOKING',
        label: `Booking · ${friendly(document.requirementKey)}`,
      });
    });
    deliveryWorkspaceQuery.data?.documents.forEach((document) => {
      if (!document.evidenceId || seen.has(document.evidenceId)) return;
      seen.add(document.evidenceId);
      options.push({
        id: document.evidenceId,
        stage: 'DELIVERY',
        label: `Delivery · ${friendly(document.requirementKey)}`,
      });
    });
    return options;
  }, [bookingWorkspaceQuery.data?.documents, deliveryWorkspaceQuery.data?.documents]);

  useEffect(() => {
    if (!findingId || !flagsQuery.data?.some((flag) => flag.flagId === findingId)) return;
    document.getElementById(`audit-finding-${findingId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [findingId, flagsQuery.data]);

  if (!project || !journeyId) return null;
  // A PC's permittedActions here never grant Accept/Reject/Take Action --
  // this whole page has always been read-only for them, and everything
  // it shows (open flags, what's blocking the case) is already on the
  // journey's own Overview. Rather than leave a page that does nothing
  // for PC reachable by a stale link or the back button, send them
  // straight to where their actual work is.
  if (project.operatingRole === 'PC') {
    return <Navigate to={`/journeys/${journeyId}/overview`} replace />;
  }
  const summary = summaryQuery.data;

  const refresh = async () => {
    await Promise.all([summaryQuery.refetch(), flagsQuery.refetch(), timelineQuery.refetch()]);
    if (deliveryCompleted) await sourceComparisonQuery.refetch();
  };

  const run = async (operation: () => Promise<unknown>, success: string) => {
    setBusy(true);
    setError(undefined);
    setMessage(undefined);
    try {
      await operation();
      await refresh();
      setMessage(success);
    } catch {
      setError('We could not save that audit action. Refresh the case and try again.');
      await refresh();
      throw new Error('Audit action failed');
    } finally {
      setBusy(false);
    }
  };

  const createFlag = async () => {
    const stage = newStage === 'BOOKING' ? summary?.booking : summary?.delivery;
    if (!stage || !newSummary.trim() || !newRemarks.trim()) return;
    await run(
      () => raiseAuditFlag(
        project.tenantId,
        journeyId,
        newStage,
        stage.aggregateVersion,
        {
          category: newCategory,
          severity: newSeverity,
          summary: newSummary.trim(),
          remarks: newRemarks.trim(),
          evidenceIds: newEvidence,
        },
        accessToken,
      ),
      'Audit Flag raised and added to the permanent case history.',
    );
    setNewSummary('');
    setNewRemarks('');
    setNewEvidence([]);
  };

  const completeAudit = async (stage: Uc03StageAuditView) => {
    await run(
      () => completeStageAudit(project.tenantId, journeyId, stage, '', accessToken),
      `${friendly(stage.stage)} audit marked complete.`,
    );
  };

  // TL's own verdict on a finding -- see FlagCard's own comment for why
  // this lives here now instead of only in Task Queue.
  const openFlagDecision = (flagId: string, action: Uc03FlagAction) => {
    setFlagDecision({ flagId, action, reason: '', rejectionCategory: '', severity: 'MEDIUM' });
  };
  const changeFlagDecision = (patch: Partial<Omit<FlagDecisionFormState, 'flagId' | 'action'>>) => {
    setFlagDecision((current) => (current ? { ...current, ...patch } : current));
  };
  const submitFlagDecision = async (flag: Uc03AuditFlag) => {
    if (!flagDecision) return;
    await run(
      () => actOnAuditFlag(
        project.tenantId,
        journeyId,
        flag,
        flagDecision.action,
        flagDecision.reason.trim(),
        accessToken,
        [],
        flagDecision.action === 'TAKE_ACTION' ? flagDecision.severity : undefined,
        flagDecision.action === 'MARK_FALSE_POSITIVE' ? (flagDecision.rejectionCategory || undefined) : undefined,
      ),
      flagDecision.action === 'CONFIRM_BREACH'
        ? 'Recorded as a confirmed breach.'
        : flagDecision.action === 'MARK_FALSE_POSITIVE'
          ? 'Recorded as a false positive.'
          : 'Task raised for PC.',
    );
    setFlagDecision(null);
  };

  const toggleNewEvidence = (id: string) => {
    setNewEvidence((current) => (
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id]
    ));
  };

  return (
    <div className="screen-stack uc03-c3-audit">
      <PageHeader
        eyebrow={`${friendly(summary?.operatingRole || project.operatingRole)} · Audit review`}
        title="Booking & Delivery Audit"
        description="A read-only view of this case -- Audit Flags, source comparisons, evidence and the complete history. Confirm Breach, Mark False Positive or resolve a flag in Task Queue; nothing here changes the underlying source documents or the record."
      />

      <nav className="uc03-c3-context-links" aria-label="Case navigation">
        <Link to="/dashboard">Project work list</Link>
      </nav>

      {(summaryQuery.isError || flagsQuery.isError || timelineQuery.isError) && (
        <section className="dashboard-load-state" role="alert">
          <div className="dashboard-load-state__mark" aria-hidden="true">!</div>
          <div className="dashboard-load-state__copy">
            <strong>We couldn't load the complete audit view.</strong>
            <p>Please refresh this case. No audit action has been inferred from the failed request.</p>
          </div>
          <button type="button" className="user-menu-button" onClick={() => void refresh()}>Try Again</button>
        </section>
      )}

      {message && <div className="uc03-c3-message" role="status">{message}</div>}
      {error && <div className="uc03-c3-error" role="alert">{error}</div>}

      {summary && (
        <>
          <section className="uc03-c3-overview" aria-label="Audit overview">
            <div><span>Open flags</span><strong>{summary.openFlagCount}</strong></div>
            <div><span>Resolved flags</span><strong>{summary.totalHistoricalFlagCount - summary.openFlagCount}</strong></div>
            <div><span>Total raised (all-time)</span><strong>{summary.totalHistoricalFlagCount}</strong></div>
            <div><span>System flags</span><strong>{summary.machineFlagCount}</strong></div>
            <div><span>Human flags</span><strong>{summary.humanFlagCount}</strong></div>
            <div><span>Highest open severity</span><strong>{friendly(summary.highestOpenSeverity || 'NONE')}</strong></div>
          </section>

          {flagsQuery.data && <AuditBreakdown flags={flagsQuery.data} />}

          <section className="uc03-c3-stage-grid" aria-label="Stage audit status">
            {summary.booking && (
              <StageAuditCard
                stage={summary.booking}
                busy={busy}
                canComplete={summary.permittedActions.includes('COMPLETE_AUDIT')}
                onComplete={completeAudit}
              />
            )}
            {summary.delivery && (
              <StageAuditCard
                stage={summary.delivery}
                busy={busy}
                canComplete={summary.permittedActions.includes('COMPLETE_AUDIT')}
                onComplete={completeAudit}
              />
            )}
          </section>
        </>
      )}

      {deliveryCompleted && sourceComparisonQuery.isPending && (
        <section className="uc03-c3-section" role="status">Loading cross-source attribute comparison…</section>
      )}
      {deliveryCompleted && sourceComparisonQuery.isError && (
        <section className="dashboard-load-state" role="alert">
          <div className="dashboard-load-state__mark" aria-hidden="true">!</div>
          <div className="dashboard-load-state__copy">
            <strong>Source comparison is temporarily unavailable.</strong>
            <p>The rest of the audit workspace remains available. No source value has been copied or inferred.</p>
          </div>
          <button type="button" className="user-menu-button" onClick={() => void sourceComparisonQuery.refetch()}>Try Again</button>
        </section>
      )}
      {sourceComparisonQuery.data && (
        <AuditSourceComparisonTable comparison={sourceComparisonQuery.data} onEvidence={(source) => { if (hasBoxedEvidence(source)) setSelectedSource(source); }} />
      )}

      {summary?.permittedActions.includes('RAISE') && (
        <section className="uc03-c3-section" aria-labelledby="raise-flag-heading">
          <header>
            <div>
              <span>Human observation</span>
              <h2 id="raise-flag-heading">Raise Audit Flag</h2>
              <p>Record what you observed. Verigence keeps source evidence unchanged and records your operating role with the flag.</p>
            </div>
          </header>
          <div className="uc03-c3-flag-form">
            <label><span>Stage</span><select value={newStage} onChange={(event) => setNewStage(event.target.value as Uc03StageCode)}>
              <option value="BOOKING" disabled={!summary.booking}>Booking</option>
              <option value="DELIVERY" disabled={!summary.delivery}>Delivery</option>
            </select></label>
            <label><span>Category</span><select value={newCategory} onChange={(event) => setNewCategory(event.target.value as (typeof FLAG_CATEGORIES)[number])}>
              {FLAG_CATEGORIES.map((value) => <option key={value} value={value}>{friendly(value)}</option>)}
            </select></label>
            <label><span>Severity</span><select value={newSeverity} onChange={(event) => setNewSeverity(event.target.value as (typeof SEVERITIES)[number])}>
              {SEVERITIES.map((value) => <option key={value} value={value}>{friendly(value)}</option>)}
            </select></label>
            <label className="uc03-c3-span"><span>Observation</span><input value={newSummary} maxLength={500} onChange={(event) => setNewSummary(event.target.value)} placeholder="Describe the audit exception" /></label>
            {/* Required, not optional: this is the ONLY thing that becomes
                the finding's description once raised -- a flag left with no
                remarks previously had nothing beyond its one-line
                Observation to explain it later. */}
            <label className="uc03-c3-span">
              <span>Remarks (required)</span>
              <textarea
                value={newRemarks}
                maxLength={4000}
                onChange={(event) => setNewRemarks(event.target.value)}
                rows={3}
                placeholder="Explain what was observed and why it matters -- this is what reviewers will see to identify the flag"
                required
              />
            </label>
          </div>
          {evidenceOptions.filter((option) => option.stage === newStage).length > 0 && (
            <fieldset className="uc03-c3-evidence-picker uc03-c3-new-evidence">
              <legend>Link existing {friendly(newStage)} evidence</legend>
              {evidenceOptions.filter((option) => option.stage === newStage).map((option) => (
                <label key={option.id}>
                  <input type="checkbox" checked={newEvidence.includes(option.id)} onChange={() => toggleNewEvidence(option.id)} />
                  <span>{option.label}</span>
                </label>
              ))}
            </fieldset>
          )}
          <button
            type="button"
            className="uc03-c3-primary"
            disabled={busy || !newSummary.trim() || !newRemarks.trim() || !(newStage === 'BOOKING' ? summary.booking : summary.delivery)}
            onClick={() => void createFlag()}
          >
            Raise Audit Flag
          </button>
        </section>
      )}

      <section className="uc03-c3-section" aria-labelledby="flag-register-heading">
        <header className="uc03-c3-section-heading">
          <div><span>Permanent register</span><h2 id="flag-register-heading">Audit Flags</h2><p>Resolved flags stay visible as historical audit evidence. Open flags link to Task Queue to act on them.</p></div>
          <div className="uc03-c3-filter-group">
            <div className="uc03-c3-filter" role="group" aria-label="Audit Flag stage filter">
              {(['ALL', 'BOOKING', 'DELIVERY'] as const).map((value) => (
                <button type="button" key={value} className={stageFilter === value ? 'is-active' : ''} onClick={() => setStageFilter(value)}>{friendly(value)}</button>
              ))}
            </div>
            {/* System flags (every rule/producer check) vs. Human flags (a
                person's own observation) -- two different working views on
                the same register, plus the combined "All" for free. Labels
                match the System flags / Human flags counts already shown in
                the overview tiles above, not new terminology. */}
            <div className="uc03-c3-filter" role="group" aria-label="Audit Flag origin filter">
              {([
                { value: 'ALL', label: 'All flags' },
                { value: 'MACHINE', label: 'System flags' },
                { value: 'HUMAN', label: 'Human flags' },
              ] as const).map(({ value, label }) => (
                <button type="button" key={value} className={originFilter === value ? 'is-active' : ''} onClick={() => setOriginFilter(value)}>{label}</button>
              ))}
            </div>
          </div>
        </header>
        {(() => {
          // VOIDED is excluded everywhere else this same finding is counted
          // (this page's own "Total raised (all-time)" tile, Journey 360's
          // Flags tab) -- rendering it here too silently inflated this
          // register beyond what those numbers promised, breaking the one
          // thing a reviewer actually relies on: the counts matching
          // wherever the same finding is shown.
          const filtered = (flagsQuery.data || []).filter(
            (flag) => flag.status !== 'VOIDED' && (originFilter === 'ALL' || flag.originKind === originFilter),
          );
          const groups = groupFlagsByClass(filtered);
          return (
            <div className="uc03-c3-flag-groups">
              {groups.map(({ findingClass, flags }) => (
                <div className="uc03-c3-flag-group" key={findingClass}>
                  <div
                    id={`flag-group-${findingClass.toLowerCase()}`}
                    className={`uc03-c3-flag-group-head uc03-c3-flag-group-head--${findingClass.toLowerCase()}`}
                  >
                    <span>{CLASS_LABEL[findingClass] || 'Unclassified'}</span>
                    <span className="uc03-c3-flag-group-count">{flags.length}</span>
                  </div>
                  <div className="uc03-c3-flag-list">
                    {flags.map((flag) => (
                      <FlagCard
                        key={flag.flagId}
                        flag={flag}
                        journeyId={journeyId}
                        timezoneName={project.timezoneName}
                        permittedActions={summary?.permittedActions || []}
                        isTarget={flag.flagId === findingId}
                        decision={flagDecision}
                        busy={busy}
                        onOpenDecision={openFlagDecision}
                        onChangeDecision={changeFlagDecision}
                        onCancelDecision={() => setFlagDecision(null)}
                        onSubmitDecision={(f) => void submitFlagDecision(f)}
                      />
                    ))}
                  </div>
                </div>
              ))}
              {filtered.length === 0 && <div className="uc03-c3-empty">No Audit Flags match this filter.</div>}
            </div>
          );
        })()}
      </section>

      {/* Collapsed by default -- a full case's Timeline can run to dozens of
          entries, and it was the single largest contributor to this page
          reading as an endless scroll. The Flags register above is the
          thing a reviewer actually comes here for; the Timeline is a
          reference a reviewer opens on demand, not something to page past
          every time. */}
      <details className="uc03-c3-section uc03-c3-timeline-details">
        <summary>
          <div><span>Immutable history</span><h2>Audit Timeline</h2><p>Booking, Delivery, flag and review events in one chronological view.</p></div>
          <span className="uc03-c3-flag-group-count">{timelineQuery.data?.length ?? 0}</span>
        </summary>
        <ol className="uc03-c3-timeline">
          {timelineQuery.data?.map((item, index) => (
            <li key={`${item.occurredAtUtc}-${item.eventType}-${index}`}>
              <div className="uc03-c3-timeline-marker" aria-hidden="true" />
              <article>
                <div className="uc03-c3-timeline-meta">
                  <span>{item.stage ? friendly(item.stage) : friendly(item.kind)}</span>
                  <span>{formatTime(item.occurredAtUtc, project.timezoneName)}</span>
                  {item.actorRole && <span>{friendly(item.actorRole)}</span>}
                </div>
                <strong>{item.summary}</strong>
                {item.remarks && <p>{item.remarks}</p>}
              </article>
            </li>
          ))}
          {timelineQuery.data?.length === 0 && <li className="uc03-c3-empty">No audit history has been recorded yet.</li>}
        </ol>
      </details>

      {selectedSource && hasBoxedEvidence(selectedSource) && (
        <AttributeEvidenceViewer
          tenantId={project.tenantId}
          journeyId={journeyId}
          accessToken={accessToken}
          source={selectedSource}
          onClose={() => setSelectedSource(undefined)}
        />
      )}
    </div>
  );
}
