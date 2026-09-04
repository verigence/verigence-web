import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';

import PageHeader from '../components/PageHeader';
import AttributeEvidenceViewer, { hasBoxedEvidence } from '../features/uc03/AttributeEvidenceViewer';
import ReviewEffectiveValueEditor, { reviewSourceKey } from '../features/uc03/ReviewEffectiveValueEditor';
import { buildRawReviewGroups } from '../features/uc03/reviewFieldGroups';
import { completeDelivery, getDeliveryWorkspace } from '../services/audit-core/uc03Delivery';
import {
  confirmDeliveryReviewV2,
  getDeliveryReviewV2,
  type ReviewFieldCorrection,
  type ReviewV2Attribute,
  type ReviewV2SourceValue,
  type ReviewV2UnmappedField,
} from '../services/audit-core/uc03DocumentReviewV2';
import { useProjectContextStore } from '../store/projectContextStore';
import { useSessionStore } from '../store/sessionStore';
import '../styles/uc03-document-capture-v2.css';
import '../styles/uc03-attribute-audit-review.css';
import '../styles/uc03-delivery-capture-v2.css';

const REFRESH_MS = 2 * 60 * 1000;
const REVIEW_THRESHOLD = 92;

type ReviewGroup = 'CUSTOMER' | 'VEHICLE' | 'FINANCIAL' | 'OTHER';

function hasExtractedValue(value: unknown): boolean {
  return value !== null && value !== undefined && value !== '';
}

function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return 'Not available';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  try { return JSON.stringify(value); } catch { return String(value); }
}

function fieldLabel(fieldKey: string): string {
  return fieldKey
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function groupFor(key: string, label: string): ReviewGroup {
  const text = `${key} ${label}`.toLowerCase();
  if (/(customer|name|mobile|phone|email|address|pan|aadhaar|identity|dob)/.test(text)) return 'CUSTOMER';
  if (/(vehicle|model|variant|colour|color|vin|chassis|engine|registration|invoice|dealer|outlet)/.test(text)) return 'VEHICLE';
  if (/(price|amount|payment|receipt|discount|tax|gst|insurance|finance|balance|total|ex showroom|ex_showroom)/.test(text)) return 'FINANCIAL';
  return 'OTHER';
}

function groupTitle(group: ReviewGroup): string {
  if (group === 'CUSTOMER') return 'Customer Details';
  if (group === 'VEHICLE') return 'Vehicle & Invoice Details';
  if (group === 'FINANCIAL') return 'Price & Payment Details';
  return 'Other Extracted Details';
}

function confidence(value: number | null): string {
  if (value === null || value === undefined) return 'Confidence —';
  return `${value.toFixed(value % 1 === 0 ? 0 : 1)}% confidence`;
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

function EvidenceSource({ source, onEvidence }: { source: ReviewV2SourceValue; onEvidence: (source: ReviewV2SourceValue) => void }) {
  const boxed = hasBoxedEvidence(source);
  if (!boxed) {
    return (
      <div className="uc03-delivery-review-source" style={{ cursor: 'default' }}>
        <strong>{source.documentLabel}</strong>
        <span>{displayValue(source.value)}</span>
        <small>{confidence(source.confidenceScore)} · Source location unavailable</small>
      </div>
    );
  }
  return (
    <button type="button" className="uc03-delivery-review-source" onClick={() => onEvidence(source)}>
      <strong>{source.documentLabel}</strong>
      <span>{displayValue(source.value)}</span>
      <small>{confidence(source.confidenceScore)} · boxed evidence</small>
    </button>
  );
}

export default function DeliveryReviewV2Page() {
  const { journeyId = '' } = useParams();
  const navigate = useNavigate();
  const project = useProjectContextStore((state) => state.selectedProject);
  const accessToken = useSessionStore((state) => state.accessToken);
  const [activeGroup, setActiveGroup] = useState<ReviewGroup>('CUSTOMER');
  const [selectedSource, setSelectedSource] = useState<ReviewV2SourceValue>();
  const [corrections, setCorrections] = useState<Map<string, ReviewFieldCorrection>>(new Map());
  const [confirming, setConfirming] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();

  const enabled = Boolean(project?.tenantId && journeyId && accessToken);
  const reviewQuery = useQuery({
    queryKey: ['uc03-delivery-review-v2', project?.tenantId, journeyId],
    queryFn: () => getDeliveryReviewV2(project!.tenantId, journeyId, accessToken),
    enabled,
    retry: false,
    refetchOnWindowFocus: false,
    refetchInterval: (query) => query.state.data?.processingPending ? REFRESH_MS : false,
  });
  const workspaceQuery = useQuery({
    queryKey: ['uc03-delivery-review-workspace', project?.tenantId, journeyId],
    queryFn: () => getDeliveryWorkspace(project!.tenantId, journeyId, accessToken),
    enabled,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const rawGroups = useMemo(
    () => buildRawReviewGroups(reviewQuery.data?.unmappedFields ?? [], REVIEW_THRESHOLD),
    [reviewQuery.data?.unmappedFields],
  );
  const groupedAttributes = useMemo(() => {
    const groups: Record<ReviewGroup, ReviewV2Attribute[]> = { CUSTOMER: [], VEHICLE: [], FINANCIAL: [], OTHER: [] };
    reviewQuery.data?.attributes.forEach((attribute) => {
      if (!hasExtractedValue(attribute.resolvedValue)) return;
      groups[groupFor(attribute.attributeKey, attribute.label)].push(attribute);
    });
    return groups;
  }, [reviewQuery.data?.attributes]);
  const groupedRaw = useMemo(() => {
    const groups: Record<ReviewGroup, typeof rawGroups> = { CUSTOMER: [], VEHICLE: [], FINANCIAL: [], OTHER: [] };
    rawGroups.forEach((item) => groups[groupFor(item.fieldKey, fieldLabel(item.fieldKey))].push(item));
    return groups;
  }, [rawGroups]);

  if (!project || !journeyId) return null;
  if (reviewQuery.isPending || workspaceQuery.isPending) return <div className="uc03-c1-loading" role="status">Loading Delivery Review…</div>;
  if (reviewQuery.isError || !reviewQuery.data || workspaceQuery.isError || !workspaceQuery.data) {
    return (
      <section className="dashboard-load-state" role="alert">
        <div className="dashboard-load-state__mark">!</div>
        <div className="dashboard-load-state__copy"><strong>Delivery Review is not available yet.</strong><p>Refresh after Delivery documents are submitted.</p></div>
        <button type="button" className="user-menu-button" onClick={() => void Promise.all([reviewQuery.refetch(), workspaceQuery.refetch()])}>Try Again</button>
      </section>
    );
  }

  const review = reviewQuery.data;
  const workspace = workspaceQuery.data;
  const deliveryCompleted = workspace.delivery.businessStatus === 'DELIVERY_COMPLETED';
  const failedDocuments = review.documents.filter((document) => document.extractionState === 'FAILED');
  const mappedExceptions = review.attributes.filter((attribute) => (
    hasExtractedValue(attribute.resolvedValue)
    && (attribute.comparisonState === 'MISMATCH' || attribute.reviewState === 'NEEDS_REVIEW')
  )).length;
  const rawExceptions = rawGroups.filter((item) => item.needsDecision).length;
  const exceptions = mappedExceptions + rawExceptions;
  const extractedCount = review.attributes.filter((attribute) => hasExtractedValue(attribute.resolvedValue)).length + rawGroups.length;
  const canConfirmReview = review.pcVerificationStatus === 'PENDING' && !review.processingPending && failedDocuments.length === 0;

  const setCorrection = (source: ReviewV2SourceValue | ReviewV2UnmappedField, correction: ReviewFieldCorrection | undefined) => {
    const key = reviewSourceKey(source);
    setCorrections((current) => {
      const next = new Map(current);
      if (correction) next.set(key, correction);
      else next.delete(key);
      return next;
    });
  };

  const confirmReview = async () => {
    setConfirming(true);
    setError(undefined);
    setMessage(undefined);
    try {
      const result = await confirmDeliveryReviewV2(
        project.tenantId,
        journeyId,
        review.aggregateVersion,
        [...corrections.values()],
        accessToken,
      );
      setCorrections(new Map());
      setMessage(`${result.storedFieldCount} Delivery DI field${result.storedFieldCount === 1 ? '' : 's'} confirmed in Audit Core.`);
      await Promise.all([reviewQuery.refetch(), workspaceQuery.refetch()]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Delivery Review could not be confirmed. Refresh and try again.');
      await Promise.all([reviewQuery.refetch(), workspaceQuery.refetch()]);
    } finally {
      setConfirming(false);
    }
  };

  const completePhysicalDelivery = async () => {
    setCompleting(true);
    setError(undefined);
    setMessage(undefined);
    try {
      const result = await completeDelivery(project.tenantId, journeyId, workspace.delivery.aggregateVersion, accessToken);
      setMessage(`Delivery recorded as complete. ${result.raisedFlagIds.length} audit flag${result.raisedFlagIds.length === 1 ? '' : 's'} raised for follow-up.`);
      await Promise.all([workspaceQuery.refetch(), reviewQuery.refetch()]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Delivery could not be completed.');
      await Promise.all([workspaceQuery.refetch(), reviewQuery.refetch()]);
    } finally {
      setCompleting(false);
    }
  };

  return (
    <div className="screen-stack uc03-delivery-review-v2">
      <div className="uc03-c1-topbar">
        <button type="button" className="uc03-c1-back" onClick={() => navigate('/dashboard')}>← Work List</button>
        <button type="button" className="uc03-v2-review-refresh" disabled={reviewQuery.isFetching} onClick={() => void reviewQuery.refetch()}>{reviewQuery.isFetching ? 'Refreshing…' : 'Refresh Review'}</button>
      </div>
      <PageHeader
        eyebrow="Delivery Review · Evidence First"
        title="Review Delivery information"
        description="Review values extracted from Delivery-stage documents. The DI value remains traceable; edit only when the confirmed business value is different."
      />

      {message ? <div className="uc03-booking-journey-feedback is-success" role="status">{message}</div> : null}
      {error ? <div className="uc03-booking-journey-feedback is-error" role="alert">{error}</div> : null}

      <section className="uc03-delivery-review-summary">
        <div><span>Extracted fields</span><strong>{extractedCount}</strong></div>
        <div><span>Audit exceptions</span><strong>{exceptions}</strong></div>
        <div><span>PC corrections</span><strong>{corrections.size}</strong></div>
        <div><span>Review status</span><strong>{review.pcVerificationStatus}</strong></div>
      </section>

      {review.processingPending ? <div className="uc03-booking-journey-feedback is-success" role="status">Some Delivery document values are still being prepared. Available values remain usable; this Review checks again in 2 minutes.</div> : null}

      <nav className="uc03-delivery-review-tabs" aria-label="Delivery review sections">
        {(['CUSTOMER', 'VEHICLE', 'FINANCIAL', 'OTHER'] as ReviewGroup[]).map((group) => (
          <button key={group} type="button" className={activeGroup === group ? 'is-active' : ''} onClick={() => setActiveGroup(group)}>
            {groupTitle(group)} ({groupedAttributes[group].length + groupedRaw[group].length})
          </button>
        ))}
      </nav>

      <section className="uc03-delivery-review-section">
        <h2>{groupTitle(activeGroup)}</h2>
        {groupedAttributes[activeGroup].map((attribute) => {
          const source = attribute.resolvedSource;
          const localizationException = attribute.sources.some((item) => !hasBoxedEvidence(item));
          const exception = attribute.comparisonState === 'MISMATCH' || attribute.reviewState === 'NEEDS_REVIEW' || localizationException;
          return (
            <article key={attribute.attributeKey} className={`uc03-delivery-review-field ${exception ? 'is-exception' : ''}`}>
              <div className="uc03-delivery-review-field__name"><strong>{attribute.label}</strong><span>{attribute.sources.length} source{attribute.sources.length === 1 ? '' : 's'}</span></div>
              <div className="uc03-delivery-review-field__value">
                {source ? (
                  <ReviewEffectiveValueEditor
                    source={source}
                    correction={corrections.get(reviewSourceKey(source))}
                    onChange={(correction) => setCorrection(source, correction)}
                    requireValue
                    disabled={review.pcVerificationStatus === 'VERIFIED'}
                  />
                ) : <strong>{displayValue(attribute.resolvedValue)}</strong>}
                <span>{confidence(attribute.confidenceScore)}</span>
              </div>
              <div className="uc03-delivery-review-sources">
                {attribute.sources.map((item) => <EvidenceSource key={`${item.documentId}:${item.canonicalFieldId}:${item.sourceFactVersion}`} source={item} onEvidence={setSelectedSource} />)}
              </div>
              <span className="uc03-delivery-review-result">{attribute.comparisonState === 'MISMATCH' ? 'Source mismatch' : attribute.reviewState === 'NEEDS_REVIEW' ? 'Needs review' : 'Ready'}</span>
            </article>
          );
        })}

        {groupedRaw[activeGroup].map((item) => {
          const source = item.selected;
          const evidenceSource = rawSource(source);
          return (
            <article key={item.groupKey} className={`uc03-delivery-review-field ${item.needsDecision ? 'is-exception' : ''}`}>
              <div className="uc03-delivery-review-field__name"><strong>{fieldLabel(item.fieldKey)}</strong><span>DI extracted · not mapped · {source.documentLabel}</span></div>
              <div className="uc03-delivery-review-field__value">
                <ReviewEffectiveValueEditor
                  source={source}
                  correction={corrections.get(reviewSourceKey(source))}
                  onChange={(correction) => setCorrection(source, correction)}
                  disabled={review.pcVerificationStatus === 'VERIFIED'}
                />
                <span>{confidence(source.confidenceScore)}</span>
              </div>
              <div className="uc03-delivery-review-sources">
                {item.sources.map((field) => {
                  const itemSource = rawSource(field);
                  return <EvidenceSource key={`${field.documentId}:${field.canonicalFieldId}:${field.sourceFactVersion}`} source={itemSource} onEvidence={setSelectedSource} />;
                })}
              </div>
              <span className="uc03-delivery-review-result">{item.needsDecision ? 'Needs review' : 'Ready'}</span>
              {hasBoxedEvidence(evidenceSource) ? <button type="button" className="uc03-attribute-evidence-link" onClick={() => setSelectedSource(evidenceSource)}>View selected evidence</button> : null}
            </article>
          );
        })}
        {!groupedAttributes[activeGroup].length && !groupedRaw[activeGroup].length ? <p>No extracted values are available in this section yet.</p> : null}
      </section>

      <section className="uc03-attribute-confirm-panel">
        <div>
          <strong>{review.pcVerificationStatus === 'VERIFIED' ? 'Delivery Review verified' : 'Confirm Delivery Review'}</strong>
          <span>{review.pcVerificationStatus === 'VERIFIED' ? 'Original DI values and confirmed effective values are retained in Audit Core.' : review.processingPending ? 'Final Review confirmation becomes available when Delivery document processing finishes.' : failedDocuments.length ? 'Resolve failed Delivery document processing before Review confirmation.' : 'Unchanged fields keep their DI values; saved corrections become the effective values.'}</span>
        </div>
        {review.pcVerificationStatus !== 'VERIFIED' ? <button type="button" className="uc03-c3-primary" disabled={!canConfirmReview || confirming} onClick={() => void confirmReview()}>{confirming ? 'Confirming…' : 'Confirm reviewed values'}</button> : null}
      </section>

      <section className="uc03-delivery-review-complete">
        <div>
          <strong>{deliveryCompleted ? 'Physical Delivery is complete' : 'Record physical Delivery when handover is complete'}</strong>
          <p>Physical Delivery remains independent of audit Review. Open exceptions or an unfinished Review do not block the Delivery event.</p>
        </div>
        {!deliveryCompleted ? <button type="button" className="uc03-c1-primary" disabled={completing} onClick={() => void completePhysicalDelivery()}>{completing ? 'Recording…' : 'Complete Delivery'}</button> : <button type="button" className="uc03-c1-secondary" onClick={() => navigate(`/audit/${journeyId}`)}>View Audit Flags</button>}
      </section>

      {selectedSource ? <AttributeEvidenceViewer tenantId={project.tenantId} journeyId={journeyId} accessToken={accessToken} source={selectedSource} onClose={() => setSelectedSource(undefined)} /> : null}
    </div>
  );
}
