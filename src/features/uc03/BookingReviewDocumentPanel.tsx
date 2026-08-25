import { useEffect, useMemo, useState } from 'react';

import { DocumentFieldReview } from './DocumentFieldReview';
import {
  decideExtractionProposal,
  type ExtractionProposalView,
} from '../../services/audit-core/uc03Booking';

interface BookingReviewDocumentPanelProps {
  tenantId: string;
  journeyId: string;
  accessToken?: string;
  evidenceId: string;
  documentName: string;
  proposals: ExtractionProposalView[];
  aggregateVersion: number;
  disabled?: boolean;
  onVersion: (version: number) => void;
  onApprove: () => Promise<void>;
}

export default function BookingReviewDocumentPanel({
  tenantId,
  journeyId,
  accessToken,
  evidenceId,
  documentName,
  proposals,
  aggregateVersion,
  disabled = false,
  onVersion,
  onApprove,
}: BookingReviewDocumentPanelProps) {
  const [currentVersion, setCurrentVersion] = useState(aggregateVersion);
  const [decidedIds, setDecidedIds] = useState<Set<string>>(() => new Set());
  const [fieldReviewComplete, setFieldReviewComplete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [approved, setApproved] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => setCurrentVersion(aggregateVersion), [aggregateVersion]);
  useEffect(() => {
    setDecidedIds(new Set());
    setFieldReviewComplete(false);
    setApproved(false);
    setError(undefined);
  }, [evidenceId]);

  const visibleProposals = useMemo(
    () => proposals.filter((proposal) => proposal.status !== 'SUPERSEDED'),
    [proposals],
  );

  const decide = async (
    proposal: ExtractionProposalView,
    mode: 'accept' | 'correct',
    correctedValue?: string,
  ) => {
    setError(undefined);
    try {
      const result = await decideExtractionProposal(
        tenantId,
        journeyId,
        proposal.proposalId,
        mode,
        currentVersion,
        accessToken,
        correctedValue,
      );
      setCurrentVersion(result.aggregateVersion);
      setDecidedIds((current) => new Set(current).add(proposal.proposalId));
      onVersion(result.aggregateVersion);
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'The extracted field could not be saved.');
      throw cause;
    }
  };

  const approve = async () => {
    setBusy(true);
    setError(undefined);
    try {
      await onApprove();
      setApproved(true);
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'The document could not be approved.');
    } finally {
      setBusy(false);
    }
  };

  const reviewedCount = visibleProposals.filter((proposal) =>
    decidedIds.has(proposal.proposalId)
      || proposal.status === 'ACCEPTED'
      || proposal.status === 'CORRECTED',
  ).length;

  return (
    <section className="uc03-booking-review-panel">
      <header className="uc03-booking-review-panel__header">
        <div>
          <span className="uc03-c1-eyebrow">Document Review</span>
          <h2>{documentName}</h2>
          <p>Open the document, select each System Read value, and confirm or correct it before approving this document.</p>
        </div>
        <span className="uc03-booking-review-panel__count">
          {approved
            ? 'Approved'
            : fieldReviewComplete
              ? 'All fields reviewed'
              : visibleProposals.length
                ? `${reviewedCount}/${visibleProposals.length} persisted decisions`
                : 'Visual review'}
        </span>
      </header>

      {error ? <div className="uc03-booking-journey-feedback is-error" role="alert">{error}</div> : null}

      <DocumentFieldReview
        tenantId={tenantId}
        journeyId={journeyId}
        accessToken={accessToken}
        evidenceId={evidenceId}
        documentName={documentName}
        proposals={visibleProposals}
        decidedIds={decidedIds}
        disabled={disabled || busy || approved}
        onAccept={(proposal) => decide(proposal, 'accept')}
        onCorrect={(proposal, value) => decide(proposal, 'correct', value)}
        onReviewCompleteChange={setFieldReviewComplete}
      />

      <footer className="uc03-booking-review-panel__footer">
        <span>
          {approved
            ? 'Document review approved and recorded.'
            : fieldReviewComplete
              ? 'Every extracted value has been reviewed. Approve Document records the PC document verification.'
              : visibleProposals.length
                ? 'Review every System Read value before approving this document.'
                : 'No extracted fields were returned. Review the document visually before approving it.'}
        </span>
        <button
          type="button"
          className="uc03-c1-primary"
          disabled={disabled || busy || approved || !fieldReviewComplete}
          onClick={() => void approve()}
        >
          {approved ? 'Approved' : busy ? 'Approving…' : 'Approve Document'}
        </button>
      </footer>
    </section>
  );
}
