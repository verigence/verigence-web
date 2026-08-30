import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';

import PageHeader from '../components/PageHeader';
import AttributeEvidenceViewer, { hasBoxedEvidence } from '../features/uc03/AttributeEvidenceViewer';
import {
  confirmBookingReviewV2,
  getBookingReviewDecisionsV2,
  getBookingReviewV2,
  setBookingReviewDecisionV2,
  type ReviewDecisionValue,
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

const EXPECTED_DOCUMENT_BY_ATTRIBUTE: Record<string, string> = {
  customer_name: 'PAN Card / Aadhaar Card / Booking Form',
  customer_date_of_birth: 'PAN Card / Aadhaar Card',
  aadhaar_number: 'Aadhaar Card',
  customer_gender: 'Aadhaar Card',
  customer_address: 'Aadhaar Card / Booking Form',
  customer_number: 'Booking Form',
  mail_id: 'Booking Form',
  pan: 'PAN Card',
  pan_father_name: 'PAN Card',
  customer_relationship_type: 'PAN Card / Aadhaar Card',
  customer_relationship_name: 'PAN Card / Aadhaar Card',
  dealer_name: 'Booking Form',
  dealer_branch: 'Booking Form',
  sc_name: 'Booking Form',
  model: 'Booking Form / Invoice',
  variant: 'Booking Form / Invoice',
  color: 'Booking Form / Invoice',
  sku_code: 'Booking Form',
  booking_registration_by: 'Booking Form',
  booking_registration_type: 'Booking Form',
  booking_insurance_by: 'Booking Form',
  booking_exchange_applicable: 'Booking Form',
  booking_exchange_value: 'Booking Form',
  booking_ex_showroom_price: 'Booking Form / Cost Sheet / Invoice',
  booking_tcs_amount: 'Booking Form / Invoice',
  booking_registration_charges: 'Booking Form',
  booking_road_tax_amount: 'Booking Form',
  booking_road_tax_registration_combined: 'Booking Form',
  booking_insurance_amount: 'Insurance Document / Booking Form',
  booking_rsa_amount: 'Booking Form',
  booking_accessories_cost: 'Booking Form',
  booking_additional_warranty_amount: 'Booking Form',
  booking_other_charges: 'Booking Form',
  booking_total_price: 'Booking Form / Invoice',
  booking_discount_amount: 'Booking Form / Invoice',
  booking_bonus_amount: 'Booking Form',
  booking_net_amount: 'Booking Form / Invoice',
  booking_amount_paid: 'Booking Form',
  booking_balance_amount: 'Booking Form',
  booking_payment_mode: 'Booking Form',
  booking_payment_reference: 'Booking Form',
  expected_delivery_text: 'Booking Form',
  expected_delivery_date: 'Booking Form',
  booking_reference: 'Booking Form',
  actual_booking_date: 'Booking Form',
};

function displayFieldKey(fieldKey: string): string {
  return fieldKey
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return 'Not available yet';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function confidence(value: number | null): string {
  if (value === null || value === undefined) return '—';
  return `${value.toFixed(value % 1 === 0 ? 0 : 1)}%`;
}

function comparableValue(value: unknown): string {
  if (typeof value === 'string') return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function hasExtractedValue(attribute: ReviewV2Attribute): boolean {
  return attribute.resolvedValue !== null
    && attribute.resolvedValue !== undefined
    && attribute.resolvedValue !== '';
}

function expectedDocument(attribute: ReviewV2Attribute): string {
  return EXPECTED_DOCUMENT_BY_ATTRIBUTE[attribute.attributeKey] ?? 'Configured source document';
}

function isReceiptField(field: ReviewV2UnmappedField): boolean {
  return field.documentTypeKey?.trim().toLowerCase() === RECEIPT_DOCUMENT_TYPE;
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

interface RawReviewGroup {
  fieldKey: string;
  sources: ReviewV2UnmappedField[];
  selected: ReviewV2UnmappedField;
  needsDecision: boolean;
  mismatch: boolean;
}

function groupRawFields(fields: ReviewV2UnmappedField[]): RawReviewGroup[] {
  const grouped = new Map<string, ReviewV2UnmappedField[]>();
  fields.forEach((field) => {
    if (field.value === null || field.value === undefined || field.value === '') return;
    const existing = grouped.get(field.fieldKey) ?? [];
    existing.push(field);
    grouped.set(field.fieldKey, existing);
  });

  return [...grouped.entries()].map(([fieldKey, sources]) => {
    const sorted = [...sources].sort((left, right) => {
      const confidenceDelta = (right.confidenceScore ?? -1) - (left.confidenceScore ?? -1);
      if (confidenceDelta !== 0) return confidenceDelta;
      return left.documentLabel.localeCompare(right.documentLabel);
    });
    const selected = sorted[0];
    const mismatch = new Set(sources.map((source) => comparableValue(source.value))).size > 1;
    const lowConfidence = selected.confidenceScore === null || selected.confidenceScore < REVIEW_THRESHOLD;
    return {
      fieldKey,
      sources,
      selected,
      mismatch,
      needsDecision: mismatch || lowConfidence,
    };
  }).sort((left, right) => displayFieldKey(left.fieldKey).localeCompare(displayFieldKey(right.fieldKey)));
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
      <button
        type="button"
        className={decision === 'ACCEPTED' ? 'is-selected accept' : 'accept'}
        disabled={busy}
        onClick={() => onDecision(reviewKey, 'ACCEPTED')}
      >
        ✓ Accept
      </button>
      <button
        type="button"
        className={decision === 'REJECTED' ? 'is-selected reject' : 'reject'}
        disabled={busy}
        onClick={() => onDecision(reviewKey, 'REJECTED')}
      >
        ✕ Reject
      </button>
    </div>
  );
}

function AttributeRow({
  attribute,
  decision,
  busy,
  onEvidence,
  onDecision,
}: {
  attribute: ReviewV2Attribute;
  decision?: ReviewDecisionValue;
  busy: boolean;
  onEvidence: (source: ReviewV2SourceValue) => void;
  onDecision: (reviewKey: string, decision: ReviewDecisionValue) => void;
}) {
  const source = attribute.resolvedSource;
  const needsDecision = needsAttributeDecision(attribute);
  const localizationMissing = Boolean(source && !hasBoxedEvidence(source));
  const status = decision === 'REJECTED'
    ? 'Rejected'
    : decision === 'ACCEPTED'
      ? 'Accepted'
      : needsDecision
        ? (attribute.comparisonState === 'MISMATCH' ? 'Source Mismatch' : 'Needs Review')
        : localizationMissing
          ? 'Source Location Unavailable'
          : 'Ready';

  return (
    <tr className={needsDecision && !decision ? 'needs-review' : ''}>
      <td className="uc03-attribute-name-cell">
        <strong>{attribute.label}</strong>
        <span>
          {attribute.excelFieldNo ? `Excel #${attribute.excelFieldNo}` : 'Booking business field'}
          {attribute.mappingStatus === 'PROVISIONAL' ? ' · review-only mapping' : ''}
        </span>
      </td>
      <td>{displayValue(attribute.resolvedValue)}</td>
      <td>{confidence(attribute.confidenceScore)}</td>
      <td>
        {source ? (
          <div className="uc03-attribute-source-cell">
            <strong>{source.documentLabel}</strong>
            <span>{source.documentTypeKey || source.originalFilename}</span>
            {hasBoxedEvidence(source) ? (
              <button type="button" className="uc03-attribute-evidence-link" onClick={() => onEvidence(source)}>
                View boxed evidence
              </button>
            ) : (
              <span>Source location unavailable</span>
            )}
          </div>
        ) : '—'}
      </td>
      <td>
        <span className={`uc03-attribute-status ${decision === 'REJECTED' ? 'rejected' : needsDecision && !decision ? 'needs-review' : localizationMissing ? 'needs-review' : 'ready'}`}>
          {status}
        </span>
      </td>
      <td>
        {needsDecision ? (
          <DecisionButtons
            reviewKey={`attribute:${attribute.attributeKey}`}
            decision={decision}
            busy={busy}
            onDecision={onDecision}
          />
        ) : <span className="uc03-review-auto-cleared">No action needed</span>}
      </td>
    </tr>
  );
}

function RawReviewCards({
  groups,
  decisionByKey,
  decisionBusyKey,
  onEvidence,
  onDecision,
}: {
  groups: RawReviewGroup[];
  decisionByKey: Map<string, ReviewDecisionValue>;
  decisionBusyKey?: string;
  onEvidence: (source: ReviewV2SourceValue) => void;
  onDecision: (reviewKey: string, decision: ReviewDecisionValue) => void;
}) {
  return (
    <div className="uc03-raw-review-grid">
      {groups.map((group) => {
        const reviewKey = `raw:${group.fieldKey}`;
        const decision = decisionByKey.get(reviewKey);
        const selectedSourceValue = rawSource(group.selected);
        const selectedHasBox = hasBoxedEvidence(selectedSourceValue);
        return (
          <article key={group.fieldKey} className={`uc03-raw-review-card ${group.needsDecision && !decision ? 'needs-review' : ''}`}>
            <header>
              <div>
                <span className="uc03-attribute-evidence-kicker">DI extracted field</span>
                <h3>{displayFieldKey(group.fieldKey)}</h3>
              </div>
              <span className={`uc03-attribute-status ${decision === 'REJECTED' ? 'rejected' : group.needsDecision && !decision ? 'needs-review' : !selectedHasBox ? 'needs-review' : 'ready'}`}>
                {decision === 'ACCEPTED' ? 'Accepted' : decision === 'REJECTED' ? 'Rejected' : group.mismatch ? 'Source Mismatch' : group.needsDecision ? 'Needs Review' : !selectedHasBox ? 'Source Location Unavailable' : 'Ready'}
              </span>
            </header>

            <div className="uc03-raw-review-selected">
              <span>Selected DI value</span>
              <strong>{displayValue(group.selected.value)}</strong>
              <small>{group.selected.documentLabel} · {confidence(group.selected.confidenceScore)} · {selectedHasBox ? 'boxed evidence' : 'source location unavailable'}</small>
            </div>

            {group.sources.length > 1 && (
              <div className="uc03-raw-review-sources">
                <span>Available source values</span>
                {group.sources.map((source) => {
                  const evidenceSource = rawSource(source);
                  const boxed = hasBoxedEvidence(evidenceSource);
                  return (
                    <button
                      type="button"
                      key={`${source.documentId}:${source.canonicalFieldId}:${source.sourceFactVersion}`}
                      disabled={!boxed}
                      onClick={() => boxed && onEvidence(evidenceSource)}
                    >
                      <strong>{displayValue(source.value)}</strong>
                      <small>{source.documentLabel} · {confidence(source.confidenceScore)} · {boxed ? 'boxed evidence' : 'source location unavailable'}</small>
                    </button>
                  );
                })}
              </div>
            )}

            <div className="uc03-raw-review-actions">
              {selectedHasBox ? (
                <button type="button" className="uc03-attribute-evidence-link" onClick={() => onEvidence(selectedSourceValue)}>
                  View boxed evidence
                </button>
              ) : (
                <span>Source location unavailable</span>
              )}
              {group.needsDecision ? (
                <DecisionButtons
                  reviewKey={reviewKey}
                  decision={decision}
                  busy={decisionBusyKey === reviewKey}
                  onDecision={onDecision}
                />
              ) : <span className="uc03-review-auto-cleared">No action needed</span>}
            </div>
          </article>
        );
      })}
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
  const [confirming, setConfirming] = useState(false);
  const [confirmationMessage, setConfirmationMessage] = useState<string>();
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

  const receiptGroups = useMemo(
    () => groupRawFields((reviewQuery.data?.unmappedFields ?? []).filter(isReceiptField)),
    [reviewQuery.data?.unmappedFields],
  );
  const additionalRawGroups = useMemo(
    () => groupRawFields((reviewQuery.data?.unmappedFields ?? []).filter((field) => !isReceiptField(field))),
    [reviewQuery.data?.unmappedFields],
  );
  const rawGroups = useMemo(
    () => [...receiptGroups, ...additionalRawGroups],
    [receiptGroups, additionalRawGroups],
  );

  if (!project || !journeyId) return null;

  if (reviewQuery.isPending) {
    return <div className="uc03-c1-loading" role="status">Loading Booking Review…</div>;
  }

  if (reviewQuery.isError || !reviewQuery.data) {
    return (
      <section className="dashboard-load-state" role="alert">
        <div className="dashboard-load-state__mark">!</div>
        <div className="dashboard-load-state__copy">
          <strong>Review is not available yet.</strong>
          <p>{reviewQuery.error instanceof Error ? reviewQuery.error.message : 'Please try again.'}</p>
        </div>
        <button type="button" className="user-menu-button" onClick={() => void reviewQuery.refetch()}>Try Again</button>
      </section>
    );
  }

  const review = reviewQuery.data;
  const pendingDocuments = review.documents.filter((document) => document.extractionState === 'PENDING');
  const failedDocuments = review.documents.filter((document) => document.extractionState === 'FAILED');
  const populatedAttributes = review.attributes.filter(hasExtractedValue);
  const missingAttributes = review.attributes.filter((attribute) => !hasExtractedValue(attribute));
  const requiredMappedKeys = populatedAttributes
    .filter(needsAttributeDecision)
    .map((attribute) => `attribute:${attribute.attributeKey}`);
  const requiredRawKeys = rawGroups
    .filter((group) => group.needsDecision)
    .map((group) => `raw:${group.fieldKey}`);
  const requiredDecisionKeys = [...requiredMappedKeys, ...requiredRawKeys];
  const unresolvedDecisionKeys = requiredDecisionKeys.filter((key) => !decisionByKey.has(key));
  const canConfirm = review.pcVerificationStatus === 'PENDING'
    && !review.processingPending
    && failedDocuments.length === 0
    && !decisionsQuery.isPending
    && !decisionsQuery.isError
    && unresolvedDecisionKeys.length === 0;

  const setDecision = async (reviewKey: string, decision: ReviewDecisionValue) => {
    setDecisionBusyKey(reviewKey);
    setDecisionError(undefined);
    setConfirmationError(undefined);
    try {
      await setBookingReviewDecisionV2(
        project.tenantId,
        journeyId,
        reviewKey,
        decision,
        accessToken,
      );
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
    setConfirmationMessage(undefined);
    setConfirmationError(undefined);
    try {
      const result = await confirmBookingReviewV2(
        project.tenantId,
        journeyId,
        review.aggregateVersion,
        accessToken,
      );
      const applied = result.appliedAttributes.length;
      const reviewOnly = result.reviewOnlyAttributes.length;
      const rejected = result.rejectedAttributes?.length ?? 0;
      setConfirmationMessage(
        `Booking Review verified. ${applied} attribute${applied === 1 ? '' : 's'} updated; ${reviewOnly} remain review-only; ${rejected} rejected value${rejected === 1 ? '' : 's'} were not projected.`,
      );
      await Promise.all([reviewQuery.refetch(), decisionsQuery.refetch()]);
    } catch (error) {
      setConfirmationError(error instanceof Error ? error.message : 'Booking Review could not be confirmed. Refresh and try again.');
      await Promise.all([reviewQuery.refetch(), decisionsQuery.refetch()]);
    } finally {
      setConfirming(false);
    }
  };

  return (
    <div className="screen-stack uc03-booking-journey uc03-v2-capture uc03-attribute-review-page">
      <div className="uc03-c1-topbar">
        <button type="button" className="uc03-c1-back" onClick={() => navigate('/dashboard')}>← Work List</button>
        <div className="uc03-v2-review-top-actions">
          {hasNewResults ? (
            <button type="button" className="uc03-v2-review-notification" onClick={() => setHasNewResults(false)}>
              ● New review results
            </button>
          ) : null}
          <button
            type="button"
            className="uc03-v2-review-refresh"
            disabled={reviewQuery.isFetching || decisionsQuery.isFetching}
            onClick={() => {
              setHasNewResults(false);
              void Promise.all([reviewQuery.refetch(), decisionsQuery.refetch()]);
            }}
          >{reviewQuery.isFetching || decisionsQuery.isFetching ? 'Refreshing…' : 'Refresh Review'}</button>
        </div>
      </div>

      <PageHeader
        eyebrow="Booking Review · Evidence First"
        title="Review extracted Booking information"
        description="Verigence shows only values actually extracted by Document Intelligence in the main review. Expected attributes without an extracted value are listed separately at the bottom."
      />

      <section className="uc03-attribute-review-summary" aria-label="Booking review summary">
        <div><span>Mapped values</span><strong>{populatedAttributes.length}</strong></div>
        <div><span>Payment receipt values</span><strong>{receiptGroups.length}</strong></div>
        <div><span>Expected not extracted</span><strong>{missingAttributes.length}</strong></div>
        <div><span>Exceptions pending</span><strong>{unresolvedDecisionKeys.length}</strong></div>
      </section>

      {review.processingPending ? (
        <div className="uc03-v2-review-pending" role="status">
          <div>
            <strong>Some documents are still being processed.</strong>
            <span>Booking is complete. Keep working with the available results; this screen checks again after 2 minutes while it remains open.</span>
          </div>
          <span>{pendingDocuments.length} pending</span>
        </div>
      ) : null}

      {requiredDecisionKeys.length > 0 ? (
        <div className="uc03-v2-review-attention" role="status">
          <strong>{unresolvedDecisionKeys.length} of {requiredDecisionKeys.length} exception{requiredDecisionKeys.length === 1 ? '' : 's'} still need a decision.</strong>
          <span>Low-confidence or conflicting values require Accept or Reject. Normal high-confidence values do not need repetitive clicks.</span>
        </div>
      ) : null}

      {review.missingDeclarations.length ? (
        <section className="uc03-v2-section">
          <header>
            <div><span className="uc03-c1-eyebrow">Declarations</span><h2>Applicable documents not available</h2></div>
          </header>
          <div className="uc03-v2-review-missing-list">
            {review.missingDeclarations.map((item) => (
              <div key={item.requirementKey} className="uc03-v2-review-missing-row">
                <div>
                  <strong>{item.label}</strong>
                  <span>Applicable · Document not available</span>
                </div>
                <span>Recorded for audit follow-up</span>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="uc03-v2-section uc03-attribute-table-section">
        <header className="uc03-v2-section-header">
          <div>
            <span className="uc03-c1-eyebrow">Extracted Booking attributes</span>
            <h2>Business attribute review</h2>
            <p>Only mapped attributes with an actual DI value appear here. A mismatch or confidence below {REVIEW_THRESHOLD}% becomes an exception; otherwise no reviewer action is required.</p>
          </div>
          <span>PC Verification: {review.pcVerificationStatus}</span>
        </header>

        <div className="uc03-attribute-table-wrap">
          <table className="uc03-attribute-table uc03-booking-review-table">
            <thead>
              <tr>
                <th>Attribute</th>
                <th>DI value</th>
                <th>Confidence</th>
                <th>Source evidence</th>
                <th>Review state</th>
                <th>Decision</th>
              </tr>
            </thead>
            <tbody>
              {populatedAttributes.length > 0 ? populatedAttributes.map((attribute) => {
                const reviewKey = `attribute:${attribute.attributeKey}`;
                return (
                  <AttributeRow
                    key={attribute.attributeKey}
                    attribute={attribute}
                    decision={decisionByKey.get(reviewKey)}
                    busy={decisionBusyKey === reviewKey}
                    onEvidence={setSelectedSource}
                    onDecision={(key, decision) => void setDecision(key, decision)}
                  />
                );
              }) : (
                <tr>
                  <td colSpan={6} className="uc03-review-empty-table">No mapped Booking values have been extracted yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {receiptGroups.length > 0 && (
        <section className="uc03-v2-section uc03-raw-review-section">
          <header className="uc03-v2-section-header">
            <div>
              <span className="uc03-c1-eyebrow">Payment receipts</span>
              <h2>Dealer receipt evidence</h2>
              <p>Each receipt remains a separate payment record. Receipt values are reviewed in their own frame and are not collapsed into one Booking attribute.</p>
            </div>
            <span>{receiptGroups.length} value{receiptGroups.length === 1 ? '' : 's'}</span>
          </header>
          <RawReviewCards
            groups={receiptGroups}
            decisionByKey={decisionByKey}
            decisionBusyKey={decisionBusyKey}
            onEvidence={setSelectedSource}
            onDecision={(key, decision) => void setDecision(key, decision)}
          />
        </section>
      )}

      {additionalRawGroups.length > 0 && (
        <section className="uc03-v2-section uc03-raw-review-section">
          <header className="uc03-v2-section-header">
            <div>
              <span className="uc03-c1-eyebrow">Additional extracted evidence</span>
              <h2>DI values not yet mapped to a business attribute</h2>
              <p>Only genuinely unmapped values appear here. They stay in Document Intelligence and are never guessed into a business field.</p>
            </div>
            <span>{additionalRawGroups.length} field{additionalRawGroups.length === 1 ? '' : 's'}</span>
          </header>
          <RawReviewCards
            groups={additionalRawGroups}
            decisionByKey={decisionByKey}
            decisionBusyKey={decisionBusyKey}
            onEvidence={setSelectedSource}
            onDecision={(key, decision) => void setDecision(key, decision)}
          />
        </section>
      )}

      {missingAttributes.length > 0 && (
        <section className="uc03-v2-section uc03-missing-attribute-section">
          <header className="uc03-v2-section-header">
            <div>
              <span className="uc03-c1-eyebrow">Expected but not extracted</span>
              <h2>Attributes not available from DI</h2>
              <p>These are kept out of the review table. The list shows only the expected attribute and the document where it would normally be extracted.</p>
            </div>
            <span>{missingAttributes.length} attribute{missingAttributes.length === 1 ? '' : 's'}</span>
          </header>
          <div className="uc03-missing-attribute-list">
            <div className="uc03-missing-attribute-heading">
              <span>Attribute</span>
              <span>Expected document</span>
            </div>
            {missingAttributes.map((attribute) => (
              <div key={attribute.attributeKey} className="uc03-missing-attribute-row">
                <strong>{attribute.label}</strong>
                <span>{expectedDocument(attribute)}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {decisionError && <div className="uc03-c3-error" role="alert">{decisionError}</div>}
      {decisionsQuery.isError && <div className="uc03-c3-error" role="alert">Review decisions could not be loaded. Refresh Review before confirming.</div>}
      {confirmationMessage && <div className="uc03-c3-message" role="status">{confirmationMessage}</div>}
      {confirmationError && <div className="uc03-c3-error" role="alert">{confirmationError}</div>}

      <section className="uc03-attribute-confirm-panel">
        <div>
          <strong>{review.pcVerificationStatus === 'VERIFIED' ? 'Booking Review verified' : 'Complete Booking Review'}</strong>
          <span>
            {review.pcVerificationStatus === 'VERIFIED'
              ? 'Review decisions and source references are recorded. Raw DI extraction remains in Document Intelligence.'
              : review.processingPending
                ? 'Available results can be reviewed now. Final confirmation unlocks when document processing finishes.'
                : failedDocuments.length > 0
                  ? 'Resolve failed document processing before confirming.'
                  : unresolvedDecisionKeys.length > 0
                    ? `Decide the remaining ${unresolvedDecisionKeys.length} exception${unresolvedDecisionKeys.length === 1 ? '' : 's'} before confirming.`
                    : 'All exceptions are resolved. Confirmation re-reads current DI facts on the server and applies only approved typed business updates.'}
          </span>
        </div>
        {review.pcVerificationStatus !== 'VERIFIED' && (
          <button type="button" className="uc03-c3-primary" disabled={!canConfirm || confirming} onClick={() => void confirmReview()}>
            {confirming ? 'Confirming…' : 'Confirm reviewed values'}
          </button>
        )}
      </section>

      {failedDocuments.length ? (
        <div className="uc03-v2-review-failed-summary">
          {failedDocuments.length} document{failedDocuments.length === 1 ? '' : 's'} could not be processed and require follow-up.
        </div>
      ) : null}

      {selectedSource && (
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
