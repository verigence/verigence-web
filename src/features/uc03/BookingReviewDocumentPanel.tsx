import { useEffect, useMemo, useState } from 'react';

import { DocumentFieldReview } from './DocumentFieldReview';
import {
  decideExtractionProposal,
  getBookingEvidenceReviewContent,
  type ExtractionProposalView,
} from '../../services/audit-core/uc03Booking';
import { displayName } from '../../utils/displayNames';

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

interface SourcePreview {
  url: string;
  mimeType: string;
}

function proposalValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return 'Not Found';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
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
  const [source, setSource] = useState<SourcePreview | null>(null);
  const [sourceError, setSourceError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [approved, setApproved] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => setCurrentVersion(aggregateVersion), [aggregateVersion]);
  useEffect(() => {
    setDecidedIds(new Set());
    setApproved(false);
    setError(undefined);
  }, [evidenceId]);

  const editablePending = useMemo(
    () => proposals.filter((proposal) => proposal.status === 'PENDING' && proposal.canAccept && !decidedIds.has(proposal.proposalId)),
    [decidedIds, proposals],
  );
  const readOnly = useMemo(
    () => proposals.filter((proposal) => !proposal.canAccept && proposal.status !== 'SUPERSEDED'),
    [proposals],
  );

  useEffect(() => {
    if (editablePending.length > 0) {
      setSource(null);
      setSourceError(undefined);
      return;
    }
    let cancelled = false;
    let objectUrl: string | null = null;
    setSourceError(undefined);
    void getBookingEvidenceReviewContent(tenantId, journeyId, evidenceId, accessToken)
      .then((result) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(result.blob);
        setSource({ url: objectUrl, mimeType: result.mimeType });
      })
      .catch((cause: unknown) => {
        if (!cancelled) setSourceError(cause instanceof Error ? cause.message : 'Unable to load source document.');
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [accessToken, editablePending.length, evidenceId, journeyId, tenantId]);

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

  return (
    <section className="uc03-booking-review-panel">
      <header className="uc03-booking-review-panel__header">
        <div>
          <span className="uc03-c1-eyebrow">Document Review</span>
          <h2>{documentName}</h2>
          <p>Compare the System Read value with the uploaded document. Change only when the document shows a different value.</p>
        </div>
        <span className="uc03-booking-review-panel__count">
          {approved
            ? 'Approved'
            : editablePending.length > 0
              ? `${editablePending.length} editable field${editablePending.length === 1 ? '' : 's'} left`
              : 'Editable fields complete'}
        </span>
      </header>

      {error ? <div className="uc03-booking-journey-feedback is-error" role="alert">{error}</div> : null}

      {editablePending.length > 0 ? (
        <DocumentFieldReview
          tenantId={tenantId}
          journeyId={journeyId}
          accessToken={accessToken}
          proposals={editablePending}
          disabled={disabled || busy || approved}
          onAccept={(proposal) => decide(proposal, 'accept')}
          onCorrect={(proposal, value) => decide(proposal, 'correct', value)}
        />
      ) : (
        <div className="uc03-booking-review-source-only">
          {sourceError ? <div className="uc03-booking-journey-feedback is-error">{sourceError}</div> : null}
          {!source && !sourceError ? <div className="uc03-review-preview-message">Loading Source Document…</div> : null}
          {source?.mimeType.startsWith('image/') ? <img src={source.url} alt={`${documentName} source`} /> : null}
          {source?.mimeType.includes('pdf') ? <iframe title={`${documentName} source`} src={`${source.url}#page=1&view=FitH`} /> : null}
          {source && !source.mimeType.startsWith('image/') && !source.mimeType.includes('pdf') ? (
            <a href={source.url} target="_blank" rel="noreferrer">Open Source Document</a>
          ) : null}
        </div>
      )}

      {readOnly.length > 0 ? (
        <div className="uc03-booking-readonly-fields">
          <div className="uc03-booking-readonly-fields__heading">
            <strong>System Read · Product / reference fields</strong>
            <span>Read-only here. Model and Variant are confirmed against Product Master above.</span>
          </div>
          <div className="uc03-booking-readonly-fields__grid">
            {readOnly.map((proposal) => (
              <div key={proposal.proposalId}>
                <span>{displayName(proposal.fieldKey)}</span>
                <strong>{proposalValue(proposal.proposedValue)}</strong>
                {proposal.pageNo ? <small>Page {proposal.pageNo}</small> : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <footer className="uc03-booking-review-panel__footer">
        <span>
          {approved
            ? 'Document review approved and recorded.'
            : editablePending.length > 0
              ? 'Approve Document becomes available after every editable System Read field is accepted or corrected.'
              : 'All editable fields are decided. Approving records the PC document review in Audit Core and DI.'}
        </span>
        <button
          type="button"
          className="uc03-c1-primary"
          disabled={disabled || busy || approved || editablePending.length > 0}
          onClick={() => void approve()}
        >
          {approved ? 'Approved' : busy ? 'Approving…' : 'Approve Document'}
        </button>
      </footer>
    </section>
  );
}
