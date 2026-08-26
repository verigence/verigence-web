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
  proposals: ExtractionProposalView[];
  aggregateVersion: number;
  disabled?: boolean;
  onVersion: (version: number) => void;
  onApprove: () => Promise<void>;
}

type LocalDecision = {
  decision: 'APPROVED' | 'CORRECTED';
  approvedValue: unknown;
};

const READY = new Set(['COMPLETED', 'COMPLETE', 'PROCESSED', 'SUCCEEDED', 'READY', 'VERIFIED']);
const FAILED = new Set(['FAILED', 'REJECTED']);
const BACKOFF_MS = [3000, 5000, 8000, 10000];

function valueOf(fact: PcBookingExtractionFact): unknown {
  return fact.normalizedValue ?? fact.rawValue ?? '';
}

function proposalFromFact(
  documentId: string,
  documentTypeKey: string,
  fact: PcBookingExtractionFact,
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
    // Confidence is deliberately not sent to the PC rendering component. The
    // original DI fact is retained separately and submitted only as audit provenance.
    confidence: null,
    pageNo: fact.pageNo,
    evidenceRegion: fact.evidenceRegion as ExtractionProposalView['evidenceRegion'],
    status: 'PENDING',
    acceptedValue: null,
    canAccept: true,
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
  aggregateVersion,
  disabled = false,
  onVersion,
  onApprove,
}: BookingReviewDocumentPanelProps) {
  const [currentVersion, setCurrentVersion] = useState(aggregateVersion);
  const [requirement, setRequirement] = useState<BookingUploadRequirementContext | null>(null);
  const [facts, setFacts] = useState<PcBookingExtractionFact[]>([]);
  const [processingStatus, setProcessingStatus] = useState<string>('PROCESSING');
  const [decisions, setDecisions] = useState<Map<string, LocalDecision>>(() => new Map());
  const [fieldReviewComplete, setFieldReviewComplete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [approved, setApproved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  useEffect(() => setCurrentVersion(aggregateVersion), [aggregateVersion]);
  useEffect(() => {
    setRequirement(null);
    setFacts([]);
    setProcessingStatus('PROCESSING');
    setDecisions(new Map());
    setFieldReviewComplete(false);
    setApproved(false);
    setLoading(true);
    setError(undefined);
  }, [evidenceId]);

  useEffect(() => {
    if (!accessToken) return undefined;
    let cancelled = false;
    let timer: number | undefined;
    let attempt = 0;

    const load = async () => {
      try {
        const context = await prepareBookingDocumentUploadContext(tenantId, journeyId, accessToken);
        const list = await listPcBookingDocuments(tenantId, context.externalContextRef, accessToken);
        if (cancelled) return;
        const document = list.documents.find((item) => item.documentId === evidenceId);
        const slot = context.requirements.find((item) =>
          item.requirementRef === document?.requirementRef
          || locallyUploadedDocumentIds(tenantId, journeyId, item.requirementRef).includes(evidenceId));
        if (!slot) {
          setLoading(false);
          setError('This uploaded document is waiting for its Booking requirement linkage. Please retry shortly.');
          return;
        }
        setRequirement(slot);
        const status = (document?.processingStatus || processingStatus || 'PROCESSING').toUpperCase();
        setProcessingStatus(status);

        if (READY.has(status)) {
          const review = await getPcBookingExtractionReview(
            tenantId,
            context.externalContextRef,
            evidenceId,
            accessToken,
          );
          if (cancelled) return;
          setProcessingStatus(review.processingStatus.toUpperCase());
          setFacts(review.facts.filter((fact) => slot.captureEligibleFieldKeys.includes(fact.fieldKey)));
          setLoading(false);
          setError(undefined);
          return;
        }
        if (FAILED.has(status)) {
          setLoading(false);
          setError('Document extraction failed. The upload is retained; upload a clearer replacement if needed.');
          return;
        }

        setLoading(false);
        setError(undefined);
        const delay = BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)];
        attempt += 1;
        timer = window.setTimeout(() => void load(), delay);
      } catch (cause: unknown) {
        if (cancelled) return;
        setLoading(false);
        setError(cause instanceof Error ? cause.message : 'Document Intelligence is temporarily unavailable.');
        const delay = BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)];
        attempt += 1;
        timer = window.setTimeout(() => void load(), delay);
      }
    };

    void load();
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [accessToken, evidenceId, journeyId, tenantId]);

  const syntheticProposals = useMemo(() => {
    const documentTypeKey = requirement?.documentTypeKey || '';
    return facts.map((fact) => proposalFromFact(evidenceId, documentTypeKey, fact));
  }, [evidenceId, facts, requirement?.documentTypeKey]);

  const decidedIds = useMemo(() => new Set(decisions.keys()), [decisions]);

  const decide = async (
    proposal: ExtractionProposalView,
    mode: 'accept' | 'correct',
    correctedValue?: string,
  ) => {
    const fact = facts.find((item) => item.sourceFactRef === proposal.sourceFactId);
    if (!fact) throw new Error('The DI source fact is no longer available for this field.');
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
    if (!requirement) return;
    setBusy(true);
    setError(undefined);
    try {
      if (facts.length > 0) {
        if (!fieldReviewComplete || decisions.size !== facts.length) {
          throw new Error('Review every System Read field before approving this document.');
        }
        const fields: BookingExtractionFieldDecision[] = facts.map((fact) => {
          const decision = decisions.get(fact.sourceFactRef);
          if (!decision) throw new Error(`Review ${fact.fieldKey} before approving this document.`);
          return {
            fieldKey: fact.fieldKey,
            sourceFactRef: fact.sourceFactRef,
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
        setCurrentVersion(result.aggregateVersion);
        onVersion(result.aggregateVersion);
      }
      await onApprove();
      setApproved(true);
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
              ? 'Extracting…'
              : fieldReviewComplete
                ? 'All fields reviewed'
                : syntheticProposals.length
                  ? `${decisions.size}/${syntheticProposals.length} reviewed`
                  : 'Visual review'}
        </span>
      </header>

      {error ? <div className="uc03-booking-journey-feedback is-error" role="alert">{error}</div> : null}
      {loading || extractionPending ? (
        <div className="uc03-booking-review-loading" role="status">
          {loading ? 'Loading document status…' : 'Document uploaded. Extraction is still running in Document Intelligence…'}
        </div>
      ) : null}

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
              ? 'You can leave this screen; extraction continues asynchronously in DI.'
              : syntheticProposals.length
                ? 'One batch is written to Audit Core only when you approve this document.'
                : 'No supported extracted business fields were returned. Review the source document visually.'}
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
