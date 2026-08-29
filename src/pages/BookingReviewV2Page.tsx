import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';

import PageHeader from '../components/PageHeader';
import {
  getBookingReviewV2,
  type ReviewV2Field,
} from '../services/audit-core/uc03DocumentReviewV2';
import { useProjectContextStore } from '../store/projectContextStore';
import { useSessionStore } from '../store/sessionStore';
import '../styles/uc03-document-capture-v2.css';

const REVIEW_REFRESH_MS = 2 * 60 * 1000;

function displayFieldKey(fieldKey: string): string {
  return fieldKey
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return 'Not found';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function ReviewFieldRow({ field }: { field: ReviewV2Field }) {
  const needsReview = field.reviewState === 'NEEDS_REVIEW';
  return (
    <div className={`uc03-v2-review-field ${needsReview ? 'needs-review' : ''}`}>
      <div>
        <strong>{displayFieldKey(field.fieldKey)}</strong>
        {field.pageNo ? <small>Page {field.pageNo}</small> : null}
      </div>
      <span className={field.value === null || field.value === undefined ? 'is-empty' : ''}>
        {displayValue(field.value)}
      </span>
      <span className={`uc03-v2-review-state ${needsReview ? 'needs-review' : 'ready'}`}>
        {needsReview ? 'Needs Review' : 'Ready'}
      </span>
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

  const enabled = Boolean(project?.tenantId && journeyId && accessToken);
  const reviewQuery = useQuery({
    queryKey: ['uc03-document-review-v2', project?.tenantId, journeyId],
    queryFn: () => getBookingReviewV2(project!.tenantId, journeyId!, accessToken),
    enabled,
    refetchOnWindowFocus: false,
    refetchInterval: (query) => query.state.data?.processingPending ? REVIEW_REFRESH_MS : false,
  });

  const readyFieldCount = useMemo(
    () => reviewQuery.data?.documents.reduce(
      (total, document) => total + document.fields.length,
      0,
    ) ?? 0,
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

  return (
    <div className="screen-stack uc03-booking-journey uc03-v2-capture">
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
        title="Review extracted Booking information"
        description="Review becomes available immediately after Booking submission. Document extraction continues independently and updates this screen as results become available."
      />

      {review.processingPending ? (
        <div className="uc03-v2-review-pending" role="status">
          <div>
            <strong>Some documents are still being processed.</strong>
            <span>You can leave this screen and check later. While this window remains open, Review checks again after 2 minutes.</span>
          </div>
          <span>{pendingDocuments.length} pending</span>
        </div>
      ) : null}

      {review.needsReviewCount > 0 ? (
        <div className="uc03-v2-review-attention" role="status">
          <strong>{review.needsReviewCount} extracted field{review.needsReviewCount === 1 ? '' : 's'} need review.</strong>
          <span>Confidence values are intentionally hidden; only the review state is shown.</span>
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

      <section className="uc03-v2-section">
        <header className="uc03-v2-section-header">
          <div><span className="uc03-c1-eyebrow">Document Intelligence</span><h2>Extracted values</h2></div>
          <span>PC Verification: {review.pcVerificationStatus}</span>
        </header>

        {review.documents.length === 0 ? (
          <div className="uc03-v2-review-empty">
            <strong>No classified documents are available for Review yet.</strong>
            <span>Check again later if document processing has only just started.</span>
          </div>
        ) : (
          <div className="uc03-v2-review-documents">
            {review.documents.map((document) => (
              <article key={document.documentId} className="uc03-v2-review-document">
                <header>
                  <div>
                    <strong>{document.label}</strong>
                    <span>{document.originalFilename}</span>
                  </div>
                  <div className="uc03-v2-review-document-actions">
                    <span className={`uc03-v2-review-state ${document.extractionState.toLowerCase()}`}>
                      {document.extractionState === 'READY' ? 'Extraction Ready' : document.extractionState === 'FAILED' ? 'Processing Failed' : 'Processing'}
                    </span>
                    {document.contentUrl ? <a href={document.contentUrl} target="_blank" rel="noreferrer">View Document</a> : null}
                  </div>
                </header>

                {document.extractionState === 'PENDING' ? (
                  <div className="uc03-v2-review-document-message">
                    Extraction is not available yet. This does not invalidate the completed Booking capture.
                  </div>
                ) : document.extractionState === 'FAILED' ? (
                  <div className="uc03-v2-review-document-message is-error">
                    Document processing did not complete. This item requires follow-up.
                  </div>
                ) : document.fields.length === 0 ? (
                  <div className="uc03-v2-review-document-message">No extracted fields were returned for this document.</div>
                ) : (
                  <div className="uc03-v2-review-fields">
                    {document.fields.map((field) => (
                      <ReviewFieldRow key={`${document.documentId}:${field.fieldKey}`} field={field} />
                    ))}
                  </div>
                )}
              </article>
            ))}
          </div>
        )}

        {failedDocuments.length ? (
          <div className="uc03-v2-review-failed-summary">
            {failedDocuments.length} document{failedDocuments.length === 1 ? '' : 's'} could not be processed and require follow-up.
          </div>
        ) : null}
      </section>
    </div>
  );
}
