import { useEffect, useMemo, useState } from 'react';

import {
  getBookingEvidenceFacts,
  type EvidenceFactView,
  type ExtractionProposalView,
} from '../../services/audit-core/uc03Booking';
import { getBookingDocumentAccess } from '../../services/audit-core/uc03BookingDocumentAccess';
import { displayName } from '../../utils/displayNames';

interface Props {
  tenantId: string;
  journeyId: string;
  accessToken?: string;
  evidenceId: string;
  documentName: string;
  proposals: ExtractionProposalView[];
  lockedCustomerName: string;
  disabled?: boolean;
  refreshKey?: string | null;
  onAccept: (proposal: ExtractionProposalView) => Promise<void>;
  onCorrect: (proposal: ExtractionProposalView, value: string) => Promise<void>;
  onClose: () => void;
}

interface SourcePreview {
  url: string;
  mimeType: string;
}

function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return 'Not Found';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function comparableValue(value: unknown): string {
  return displayValue(value).trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

function confidenceLabel(value?: number | null): string | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  const percent = value <= 1 ? value * 100 : value;
  return `${Math.round(percent)}% Confidence`;
}

function ProposalRow({
  proposal,
  lockedCustomerName,
  disabled,
  onAccept,
  onCorrect,
}: {
  proposal: ExtractionProposalView;
  lockedCustomerName: string;
  disabled: boolean;
  onAccept: (proposal: ExtractionProposalView) => Promise<void>;
  onCorrect: (proposal: ExtractionProposalView, value: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [correction, setCorrection] = useState(displayValue(proposal.proposedValue));
  const [busy, setBusy] = useState(false);
  // Only the name entered when the Journey was created is locked. PAN/Aadhaar
  // names establish Legal Name and must remain available for normal PC review.
  const lockedIdentityField = proposal.fieldKey === 'customer_name';
  const lockedMatches = lockedIdentityField
    && comparableValue(proposal.proposedValue) === comparableValue(lockedCustomerName);
  const decided = proposal.status !== 'PENDING';
  const displayedValue = decided && proposal.acceptedValue !== null && proposal.acceptedValue !== undefined
    ? proposal.acceptedValue
    : proposal.proposedValue;

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
      setEditing(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className={`uc03-document-detail-field${lockedIdentityField ? ' is-locked' : ''}`}>
      <div className="uc03-document-detail-field__copy">
        <span>{displayName(proposal.fieldKey)}</span>
        <strong>{displayValue(displayedValue)}</strong>
        <small>
          {[confidenceLabel(proposal.confidence), decided ? displayName(proposal.status) : 'Needs Validation']
            .filter(Boolean)
            .join(' · ')}
        </small>
      </div>

      {lockedIdentityField ? (
        <div className={`uc03-document-detail-lock${lockedMatches ? ' is-match' : ' is-mismatch'}`}>
          <span>Customer Name entered at Journey creation</span>
          <strong>{lockedCustomerName}</strong>
          <small>{lockedMatches ? 'Matches the document.' : 'Different from the document. The entered Customer Name remains locked.'}</small>
        </div>
      ) : null}

      {!decided && lockedIdentityField ? (
        <button
          type="button"
          className="uc03-c1-primary"
          disabled={disabled || busy || !proposal.canAccept}
          onClick={() => void run(() => lockedMatches ? onAccept(proposal) : onCorrect(proposal, lockedCustomerName))}
        >
          {lockedMatches ? 'Matches Document' : 'Keep Entered Name'}
        </button>
      ) : null}

      {!decided && !lockedIdentityField && proposal.canAccept && !editing ? (
        <div className="uc03-document-detail-field__actions">
          <button
            type="button"
            className="uc03-c1-primary"
            disabled={disabled || busy}
            onClick={() => void run(() => onAccept(proposal))}
          >
            Matches Document
          </button>
          <button
            type="button"
            className="uc03-c1-secondary"
            disabled={disabled || busy}
            onClick={() => setEditing(true)}
          >
            Edit Value
          </button>
        </div>
      ) : null}

      {!decided && !lockedIdentityField && proposal.canAccept && editing ? (
        <div className="uc03-document-detail-edit">
          <label>
            <span>Correct Value</span>
            <input
              autoFocus
              value={correction}
              disabled={disabled || busy}
              onChange={(event) => setCorrection(event.target.value)}
            />
          </label>
          <div className="uc03-document-detail-field__actions">
            <button
              type="button"
              className="uc03-c1-primary"
              disabled={disabled || busy || !correction.trim()}
              onClick={() => void run(() => onCorrect(proposal, correction.trim()))}
            >
              Save Edit
            </button>
            <button
              type="button"
              className="uc03-c1-secondary"
              disabled={disabled || busy}
              onClick={() => {
                setCorrection(displayValue(proposal.proposedValue));
                setEditing(false);
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {!decided && !proposal.canAccept ? (
        <p className="uc03-document-detail-readonly">This extracted field is view-only until its configured business/master mapping is available.</p>
      ) : null}
    </article>
  );
}

export default function BookingDocumentDetails({
  tenantId,
  journeyId,
  accessToken,
  evidenceId,
  documentName,
  proposals,
  lockedCustomerName,
  disabled = false,
  refreshKey,
  onAccept,
  onCorrect,
  onClose,
}: Props) {
  const [source, setSource] = useState<SourcePreview | null>(null);
  const [sourceLoading, setSourceLoading] = useState(true);
  const [sourceError, setSourceError] = useState<string>();
  const [facts, setFacts] = useState<EvidenceFactView[]>([]);
  const [factsLoading, setFactsLoading] = useState(true);
  const [factsError, setFactsError] = useState<string>();

  useEffect(() => {
    let cancelled = false;
    setSourceLoading(true);
    setSourceError(undefined);

    void getBookingDocumentAccess(tenantId, journeyId, evidenceId, accessToken)
      .then((result) => {
        if (cancelled) return;
        setSource({ url: result.url, mimeType: result.mimeType });
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setSource(null);
        setSourceError(cause instanceof Error ? cause.message : 'The uploaded document could not be opened.');
      })
      .finally(() => {
        if (!cancelled) setSourceLoading(false);
      });

    return () => { cancelled = true; };
  }, [accessToken, evidenceId, journeyId, tenantId]);

  useEffect(() => {
    let cancelled = false;
    setFactsLoading(true);
    setFactsError(undefined);
    void getBookingEvidenceFacts(tenantId, journeyId, evidenceId, accessToken)
      .then((result) => {
        if (!cancelled) setFacts(result);
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setFacts([]);
          setFactsError(cause instanceof Error ? cause.message : 'Extracted fields could not be loaded.');
        }
      })
      .finally(() => {
        if (!cancelled) setFactsLoading(false);
      });
    return () => { cancelled = true; };
  }, [accessToken, evidenceId, journeyId, refreshKey, tenantId]);

  const proposalFactIds = useMemo(
    () => new Set(proposals.map((proposal) => proposal.sourceFactId)),
    [proposals],
  );
  const readOnlyFacts = facts.filter((fact) => !proposalFactIds.has(fact.evidenceFactId));
  const isImage = source?.mimeType.startsWith('image/') ?? false;
  const isPdf = source?.mimeType.includes('pdf') ?? false;

  return (
    <section className="uc03-document-details" aria-label={`${documentName} details`}>
      <header className="uc03-document-details__header">
        <div>
          <span className="uc03-c1-eyebrow">Document Review</span>
          <h3>{documentName}</h3>
          <p>Compare the System Read values with the uploaded document. Confirm matching values or edit only where the document differs.</p>
        </div>
        <button type="button" className="uc03-c1-secondary" onClick={onClose}>Close Details</button>
      </header>

      <div className="uc03-document-details__layout">
        <div className="uc03-document-details__source">
          <div className="uc03-document-details__subhead">
            <strong>Uploaded Document</strong>
          </div>
          <div className="uc03-document-details__preview">
            {sourceLoading ? <div className="uc03-document-details__empty">Loading document…</div> : null}
            {sourceError ? <div className="uc03-document-details__empty is-error">{sourceError}</div> : null}
            {!sourceLoading && !sourceError && source && isImage ? <img src={source.url} alt={documentName} /> : null}
            {!sourceLoading && !sourceError && source && isPdf ? (
              <iframe title={`${documentName} document`} src={`${source.url}#view=FitH`} />
            ) : null}
            {!sourceLoading && !sourceError && source && !isImage && !isPdf ? (
              <div className="uc03-document-details__empty">
                <span>Inline preview is not available for this format.</span>
                <a href={source.url} target="_blank" rel="noreferrer">Open Document</a>
              </div>
            ) : null}
          </div>
        </div>

        <div className="uc03-document-details__fields">
          <div className="uc03-document-details__subhead">
            <strong>System Read</strong>
            <span>{factsLoading ? 'Loading…' : `${facts.length} ${facts.length === 1 ? 'Field' : 'Fields'}`}</span>
          </div>

          {factsError ? <div className="uc03-document-details__empty is-error">{factsError}</div> : null}
          {!factsLoading && !factsError && facts.length === 0 ? (
            <div className="uc03-document-details__empty">No extracted fields are available yet. Close this view and use Get Details again after processing completes.</div>
          ) : null}

          <div className="uc03-document-details__field-list">
            {proposals.map((proposal) => (
              <ProposalRow
                key={proposal.proposalId}
                proposal={proposal}
                lockedCustomerName={lockedCustomerName}
                disabled={disabled}
                onAccept={onAccept}
                onCorrect={onCorrect}
              />
            ))}

            {readOnlyFacts.map((fact) => (
              <article className="uc03-document-detail-field is-readonly" key={fact.evidenceFactId}>
                <div className="uc03-document-detail-field__copy">
                  <span>{displayName(fact.fieldKey)}</span>
                  <strong>{displayValue(fact.normalizedValue ?? fact.value)}</strong>
                  <small>{[confidenceLabel(fact.confidenceScore), fact.verificationStatus ? displayName(fact.verificationStatus) : null].filter(Boolean).join(' · ')}</small>
                </div>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
