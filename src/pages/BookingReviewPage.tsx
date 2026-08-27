import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';

import PageHeader from '../components/PageHeader';
import StatusPill from '../components/StatusPill';
import { DocumentFieldReview } from '../features/uc03/DocumentFieldReview';
import {
  bookingWorkspaceQueryKey,
  pcVerificationQueryKey,
  UC03_OPERATIONAL_GC_MS,
} from '../features/uc03/queryKeys';
import {
  clearReviewReadinessWatch,
  watchReviewReadiness,
} from '../features/uc03/ReviewReadinessWatcher';
import {
  decideExtractionProposal,
  getBookingWorkspace,
  refreshBookingExtraction,
  type BookingWorkspace,
  type ExtractionProposalView,
} from '../services/audit-core/uc03Booking';
import {
  getPcVerification,
  verifyPcBooking,
  type PcVerificationView,
} from '../services/audit-core/uc03PcVerification';
import { useProjectContextStore } from '../store/projectContextStore';
import { useSessionStore } from '../store/sessionStore';

export default function BookingReviewPage() {
  const { journeyId } = useParams<{ journeyId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const project = useProjectContextStore((state) => state.selectedProject);
  const accessToken = useSessionStore((state) => state.accessToken);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();
  const firstReadinessCheck = useRef(false);
  const watchRegistered = useRef(false);

  const enabled = Boolean(project?.tenantId && journeyId && accessToken);
  const workspaceKey = bookingWorkspaceQueryKey(project?.tenantId, journeyId);
  const verificationKey = pcVerificationQueryKey(project?.tenantId, journeyId);

  const verificationQuery = useQuery({
    queryKey: verificationKey,
    queryFn: () => getPcVerification(project!.tenantId, journeyId!, accessToken),
    enabled,
    staleTime: 15_000,
    gcTime: UC03_OPERATIONAL_GC_MS,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const verification = verificationQuery.data;
  const reviewReady = Boolean(verification?.reviewReady && verification.pcVerificationStatus === 'PENDING');

  // The heavy Booking workspace is deliberately lazy here. Until DI says the
  // review is ready, the Review screen needs only the lightweight verification view.
  const workspaceQuery = useQuery({
    queryKey: workspaceKey,
    queryFn: () => getBookingWorkspace(project!.tenantId, journeyId!, accessToken),
    enabled: enabled && reviewReady,
    staleTime: 0,
    gcTime: UC03_OPERATIONAL_GC_MS,
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  useEffect(() => {
    if (!enabled || firstReadinessCheck.current) return;
    if (!verification || verification.pcVerificationStatus !== 'PENDING' || verification.reviewReady) return;
    firstReadinessCheck.current = true;
    void refreshBookingExtraction(project!.tenantId, journeyId!, accessToken)
      .then((result) => {
        queryClient.setQueryData<BookingWorkspace>(workspaceKey, (current) => current ? {
          ...current,
          aggregateVersion: result.aggregateVersion,
        } : current);
      })
      .catch(() => undefined)
      .finally(() => { void verificationQuery.refetch(); });
  }, [accessToken, enabled, journeyId, project, queryClient, verification, verificationQuery, workspaceKey]);

  const cachedWorkspace = workspaceQuery.data;
  const bookingLabel = String(cachedWorkspace?.capture.BOOKING_REFERENCE || 'Booking');

  useEffect(() => {
    if (!project?.tenantId || !journeyId || !verification) return;
    if (verification.pcVerificationStatus === 'VERIFIED' || verification.reviewReady) {
      clearReviewReadinessWatch(project.tenantId, journeyId);
      return;
    }
    if (verification.pcVerificationStatus === 'PENDING' && !watchRegistered.current) {
      watchRegistered.current = true;
      watchReviewReadiness(project.tenantId, journeyId, bookingLabel);
    }
  }, [bookingLabel, journeyId, project?.tenantId, verification]);

  if (!project || !journeyId) return null;

  const retry = async () => {
    await verificationQuery.refetch();
    if (reviewReady) await workspaceQuery.refetch();
  };

  const handleProposal = async (
    proposal: ExtractionProposalView,
    mode: 'accept' | 'correct',
    correctedValue?: string,
  ) => {
    if (!cachedWorkspace) return;
    setBusy(true);
    setError(undefined);
    setMessage(undefined);
    try {
      const result = await decideExtractionProposal(
        project.tenantId,
        journeyId,
        proposal.proposalId,
        mode,
        cachedWorkspace.aggregateVersion,
        accessToken,
        correctedValue,
      );
      queryClient.setQueryData<BookingWorkspace>(workspaceKey, (current) => current ? {
        ...current,
        aggregateVersion: result.aggregateVersion,
        proposals: current.proposals.map((item) => item.proposalId === proposal.proposalId ? {
          ...item,
          status: mode === 'accept' ? 'ACCEPTED' : 'CORRECTED',
          acceptedValue: mode === 'accept' ? item.proposedValue : correctedValue,
          canAccept: false,
          version: item.version + 1,
        } : item),
      } : current);
      queryClient.setQueryData<PcVerificationView>(verificationKey, (current) => current ? {
        ...current,
        aggregateVersion: result.aggregateVersion,
        pendingProposalCount: proposal.status === 'PENDING'
          ? Math.max(0, current.pendingProposalCount - 1)
          : current.pendingProposalCount,
      } : current);
      setMessage(mode === 'accept'
        ? 'Extracted value confirmed.'
        : 'Correction saved. The original DI extraction remains unchanged.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The review action could not be completed.');
    } finally {
      setBusy(false);
    }
  };

  const handleVerify = async () => {
    if (!verification) return;
    setBusy(true);
    setError(undefined);
    setMessage(undefined);
    try {
      const result = await verifyPcBooking(
        project.tenantId,
        journeyId,
        verification.aggregateVersion,
        accessToken,
      );
      queryClient.setQueryData(verificationKey, result);
      queryClient.setQueryData<BookingWorkspace>(workspaceKey, (current) => current ? {
        ...current,
        aggregateVersion: result.aggregateVersion,
      } : current);
      clearReviewReadinessWatch(project.tenantId, journeyId);
      setMessage('PC verification completed.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The review action could not be completed.');
    } finally {
      setBusy(false);
    }
  };

  if (verificationQuery.isPending) {
    return (
      <div className="screen-stack uc03-c1-workspace">
        <PageHeader eyebrow="PC Document Verification" title="Booking review" description="Checking document readiness…" />
        <section className="uc03-c1-section">
          <div className="uc03-review-empty" role="status"><strong>Opening review…</strong><span>The screen is ready; only the latest verification state is being loaded.</span></div>
        </section>
      </div>
    );
  }
  if (verificationQuery.isError || !verification) {
    const cause = verificationQuery.error;
    return (
      <section className="dashboard-load-state" role="alert">
        <div className="dashboard-load-state__mark">!</div>
        <div className="dashboard-load-state__copy">
          <strong>We couldn't open this Booking review.</strong>
          <p>{cause instanceof Error ? cause.message : 'Please try again.'}</p>
        </div>
        <button type="button" className="user-menu-button" onClick={() => void retry()}>Try Again</button>
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

  if (!verification.reviewReady) {
    return (
      <div className="screen-stack uc03-c1-workspace">
        <div className="uc03-c1-topbar">
          <button type="button" className="uc03-c1-back" onClick={() => navigate('/dashboard')}>← Work list</button>
          <span>Project · {project.projectName}</span>
        </div>
        <PageHeader eyebrow="PC Document Verification" title={bookingLabel} description="Booking capture is complete. Document verification is waiting for Document Intelligence." />
        <section className="uc03-c1-section">
          <div className="uc03-review-empty" role="status">
            <strong>Documents are still being prepared.</strong>
            <span>Document Intelligence is processing the uploaded documents. Please continue with your other work and check again later. While this application window remains open, we will recheck this Booking after two minutes.</span>
          </div>
          <div className="uc03-c1-stage-strip" aria-label="Document processing status">
            <div><span>Linked documents</span><strong>{verification.linkedDocumentCount}</strong></div>
            <div><span>Processing</span><strong>{verification.pendingDocumentCount}</strong></div>
            <div><span>Need attention</span><strong>{verification.failedDocumentCount}</strong></div>
            <div><span>PC verification</span><StatusPill value="PENDING" /></div>
          </div>
          {verification.failedDocumentCount > 0 && (
            <div className="uc03-c1-feedback is-error" role="alert">
              One or more documents could not be processed. Upload a clearer document from Booking Documents and try Review again.
            </div>
          )}
          <div className="uc03-c1-document-actions">
            <button type="button" className="uc03-c1-secondary" onClick={() => navigate('/dashboard')}>Back to Work List</button>
            <button type="button" className="uc03-c1-secondary" onClick={() => navigate(`/bookings/${journeyId}`)}>Booking Documents</button>
          </div>
        </section>
      </div>
    );
  }

  if (workspaceQuery.isPending || workspaceQuery.isFetching || !cachedWorkspace) {
    return (
      <div className="screen-stack uc03-c1-workspace">
        <div className="uc03-c1-topbar">
          <button type="button" className="uc03-c1-back" onClick={() => navigate('/dashboard')}>← Work list</button>
          <span>Project · {project.projectName}</span>
        </div>
        <PageHeader eyebrow="PC Document Verification" title={bookingLabel} description="Documents are ready. Loading only the extracted fields needed for review…" />
        <section className="uc03-c1-section">
          <div className="uc03-review-empty" role="status"><strong>Preparing extracted fields…</strong><span>No other Booking sections are being reloaded.</span></div>
        </section>
      </div>
    );
  }

  if (workspaceQuery.isError) {
    const cause = workspaceQuery.error;
    return (
      <section className="dashboard-load-state" role="alert">
        <div className="dashboard-load-state__mark">!</div>
        <div className="dashboard-load-state__copy">
          <strong>We couldn't load the extracted fields.</strong>
          <p>{cause instanceof Error ? cause.message : 'Please try again.'}</p>
        </div>
        <button type="button" className="user-menu-button" onClick={() => void retry()}>Try Again</button>
      </section>
    );
  }

  const reviewableProposals = cachedWorkspace.proposals.filter((proposal) => proposal.canAccept);
  const pendingReviewable = reviewableProposals.filter((proposal) => proposal.status === 'PENDING');
  const canVerify = verification.pendingProposalCount === 0;

  return (
    <div className="screen-stack uc03-c1-workspace">
      <div className="uc03-c1-topbar">
        <button type="button" className="uc03-c1-back" onClick={() => navigate('/dashboard')}>← Work list</button>
        <span>Project · {project.projectName}</span>
      </div>

      <PageHeader
        eyebrow="PC Document Verification"
        title={bookingLabel}
        description="Compare the uploaded source document with DI extraction. Confirm or correct the value; DI remains unchanged."
      />

      <section className="uc03-c1-stage-strip" aria-label="PC verification status">
        <div><span>Booking status</span><strong>{cachedWorkspace.bookingStage.businessStatus || '—'}</strong></div>
        <div><span>PC verification</span><StatusPill value={verification.pcVerificationStatus} /></div>
        <div><span>Pending fields</span><strong>{verification.pendingProposalCount}</strong></div>
        <div><span>Documents</span><strong>{verification.linkedDocumentCount}</strong></div>
      </section>

      {message && <div className="uc03-c1-feedback is-success" role="status">{message}</div>}
      {error && <div className="uc03-c1-feedback is-error" role="alert">{error}</div>}

      <section className="uc03-c1-section">
        <header className="uc03-c1-section-heading">
          <div>
            <span className="uc03-c1-eyebrow">Document review</span>
            <h2>Compare source &amp; extracted value</h2>
            <p>Review one field at a time. Confirmed/corrected values update the Audit Core business record while the original DI extraction and confidence remain unchanged.</p>
          </div>
        </header>
        <DocumentFieldReview
          tenantId={project.tenantId}
          journeyId={journeyId}
          accessToken={accessToken}
          proposals={reviewableProposals}
          disabled={busy}
          onAccept={(proposal) => { void handleProposal(proposal, 'accept'); }}
          onCorrect={(proposal, value) => { void handleProposal(proposal, 'correct', value); }}
        />
      </section>

      <section className="uc03-c1-section uc03-c1-checkpoint-section">
        <header className="uc03-c1-section-heading">
          <div>
            <span className="uc03-c1-eyebrow">PC verification</span>
            <h2>{canVerify ? 'Review complete' : `${pendingReviewable.length} extracted field${pendingReviewable.length === 1 ? '' : 's'} remaining`}</h2>
            <p>This changes only PC verification status. It does not change the Booking business status and does not require a TL review.</p>
          </div>
          <StatusPill value={canVerify ? 'READY' : 'PENDING'} />
        </header>
        <button type="button" className="uc03-c1-primary" disabled={busy || !canVerify} onClick={() => void handleVerify()}>
          Mark Booking Verified
        </button>
      </section>
    </div>
  );
}
