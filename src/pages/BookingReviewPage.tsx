import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';

import PageHeader from '../components/PageHeader';
import StatusPill from '../components/StatusPill';
import { OptimizedDirectDiFieldReview } from '../features/uc03/OptimizedDirectDiFieldReview';
import { clearReviewReadinessWatch } from '../features/uc03/ReviewReadinessWatcher';
import {
  getCachedBookingReviewContext,
  prepareBookingDocumentUploadContext,
  type BookingReviewCachedContext,
  type BookingReviewCachedDocument,
} from '../services/audit-core/uc03PcBookingDocuments';
import {
  getPcDirectReviewState,
  submitPcDirectDocumentReview,
  verifyPcBookingDirect,
  type PcDirectExtractedField,
} from '../services/audit-core/uc03PcDirectReview';
import { getPcVerification } from '../services/audit-core/uc03PcVerification';
import {
  getPcBookingExtractionReview,
  type PcBookingExtractionFact,
  type PcBookingExtractionReview,
} from '../services/di/bookingDocuments';
import { getPcBookingDocumentPreviewSource } from '../services/di/bookingPreview';
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

function LazyReviewDocument({
  tenantId,
  journeyId,
  externalContextRef,
  document,
  accessToken,
  enabled,
  saving,
  blocked,
  modifiedValues,
  onModify,
  onReset,
  onSave,
  onPreviewSettled,
}: {
  tenantId: string;
  journeyId: string;
  externalContextRef: string;
  document: BookingReviewCachedDocument;
  accessToken: string;
  enabled: boolean;
  saving: boolean;
  blocked: boolean;
  modifiedValues: Record<string, string>;
  onModify: (fact: PcBookingExtractionFact, value: string) => void;
  onReset: (fact: PcBookingExtractionFact) => void;
  onSave: (document: BookingReviewCachedDocument, review: PcBookingExtractionReview) => void;
  onPreviewSettled: () => void;
}) {
  const settledNotified = useRef(false);
  const extractionQuery = useQuery({
    queryKey: ['uc03-pc-direct-di-extraction', tenantId, journeyId, document.documentId],
    queryFn: () => getPcBookingExtractionReview(
      tenantId,
      externalContextRef,
      document.documentId,
      accessToken,
    ),
    enabled,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: 1,
  });
  const extractionReady = extractionQuery.data?.processingStatus.toUpperCase() === 'PROCESSED';
  const contentQuery = useQuery({
    queryKey: ['uc03-pc-direct-di-preview-v2', tenantId, journeyId, document.documentId],
    queryFn: () => getPcBookingDocumentPreviewSource(
      tenantId,
      externalContextRef,
      document.documentId,
      accessToken,
      document,
    ),
    // Do not start a large source-document request until the small extraction
    // response confirms this document is actually ready for human review.
    enabled: enabled && extractionReady,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: 1,
  });

  const notifySequenceSettled = () => {
    if (settledNotified.current) return;
    settledNotified.current = true;
    onPreviewSettled();
  };

  useEffect(() => {
    if (!enabled || settledNotified.current) return;
    if (extractionQuery.isError) {
      notifySequenceSettled();
      return;
    }
    if (extractionQuery.isSuccess && !extractionReady) {
      // A still-processing document must not block the rest of the Booking.
      notifySequenceSettled();
    }
  }, [enabled, extractionQuery.isError, extractionQuery.isSuccess, extractionReady]);

  if (!enabled) {
    return (
      <section className="uc03-c1-section" aria-label={`${friendly(document.documentTypeKey)} queued`}>
        <div className="uc03-review-empty" role="status">
          <strong>{friendly(document.documentTypeKey)}</strong>
          <span>Queued. It will load after the previous document becomes visible.</span>
        </div>
      </section>
    );
  }

  if (extractionQuery.isPending) {
    return (
      <section className="uc03-c1-section">
        <div className="uc03-c1-loading" role="status">
          Loading {friendly(document.documentTypeKey)} extraction from Document Intelligence…
        </div>
      </section>
    );
  }

  if (extractionQuery.isError || !extractionQuery.data) {
    return (
      <section className="uc03-c1-section">
        <div className="uc03-c1-feedback is-error" role="alert">
          {extractionQuery.error instanceof Error
            ? extractionQuery.error.message
            : `${friendly(document.documentTypeKey)} extraction could not be loaded from DI.`}
        </div>
        <div className="uc03-c1-document-actions">
          <button type="button" className="uc03-c1-secondary" onClick={() => void extractionQuery.refetch()}>
            Retry this document
          </button>
        </div>
      </section>
    );
  }

  const review = extractionQuery.data;
  if (!extractionReady) {
    return (
      <section className="uc03-c1-section">
        <div className="uc03-review-empty" role="status">
          <strong>{friendly(document.documentTypeKey)} is still processing.</strong>
          <span>The next document can continue while DI finishes this one.</span>
        </div>
        <div className="uc03-c1-document-actions">
          <button type="button" className="uc03-c1-secondary" onClick={() => void extractionQuery.refetch()}>
            Check this document again
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="uc03-c1-section">
      <OptimizedDirectDiFieldReview
        documentName={friendly(document.documentTypeKey || document.requirementKey)}
        facts={review.facts}
        content={contentQuery.data}
        contentLoading={contentQuery.isPending}
        contentError={contentQuery.isError
          ? (contentQuery.error instanceof Error ? contentQuery.error.message : 'Source document could not be loaded.')
          : undefined}
        modifiedValues={modifiedValues}
        disabled={blocked}
        onModify={onModify}
        onReset={onReset}
        onPreviewSettled={notifySequenceSettled}
      />
      <div className="uc03-c1-document-actions">
        <button
          type="button"
          className="uc03-c1-primary"
          disabled={saving || blocked}
          onClick={() => onSave(document, review)}
        >
          {saving ? 'Saving Review…' : 'Save Document Review'}
        </button>
      </div>
    </section>
  );
}

export default function BookingReviewPage() {
  const { journeyId } = useParams<{ journeyId: string }>();
  const navigate = useNavigate();
  const project = useProjectContextStore((state) => state.selectedProject);
  const accessToken = useSessionStore((state) => state.accessToken);
  const [reviewContext, setReviewContext] = useState<BookingReviewCachedContext | null>(() => (
    project?.tenantId && journeyId ? getCachedBookingReviewContext(project.tenantId, journeyId) : null
  ));
  const [contextLoading, setContextLoading] = useState(false);
  const [busyDocumentId, setBusyDocumentId] = useState<string>();
  const [verifying, setVerifying] = useState(false);
  const [verified, setVerified] = useState(false);
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();
  const [modifications, setModifications] = useState<ModifiedByDocument>({});
  const [locallyReviewedIds, setLocallyReviewedIds] = useState<Set<string>>(() => new Set());
  const [unlockedDocumentCount, setUnlockedDocumentCount] = useState(0);
  const cacheSyncAttempted = useRef(false);

  const enabled = Boolean(project?.tenantId && journeyId && accessToken);

  // Fast path: the upload flow persisted externalContextRef + document ids in
  // session storage. Review opens immediately from that cache. Audit Core is only
  // used here as a non-blocking fallback for a cold/new browser session.
  useEffect(() => {
    if (!enabled || !project?.tenantId || !journeyId) return;
    const cached = getCachedBookingReviewContext(project.tenantId, journeyId);
    if (cached) {
      setReviewContext(cached);
      return;
    }

    let cancelled = false;
    setContextLoading(true);
    void prepareBookingDocumentUploadContext(project.tenantId, journeyId, accessToken)
      .then(() => {
        if (cancelled) return;
        const recovered = getCachedBookingReviewContext(project.tenantId, journeyId);
        setReviewContext(recovered);
        if (!recovered) setError('No Booking document context is available for this Journey.');
      })
      .catch((cause) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'Booking document context could not be loaded.');
      })
      .finally(() => {
        if (!cancelled) setContextLoading(false);
      });
    return () => { cancelled = true; };
  }, [accessToken, enabled, journeyId, project?.tenantId]);

  // This Audit Core state check runs in the background and never gates the first
  // document. It is used only to hide already-reviewed docs and enable final verify.
  const directStateQuery = useQuery({
    queryKey: ['uc03-pc-direct-review-state', project?.tenantId, journeyId],
    queryFn: () => getPcDirectReviewState(project!.tenantId, journeyId!, accessToken),
    enabled: enabled && Boolean(reviewContext),
    staleTime: 15_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: 1,
  });

  const reviewedIds = useMemo(() => {
    const result = new Set(directStateQuery.data?.reviewedDocumentIds ?? []);
    locallyReviewedIds.forEach((documentId) => result.add(documentId));
    return result;
  }, [directStateQuery.data?.reviewedDocumentIds, locallyReviewedIds]);

  const reviewCandidates = useMemo(
    () => (reviewContext?.documents ?? []).filter((document) => !reviewedIds.has(document.documentId)),
    [reviewContext?.documents, reviewedIds],
  );
  const candidateKey = reviewCandidates.map((document) => document.documentId).join('|');

  useEffect(() => {
    setUnlockedDocumentCount((current) => {
      if (reviewCandidates.length === 0) return 0;
      if (current <= 0) return 1;
      return Math.min(current, reviewCandidates.length);
    });
  }, [candidateKey, reviewCandidates.length]);

  // If a cold/stale cache misses a document that Audit Core already considers
  // active, refresh the context in the background. The DI first-document path has
  // already started, so this recovery never recreates the old full-screen wait.
  useEffect(() => {
    if (!project?.tenantId || !journeyId || !reviewContext || !directStateQuery.data || cacheSyncAttempted.current) return;
    const cachedIds = new Set(reviewContext.documents.map((document) => document.documentId));
    const missing = directStateQuery.data.activeDocumentIds.some((documentId) => !cachedIds.has(documentId));
    if (!missing) return;
    cacheSyncAttempted.current = true;
    void prepareBookingDocumentUploadContext(project.tenantId, journeyId, accessToken, true)
      .then(() => {
        const refreshed = getCachedBookingReviewContext(project.tenantId, journeyId);
        if (refreshed) setReviewContext(refreshed);
      })
      .catch(() => undefined);
  }, [accessToken, directStateQuery.data, journeyId, project?.tenantId, reviewContext]);

  if (!project || !journeyId || !accessToken) return null;

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

  const saveDocumentReview = async (
    document: BookingReviewCachedDocument,
    review: PcBookingExtractionReview,
  ) => {
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
      setLocallyReviewedIds((current) => new Set([...current, document.documentId]));
      setModifications((current) => {
        const next = { ...current };
        delete next[document.documentId];
        return next;
      });
      void directStateQuery.refetch();
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
      const state = await getPcDirectReviewState(project.tenantId, journeyId, accessToken);
      if (!state.reviewComplete) {
        throw new Error(`${state.pendingDocumentCount} Booking document${state.pendingDocumentCount === 1 ? '' : 's'} still need review.`);
      }
      const current = await getPcVerification(project.tenantId, journeyId, accessToken);
      if (!current.captureSubmitted) throw new Error('Booking capture has not been submitted.');
      if (current.pcVerificationStatus !== 'VERIFIED') {
        await verifyPcBookingDirect(project.tenantId, journeyId, current.aggregateVersion, accessToken);
      }
      clearReviewReadinessWatch(project.tenantId, journeyId);
      setVerified(true);
      setMessage('PC verification completed.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'PC verification could not be completed.');
    } finally {
      setVerifying(false);
    }
  };

  const refreshDocumentContext = async () => {
    setContextLoading(true);
    setError(undefined);
    try {
      await prepareBookingDocumentUploadContext(project.tenantId, journeyId, accessToken, true);
      setReviewContext(getCachedBookingReviewContext(project.tenantId, journeyId));
      await directStateQuery.refetch();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Booking document list could not be refreshed.');
    } finally {
      setContextLoading(false);
    }
  };

  if (verified) {
    return (
      <div className="screen-stack uc03-c1-workspace">
        <PageHeader eyebrow="PC Document Verification" title="Booking Review" description="The PC document verification for this Booking is complete." />
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

  const totalDocuments = reviewContext?.documents.length ?? 0;
  const reviewedDocumentCount = reviewContext
    ? reviewContext.documents.filter((document) => reviewedIds.has(document.documentId)).length
    : 0;
  const canVerify = Boolean(directStateQuery.data?.reviewComplete);
  const pendingDocumentReviewCount = directStateQuery.data?.pendingDocumentCount ?? reviewCandidates.length;

  return (
    <div className="screen-stack uc03-c1-workspace">
      <div className="uc03-c1-topbar">
        <button type="button" className="uc03-c1-back" onClick={() => navigate('/dashboard')}>← Work list</button>

      </div>

      <PageHeader
        eyebrow="PC Document Verification"
        title="Booking Review"
        description="DI fields load first; source documents render one at a time so the current document gets network priority."
      />

      {message && <div className="uc03-c1-feedback is-success" role="status">{message}</div>}
      {error && <div className="uc03-c1-feedback is-error" role="alert">{error}</div>}

      {!reviewContext && contextLoading && (
        <section className="uc03-c1-section">
          <div className="uc03-review-empty" role="status">
            <strong>Locating Booking documents…</strong>
            <span>The fast session cache was not available, so the document context is being recovered in the background.</span>
          </div>
        </section>
      )}

      {reviewContext && totalDocuments > 0 && (
        <section className="uc03-c1-stage-strip" aria-label="Document review progress">
          <div><span>Documents</span><strong>{totalDocuments}</strong></div>
          <div><span>Reviewed</span><strong>{reviewedDocumentCount}</strong></div>
          <div><span>Remaining</span><strong>{Math.max(0, totalDocuments - reviewedDocumentCount)}</strong></div>
          <div><span>PC verification</span><StatusPill value={canVerify ? 'READY' : 'PENDING'} /></div>
        </section>
      )}

      {reviewContext && reviewCandidates.map((document, index) => (
        <LazyReviewDocument
          key={document.documentId}
          tenantId={project.tenantId}
          journeyId={journeyId}
          externalContextRef={reviewContext.externalContextRef}
          document={document}
          accessToken={accessToken}
          enabled={index < unlockedDocumentCount}
          saving={busyDocumentId === document.documentId}
          blocked={Boolean(busyDocumentId) || verifying}
          modifiedValues={modifications[document.documentId] || {}}
          onModify={(fact, value) => setModifiedValue(document.documentId, fact, value)}
          onReset={(fact) => resetModifiedValue(document.documentId, fact)}
          onSave={(target, review) => void saveDocumentReview(target, review)}
          onPreviewSettled={() => {
            setUnlockedDocumentCount((current) => Math.max(current, index + 2));
          }}
        />
      ))}

      {reviewContext && totalDocuments === 0 && (
        <section className="uc03-c1-section">
          <div className="uc03-review-empty" role="status">
            <strong>No Booking documents are cached for Review.</strong>
            <span>Refresh the document list, or return to Booking Documents if nothing has been uploaded yet.</span>
          </div>
        </section>
      )}

      {reviewContext && totalDocuments > 0 && reviewCandidates.length === 0 && (
        <section className="uc03-c1-section">
          <div className="uc03-review-empty" role="status">
            <strong>All Booking documents are reviewed.</strong>
            <span>Final verification becomes available as soon as Audit Core confirms the saved document reviews.</span>
          </div>
        </section>
      )}

      <section className="uc03-c1-section uc03-c1-checkpoint-section">
        <header className="uc03-c1-section-heading">
          <div>
            <span className="uc03-c1-eyebrow">PC verification</span>
            <h2>{canVerify ? 'Review complete' : `${pendingDocumentReviewCount} document${pendingDocumentReviewCount === 1 ? '' : 's'} still to review`}</h2>
            <p>Final verification checks Audit Core only when required; it does not block the Review screen opening.</p>
          </div>
          <StatusPill value={canVerify ? 'READY' : 'PENDING'} />
        </header>
        <button type="button" className="uc03-c1-primary" disabled={verifying || Boolean(busyDocumentId) || !canVerify} onClick={() => void handleVerify()}>
          {verifying ? 'Completing…' : 'Mark Booking Verified'}
        </button>
        <div className="uc03-c1-document-actions">
          <button type="button" className="uc03-c1-secondary" onClick={() => navigate('/dashboard')}>Back to Work List</button>
          <button type="button" className="uc03-c1-secondary" onClick={() => navigate(`/bookings/${journeyId}`)}>Booking Documents</button>
          <button type="button" className="uc03-c1-secondary" disabled={contextLoading} onClick={() => void refreshDocumentContext()}>
            {contextLoading ? 'Refreshing…' : 'Refresh Document List'}
          </button>
        </div>
      </section>
    </div>
  );
}
