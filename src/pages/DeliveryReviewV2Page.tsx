import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';

import PageHeader from '../components/PageHeader';
import AttributeEvidenceViewer from '../features/uc03/AttributeEvidenceViewer';
import { completeDelivery, getDeliveryWorkspace } from '../services/audit-core/uc03Delivery';
import {
  getAuditSourceComparisonV2,
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

type ReviewGroup = 'CUSTOMER' | 'VEHICLE' | 'FINANCIAL' | 'OTHER';

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
    reviewState: field.confidenceScore !== null && field.confidenceScore >= 92 ? 'READY' : 'NEEDS_REVIEW',
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

function AttributeCard({ attribute, onEvidence }: { attribute: ReviewV2Attribute; onEvidence: (source: ReviewV2SourceValue) => void }) {
  const exception = attribute.comparisonState === 'MISMATCH' || attribute.reviewState === 'NEEDS_REVIEW';
  return (
    <article className={`uc03-delivery-review-field ${exception ? 'is-exception' : ''}`}>
      <div className="uc03-delivery-review-field__name">
        <strong>{attribute.label}</strong>
        <span>{attribute.sources.length} source{attribute.sources.length === 1 ? '' : 's'}</span>
      </div>
      <div className="uc03-delivery-review-field__value">
        <strong>{displayValue(attribute.resolvedValue)}</strong>
        <span>{confidence(attribute.confidenceScore)}</span>
      </div>
      <div className="uc03-delivery-review-sources">
        {attribute.sources.map((source) => (
          <button key={`${source.documentId}:${source.canonicalFieldId}:${source.sourceFactVersion}`} type="button" className="uc03-delivery-review-source" onClick={() => onEvidence(source)}>
            <strong>{source.documentLabel}</strong>
            <span>{displayValue(source.value)}</span>
            <small>{confidence(source.confidenceScore)} · boxed evidence</small>
          </button>
        ))}
      </div>
      <span className="uc03-delivery-review-result">
        {attribute.comparisonState === 'MATCH' ? 'Sources match' : attribute.comparisonState === 'MISMATCH' ? 'Exception' : attribute.comparisonState === 'SINGLE_SOURCE' ? 'Single source' : 'Not available'}
      </span>
    </article>
  );
}

interface RawGroup {
  fieldKey: string;
  fields: ReviewV2UnmappedField[];
  selected: ReviewV2UnmappedField;
  mismatch: boolean;
}

function rawGroups(fields: ReviewV2UnmappedField[]): RawGroup[] {
  const grouped = new Map<string, ReviewV2UnmappedField[]>();
  fields.forEach((field) => {
    if (field.value === null || field.value === undefined || field.value === '') return;
    grouped.set(field.fieldKey, [...(grouped.get(field.fieldKey) ?? []), field]);
  });
  return [...grouped.entries()].map(([fieldKey, sources]) => {
    const sorted = [...sources].sort((left, right) => (right.confidenceScore ?? -1) - (left.confidenceScore ?? -1));
    const values = new Set(sources.map((source) => JSON.stringify(source.value)));
    return { fieldKey, fields: sources, selected: sorted[0], mismatch: values.size > 1 };
  });
}

export default function DeliveryReviewV2Page() {
  const { journeyId = '' } = useParams();
  const navigate = useNavigate();
  const project = useProjectContextStore((state) => state.selectedProject);
  const accessToken = useSessionStore((state) => state.accessToken);
  const [activeGroup, setActiveGroup] = useState<ReviewGroup>('CUSTOMER');
  const [selectedSource, setSelectedSource] = useState<ReviewV2SourceValue>();
  const [completing, setCompleting] = useState(false);
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();

  const enabled = Boolean(project?.tenantId && journeyId && accessToken);
  const comparisonQuery = useQuery({
    queryKey: ['uc03-delivery-review-v2', project?.tenantId, journeyId],
    queryFn: () => getAuditSourceComparisonV2(project!.tenantId, journeyId, accessToken),
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

  const raw = useMemo(() => rawGroups(comparisonQuery.data?.unmappedFields ?? []), [comparisonQuery.data?.unmappedFields]);
  const groupedAttributes = useMemo(() => {
    const groups: Record<ReviewGroup, ReviewV2Attribute[]> = { CUSTOMER: [], VEHICLE: [], FINANCIAL: [], OTHER: [] };
    comparisonQuery.data?.attributes.forEach((attribute) => {
      if (attribute.resolvedValue === null || attribute.resolvedValue === undefined || attribute.resolvedValue === '') return;
      groups[groupFor(attribute.attributeKey, attribute.label)].push(attribute);
    });
    return groups;
  }, [comparisonQuery.data?.attributes]);
  const groupedRaw = useMemo(() => {
    const groups: Record<ReviewGroup, RawGroup[]> = { CUSTOMER: [], VEHICLE: [], FINANCIAL: [], OTHER: [] };
    raw.forEach((item) => groups[groupFor(item.fieldKey, fieldLabel(item.fieldKey))].push(item));
    return groups;
  }, [raw]);

  if (!project || !journeyId) return null;

  if (comparisonQuery.isPending || workspaceQuery.isPending) return <div className="uc03-c1-loading" role="status">Loading Delivery Review…</div>;
  if (comparisonQuery.isError || !comparisonQuery.data || workspaceQuery.isError || !workspaceQuery.data) {
    return (
      <section className="dashboard-load-state" role="alert">
        <div className="dashboard-load-state__mark">!</div>
        <div className="dashboard-load-state__copy"><strong>Delivery Review is not available yet.</strong><p>Refresh after Delivery documents are submitted.</p></div>
        <button type="button" className="user-menu-button" onClick={() => void Promise.all([comparisonQuery.refetch(), workspaceQuery.refetch()])}>Try Again</button>
      </section>
    );
  }

  const comparison = comparisonQuery.data;
  const workspace = workspaceQuery.data;
  const deliveryCompleted = workspace.delivery.businessStatus === 'DELIVERY_COMPLETED';
  const exceptions = comparison.attributes.filter((attribute) => attribute.comparisonState === 'MISMATCH' || attribute.reviewState === 'NEEDS_REVIEW').length
    + raw.filter((item) => item.mismatch || item.selected.confidenceScore === null || item.selected.confidenceScore < 92).length;
  const extractedCount = comparison.attributes.filter((attribute) => attribute.resolvedValue !== null && attribute.resolvedValue !== undefined && attribute.resolvedValue !== '').length + raw.length;

  const complete = async () => {
    setCompleting(true);
    setError(undefined);
    try {
      const result = await completeDelivery(project.tenantId, journeyId, workspace.delivery.aggregateVersion, accessToken);
      setMessage(`Delivery recorded as complete. ${result.raisedFlagIds.length} audit flag${result.raisedFlagIds.length === 1 ? '' : 's'} raised for follow-up.`);
      await workspaceQuery.refetch();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Delivery could not be completed.');
    } finally {
      setCompleting(false);
    }
  };

  return (
    <div className="screen-stack uc03-delivery-review-v2">
      <div className="uc03-c1-topbar">
        <button type="button" className="uc03-c1-back" onClick={() => navigate('/dashboard')}>← Work List</button>
        <button type="button" className="uc03-v2-review-refresh" disabled={comparisonQuery.isFetching} onClick={() => void comparisonQuery.refetch()}>{comparisonQuery.isFetching ? 'Refreshing…' : 'Refresh Review'}</button>
      </div>
      <PageHeader
        eyebrow="Delivery Review · Evidence First"
        title="Review Delivery information"
        description="All extracted values are shown with their source evidence. Differences and low-confidence values are identified as audit exceptions; they never block Delivery."
      />

      {message ? <div className="uc03-booking-journey-feedback is-success" role="status">{message}</div> : null}
      {error ? <div className="uc03-booking-journey-feedback is-error" role="alert">{error}</div> : null}

      <section className="uc03-delivery-review-summary">
        <div><span>Extracted fields</span><strong>{extractedCount}</strong></div>
        <div><span>Audit exceptions</span><strong>{exceptions}</strong></div>
        <div><span>Documents processing</span><strong>{comparison.processingPending ? 'Yes' : 'No'}</strong></div>
        <div><span>Delivery status</span><strong>{deliveryCompleted ? 'Completed' : 'In progress'}</strong></div>
      </section>

      {comparison.processingPending ? <div className="uc03-booking-journey-feedback is-success" role="status">Some document values are still being prepared. Available values are shown now; this Review refreshes again in 2 minutes.</div> : null}

      <nav className="uc03-delivery-review-tabs" aria-label="Delivery review sections">
        {(['CUSTOMER', 'VEHICLE', 'FINANCIAL', 'OTHER'] as ReviewGroup[]).map((group) => (
          <button key={group} type="button" className={activeGroup === group ? 'is-active' : ''} onClick={() => setActiveGroup(group)}>
            {groupTitle(group)} ({groupedAttributes[group].length + groupedRaw[group].length})
          </button>
        ))}
      </nav>

      <section className="uc03-delivery-review-section">
        <h2>{groupTitle(activeGroup)}</h2>
        {groupedAttributes[activeGroup].map((attribute) => (
          <AttributeCard key={attribute.attributeKey} attribute={attribute} onEvidence={setSelectedSource} />
        ))}
        {groupedRaw[activeGroup].map((item) => {
          const exception = item.mismatch || item.selected.confidenceScore === null || item.selected.confidenceScore < 92;
          return (
            <article key={`raw:${item.fieldKey}`} className={`uc03-delivery-review-field ${exception ? 'is-exception' : ''}`}>
              <div className="uc03-delivery-review-field__name"><strong>{fieldLabel(item.fieldKey)}</strong><span>{item.fields.length} source{item.fields.length === 1 ? '' : 's'}</span></div>
              <div className="uc03-delivery-review-field__value"><strong>{displayValue(item.selected.value)}</strong><span>{confidence(item.selected.confidenceScore)}</span></div>
              <div className="uc03-delivery-review-sources">
                {item.fields.map((field) => {
                  const source = rawSource(field);
                  return <button key={`${field.documentId}:${field.canonicalFieldId}:${field.sourceFactVersion}`} type="button" className="uc03-delivery-review-source" onClick={() => setSelectedSource(source)}><strong>{field.documentLabel}</strong><span>{displayValue(field.value)}</span><small>{confidence(field.confidenceScore)} · boxed evidence</small></button>;
                })}
              </div>
              <span className="uc03-delivery-review-result">{exception ? 'Exception' : item.fields.length > 1 ? 'Sources match' : 'Single source'}</span>
            </article>
          );
        })}
        {!groupedAttributes[activeGroup].length && !groupedRaw[activeGroup].length ? <p>No extracted values are available in this section yet.</p> : null}
      </section>

      <section className="uc03-delivery-review-complete">
        <div>
          <strong>{deliveryCompleted ? 'Physical Delivery is complete' : 'Record physical Delivery when handover is complete'}</strong>
          <p>Audit exceptions remain open for follow-up and never prevent the Delivery event.</p>
        </div>
        {!deliveryCompleted ? <button type="button" className="uc03-c1-primary" disabled={completing} onClick={() => void complete()}>{completing ? 'Recording…' : 'Complete Delivery'}</button> : <button type="button" className="uc03-c1-secondary" onClick={() => navigate(`/audit/${journeyId}`)}>View Audit Flags</button>}
      </section>

      {selectedSource ? <AttributeEvidenceViewer tenantId={project.tenantId} journeyId={journeyId} accessToken={accessToken} source={selectedSource} onClose={() => setSelectedSource(undefined)} /> : null}
    </div>
  );
}
