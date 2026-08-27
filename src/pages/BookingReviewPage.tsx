import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueries, useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';

import PageHeader from '../components/PageHeader';
import StatusPill from '../components/StatusPill';
import { DocumentFieldReview } from '../features/uc03/DocumentFieldReview';
import {
  REVIEW_READY_EVENT,
  clearReviewReadinessWatch,
  watchReviewReadiness,
} from '../features/uc03/ReviewReadinessWatcher';
import {
  getBookingWorkspace,
  type EvidenceRegion,
  type ExtractionProposalView,
} from '../services/audit-core/uc03Booking';
import type { BookingExtractionFieldDecision } from '../services/audit-core/uc03PcBookingDocuments';
import {
  getPcBookingReviewSnapshot,
  getPcDirectReviewState,
  submitPcDirectDocumentReview,
  verifyPcBookingDirect,
  type PcBookingReviewDocument,
} from '../services/audit-core/uc03PcDirectReview';
import { getPcVerification } from '../services/audit-core/uc03PcVerification';
import {
  getPcBookingExtractionReview,
  type PcBookingExtractionFact,
  type PcBookingExtractionReview,
} from '../services/di/bookingDocuments';
import { useProjectContextStore } from '../store/projectContextStore';
import { useSessionStore } from '../store/sessionStore';

interface LocalFieldDecision {
  decision: 'APPROVED' | 'CORRECTED';
  approvedValue: unknown;
}

type DecisionByDocument = Record<string, Record<string, LocalFieldDecision>>;

function friendly(value: string): string {
  return value
    .replace(/[_-]+/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function factValue(fact: PcBookingExtractionFact): unknown {
  return fact.normalizedValue ?? fact.rawValue;
}

function reviewableFacts(
  document: PcBookingReviewDocument,
  review?: PcBookingExtractionReview,
): PcBookingExtractionFact[] {
  if (!review) return [];
  const allowed = new Set(document.captureEligibleFieldKeys.map((key) => key.toLowerCase()));
  const seen = new Set<string>();
  return review.facts.filter((fact) => {
    const fieldKey = fact.fieldKey.toLowerCase();
    if (!allowed.has(fieldKey) || seen.has(fieldKey)) return false;
    const foundStatus = fact.foundStatus.toUpperCase();
    if (foundStatus === 'NOT_FOUND' || foundStatus === 'MISSING' || factValue(fact) === null || factValue(fact) === undefined) {
      return false;
    }
    seen.add(fieldKey);
    return true;
  });
}

function proposalsFor(
  document: PcBookingReviewDocument,
  review?: PcBookingExtractionReview,
): ExtractionProposalView[] {
  return reviewableFacts(document, review).map((fact) => ({
    proposalId: fact.sourceFactRef,
    fieldKey: fact.fieldKey,
    sourceEvidenceId: document.documentId,
    sourceFactId: fact.sourceFactRef,
    sourceFactVersion: fact.sourceFactVersion,
    sourceDocumentTypeKey: document.documentTypeKey,
    valueSource: 'DI_MACHINE',
    proposedValue: factValue(fact),
    // Confidence is deliberately not presented to the PC. It is carried from the
    // DI fact only when the document batch is submitted for immutable provenance.
    confidence: null,
    pageNo: fact.pageNo,
    evidenceRegion: fact.evidenceRegion as EvidenceRegion | null,
    status: 'PENDING',
    acceptedValue: null,
    canAccept: true,
    owningDomainKey: null,
    owningRecordReference: null,
    version: 1,
  }));
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
  const [decisions, setDecisions] = useState<DecisionByDocument>({});
  const [documentComplete, setDocumentComplete] = useState<Record<string, boolean>>({});
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

  const rememberDecision = (
    documentId: string,
    proposal: ExtractionProposalView,
    decision: LocalFieldDecision,
  ) => {
    setDecisions((current) => ({
      ...current,
      [documentId]: {
        ...(current[documentId] || {}),
        [proposal.proposalId]: decision,
      },
    }));
  };

  const saveDocumentReview = async (document: PcBookingReviewDocument) => {
    const review = extractionByDocument.get(document.documentId);
    if (!review) return;
    const proposals = proposalsFor(document, review);
    const documentDecisions = decisions[document.documentId] || {};
    if (proposals.some((proposal) => !documentDecisions[proposal.proposalId])) {
      setError('Review every extracted value before saving this document review.');
      return;
    }

    const factByRef = new Map(review.facts.map((fact) => [fact.sourceFactRef, fact]));
    const fields: BookingExtractionFieldDecision[] = proposals.map((proposal) => {
      const fact = factByRef.get(proposal.sourceFactId);
      const local = documentDecisions[proposal.proposalId];
      if (!fact || !local) throw new Error('The DI extraction changed while this document was being reviewed. Please reopen the review.');
      return {
        fieldKey: fact.fieldKey,
        sourceFactRef: fact.sourceFactRef,
        sourceFactVersion: 1,
        sourceConfidence: fact.confidenceScore,
        decision: local.decision,
        approvedValue: local.approvedValue,
      };
    });

    setBusyDocumentId(document.documentId);
    setError(undefined);
    setMessage(undefined);
    try {
      await submitPcDirectDocumentReview(
        project.tenantId,
        journeyId,
        document.requirementRef,
        document.documentId,
        fields,
        accessToken,
      );
      setMessage(`${friendly(document.documentTypeKey || document.requirementKey)} review saved.`);
      setDecisions((current) => {
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
            <span>Confirmed or corrected business values have been recorded in Audit Core. DI retains its original extraction.</span>
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
        description="Booking capture is complete. Document status and extraction are read directly from Document Intelligence."
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
        const query = extractionQueries[index];
        const review = query?.data;
        const proposals = proposalsFor(document, review);
        const decidedIds = new Set(Object.keys(decisions[document.documentId] || {}));
        const isComplete = documentComplete[document.documentId] ?? proposals.length === 0;
        const saving = busyDocumentId === document.documentId;
        return (
          <section className="uc03-c1-section" key={document.documentId}>
            {query?.isPending && <div className="uc03-c1-loading" role="status">Loading extracted values…</div>}
            {query?.isError && (
              <div className="uc03-c1-feedback is-error" role="alert">
                {query.error instanceof Error ? query.error.message : 'DI extraction could not be loaded for this document.'}
              </div>
            )}
            {review && (
              <>
                <DocumentFieldReview
                  tenantId={project.tenantId}
                  journeyId={journeyId}
                  accessToken={accessToken}
                  evidenceId={document.documentId}
                  documentName={friendly(document.documentTypeKey || document.requirementKey)}
                  proposals={proposals}
                  decidedIds={decidedIds}
                  disabled={Boolean(busyDocumentId) || verifying}
                  onAccept={async (proposal) => {
                    rememberDecision(document.documentId, proposal, {
                      decision: 'APPROVED',
                      approvedValue: proposal.proposedValue,
                    });
                  }}
                  onCorrect={async (proposal, value) => {
                    rememberDecision(document.documentId, proposal, {
                      decision: 'CORRECTED',
                      approvedValue: value,
                    });
                  }}
                  onReviewCompleteChange={(complete) => setDocumentComplete((current) => (
                    current[document.documentId] === complete
                      ? current
                      : { ...current, [document.documentId]: complete }
                  ))}
                />
                <div className="uc03-c1-document-actions">
                  <button
                    type="button"
                    className="uc03-c1-primary"
                    disabled={!isComplete || saving || Boolean(busyDocumentId) || verifying}
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
