import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';

import PageHeader from '../components/PageHeader';
import StatusPill from '../components/StatusPill';
import { DocumentFieldReview } from '../features/uc03/DocumentFieldReview';
import {
  clearReviewReadinessWatch,
  watchReviewReadiness,
} from '../features/uc03/ReviewReadinessWatcher';
import {
  decideExtractionProposal,
  getBookingWorkspace,
  refreshBookingExtraction,
  type ExtractionProposalView,
} from '../services/audit-core/uc03Booking';
import {
  getPcVerification,
  verifyPcBooking,
} from '../services/audit-core/uc03PcVerification';
import { useProjectContextStore } from '../store/projectContextStore';
import { useSessionStore } from '../store/sessionStore';

export default function BookingReviewPage() {
  const { journeyId } = useParams<{ journeyId: string }>();
  const navigate = useNavigate();
  const project = useProjectContextStore((state) => state.selectedProject);
  const accessToken = useSessionStore((state) => state.accessToken);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();
  const firstReadinessCheck = useRef(false);
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
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  useEffect(() => {
    if (!enabled || firstReadinessCheck.current) return;
    if (!verificationQuery.data || verificationQuery.data.pcVerificationStatus !== 'PENDING') return;
    firstReadinessCheck.current = true;
    void refreshBookingExtraction(project!.tenantId, journeyId!, accessToken)
      .catch(() => undefined)
      .finally(() => Promise.all([workspaceQuery.refetch(), verificationQuery.refetch()]));
  }, [accessToken, enabled, journeyId, project, verificationQuery.data, verificationQuery.refetch, workspaceQuery.refetch]);

  const verification = verificationQuery.data;
  const workspace = workspaceQuery.data;
  const bookingLabel = String(workspace?.capture.BOOKING_REFERENCE || 'Booking');

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

  const refresh = async () => {
    await Promise.all([workspaceQuery.refetch(), verificationQuery.refetch()]);
  };

  const run = async (operation: () => Promise<unknown>, success: string) => {
    setBusy(true);
    setError(undefined);
    setMessage(undefined);
    try {
      await operation();
      setMessage(success);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The review action could not be completed.');
    } finally {
      setBusy(false);
    }
  };

  const handleProposal = (
    proposal: ExtractionProposalView,
    mode: 'accept' | 'correct',
    correctedValue?: string,
  ) => run(
    () => decideExtractionProposal(
      project.tenantId,
      journeyId,
      proposal.proposalId,
      mode,
      workspace!.aggregateVersion,
      accessToken,
      correctedValue,
    ),
    mode === 'accept'
      ? 'Extracted value confirmed.'
      : 'Correction saved. The original DI extraction remains unchanged.',
  );

  const handleVerify = () => run(
    async () => {
      await verifyPcBooking(
        project.tenantId,
        journeyId,
        verification!.aggregateVersion,
        accessToken,
      );
      clearReviewReadinessWatch(project.tenantId, journeyId);
    },
    'PC verification completed.',
  );

  if (workspaceQuery.isPending || verificationQuery.isPending) {
    return <div className="uc03-c1-loading" role="status">Opening document review…</div>;
  }
  if (workspaceQuery.isError || verificationQuery.isError || !workspace || !verification) {
    const cause = workspaceQuery.error || verificationQuery.error;
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

  const reviewableProposals = workspace.proposals.filter((proposal) => proposal.canAccept);
  const pendingReviewable = reviewableProposals.filter((proposal) => proposal.status === 'PENDING');
  const reviewDocuments = workspace.documents.filter((document) =>
    Boolean(document.evidenceId)
    && reviewableProposals.some((proposal) => proposal.sourceEvidenceId === document.evidenceId),
  );
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
        description="Compare each uploaded source document with DI extraction. Confirm or correct the value; DI remains unchanged."
      />

      <section className="uc03-c1-stage-strip" aria-label="PC verification status">
        <div><span>Booking status</span><strong>{workspace.bookingStage.businessStatus || '—'}</strong></div>
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
            <p>Review fields against the document that produced them. Confirmed/corrected values update the Audit Core business record while the original DI extraction and confidence remain unchanged.</p>
          </div>
        </header>

        {reviewDocuments.length > 0 ? reviewDocuments.map((document) => {
          const evidenceId = document.evidenceId!;
          const proposals = reviewableProposals.filter((proposal) => proposal.sourceEvidenceId === evidenceId);
          return (
            <DocumentFieldReview
              key={evidenceId}
              tenantId={project.tenantId}
              journeyId={journeyId}
              accessToken={accessToken}
              evidenceId={evidenceId}
              documentName={document.documentTypeKey || document.requirementKey}
              proposals={proposals}
              disabled={busy}
              onAccept={(proposal) => handleProposal(proposal, 'accept')}
              onCorrect={(proposal, value) => handleProposal(proposal, 'correct', value)}
            />
          );
        }) : (
          <div className="uc03-review-empty" role="status">
            <strong>No extracted fields require PC confirmation.</strong>
            <span>You may complete PC verification when the pending field count is zero.</span>
          </div>
        )}
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
