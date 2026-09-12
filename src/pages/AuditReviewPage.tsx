import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams, useSearchParams } from 'react-router-dom';

import PageHeader from '../components/PageHeader';
import StatusPill from '../components/StatusPill';
import AttributeEvidenceViewer, { hasBoxedEvidence } from '../features/uc03/AttributeEvidenceViewer';
import AuditSourceComparisonTable from '../features/uc03/AuditSourceComparisonTable';
import {
  completeStageAudit,
  getAuditSummary,
  getAuditTimeline,
  listAuditFlags,
  raiseAuditFlag,
  type Uc03AuditFlag,
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

/** One group per finding type (category), most-open-first, then by most
 * recent within a group -- flags of the same kind (every WRONG_DOCUMENT, every
 * MANUAL_VERIFICATION...) sit together instead of interleaved in one flat,
 * hard-to-scan list ordered only by creation time. */
function groupFlagsByCategory(flags: Uc03AuditFlag[]): Array<{ category: string; flags: Uc03AuditFlag[] }> {
  const byCategory = new Map<string, Uc03AuditFlag[]>();
  for (const flag of flags) {
    const key = flag.category || 'OTHER';
    const bucket = byCategory.get(key);
    if (bucket) bucket.push(flag);
    else byCategory.set(key, [flag]);
  }
  const openCount = (group: Uc03AuditFlag[]) =>
    group.filter((f) => f.status === 'OPEN' || f.status === 'ACKNOWLEDGED').length;
  return Array.from(byCategory.entries())
    .map(([category, groupFlags]) => ({ category, flags: groupFlags }))
    .sort((a, b) => openCount(b.flags) - openCount(a.flags) || b.flags.length - a.flags.length);
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
        <div><dt>Open flags</dt><dd>{stage.openFlagCount}</dd></div>
        <div><dt>Historical flags</dt><dd>{stage.totalHistoricalFlagCount}</dd></div>
        <div><dt>Completion guards</dt><dd>{stage.blockingOpenFlagCount}</dd></div>
      </dl>
      {stage.auditState !== 'COMPLETE' && canComplete && (
        <button type="button" className="uc03-c3-primary" disabled={busy} onClick={() => void onComplete(stage)}>
          Complete {friendly(stage.stage)} audit
        </button>
      )}
      {stage.auditState === 'COMPLETE' && stage.auditStatus === 'FLAGS_RAISED' && (
        <p className="uc03-c3-note">Audit work is complete. Historical flags remain part of the audit record.</p>
      )}
    </article>
  );
}

function FlagCard({
  flag,
  timezoneName,
  permittedActions,
  isTarget,
}: {
  flag: Uc03AuditFlag;
  timezoneName: string;
  permittedActions: string[];
  isTarget: boolean;
}) {
  // Per-finding permitted actions from the server (class-aware); fall back to the
  // role-level list. Used only to decide whether a "Take action" link is worth
  // showing at all -- Audit View is a read view of the case (evidence,
  // classification, severity, SLA, full history); accepting, rejecting,
  // resolving or remarking on a flag all happen in Review Queue, the
  // actionable surface, not here.
  const canDo = (action: string) =>
    flag.permittedActions.includes(action) || permittedActions.includes(action);
  const isViolation = flag.findingClass === 'VIOLATION';
  const open = ['OPEN', 'ACKNOWLEDGED'].includes(flag.status);
  const actionable = open && (
    canDo('ACKNOWLEDGE') || canDo('CONFIRM_BREACH') || canDo('MARK_FALSE_POSITIVE') || canDo('RESOLVE')
  );

  const classLabel = flag.findingClass === 'VIOLATION'
    ? 'Violation'
    : flag.findingClass === 'DOCUMENT_GAP'
      ? 'Missing document'
      : flag.findingClass === 'DATA_GAP'
        ? 'Missing data'
        : null;
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
            {classLabel && <span className={`uc03-c3-class uc03-c3-class--${(flag.findingClass || '').toLowerCase()}`}>{classLabel}</span>}
            <span>{actorLabel(flag)}</span>
            {flag.ownerRoleCode && <span>Owner: {friendly(flag.ownerRoleCode)}</span>}
            {slaText && open && <span className={new Date(flag.slaDueAtUtc || 0).getTime() < Date.now() ? 'uc03-c3-sla-late' : 'uc03-c3-sla'}>{slaText}</span>}
            {flag.escalationLevel > 0 && open && <span className="uc03-c3-sla-late">Escalated</span>}
            {flag.evidenceCount > 0 && <span>{flag.evidenceCount} linked evidence</span>}
          </div>
          <h3>{flag.title}</h3>
          {flag.description && <p>{flag.description}</p>}
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

      {actionable && (
        <Link className="uc03-c3-take-action" to={`/reviews?findingId=${encodeURIComponent(flag.flagId)}`}>
          Take action in Review Queue →
        </Link>
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

  const enabled = Boolean(project?.tenantId && journeyId && accessToken);
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
        description="A read-only view of this case -- Audit Flags, source comparisons, evidence and the complete history. Confirm Breach, Mark False Positive or resolve a flag in Review Queue; nothing here changes the underlying source documents or the record."
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
            <div><span>Historical flags</span><strong>{summary.totalHistoricalFlagCount}</strong></div>
            <div><span>System flags</span><strong>{summary.machineFlagCount}</strong></div>
            <div><span>Human flags</span><strong>{summary.humanFlagCount}</strong></div>
            <div><span>Highest open severity</span><strong>{friendly(summary.highestOpenSeverity || 'NONE')}</strong></div>
          </section>

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
          <div><span>Permanent register</span><h2 id="flag-register-heading">Audit Flags</h2><p>Resolved flags stay visible as historical audit evidence. Open flags link to Review Queue to act on them.</p></div>
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
          const filtered = (flagsQuery.data || []).filter(
            (flag) => originFilter === 'ALL' || flag.originKind === originFilter,
          );
          const groups = groupFlagsByCategory(filtered);
          return (
            <div className="uc03-c3-flag-groups">
              {groups.map(({ category, flags }) => (
                <div className="uc03-c3-flag-group" key={category}>
                  <div className="uc03-c3-flag-group-head">
                    <span>{friendly(category)}</span>
                    <span className="uc03-c3-flag-group-count">{flags.length}</span>
                  </div>
                  <div className="uc03-c3-flag-list">
                    {flags.map((flag) => (
                      <FlagCard
                        key={flag.flagId}
                        flag={flag}
                        timezoneName={project.timezoneName}
                        permittedActions={summary?.permittedActions || []}
                        isTarget={flag.flagId === findingId}
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

      <section className="uc03-c3-section" aria-labelledby="timeline-heading">
        <header><div><span>Immutable history</span><h2 id="timeline-heading">Audit Timeline</h2><p>Booking, Delivery, flag and review events in one chronological view.</p></div></header>
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
      </section>

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
