import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';

import PageHeader from '../components/PageHeader';
import AttributeEvidenceViewer, { hasBoxedEvidence } from '../features/uc03/AttributeEvidenceViewer';
import ReviewEffectiveValueEditor, { reviewSourceKey } from '../features/uc03/ReviewEffectiveValueEditor';
import { buildRawReviewGroups } from '../features/uc03/reviewFieldGroups';
import {
  confirmBookingReviewV2,
  getBookingReviewDecisionsV2,
  getBookingReviewV2,
  setBookingReviewDecisionV2,
  type ReviewDecisionValue,
  type ReviewFieldCorrection,
  type ReviewV2Attribute,
  type ReviewV2SourceValue,
  type ReviewV2UnmappedField,
} from '../services/audit-core/uc03DocumentReviewV2';
import { useProjectContextStore } from '../store/projectContextStore';
import { useSessionStore } from '../store/sessionStore';
import '../styles/uc03-document-capture-v2.css';
import '../styles/uc03-attribute-audit-review.css';

const REVIEW_REFRESH_MS = 2 * 60 * 1000;
const REVIEW_THRESHOLD = 92;
const RECEIPT_DOCUMENT_TYPE = 'dealer_receipt';

function displayFieldKey(fieldKey: string): string {
  return fieldKey
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return 'Not available yet';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  try { return JSON.stringify(value); } catch { return String(value); }
}

function confidence(value: number | null): string {
  if (value === null || value === undefined) return '—';
  return `${value.toFixed(value % 1 === 0 ? 0 : 1)}%`;
}

function hasExtractedValue(attribute: ReviewV2Attribute): boolean {
  return attribute.resolvedValue !== null && attribute.resolvedValue !== undefined && attribute.resolvedValue !== '';
}

function needsAttributeDecision(attribute: ReviewV2Attribute): boolean {
  return hasExtractedValue(attribute)
    && (attribute.reviewState === 'NEEDS_REVIEW' || attribute.comparisonState === 'MISMATCH');
}

function rawSource(field: ReviewV2UnmappedField): ReviewV2SourceValue {
  return {
    canonicalFieldId: field.canonicalFieldId,
    fieldKey: field.fieldKey,
    value: field.value,
    confidenceScore: field.confidenceScore,
    sourceFactVersion: field.sourceFactVersion,
    reviewState: field.confidenceScore !== null && field.confidenceScore >= REVIEW_THRESHOLD ? 'READY' : 'NEEDS_REVIEW',
    documentId: field.documentId,
    evidenceId: null,
    documentTypeKey: field.documentTypeKey,
    documentLabel: field.documentLabel,
    originalFilename: field.originalFilename,
    contentUrl: null,
    pageNo: field.pageNo,
    evidenceRegion: field.evidenceRegion,
  };
}

function DecisionButtons({
  reviewKey,
  decision,
  busy,
  onDecision,
}: {
  reviewKey: string;
  decision?: ReviewDecisionValue;
  busy: boolean;
  onDecision: (reviewKey: string, decision: ReviewDecisionValue) => void;
}) {
  return (
    <div className="uc03-review-decision-buttons" aria-label="Review decision">
      <button type="button" className={decision === 'ACCEPTED' ? 'is-selected accept' : 'accept'} disabled={busy} onClick={() => onDecision(reviewKey, 'ACCEPTED')}>✓ Accept</button>
      <button type="button" className={decision === 'REJECTED' ? 'is-selected reject' : 'reject'} disabled={busy} onClick={() => onDecision(reviewKey, 'REJECTED')}>✕ Reject</button>
    </div>
  );
}

export default function BookingReviewV2Page() {
  const { journeyId } = useParams<{ journeyId: string }>();
  const navigate = useNavigate();
  const project = useProjectContextStore((state) => state.selectedProject);
  const accessToken = useSessionStore((state) => state.accessToken);
  const previousReadyFieldCount = useRef<number | null>(null);
  const [hasNewResults, setHasNewResults] = useState(false);
  const [selectedSource, setSelectedSource] = useState<ReviewV2SourceValue>();
  const [decisionBusyKey, setDecisionBusyKey] = useState<string>();
  const [decisionError, setDecisionError] = useState<string>();
  const [corrections, setCorrections] = useState<Map<string, ReviewFieldCorrection>>(new Map());
  const [confirming, setConfirming] = useState(false);
  const [confirmationError, setConfirmationError] = useState<string>();

  const enabled = Boolean(project?.tenantId && journeyId && accessToken);
  const reviewQuery = useQuery({
    queryKey: ['uc03-document-review-v2', project?.tenantId, journeyId],
    queryFn: () => getBookingReviewV2(project!.tenantId, journeyId!, accessToken),
    enabled,
    refetchOnWindowFocus: false,
    refetchInterval: (query) => query.state.data?.processingPending ? REVIEW_REFRESH_MS : false,
  });
  const decisionsQuery = useQuery({
    queryKey: ['uc03-document-review-v2-decisions', project?.tenantId, journeyId],
    queryFn: () => getBookingReviewDecisionsV2(project!.tenantId, journeyId!, accessToken),
    enabled,
    refetchOnWindowFocus: false,
  });

  const readyFieldCount = useMemo(
    () => reviewQuery.data?.attributes.filter(hasExtractedValue).length ?? 0,
    [reviewQuery.data],
  );
  useEffect(() => {
    const previous = previousReadyFieldCount.current;
    if (previous !== null && readyFieldCount > previous) setHasNewResults(true);
    previousReadyFieldCount.current = readyFieldCount;
  }, [readyFieldCount]);

  const decisionByKey = useMemo(() => new Map(
    (decisionsQuery.data?.decisions ?? []).map((item) => [item.reviewKey, item.decision] as const),
  ), [decisionsQuery.data]);
  const rawGroups = useMemo(
    () => buildRawReviewGroups(reviewQuery.data?.unmappedFields ?? [], REVIEW_THRESHOLD),
    [reviewQuery.data?.unmappedFields],
  );
  const receiptGroups = useMemo(
    () => rawGroups.filter((group) => group.selected.documentTypeKey?.trim().toLowerCase() === RECEIPT_DOCUMENT_TYPE),
    [rawGroups],
  );
  const additionalRawGroups = useMemo(
    () => rawGroups.filter((group) => group.selected.documentTypeKey?.trim().toLowerCase() !== RECEIPT_DOCUMENT_TYPE),
    [rawGroups],
  );

  if (!project || !journeyId) return null;
  if (reviewQuery.isPending) return <div className="uc03-c1-loading" role="status">Loading Booking Review…</div>;
  if (reviewQuery.isError || !reviewQuery.data) {
    return (
      <section className="dashboard-load-state" role="alert">
        <div className="dashboard-load-state__mark">!</div>
        <div className="dashboard-load-state__copy"><strong>Review is not available yet.</strong><p>{reviewQuery.error instanceof Error ? reviewQuery.error.message : 'Please try again.'}</p></div>
        <button type="button" className="user-menu-button" onClick={() => void reviewQuery.refetch()}>Try Again</button>
      </section>
    );
  }

  const review = reviewQuery.data;
  const pendingDocuments = review.documents.filter((document) => document.extractionState === 'PENDING');
  const failedDocuments = review.documents.filter((document) => document.extractionState === 'FAILED');
  const populatedAttributes = review.attributes.filter(hasExtractedValue);
  const requiredMappedKeys = populatedAttributes.filter(needsAttributeDecision).map((attribute) => `attribute:${attribute.attributeKey}`);
  const requiredRawKeys = rawGroups.filter((group) => group.needsDecision).map((group) => group.reviewKey);
  const requiredDecisionKeys = [...requiredMappedKeys, ...requiredRawKeys];
  const unresolvedDecisionKeys = requiredDecisionKeys.filter((key) => !decisionByKey.has(key));
  const canConfirm = review.pcVerificationStatus === 'PENDING'
    && !review.processingPending
    && failedDocuments.length === 0
    && !decisionsQuery.isPending
    && !decisionsQuery.isError
    && unresolvedDecisionKeys.length === 0;

  const setCorrection = (source: ReviewV2SourceValue | ReviewV2UnmappedField, correction: ReviewFieldCorrection | undefined) => {
    const key = reviewSourceKey(source);
    setCorrections((current) => {
      const next = new Map(current);
      if (correction) next.set(key, correction);
      else next.delete(key);
      return next;
    });
  };

  const setDecision = async (reviewKey: string, decision: ReviewDecisionValue) => {
    setDecisionBusyKey(reviewKey);
    setDecisionError(undefined);
    setConfirmationError(undefined);
    try {
      await setBookingReviewDecisionV2(project.tenantId, journeyId, reviewKey, decision, accessToken);
      await decisionsQuery.refetch();
    } catch (error) {
      setDecisionError(error instanceof Error ? error.message : 'The review decision could not be saved.');
      await Promise.all([reviewQuery.refetch(), decisionsQuery.refetch()]);
    } finally {
      setDecisionBusyKey(undefined);
    }
  };

  const confirmReview = async () => {
    setConfirming(true);
    setConfirmationError(undefined);
    try {
      await confirmBookingReviewV2(
        project.tenantId,
        journeyId,
        review.aggregateVersion,
        [...corrections.values()],
        accessToken,
      );
      setCorrections(new Map());
      navigate('/dashboard', { replace: true });
    } catch (error) {
      setConfirmationError(error instanceof Error ? error.message : 'Booking Review could not be confirmed. Refresh and try again.');
      await Promise.all([reviewQuery.refetch(), decisionsQuery.refetch()]);
    } finally {
      setConfirming(false);
    }
  };

  const renderRawGroups = (groups: typeof rawGroups) => (
    <div className="uc03-raw-review-grid">
      {groups.map((group) => {
        const decision = decisionByKey.get(group.reviewKey);
        const source = group.selected;
        const evidenceSource = rawSource(source);
        const selectedHasBox = hasBoxedEvidence(evidenceSource);
        return (
          <article key={group.groupKey} className={`uc03-raw-review-card ${group.needsDecision && !decision ? 'needs-review' : ''}`}>
            <header>
              <div><span className="uc03-attribute-evidence-kicker">DI extracted field</span><h3>{displayFieldKey(group.fieldKey)}</h3><small>{source.documentLabel}</small></div>
              <span className={`uc03-attribute-status ${decision === 'REJECTED' ? 'rejected' : group.needsDecision && !decision ? 'needs-review' : 'ready'}`}>
                {decision === 'ACCEPTED' ? 'Accepted' : decision === 'REJECTED' ? 'Rejected' : group.mismatch ? 'Source Mismatch' : group.needsDecision ? 'Needs Review' : 'Ready'}
              </span>
            </header>
            <ReviewEffectiveValueEditor
              source={source}
              correction={corrections.get(reviewSourceKey(source))}
              onChange={(correction) => setCorrection(source, correction)}
              disabled={review.pcVerificationStatus === 'VERIFIED' || decision === 'REJECTED'}
            />
            <div className="uc03-raw-review-selected"><span>DI source</span><strong>{displayValue(source.value)}</strong><small>{source.documentLabel} · {confidence(source.confidenceScore)}</small></div>
            {group.sources.length > 1 ? (
              <div className="uc03-raw-review-sources">
                <span>Available source values</span>
                {group.sources.map((item) => {
                  const itemSource = rawSource(item);
                  const boxed = hasBoxedEvidence(itemSource);
                  return <button type="button" key={`${item.documentId}:${item.canonicalFieldId}:${item.sourceFactVersion}`} disabled={!boxed} onClick={() => boxed && setSelectedSource(itemSource)}><strong>{displayValue(item.value)}</strong><small>{item.documentLabel} · {confidence(item.confidenceScore)}</small></button>;
                })}
              </div>
            ) : null}
            <div className="uc03-raw-review-actions">
              {selectedHasBox ? <button type="button" className="uc03-attribute-evidence-link" onClick={() => setSelectedSource(evidenceSource)}>View boxed evidence</button> : <span>Source location unavailable</span>}
              {group.needsDecision ? <DecisionButtons reviewKey={group.reviewKey} decision={decision} busy={decisionBusyKey === group.reviewKey} onDecision={(key, value) => void setDecision(key, value)} /> : <span className="uc03-review-auto-cleared">No action needed</span>}
            </div>
          </article>
        );
      })}
    </div>
  );

  return (
    <div className="screen-stack uc03-booking-journey uc03-v2-capture uc03-attribute-review-page">
      <div className="uc03-c1-topbar">
        <button type="button" className="uc03-c1-back" onClick={() => navigate('/dashboard')}>← Work List</button>
        <div className="uc03-v2-review-top-actions">
          {hasNewResults ? <button type="button" className="uc03-v2-review-notification" onClick={() => setHasNewResults(false)}>● New review results</button> : null}
          <button type="button" className="uc03-v2-review-refresh" disabled={reviewQuery.isFetching || decisionsQuery.isFetching} onClick={() => { setHasNewResults(false); void Promise.all([reviewQuery.refetch(), decisionsQuery.refetch()]); }}>{reviewQuery.isFetching || decisionsQuery.isFetching ? 'Refreshing…' : 'Refresh Review'}</button>
        </div>
      </div>

      <PageHeader
        eyebrow="Booking Review · Evidence First"
        title="Review extracted Booking information"
        description="Unchanged values keep the DI extraction. When a PC corrects a value, Verigence retains the original DI value and stores the PC-confirmed value as the effective value."
      />

      <section className="uc03-attribute-review-summary" aria-label="Booking review summary">
        <div><span>Mapped values</span><strong>{populatedAttributes.length}</strong></div>
        <div><span>Receipt values</span><strong>{receiptGroups.length}</strong></div>
        <div><span>PC corrections</span><strong>{corrections.size}</strong></div>
        <div><span>Exceptions pending</span><strong>{unresolvedDecisionKeys.length}</strong></div>
      </section>

      {review.processingPending ? <div className="uc03-v2-review-pending" role="status"><div><strong>Some documents are still being processed.</strong><span>Booking is complete. Available results remain usable; this screen checks again after 2 minutes.</span></div><span>{pendingDocuments.length} pending</span></div> : null}
      {requiredDecisionKeys.length > 0 ? <div className="uc03-v2-review-attention" role="status"><strong>{unresolvedDecisionKeys.length} of {requiredDecisionKeys.length} exception{requiredDecisionKeys.length === 1 ? '' : 's'} still need a decision.</strong><span>Accept or Reject is separate from editing the effective value.</span></div> : null}

      {review.missingDeclarations.length ? (
        <section className="uc03-v2-section"><header><div><span className="uc03-c1-eyebrow">Declarations</span><h2>Applicable documents not available</h2></div></header><div className="uc03-v2-review-missing-list">{review.missingDeclarations.map((item) => <div key={item.requirementKey} className="uc03-v2-review-missing-row"><div><strong>{item.label}</strong><span>Applicable · Document not available</span></div><span>Recorded for audit follow-up</span></div>)}</div></section>
      ) : null}

      <section className="uc03-v2-section uc03-attribute-table-section">
        <header className="uc03-v2-section-header"><div><span className="uc03-c1-eyebrow">Extracted Booking attributes</span><h2>Business attribute review</h2><p>Edit only when the confirmed value differs from DI. The source fact and original DI value remain traceable.</p></div><span>PC Verification: {review.pcVerificationStatus}</span></header>
        <div className="uc03-attribute-table-wrap">
          <table className="uc03-attribute-table uc03-booking-review-table">
            <thead><tr><th>Attribute</th><th>Effective value</th><th>Confidence</th><th>Source evidence</th><th>Review state</th><th>Decision</th></tr></thead>
            <tbody>
              {populatedAttributes.length ? populatedAttributes.map((attribute) => {
                const source = attribute.resolvedSource;
                const reviewKey = `attribute:${attribute.attributeKey}`;
                const decision = decisionByKey.get(reviewKey);
                const needsDecision = needsAttributeDecision(attribute);
                return (
                  <tr key={attribute.attributeKey} className={needsDecision && !decision ? 'needs-review' : ''}>
                    <td className="uc03-attribute-name-cell"><strong>{attribute.label}</strong><span>{attribute.excelFieldNo ? `Excel #${attribute.excelFieldNo}` : 'Booking business field'}</span></td>
                    <td>{source ? <ReviewEffectiveValueEditor source={source} correction={corrections.get(reviewSourceKey(source))} onChange={(correction) => setCorrection(source, correction)} requireValue disabled={review.pcVerificationStatus === 'VERIFIED' || decision === 'REJECTED'} /> : displayValue(attribute.resolvedValue)}</td>
                    <td>{confidence(attribute.confidenceScore)}</td>
                    <td>{source ? <div className="uc03-attribute-source-cell"><strong>{source.documentLabel}</strong><span>{source.documentTypeKey || source.originalFilename}</span>{hasBoxedEvidence(source) ? <button type="button" className="uc03-attribute-evidence-link" onClick={() => setSelectedSource(source)}>View boxed evidence</button> : <span>Source location unavailable</span>}</div> : '—'}</td>
                    <td><span className={`uc03-attribute-status ${decision === 'REJECTED' ? 'rejected' : needsDecision && !decision ? 'needs-review' : 'ready'}`}>{decision === 'ACCEPTED' ? 'Accepted' : decision === 'REJECTED' ? 'Rejected' : needsDecision ? 'Needs Review' : 'Ready'}</span></td>
                    <td>{needsDecision ? <DecisionButtons reviewKey={reviewKey} decision={decision} busy={decisionBusyKey === reviewKey} onDecision={(key, value) => void setDecision(key, value)} /> : <span className="uc03-review-auto-cleared">No action needed</span>}</td>
                  </tr>
                );
              }) : <tr><td colSpan={6} className="uc03-review-empty-table">No mapped Booking values have been extracted yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      {receiptGroups.length ? <section className="uc03-v2-section uc03-raw-review-section"><header className="uc03-v2-section-header"><div><span className="uc03-c1-eyebrow">Payment receipts</span><h2>Dealer receipt evidence</h2><p>Each receipt and field remains tied to its own DI document identity.</p></div><span>{receiptGroups.length} value{receiptGroups.length === 1 ? '' : 's'}</span></header>{renderRawGroups(receiptGroups)}</section> : null}
      {additionalRawGroups.length ? <section className="uc03-v2-section uc03-raw-review-section"><header className="uc03-v2-section-header"><div><span className="uc03-c1-eyebrow">Additional extracted evidence</span><h2>DI fields extracted but not mapped to a Booking attribute</h2><p>These are actual DI results, kept document-scoped so repeated documents remain separate. They are shown here instead of filling the screen with configured attributes for which DI returned no value.</p></div><span>{additionalRawGroups.length} field{additionalRawGroups.length === 1 ? '' : 's'}</span></header>{renderRawGroups(additionalRawGroups)}</section> : null}

      {decisionError ? <div className="uc03-c3-error" role="alert">{decisionError}</div> : null}
      {decisionsQuery.isError ? <div className="uc03-c3-error" role="alert">Review decisions could not be loaded. Refresh Review before confirming.</div> : null}
      {confirmationError ? <div className="uc03-c3-error" role="alert">{confirmationError}</div> : null}

      <section className="uc03-attribute-confirm-panel">
        <div><strong>{review.pcVerificationStatus === 'VERIFIED' ? 'Booking Review verified' : 'Complete Booking Review'}</strong><span>{review.pcVerificationStatus === 'VERIFIED' ? 'Original DI values, confirmed effective values and provenance are retained.' : review.processingPending ? 'Final confirmation unlocks when document processing finishes.' : failedDocuments.length ? 'Resolve failed document processing before confirming.' : unresolvedDecisionKeys.length ? `Decide the remaining ${unresolvedDecisionKeys.length} exception${unresolvedDecisionKeys.length === 1 ? '' : 's'} before confirming.` : 'Unchanged fields keep DI values; saved PC corrections become effective values.'}</span></div>
        {review.pcVerificationStatus !== 'VERIFIED' ? <button type="button" className="uc03-c3-primary" disabled={!canConfirm || confirming} onClick={() => void confirmReview()}>{confirming ? 'Confirming…' : 'Confirm reviewed values'}</button> : null}
      </section>

      {failedDocuments.length ? <div className="uc03-v2-review-failed-summary">{failedDocuments.length} document{failedDocuments.length === 1 ? '' : 's'} could not be processed and require follow-up.</div> : null}
      {selectedSource ? <AttributeEvidenceViewer tenantId={project.tenantId} journeyId={journeyId} accessToken={accessToken} source={selectedSource} onClose={() => setSelectedSource(undefined)} /> : null}
    </div>
  );
}
