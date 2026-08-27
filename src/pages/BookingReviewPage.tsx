import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueries, useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';

import PageHeader from '../components/PageHeader';
import StatusPill from '../components/StatusPill';
import { DirectDiFieldReview } from '../features/uc03/DirectDiFieldReview';
import {
  REVIEW_READY_EVENT,
  clearReviewReadinessWatch,
  watchReviewReadiness,
} from '../features/uc03/ReviewReadinessWatcher';
import { getBookingWorkspace } from '../services/audit-core/uc03Booking';
import {
  getPcBookingReviewSnapshot,
  getPcDirectReviewState,
  submitPcDirectDocumentReview,
  verifyPcBookingDirect,
  type PcBookingReviewDocument,
  type PcDirectExtractedField,
} from '../services/audit-core/uc03PcDirectReview';
import { getPcVerification } from '../services/audit-core/uc03PcVerification';
import {
  getPcBookingDocumentContent,
  getPcBookingExtractionReview,
  type PcBookingExtractionFact,
  type PcBookingExtractionReview,
} from '../services/di/bookingDocuments';
import { useProjectContextStore } from '../store/projectContextStore';
import { useSessionStore } from '../store/sessionStore';

type ModifiedByDocument = Record<string, Record<string, string>>;

function friendly(value: string): string {
  return value
    .replace(/[_-]+/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function factValue(fact: PcBookingExtractionFact): unknown {
  return fact.normalizedValue ?? fact.rawValue;
}

export default function BookingReviewPage() {
  const { journeyId } = useParams<{ journeyId: string }>();
  const navigate = useNavigate();
  const project = useProjectContextStore((state) => state.selectedProject);
  const accessToken = useSessionStore((state) => state.accessToken);
  const [busyDocumentId, setBusyDocumentId] = useState<string>();
  const [verifying, setVerifying] = useState(false);
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();
  const [modifications, setModifications] = useState<ModifiedByDocument>({});
  const watchRegistered = useRef(false);

  const enabled = Boolean(project?.tenantId && journeyId && accessToken);
  const workspaceQuery = useQuery({
    queryKey: ['uc03-booking-review-workspace', project?.tenantId, journeyId],
    queryFn: () => getBookingWorkspace(project!.tenantId, journeyId!, accessToken),
    enabled,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const verificationQuery = useQuery({
    queryKey: ['uc03-pc-verification', project?.tenantId, journeyId],
    queryFn: () => getPcVerification(project!.tenantId, journeyId!, accessToken),
    enabled,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });
  const snapshotQuery = useQuery({
    queryKey: ['uc03-pc-direct-di-review-snapshot', project?.tenantId, journeyId],
    queryFn: () => getPcBookingReviewSnapshot(project!.tenantId, journeyId!, accessToken, true),
    enabled,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    retry: 1,
  });
  const directStateQuery = useQuery({
    queryKey: ['uc03-pc-direct-review-state', project?.tenantId, journeyId],
    queryFn: () => getPcDirectReviewState(project!.tenantId, journeyId!, accessToken),
    enabled,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    retry: 1,
  });

  const verification = verificationQuery.data;
  const workspace = workspaceQuery.data;
  const snapshot = snapshotQuery.data;
  const directState = directStateQuery.data;
  const bookingLabel = String(workspace?.capture.BOOKING_REFERENCE || 'Booking');
  const reviewedIds = useMemo(
    () => new Set(directState?.reviewedDocumentIds ?? []),
    [directState?.reviewedDocumentIds],
  );
  const reviewCandidates = useMemo(
    () => (snapshot?.documents ?? []).filter((document) => (
      document.linked
      && document.processingStatus.toUpperCase() === 'PROCESSED'
      && !reviewedIds.has(document.documentId)
    )),
    [reviewedIds, snapshot?.documents],
  );

  // DI owns the extraction schema. As soon as a document is review-ready, preload
  // its complete extraction and source content directly from DI in parallel so the
  // PC is not waiting on an Audit Core field whitelist when Review opens.
  const extractionQueries = useQueries({
    queries: reviewCandidates.map((document) => ({
      queryKey: ['uc03-pc-direct-di-extraction', project?.tenantId, journeyId, document.documentId],
      queryFn: () => getPcBookingExtractionReview(
        project!.tenantId,
        snapshot!.externalContextRef,
        document.documentId,
        accessToken!,
      ),
      staleTime: 60_000,
      refetchOnWindowFocus: false,
      retry: 1,
    })),
  });
  const contentQueries = useQueries({
    queries: reviewCandidates.map((document) => ({
      queryKey: ['uc03-pc-direct-di-content', project?.tenantId, journeyId, document.documentId],
      queryFn: () => getPcBookingDocumentContent(
        project!.tenantId,
        snapshot!.externalContextRef,
        document.documentId,
        accessToken!,
      ),
      staleTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      retry: 1,
    })),
  });

  const extractionByDocument = useMemo(() => {
    const result = new Map<string, PcBookingExtractionReview>();
    reviewCandidates.forEach((document, index) => {
      const review = extractionQueries[index]?.data;
      if (review) result.set(document.documentId, review);
    });
    return result;
  }, [extractionQueries, reviewCandidates]);

  useEffect(() => {
    if (!project?.tenantId || !journeyId || !verification || !snapshot) return;
    if (verification.pcVerificationStatus === 'VERIFIED' || snapshot.allReady) {
      clearReviewReadinessWatch(project.tenantId, journeyId);
      watchRegistered.current = false;
      return;
    }
    if (verification.pcVerificationStatus === 'PENDING' && snapshot.failedCount === 0 && !watchRegistered.current) {
      watchRegistered.current = true;
      watchReviewReadiness(project.tenantId, journeyId, bookingLabel);
    }
  }, [bookingLabel, journeyId, project?.tenantId, snapshot, verification]);

  useEffect(() => {
    if (!project?.tenantId || !journeyId) return undefined;
    const onReady = (event: Event) => {
      const detail = (event as CustomEvent<{ tenantId: string; journeyId: string }>).detail;
      if (detail?.tenantId !== project.tenantId || detail?.journeyId !== journeyId) return;
      void snapshotQuery.refetch();
    };
    window.addEventListener(REVIEW_READY_EVENT, onReady);
    return () => window.removeEventListener(REVIEW_READY_EVENT, onReady);
  }, [journeyId, project?.tenantId, snapshotQuery.refetch]);

  if (!project || !journeyId) return null;

  const refresh = async () => {
    await Promise.all([
      workspaceQuery.refetch(),
      verificationQuery.refetch(),
      snapshotQuery.refetch(),
      directStateQuery.refetch(),
    ]);
  };

  const setModifiedValue = (documentId: string, fact: PcBookingExtractionFact, value: string) => {
    setModifications((current) => ({
      ...current,
      [documentId]: {
        ...(current[documentId] || {}),
        [fact.sourceFactRef]: value,
      },
    }));
  };

  const resetModifiedValue = (documentId: string, fact: PcBookingExtractionFact) => {
    setModifications((current) => {
      const documentValues = { ...(current[documentId] || {}) };
      delete documentValues[fact.sourceFactRef];
      return { ...current, [documentId]: documentValues };
    });
  };

  const saveDocumentReview = async (document: PcBookingReviewDocument) => {
    const review = extractionByDocument.get(document.documentId);
    if (!review) return;
    const documentModifications = modifications[document.documentId] || {};
    const fields: PcDirectExtractedField[] = review.facts.map((fact) => ({
      fieldKey: fact.fieldKey,
      sourceFactRef: fact.sourceFactRef,
      sourceFactVersion: fact.sourceFactVersion,
      extractedValue: factValue(fact),
      modifiedValue: Object.prototype.hasOwnProperty.call(documentModifications, fact.sourceFactRef)
        ? documentModifications[fact.sourceFactRef]
        : null,
      confidenceScore: fact.confidenceScore,
    }));

    setBusyDocumentId(document.documentId);
    setError(undefined);
    setMessage(undefined);
    try {
      const result = await submitPcDirectDocumentReview(
        project.tenantId,
        journeyId,
        document.requirementRef,
        document.documentId,
        fields,
        accessToken,
      );
      const changed = result.modifiedFieldCount;
      setMessage(
        `${friendly(document.documentTypeKey || document.requirementKey)} review saved: `
        + `${result.storedFieldCount} DI field${result.storedFieldCount === 1 ? '' : 's'} stored`
        + `${changed ? `, ${changed} changed` : ''}.`,
      );
      setModifications((current) => {
        const next = { ...current };
        delete next[document.documentId];
        return next;
      });
      await Promise.all([directStateQuery.refetch(), verificationQuery.refetch()]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The document review could not be saved.');
    } finally {
      setBusyDocumentId(undefined);
    }
  };

  const handleVerify = async () => {
    setVerifying(true);
    setError(undefined);
    setMessage(undefined);
    try {
      const current = await verificationQuery.refetch();
      const version = current.data?.aggregateVersion;
      if (version === undefined) throw new Error('Unable to read the current Booking version. Please refresh and retry.');
      await verifyPcBookingDirect(project.tenantId, journeyId, version, accessToken);
      clearReviewReadinessWatch(project.tenantId, journeyId);
      await Promise.all([verificationQuery.refetch(), directStateQuery.refetch()]);
      setMessage('PC verification completed.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'PC verification could not be completed.');
    } finally {
      setVerifying(false);
    }
  };

  if (workspaceQuery.isPending || verificationQuery.isPending || snapshotQuery.isPending || directStateQuery.isPending) {
    return <div className="uc03-c1-loading" role="status">Opening document review…</div>;
  }
  if (workspaceQuery.isError || verificationQuery.isError || snapshotQuery.isError || directStateQuery.isError || !workspace || !verification || !snapshot || !directState) {
    const cause = workspaceQuery.error || verificationQuery.error || snapshotQuery.error || directStateQuery.error;
    return (
      <section className="dashboard-load-state" role="alert">
        <div className="dashboard-load-state__mark">!</div>
        <div className="dashboard-load-state__copy">
          <strong>We couldn't open this Booking review.</strong>
          <p>{cause instanceof Error ? cause.message : 'Please try again.'}</p>
        </div>
        <button type="button" className="user-menu-button" onClick={() => void refresh()}>Try Again</button>
      </section>
    );
  }

  if (!verification.captureSubmitted) {
    return (
      <div className="screen-stack uc03-c1-workspace">
        <PageHeader eyebrow="PC Document Verification" title={bookingLabel} description="Submit Booking Details before document verification." />
        <section className="uc03-c1-section">
          <div className="uc03-review-empty" role="status">
            <strong>Booking capture has not been submitted.</strong>
            <span>Complete Step 2 before opening document review.</span>
          </div>
          <button type="button" className="uc03-c1-secondary" onClick={() => navigate(`/bookings/${journeyId}`)}>Back to Booking</button>
        </section>
      </div>
    );
  }

  if (verification.pcVerificationStatus === 'VERIFIED') {
    return (
      <div className="screen-stack uc03-c1-workspace">
        <PageHeader eyebrow="PC Document Verification" title={bookingLabel} description="The PC document verification for this Booking is complete." />
        <section className="uc03-c1-section">
          <div className="uc03-review-empty" role="status">
            <strong>Booking verified.</strong>
            <span>DI extraction and any PC modifications have been recorded in Audit Core.</span>
          </div>
          <button type="button" className="uc03-c1-secondary" onClick={() => navigate('/dashboard')}>Back to Work List</button>
        </section>
      </div>
    );
  }

  const canVerify = snapshot.allReady && directState.reviewComplete;
  const pendingDocumentReviewCount = directState.pendingDocumentCount;

  return (
    <div className="screen-stack uc03-c1-workspace">
      <div className="uc03-c1-topbar">
        <button type="button" className="uc03-c1-back" onClick={() => navigate('/dashboard')}>← Work list</button>
        <span>Project · {project.projectName}</span>
      </div>

      <PageHeader
        eyebrow="PC Document Verification"
        title={bookingLabel}
        description="All extracted fields and source documents are read directly from Document Intelligence. Change only values that are incorrect."
      />

      {!snapshot.allReady && (
        <section className="uc03-c1-section">
          <div className="uc03-review-empty" role="status">
            <strong>{snapshot.documents.length === 0 ? 'No Booking documents are available in Document Intelligence.' : 'Some documents are still being prepared.'}</strong>
            <span>
              {snapshot.documents.length === 0
                ? 'Return to Booking Documents and confirm the uploads were accepted.'
                : 'You can review any document already processed. Pending documents will continue asynchronously; while this application window remains open, we will recheck after two minutes.'}
            </span>
          </div>
        </section>
      )}

      <section className="uc03-c1-stage-strip" aria-label="Document processing status">
        <div><span>Linked documents</span><strong>{snapshot.linkedDocumentCount}</strong></div>
        <div><span>Processing</span><strong>{snapshot.processingCount}</strong></div>
        <div><span>Need attention</span><strong>{snapshot.failedCount}</strong></div>
        <div><span>PC verification</span><StatusPill value="PENDING" /></div>
      </section>

      <section className="uc03-c1-section">
        <header className="uc03-c1-section-heading">
          <div>
            <span className="uc03-c1-eyebrow">Booking documents</span>
            <h2>Document status</h2>
            <p>This list comes from the current DI Booking context. A replacement document is shown immediately even if its Audit Core linkage callback is still completing.</p>
          </div>
        </header>
        {snapshot.documents.length > 0 ? (
          <div className="uc03-c1-stage-strip" aria-label="Booking document list">
            {snapshot.documents.map((document) => {
              const reviewed = reviewedIds.has(document.documentId);
              const state = reviewed
                ? 'Reviewed'
                : !document.linked
                  ? 'Linking'
                  : friendly(document.processingStatus);
              return (
                <div key={document.documentId}>
                  <span>{friendly(document.documentTypeKey || document.requirementKey)}</span>
                  <strong>{state}</strong>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="uc03-review-empty" role="status">
            <strong>No documents returned by DI.</strong>
            <span>Use Booking Documents to upload the required Booking evidence.</span>
          </div>
        )}
      </section>

      {snapshot.failedCount > 0 && (
        <div className="uc03-c1-feedback is-error" role="alert">
          One or more documents could not be processed. Upload a clearer replacement from Booking Documents and reopen Review.
        </div>
      )}
      {message && <div className="uc03-c1-feedback is-success" role="status">{message}</div>}
      {error && <div className="uc03-c1-feedback is-error" role="alert">{error}</div>}

      {reviewCandidates.map((document, index) => {
        const extractionQuery = extractionQueries[index];
        const contentQuery = contentQueries[index];
        const review = extractionQuery?.data;
        const saving = busyDocumentId === document.documentId;
        return (
          <section className="uc03-c1-section" key={document.documentId}>
            {extractionQuery?.isPending && <div className="uc03-c1-loading" role="status">Loading extracted values from DI…</div>}
            {extractionQuery?.isError && (
              <div className="uc03-c1-feedback is-error" role="alert">
                {extractionQuery.error instanceof Error ? extractionQuery.error.message : 'DI extraction could not be loaded for this document.'}
              </div>
            )}
            {review && (
              <>
                <DirectDiFieldReview
                  documentName={friendly(document.documentTypeKey || document.requirementKey)}
                  facts={review.facts}
                  content={contentQuery?.data}
                  contentLoading={contentQuery?.isPending}
                  contentError={contentQuery?.isError
                    ? (contentQuery.error instanceof Error ? contentQuery.error.message : 'DI source document could not be loaded.')
                    : undefined}
                  modifiedValues={modifications[document.documentId] || {}}
                  disabled={Boolean(busyDocumentId) || verifying}
                  onModify={(fact, value) => setModifiedValue(document.documentId, fact, value)}
                  onReset={(fact) => resetModifiedValue(document.documentId, fact)}
                />
                <div className="uc03-c1-document-actions">
                  <button
                    type="button"
                    className="uc03-c1-primary"
                    disabled={saving || Boolean(busyDocumentId) || verifying}
                    onClick={() => void saveDocumentReview(document)}
                  >
                    {saving ? 'Saving Review…' : 'Save Document Review'}
                  </button>
                </div>
              </>
            )}
          </section>
        );
      })}

      {reviewCandidates.length === 0 && snapshot.documents.some((document) => reviewedIds.has(document.documentId)) && (
        <section className="uc03-c1-section">
          <div className="uc03-review-empty" role="status">
            <strong>Processed documents already reviewed.</strong>
            <span>Any remaining document will become reviewable when DI finishes processing it.</span>
          </div>
        </section>
      )}

      <section className="uc03-c1-section uc03-c1-checkpoint-section">
        <header className="uc03-c1-section-heading">
          <div>
            <span className="uc03-c1-eyebrow">PC verification</span>
            <h2>{canVerify ? 'Review complete' : `${pendingDocumentReviewCount} document${pendingDocumentReviewCount === 1 ? '' : 's'} still to review`}</h2>
            <p>This changes only PC verification status. It does not change the Booking business status and does not require a TL review.</p>
          </div>
          <StatusPill value={canVerify ? 'READY' : 'PENDING'} />
        </header>
        <button type="button" className="uc03-c1-primary" disabled={verifying || Boolean(busyDocumentId) || !canVerify} onClick={() => void handleVerify()}>
          {verifying ? 'Completing…' : 'Mark Booking Verified'}
        </button>
        <div className="uc03-c1-document-actions">
          <button type="button" className="uc03-c1-secondary" onClick={() => navigate('/dashboard')}>Back to Work List</button>
          <button type="button" className="uc03-c1-secondary" onClick={() => navigate(`/bookings/${journeyId}`)}>Booking Documents</button>
          <button type="button" className="uc03-c1-secondary" onClick={() => void refresh()}>Check Again</button>
        </div>
      </section>
    </div>
  );
}
