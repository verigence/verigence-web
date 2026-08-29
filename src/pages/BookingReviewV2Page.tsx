import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';

import PageHeader from '../components/PageHeader';
import AttributeEvidenceViewer from '../features/uc03/AttributeEvidenceViewer';
import {
  getBookingReviewV2,
  type ReviewV2Attribute,
  type ReviewV2SourceValue,
} from '../services/audit-core/uc03DocumentReviewV2';
import { useProjectContextStore } from '../store/projectContextStore';
import { useSessionStore } from '../store/sessionStore';
import '../styles/uc03-document-capture-v2.css';
import '../styles/uc03-attribute-audit-review.css';

const REVIEW_REFRESH_MS = 2 * 60 * 1000;

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

function AttributeRow({
  attribute,
  processingPending,
  onEvidence,
}: {
  attribute: ReviewV2Attribute;
  processingPending: boolean;
  onEvidence: (source: ReviewV2SourceValue) => void;
}) {
  const source = attribute.resolvedSource;
  const hasValue = attribute.resolvedValue !== null && attribute.resolvedValue !== undefined && attribute.resolvedValue !== '';
  const needsReview = hasValue && attribute.reviewState === 'NEEDS_REVIEW';
  const status = hasValue
    ? (needsReview ? 'Needs Review' : 'Ready')
    : (processingPending ? 'Processing' : 'Not Available');

  return (
    <tr className={needsReview ? 'needs-review' : ''}>
      <td className="uc03-attribute-name-cell">
        <strong>{attribute.label}</strong>
        <span>
          {attribute.excelFieldNo ? `Excel #${attribute.excelFieldNo}` : 'Booking business field'}
          {attribute.mappingStatus === 'PROVISIONAL' ? ' · provisional mapping' : ''}
        </span>
      </td>
      <td className={hasValue ? '' : 'is-empty'}>{displayValue(attribute.resolvedValue)}</td>
      <td>{confidence(attribute.confidenceScore)}</td>
      <td>
        {source ? (
          <div className="uc03-attribute-source-cell">
            <strong>{source.documentLabel}</strong>
            <span>{source.documentTypeKey || source.originalFilename}</span>
          </div>
        ) : '—'}
      </td>
      <td><span className={`uc03-attribute-status ${needsReview ? 'needs-review' : hasValue ? 'ready' : 'pending'}`}>{status}</span></td>
      <td>
        {source ? (
          <button type="button" className="uc03-attribute-evidence-link" onClick={() => onEvidence(source)}>
            View evidence
          </button>
        ) : '—'}
      </td>
    </tr>
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

  const enabled = Boolean(project?.tenantId && journeyId && accessToken);
  const reviewQuery = useQuery({
    queryKey: ['uc03-document-review-v2', project?.tenantId, journeyId],
    queryFn: () => getBookingReviewV2(project!.tenantId, journeyId!, accessToken),
    enabled,
    refetchOnWindowFocus: false,
    refetchInterval: (query) => query.state.data?.processingPending ? REVIEW_REFRESH_MS : false,
  });

  const readyFieldCount = useMemo(
    () => reviewQuery.data?.attributes.filter((attribute) => (
      attribute.resolvedValue !== null && attribute.resolvedValue !== undefined
    )).length ?? 0,
    [reviewQuery.data],
  );

  useEffect(() => {
    const previous = previousReadyFieldCount.current;
    if (previous !== null && readyFieldCount > previous) setHasNewResults(true);
    previousReadyFieldCount.current = readyFieldCount;
  }, [readyFieldCount]);

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
  const populatedCount = review.attributes.filter((attribute) => (
    attribute.resolvedValue !== null && attribute.resolvedValue !== undefined
  )).length;

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
            disabled={reviewQuery.isFetching}
            onClick={() => {
              setHasNewResults(false);
              void reviewQuery.refetch();
            }}
          >{reviewQuery.isFetching ? 'Refreshing…' : 'Refresh Review'}</button>
        </div>
      </div>

      <PageHeader
        eyebrow="Booking Review · V2"
        title="Review Booking attributes from source documents"
        description="The business attribute view is resolved from Document Intelligence without copying raw extraction data into Audit Core. Click any source to inspect the exact document, page and Gemini evidence box."
      />

      <section className="uc03-attribute-review-summary" aria-label="Booking review summary">
        <div><span>Mapped attributes</span><strong>{review.attributes.length}</strong></div>
        <div><span>Populated</span><strong>{populatedCount}</strong></div>
        <div><span>Needs review</span><strong>{review.needsReviewCount}</strong></div>
        <div><span>Documents processing</span><strong>{pendingDocuments.length}</strong></div>
      </section>

      {review.processingPending ? (
        <div className="uc03-v2-review-pending" role="status">
          <div>
            <strong>Some documents are still being processed.</strong>
            <span>Booking is complete. This Review remains live and checks again after 2 minutes while the screen is open.</span>
          </div>
          <span>{pendingDocuments.length} pending</span>
        </div>
      ) : null}

      {review.needsReviewCount > 0 ? (
        <div className="uc03-v2-review-attention" role="status">
          <strong>{review.needsReviewCount} populated attribute{review.needsReviewCount === 1 ? '' : 's'} need attention.</strong>
          <span>Confidence is shown so PC/TL can decide whether to inspect the boxed source evidence.</span>
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
            <span className="uc03-c1-eyebrow">Common UC03 attribute mapping</span>
            <h2>Booking Attribute Review</h2>
            <p>V1 and V2 extraction keys resolve through the same explicit business/Excel mapping. No fuzzy label matching is used.</p>
          </div>
          <span>PC Verification: {review.pcVerificationStatus}</span>
        </header>

        <div className="uc03-attribute-table-wrap">
          <table className="uc03-attribute-table">
            <thead>
              <tr>
                <th>Attribute</th>
                <th>Resolved value</th>
                <th>Confidence</th>
                <th>Document</th>
                <th>Status</th>
                <th>Evidence</th>
              </tr>
            </thead>
            <tbody>
              {review.attributes.map((attribute) => (
                <AttributeRow
                  key={attribute.attributeKey}
                  attribute={attribute}
                  processingPending={review.processingPending}
                  onEvidence={setSelectedSource}
                />
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {review.unmappedFields.length > 0 && (
        <details className="uc03-attribute-unmapped">
          <summary>{review.unmappedFields.length} extracted value{review.unmappedFields.length === 1 ? '' : 's'} not yet mapped to a UC03 business/Excel attribute</summary>
          <p>These values are deliberately not guessed into a business field. Add an explicit mapping before they can participate in resolution.</p>
          <div className="uc03-attribute-unmapped-grid">
            {review.unmappedFields.map((field, index) => (
              <div key={`${field.documentId}:${field.fieldKey}:${index}`}>
                <strong>{displayFieldKey(field.fieldKey)}</strong>
                <span>{displayValue(field.value)}</span>
                <small>{field.documentLabel} · {confidence(field.confidenceScore)}</small>
              </div>
            ))}
          </div>
        </details>
      )}

      <details className="uc03-attribute-document-inventory">
        <summary>Document evidence inventory ({review.documents.length})</summary>
        <div className="uc03-v2-review-documents">
          {review.documents.map((document) => (
            <article key={document.documentId} className="uc03-v2-review-document">
              <header>
                <div><strong>{document.label}</strong><span>{document.originalFilename}</span></div>
                <span className={`uc03-v2-review-state ${document.extractionState.toLowerCase()}`}>
                  {document.extractionState === 'READY' ? 'Extraction Ready' : document.extractionState === 'FAILED' ? 'Processing Failed' : 'Processing'}
                </span>
              </header>
              {document.fields.length > 0 && (
                <div className="uc03-attribute-document-fields">
                  {document.fields.map((field) => (
                    <span key={`${document.documentId}:${field.fieldKey}`}>{displayFieldKey(field.fieldKey)} · {confidence(field.confidenceScore)}</span>
                  ))}
                </div>
              )}
            </article>
          ))}
        </div>
      </details>

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
