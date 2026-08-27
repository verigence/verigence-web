import { useEffect, useMemo, useState } from 'react';

import { DocumentFieldReview } from './DocumentFieldReview';
import type { ExtractionProposalView } from '../../services/audit-core/uc03Booking';
import {
  locallyUploadedDocumentIds,
  prepareBookingDocumentUploadContext,
  submitBookingDocumentExtractionDecisions,
  type BookingExtractionFieldDecision,
  type BookingUploadRequirementContext,
} from '../../services/audit-core/uc03PcBookingDocuments';
import {
  getPcBookingExtractionReview,
  listPcBookingDocuments,
  type PcBookingExtractionFact,
} from '../../services/di/bookingDocuments';

interface BookingReviewDocumentPanelProps {
  tenantId: string;
  journeyId: string;
  accessToken?: string;
  evidenceId: string;
  documentName: string;
  // Compatibility props retained while BookingWorkspacePage still owns the
  // aggregate/workspace transition. Direct DI facts are loaded by this panel.
  proposals?: ExtractionProposalView[];
  aggregateVersion?: number;
  disabled?: boolean;
  approved?: boolean;
  onVersion: (version: number) => void;
  onApprove: () => Promise<void>;
}

type LocalDecision = {
  decision: 'APPROVED' | 'CORRECTED';
  approvedValue: unknown;
};

const READY = new Set(['COMPLETED', 'COMPLETE', 'PROCESSED', 'SUCCEEDED', 'READY', 'VERIFIED']);
const FAILED = new Set(['FAILED', 'REJECTED']);

function valueOf(fact: PcBookingExtractionFact): unknown {
  return fact.normalizedValue ?? fact.rawValue ?? '';
}

function normalizedFieldKey(fieldKey: string): string {
  return fieldKey.trim().toLowerCase();
}

function proposalFromFact(
  documentId: string,
  documentTypeKey: string,
  fact: PcBookingExtractionFact,
  canAccept: boolean,
): ExtractionProposalView {
  return {
    proposalId: fact.sourceFactRef,
    fieldKey: fact.fieldKey,
    sourceEvidenceId: documentId,
    sourceFactId: fact.sourceFactRef,
    sourceFactVersion: fact.sourceFactVersion,
    sourceDocumentTypeKey: documentTypeKey,
    valueSource: 'DI_MACHINE_EXTRACTION',
    proposedValue: valueOf(fact),
    confidence: null,
    pageNo: fact.pageNo,
    evidenceRegion: fact.evidenceRegion as ExtractionProposalView['evidenceRegion'],
    status: 'PENDING',
    acceptedValue: null,
    canAccept,
    owningDomainKey: null,
    owningRecordReference: null,
    version: 1,
  };
}

export default function BookingReviewDocumentPanel({
  tenantId,
  journeyId,
  accessToken,
  evidenceId,
  documentName,
  disabled = false,
  approved = false,
  onVersion,
  onApprove,
}: BookingReviewDocumentPanelProps) {
  const [requirement, setRequirement] = useState<BookingUploadRequirementContext | null>(null);
  const [facts, setFacts] = useState<PcBookingExtractionFact[]>([]);
  const [processingStatus, setProcessingStatus] = useState<string>('PROCESSING');
  const [decisions, setDecisions] = useState<Map<string, LocalDecision>>(() => new Map());
  const [fieldReviewComplete, setFieldReviewComplete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  useEffect(() => {
    setRequirement(null);
    setFacts([]);
    setProcessingStatus('PROCESSING');
    setDecisions(new Map());
    setFieldReviewComplete(false);
    setLoading(true);
    setError(undefined);
  }, [evidenceId]);

  useEffect(() => {
    if (!accessToken) return undefined;
    let cancelled = false;

    const loadOnce = async () => {
      try {
        const context = await prepareBookingDocumentUploadContext(tenantId, journeyId, accessToken);
        const list = await listPcBookingDocuments(tenantId, context.externalContextRef, accessToken);
        if (cancelled) return;
        const document = list.documents.find((item) => item.documentId === evidenceId);
        const slot = context.requirements.find((item) =>
          item.requirementRef === document?.requirementRef
          || locallyUploadedDocumentIds(tenantId, journeyId, item.requirementRef).includes(evidenceId));
        if (!slot) {
          setError('This uploaded document is not linked to a Booking document requirement.');
          setLoading(false);
          return;
        }
        setRequirement(slot);
        const status = (document?.processingStatus || 'PROCESSING').toUpperCase();
        setProcessingStatus(status);

        if (FAILED.has(status)) {
          setError('Document extraction failed. Return to Documents and replace or retry this document.');
          setLoading(false);
          return;
        }
        if (!READY.has(status)) {
          setError('Extraction is not complete. Return to Booking Details and check document readiness again.');
          setLoading(false);
          return;
        }

        const review = await getPcBookingExtractionReview(
          tenantId,
          context.externalContextRef,
          evidenceId,
          accessToken,
        );
        if (cancelled) return;
        setProcessingStatus(review.processingStatus.toUpperCase());
        setFacts(review.facts);
        setError(undefined);
        setLoading(false);
      } catch (cause: unknown) {
        if (cancelled) return;
        setError(cause instanceof Error ? cause.message : 'Document Intelligence is temporarily unavailable.');
        setLoading(false);
      }
    };

    void loadOnce();
    return () => { cancelled = true; };
  }, [accessToken, evidenceId, journeyId, tenantId]);

  const captureEligibleFieldKeys = useMemo(
    () => new Set((requirement?.captureEligibleFieldKeys ?? []).map(normalizedFieldKey)),
    [requirement?.captureEligibleFieldKeys],
  );

  const persistableFacts = useMemo(
    () => facts.filter((fact) => captureEligibleFieldKeys.has(normalizedFieldKey(fact.fieldKey))),
    [captureEligibleFieldKeys, facts],
  );

  const syntheticProposals = useMemo(() => {
    const documentTypeKey = requirement?.documentTypeKey || '';
    return facts.map((fact) => proposalFromFact(
      evidenceId,
      documentTypeKey,
      fact,
      captureEligibleFieldKeys.has(normalizedFieldKey(fact.fieldKey)),
    ));
  }, [captureEligibleFieldKeys, evidenceId, facts, requirement?.documentTypeKey]);

  const decidedIds = useMemo(() => new Set(decisions.keys()), [decisions]);

  const decide = async (
    proposal: ExtractionProposalView,
    mode: 'accept' | 'correct',
    correctedValue?: string,
  ) => {
    const fact = facts.find((item) => item.sourceFactRef === proposal.sourceFactId);
    if (!fact) throw new Error('The DI source fact is no longer available for this field.');
    if (!captureEligibleFieldKeys.has(normalizedFieldKey(fact.fieldKey))) return;
    setDecisions((current) => {
      const next = new Map(current);
      next.set(proposal.proposalId, {
        decision: mode === 'accept' ? 'APPROVED' : 'CORRECTED',
        approvedValue: mode === 'accept' ? valueOf(fact) : correctedValue ?? '',
      });
      return next;
    });
  };

  const approve = async () => {
    if (!requirement || approved) return;
    setBusy(true);
    setError(undefined);
    try {
      if (facts.length > 0 && !fieldReviewComplete) {
        throw new Error('Review every System Read field before approving this document.');
      }
      if (persistableFacts.length > 0) {
        if (decisions.size !== persistableFacts.length) {
          throw new Error('Review every editable System Read field before approving this document.');
        }
        const fields: BookingExtractionFieldDecision[] = persistableFacts.map((fact) => {
          const decision = decisions.get(fact.sourceFactRef);
          if (!decision) throw new Error(`Review ${fact.fieldKey} before approving this document.`);
          return {
            fieldKey: fact.fieldKey,
            sourceFactRef: fact.sourceFactRef,
            // Audit Core's current provenance command is explicitly version-1.
            sourceFactVersion: 1,
            sourceConfidence: fact.confidenceScore,
            decision: decision.decision,
            approvedValue: decision.approvedValue,
          };
        });
        const result = await submitBookingDocumentExtractionDecisions(
          tenantId,
          journeyId,
          requirement.requirementRef,
          evidenceId,
          fields,
          accessToken,
        );
        onVersion(result.aggregateVersion);
      }
      await onApprove();
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'The document review could not be saved.');
    } finally {
      setBusy(false);
    }
  };

  const extractionPending = !READY.has(processingStatus) && !FAILED.has(processingStatus);

  return (
    <section className="uc03-booking-review-panel">
      <header className="uc03-booking-review-panel__header">
        <div>
          <span className="uc03-c1-eyebrow">Document Review</span>
          <h2>{documentName}</h2>
          <p>Compare each System Read value with the source document, then confirm or correct it.</p>
        </div>
        <span className="uc03-booking-review-panel__count">
          {approved
            ? 'Approved'
            : extractionPending
              ? 'Not ready'
              : fieldReviewComplete
                ? 'All fields reviewed'
                : syntheticProposals.length
                  ? `${decisions.size}/${syntheticProposals.length} reviewed`
                  : 'Visual review'}
        </span>
      </header>

      {error ? <div className="uc03-booking-journey-feedback is-error" role="alert">{error}</div> : null}
      {loading ? <div className="uc03-booking-review-loading" role="status">Loading document review…</div> : null}

      {!loading && READY.has(processingStatus) ? (
        <DocumentFieldReview
          tenantId={tenantId}
          journeyId={journeyId}
          accessToken={accessToken}
          evidenceId={evidenceId}
          documentName={documentName}
          proposals={syntheticProposals}
          decidedIds={decidedIds}
          disabled={disabled || busy || approved}
          onAccept={(proposal) => decide(proposal, 'accept')}
          onCorrect={(proposal, value) => decide(proposal, 'correct', value)}
          onReviewCompleteChange={setFieldReviewComplete}
        />
      ) : null}

      <footer className="uc03-booking-review-panel__footer">
        <span>
          {approved
            ? 'Document review recorded in Audit Core.'
            : extractionPending
              ? 'Extraction must complete before this document can be reviewed.'
              : syntheticProposals.length
                ? 'One batch is written to Audit Core only when you approve this document.'
                : 'No extracted values were returned. Review the source document visually.'}
        </span>
        <button
          type="button"
          className="uc03-c1-primary"
          disabled={disabled || busy || approved || loading || extractionPending || (syntheticProposals.length > 0 && !fieldReviewComplete)}
          onClick={() => void approve()}
        >
          {approved ? 'Approved' : busy ? 'Approving…' : 'Approve Document'}
        </button>
      </footer>
    </section>
  );
}
