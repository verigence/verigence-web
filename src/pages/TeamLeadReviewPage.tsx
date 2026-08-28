import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';

import PageHeader from '../components/PageHeader';
import { OptimizedDirectDiFieldReview } from '../features/uc03/OptimizedDirectDiFieldReview';
import {
  getTlReviewContext,
  requestTlDocumentReupload,
  submitTlDocumentReview,
  type TlExtractedField,
  type TlReviewRequirement,
} from '../services/audit-core/uc03Tl';
import {
  getPcBookingExtractionReview,
  type PcBookingExtractionFact,
} from '../services/di/bookingDocuments';
import { getPcBookingDocumentPreviewSource } from '../services/di/bookingPreview';
import { useProjectContextStore } from '../store/projectContextStore';
import { useSessionStore } from '../store/sessionStore';

type ReviewDocument = {
  requirementRef: string;
  requirementKey: string;
  documentTypeKey: string;
  documentId: string;
};

function friendly(value: string): string {
  return value
    .replace(/[_-]+/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function factValue(fact: PcBookingExtractionFact): unknown {
  return fact.normalizedValue ?? fact.rawValue;
}

function TlReviewDocumentCard({
  tenantId,
  journeyId,
  externalContextRef,
  accessToken,
  document,
}: {
  tenantId: string;
  journeyId: string;
  externalContextRef: string;
  accessToken: string;
  document: ReviewDocument;
}) {
  const [modifiedValues, setModifiedValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [reuploading, setReuploading] = useState(false);
  const [reuploadReason, setReuploadReason] = useState('');
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();

  const extractionQuery = useQuery({
    queryKey: ['uc03-tl-di-extraction', tenantId, journeyId, document.documentId],
    queryFn: () => getPcBookingExtractionReview(
      tenantId,
      externalContextRef,
      document.documentId,
      accessToken,
    ),
    staleTime: 60_000,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  const extractionReady = extractionQuery.data?.processingStatus.toUpperCase() === 'PROCESSED';
  const previewQuery = useQuery({
    queryKey: ['uc03-tl-document-preview', tenantId, journeyId, document.documentId],
    queryFn: () => getPcBookingDocumentPreviewSource(
      tenantId,
      externalContextRef,
      document.documentId,
      accessToken,
    ),
    enabled: extractionReady,
    staleTime: 5 * 60_000,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  const setModifiedValue = (fact: PcBookingExtractionFact, value: string) => {
    setModifiedValues((current) => ({ ...current, [fact.sourceFactRef]: value }));
  };

  const resetModifiedValue = (fact: PcBookingExtractionFact) => {
    setModifiedValues((current) => {
      const next = { ...current };
      delete next[fact.sourceFactRef];
      return next;
    });
  };

  const saveReview = async () => {
    const review = extractionQuery.data;
    if (!review || !extractionReady) return;
    const fields: TlExtractedField[] = review.facts.map((fact) => ({
      fieldKey: fact.fieldKey,
      sourceFactRef: fact.sourceFactRef,
      sourceFactVersion: fact.sourceFactVersion,
      extractedValue: factValue(fact),
      modifiedValue: Object.prototype.hasOwnProperty.call(modifiedValues, fact.sourceFactRef)
        ? modifiedValues[fact.sourceFactRef]
        : null,
      confidenceScore: fact.confidenceScore,
    }));

    setSaving(true);
    setError(undefined);
    setMessage(undefined);
    try {
      const result = await submitTlDocumentReview(
        tenantId,
        journeyId,
        document.requirementRef,
        document.documentId,
        fields,
        accessToken,
      );
      setMessage(
        `TL review recorded. ${result.storedFieldCount} field${result.storedFieldCount === 1 ? '' : 's'} stored`
        + `${result.modifiedFieldCount ? `, ${result.modifiedFieldCount} corrected` : ''}.`,
      );
      setModifiedValues({});
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'TL document review could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  const requestReupload = async () => {
    const reason = reuploadReason.trim();
    if (!reason) {
      setError('Enter a reason so the PC knows what must be corrected in the re-upload.');
      return;
    }
    setReuploading(true);
    setError(undefined);
    setMessage(undefined);
    try {
      await requestTlDocumentReupload(
        tenantId,
        journeyId,
        document.requirementRef,
        document.documentId,
        reason,
        accessToken,
      );
      setMessage('Re-upload requested from the responsible PC. The Booking/Delivery journey is not blocked by TL review.');
      setReuploadReason('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The PC re-upload request could not be created.');
    } finally {
      setReuploading(false);
    }
  };

  if (extractionQuery.isPending) {
    return <div className="uc03-c1-loading" role="status">Loading extracted fields from Document Intelligence…</div>;
  }

  if (extractionQuery.isError || !extractionQuery.data) {
    return (
      <div className="uc03-c1-feedback is-error" role="alert">
        {extractionQuery.error instanceof Error ? extractionQuery.error.message : 'Extracted fields could not be loaded.'}
      </div>
    );
  }

  if (!extractionReady) {
    return (
      <div className="uc03-review-empty" role="status">
        <strong>{friendly(document.documentTypeKey)} is still processing.</strong>
        <span>TL review is optional. You can return later without blocking the PC journey.</span>
      </div>
    );
  }

  return (
    <>
      {message && <div className="uc03-c1-feedback is-success" role="status">{message}</div>}
      {error && <div className="uc03-c1-feedback is-error" role="alert">{error}</div>}

      <OptimizedDirectDiFieldReview
        documentName={friendly(document.documentTypeKey || document.requirementKey)}
        facts={extractionQuery.data.facts}
        content={previewQuery.data}
        contentLoading={previewQuery.isPending}
        contentError={previewQuery.isError
          ? (previewQuery.error instanceof Error ? previewQuery.error.message : 'Source document could not be loaded.')
          : undefined}
        modifiedValues={modifiedValues}
        disabled={saving || reuploading}
        onModify={setModifiedValue}
        onReset={resetModifiedValue}
      />

      <div className="uc03-tl-review-actions">
        <button
          type="button"
          className="uc03-c1-primary"
          disabled={saving || reuploading}
          onClick={() => void saveReview()}
        >
          {saving ? 'Saving TL Review…' : 'Verify / Save Review'}
        </button>
        <span>TL review is optional and does not gate normal PC progression.</span>
      </div>

      <section className="uc03-tl-reupload">
        <div>
          <strong>Document needs to be uploaded again?</strong>
          <span>TL cannot upload. Request the responsible PC to replace this document.</span>
        </div>
        <textarea
          value={reuploadReason}
          onChange={(event) => setReuploadReason(event.target.value)}
          maxLength={1000}
          rows={3}
          placeholder="Reason for re-upload request"
          disabled={saving || reuploading}
        />
        <button
          type="button"
          className="uc03-c1-secondary"
          disabled={saving || reuploading || !reuploadReason.trim()}
          onClick={() => void requestReupload()}
        >
          {reuploading ? 'Requesting…' : 'Ask PC to Re-upload'}
        </button>
      </section>
    </>
  );
}

export default function TeamLeadReviewPage() {
  const { journeyId } = useParams<{ journeyId: string }>();
  const navigate = useNavigate();
  const project = useProjectContextStore((state) => state.selectedProject);
  const accessToken = useSessionStore((state) => state.accessToken);
  const [documentIndex, setDocumentIndex] = useState(0);

  const enabled = Boolean(
    project?.tenantId
    && project.operatingRole === 'TL'
    && accessToken
    && journeyId,
  );

  const contextQuery = useQuery({
    queryKey: ['uc03-tl-review-context', project?.tenantId, journeyId],
    queryFn: () => getTlReviewContext(project!.tenantId, journeyId!, accessToken),
    enabled,
    staleTime: 30_000,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  const documents = useMemo<ReviewDocument[]>(() => {
    const requirements: TlReviewRequirement[] = contextQuery.data?.requirements ?? [];
    return requirements.flatMap((requirement) => requirement.activeDocumentIds.map((documentId) => ({
      requirementRef: requirement.requirementRef,
      requirementKey: requirement.requirementKey,
      documentTypeKey: requirement.documentTypeKey,
      documentId,
    })));
  }, [contextQuery.data?.requirements]);

  if (!project || project.operatingRole !== 'TL' || !accessToken || !journeyId) return null;

  const safeIndex = documents.length ? Math.min(documentIndex, documents.length - 1) : 0;
  const currentDocument = documents[safeIndex];

  return (
    <div className="screen-stack uc03-c1-workspace uc03-tl-review-page">
      <div className="uc03-c1-topbar">
        <button type="button" className="uc03-c1-back" onClick={() => navigate('/dashboard')}>← TL Dashboard</button>
        <span>Project · {project.projectName}</span>
      </div>

      <PageHeader
        eyebrow="Team Lead · Optional Review"
        title="Review Submitted Booking"
        description="Inspect DI fields, correct values when needed, or ask the responsible PC to re-upload a document. TL review does not block the PC journey."
      />

      {contextQuery.isPending && <div className="uc03-c1-loading" role="status">Loading submitted Booking documents…</div>}
      {contextQuery.isError && (
        <div className="uc03-c1-feedback is-error" role="alert">
          {contextQuery.error instanceof Error ? contextQuery.error.message : 'TL review context could not be loaded.'}
        </div>
      )}

      {contextQuery.data && documents.length === 0 && (
        <section className="uc03-c1-section">
          <div className="uc03-review-empty">
            <strong>No active Booking documents are available for TL review.</strong>
            <span>The case remains visible on the TL dashboard and normal PC progression is unaffected.</span>
          </div>
        </section>
      )}

      {currentDocument && (
        <>
          <section className="uc03-tl-document-nav" aria-label="Submitted documents">
            <div>
              <span>Document {safeIndex + 1} of {documents.length}</span>
              <strong>{friendly(currentDocument.documentTypeKey || currentDocument.requirementKey)}</strong>
            </div>
            <div>
              <button
                type="button"
                className="uc03-c1-secondary"
                disabled={safeIndex === 0}
                onClick={() => setDocumentIndex((value) => Math.max(0, value - 1))}
              >
                Previous
              </button>
              <button
                type="button"
                className="uc03-c1-secondary"
                disabled={safeIndex >= documents.length - 1}
                onClick={() => setDocumentIndex((value) => Math.min(documents.length - 1, value + 1))}
              >
                Next
              </button>
            </div>
          </section>

          <section className="uc03-c1-section" key={currentDocument.documentId}>
            <TlReviewDocumentCard
              tenantId={project.tenantId}
              journeyId={journeyId}
              externalContextRef={contextQuery.data!.externalContextRef}
              accessToken={accessToken}
              document={currentDocument}
            />
          </section>
        </>
      )}
    </div>
  );
}
