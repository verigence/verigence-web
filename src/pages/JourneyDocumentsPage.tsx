import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';

import PageHeader from '../components/PageHeader';
import AttributeEvidenceViewer, { hasBoxedEvidence } from '../features/uc03/AttributeEvidenceViewer';
import ReviewEffectiveValueEditor, { reviewSourceKey } from '../features/uc03/ReviewEffectiveValueEditor';
import {
  confirmBookingReviewV2,
  confirmDeliveryReviewV2,
  getBookingReviewV2,
  getDeliveryReviewV2,
  proposeFieldCorrection,
  type BookingReviewV2,
  type DeliveryReviewV2,
  type ReviewFieldCorrection,
  type ReviewV2Document,
  type ReviewV2Field,
  type ReviewV2SourceValue,
} from '../services/audit-core/uc03DocumentReviewV2';
import { useProjectContextStore } from '../store/projectContextStore';
import { useSessionStore } from '../store/sessionStore';
import '../styles/uc03-journey-documents.css';

type Stage = 'BOOKING' | 'DELIVERY';
const REVIEW_THRESHOLD = 90;

function displayFieldKey(fieldKey: string): string {
  return fieldKey
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return 'Not extracted';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  try { return JSON.stringify(value); } catch { return String(value); }
}

function isHighConfidence(field: ReviewV2Field): boolean {
  return field.confidenceScore !== null && field.confidenceScore !== undefined && field.confidenceScore >= REVIEW_THRESHOLD;
}

function fieldSource(document: ReviewV2Document, field: ReviewV2Field): ReviewV2SourceValue {
  return {
    canonicalFieldId: field.canonicalFieldId,
    fieldKey: field.fieldKey,
    value: field.value,
    confidenceScore: field.confidenceScore,
    sourceFactVersion: field.sourceFactVersion,
    reviewState: field.reviewState,
    documentId: document.documentId,
    evidenceId: document.evidenceId,
    documentTypeKey: document.documentTypeKey,
    documentLabel: document.label,
    originalFilename: document.originalFilename,
    contentUrl: document.contentUrl,
    pageNo: field.pageNo,
    evidenceRegion: field.evidenceRegion,
  };
}

function proposalKey(field: ReviewV2Field): string {
  return `${field.canonicalFieldId}:${field.fieldKey}:${field.sourceFactVersion}`;
}

/** A small inline form for proposing a correction to a >=90%-confidence
 * field. Not directly editable -- see ProposeFieldCorrectionCommand's own
 * docstring on the backend: this raises a TL-adjudicated finding rather
 * than silently overwriting a high-confidence DI value. */
function ProposeCorrectionForm({
  onCancel,
  onSubmit,
  busy,
}: {
  onCancel: () => void;
  onSubmit: (proposedValue: string, remarks: string) => void;
  busy: boolean;
}) {
  const [proposedValue, setProposedValue] = useState('');
  const [remarks, setRemarks] = useState('');
  return (
    <form
      className="uc03-jd-propose-form"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(proposedValue, remarks);
      }}
    >
      <label>
        Corrected value
        <input value={proposedValue} onChange={(event) => setProposedValue(event.target.value)} required disabled={busy} />
      </label>
      <label>
        Remarks — why is the extracted value wrong?
        <textarea value={remarks} onChange={(event) => setRemarks(event.target.value)} required rows={2} disabled={busy} />
      </label>
      <div className="uc03-jd-propose-actions">
        <button type="button" onClick={onCancel} disabled={busy}>Cancel</button>
        <button type="submit" disabled={busy || !proposedValue.trim() || !remarks.trim()}>
          {busy ? 'Submitting…' : 'Submit for Team Lead review'}
        </button>
      </div>
    </form>
  );
}

function DocumentFieldsPanel({
  stage,
  document,
  isReadOnly,
  corrections,
  onCorrection,
  onEvidence,
  proposed,
  onProposed,
  tenantId,
  journeyId,
  accessToken,
}: {
  stage: Stage;
  document: ReviewV2Document;
  isReadOnly: boolean;
  corrections: Map<string, ReviewFieldCorrection>;
  onCorrection: (source: ReviewV2SourceValue, correction: ReviewFieldCorrection | undefined) => void;
  onEvidence: (source: ReviewV2SourceValue) => void;
  proposed: Set<string>;
  onProposed: (key: string) => void;
  tenantId: string;
  journeyId: string;
  accessToken?: string;
}) {
  const [openProposalFor, setOpenProposalFor] = useState<string>();
  const [proposalError, setProposalError] = useState<string>();
  const [proposalBusy, setProposalBusy] = useState(false);

  const submitProposal = async (field: ReviewV2Field, proposedValue: string, remarks: string) => {
    setProposalBusy(true);
    setProposalError(undefined);
    try {
      await proposeFieldCorrection(tenantId, journeyId, {
        stage,
        documentId: document.documentId,
        documentTypeKey: document.documentTypeKey || 'unknown',
        fieldKey: field.fieldKey,
        canonicalFieldId: field.canonicalFieldId,
        sourceFactVersion: field.sourceFactVersion,
        confidenceScore: field.confidenceScore,
        evidenceId: document.evidenceId,
        originalValue: field.value,
        proposedValue,
        remarks,
      }, accessToken);
      onProposed(proposalKey(field));
      setOpenProposalFor(undefined);
    } catch (error) {
      setProposalError(error instanceof Error ? error.message : 'The correction could not be submitted. Try again.');
    } finally {
      setProposalBusy(false);
    }
  };

  if (!document.fields.length) {
    return <p className="uc03-jd-empty">No fields have been extracted from this document yet.</p>;
  }

  return (
    <div className="uc03-jd-fields-table-wrap">
      <table className="uc03-jd-fields-table">
        <thead>
          <tr>
            <th>Field</th>
            <th>Extracted value</th>
            <th>Confidence</th>
            <th>Evidence</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {document.fields.map((field) => {
            const source = fieldSource(document, field);
            const key = proposalKey(field);
            const highConf = isHighConfidence(field);
            const boxed = hasBoxedEvidence(source);
            const alreadyProposed = proposed.has(key);
            return (
              <tr key={key} className={field.reviewState === 'NEEDS_REVIEW' ? 'needs-review' : ''}>
                <td><strong>{displayFieldKey(field.fieldKey)}</strong></td>
                <td>
                  {!highConf && !isReadOnly ? (
                    <ReviewEffectiveValueEditor
                      source={source}
                      correction={corrections.get(reviewSourceKey(source))}
                      onChange={(correction) => onCorrection(source, correction)}
                      disabled={false}
                    />
                  ) : displayValue(field.value)}
                </td>
                <td>{field.confidenceScore === null || field.confidenceScore === undefined ? '—' : `${field.confidenceScore.toFixed(field.confidenceScore % 1 === 0 ? 0 : 1)}%`}</td>
                <td>
                  {boxed ? (
                    <button type="button" className="uc03-attribute-evidence-link" onClick={() => onEvidence(source)}>View boxed evidence</button>
                  ) : <span className="uc03-jd-muted">Location unavailable</span>}
                </td>
                <td>
                  {highConf ? (
                    alreadyProposed ? (
                      <span className="uc03-jd-proposed-badge">Proposed — pending Team Lead review</span>
                    ) : isReadOnly ? (
                      <span className="uc03-jd-muted">—</span>
                    ) : openProposalFor === key ? null : (
                      <button type="button" className="uc03-jd-propose-link" onClick={() => { setOpenProposalFor(key); setProposalError(undefined); }}>
                        Propose correction
                      </button>
                    )
                  ) : (
                    <span className="uc03-jd-muted">Editable above</span>
                  )}
                  {highConf && openProposalFor === key ? (
                    <ProposeCorrectionForm
                      busy={proposalBusy}
                      onCancel={() => setOpenProposalFor(undefined)}
                      onSubmit={(proposedValue, remarks) => void submitProposal(field, proposedValue, remarks)}
                    />
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {proposalError ? <div className="uc03-jd-error" role="alert">{proposalError}</div> : null}
    </div>
  );
}

function StagePanel({
  stage,
  review,
  tenantId,
  journeyId,
  accessToken,
  onEvidence,
}: {
  stage: Stage;
  review: BookingReviewV2 | DeliveryReviewV2;
  tenantId: string;
  journeyId: string;
  accessToken?: string;
  onEvidence: (source: ReviewV2SourceValue) => void;
}) {
  const [activeDocumentId, setActiveDocumentId] = useState<string>();
  const [corrections, setCorrections] = useState<Map<string, ReviewFieldCorrection>>(new Map());
  const [proposed, setProposed] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string>();
  const [saved, setSaved] = useState(false);

  const documents = review.documents;
  const currentDocumentId = activeDocumentId && documents.some((document) => document.documentId === activeDocumentId)
    ? activeDocumentId
    : documents[0]?.documentId;
  const currentDocument = documents.find((document) => document.documentId === currentDocumentId);
  const isReadOnly = review.captureSubmitted && review.pcVerificationStatus === 'VERIFIED';

  const setCorrection = (source: ReviewV2SourceValue, correction: ReviewFieldCorrection | undefined) => {
    setSaved(false);
    setCorrections((current) => {
      const next = new Map(current);
      const key = reviewSourceKey(source);
      if (correction) next.set(key, correction);
      else next.delete(key);
      return next;
    });
  };

  const save = async () => {
    setSaving(true);
    setSaveError(undefined);
    try {
      if (stage === 'BOOKING') {
        await confirmBookingReviewV2(tenantId, journeyId, review.aggregateVersion, [...corrections.values()], accessToken);
      } else {
        await confirmDeliveryReviewV2(tenantId, journeyId, review.aggregateVersion, [...corrections.values()], accessToken);
      }
      setCorrections(new Map());
      setSaved(true);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'These corrections could not be saved. Refresh and try again.');
    } finally {
      setSaving(false);
    }
  };

  if (!documents.length) {
    return <p className="uc03-jd-empty">No documents have been uploaded for {stage === 'BOOKING' ? 'Booking' : 'Delivery'} yet.</p>;
  }

  return (
    <div className="uc03-jd-stage-panel">
      <div className="uc03-jd-doc-tabs" role="tablist" aria-label={`${stage === 'BOOKING' ? 'Booking' : 'Delivery'} documents`}>
        {documents.map((document) => (
          <button
            key={document.documentId}
            type="button"
            role="tab"
            aria-selected={document.documentId === currentDocumentId}
            className={document.documentId === currentDocumentId ? 'is-active' : ''}
            onClick={() => setActiveDocumentId(document.documentId)}
          >
            {document.label}
            {document.extractionState === 'PENDING' ? <span className="uc03-jd-tab-flag pending">extracting…</span> : null}
            {document.extractionState === 'FAILED' ? <span className="uc03-jd-tab-flag failed">failed</span> : null}
          </button>
        ))}
      </div>

      {currentDocument ? (
        <section className="uc03-jd-document-panel">
          <header>
            <div>
              <span className="uc03-c1-eyebrow">{currentDocument.documentTypeKey || 'Document'}</span>
              <h3>{currentDocument.originalFilename}</h3>
            </div>
            {currentDocument.extractionState === 'PENDING' ? <span className="uc03-jd-status pending">Extraction in progress</span> : null}
            {currentDocument.extractionState === 'FAILED' ? <span className="uc03-jd-status failed">Processing failed</span> : null}
          </header>
          <DocumentFieldsPanel
            stage={stage}
            document={currentDocument}
            isReadOnly={isReadOnly}
            corrections={corrections}
            onCorrection={setCorrection}
            onEvidence={onEvidence}
            proposed={proposed}
            onProposed={(key) => setProposed((current) => new Set(current).add(key))}
            tenantId={tenantId}
            journeyId={journeyId}
            accessToken={accessToken}
          />
        </section>
      ) : null}

      {isReadOnly ? (
        <p className="uc03-jd-readonly-note">
          {stage === 'BOOKING' ? 'Booking' : 'Delivery'} Review has already been confirmed. Values below 90% confidence
          can no longer be edited here — use Propose correction above for any field that needs a further fix.
        </p>
      ) : (
        <div className="uc03-jd-save-bar">
          <div>
            <strong>{corrections.size} correction{corrections.size === 1 ? '' : 's'} ready to save</strong>
            <span>
              Saving applies every &lt;90%-confidence correction made across all {stage === 'BOOKING' ? 'Booking' : 'Delivery'} documents
              in this session, not just this tab — it uses the same one-time Review Confirm this stage's Submit flow does.
            </span>
          </div>
          <button type="button" className="uc03-c3-primary" disabled={saving || corrections.size === 0} onClick={() => void save()}>
            {saving ? 'Saving…' : 'Save reviewed corrections'}
          </button>
        </div>
      )}
      {saved ? <div className="uc03-jd-success" role="status">Corrections saved.</div> : null}
      {saveError ? <div className="uc03-jd-error" role="alert">{saveError}</div> : null}
    </div>
  );
}

export default function JourneyDocumentsPage() {
  const { journeyId } = useParams<{ journeyId: string }>();
  const navigate = useNavigate();
  const project = useProjectContextStore((state) => state.selectedProject);
  const accessToken = useSessionStore((state) => state.accessToken);
  const [stage, setStage] = useState<Stage>('BOOKING');
  const [selectedSource, setSelectedSource] = useState<ReviewV2SourceValue>();

  const enabled = Boolean(project?.tenantId && journeyId && accessToken);
  const bookingQuery = useQuery({
    queryKey: ['uc03-journey-documents-booking', project?.tenantId, journeyId],
    queryFn: () => getBookingReviewV2(project!.tenantId, journeyId!, accessToken),
    enabled,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const deliveryQuery = useQuery({
    queryKey: ['uc03-journey-documents-delivery', project?.tenantId, journeyId],
    queryFn: () => getDeliveryReviewV2(project!.tenantId, journeyId!, accessToken),
    enabled,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const bookingAvailable = Boolean(bookingQuery.data);
  const deliveryAvailable = Boolean(deliveryQuery.data);
  const activeStage: Stage = useMemo(() => {
    if (stage === 'DELIVERY' && deliveryAvailable) return 'DELIVERY';
    if (stage === 'BOOKING' && bookingAvailable) return 'BOOKING';
    if (bookingAvailable) return 'BOOKING';
    if (deliveryAvailable) return 'DELIVERY';
    return stage;
  }, [stage, bookingAvailable, deliveryAvailable]);

  if (!project || !journeyId) return null;

  const loading = bookingQuery.isPending || deliveryQuery.isPending;
  if (loading) return <div className="uc03-c1-loading" role="status">Loading Journey Documents…</div>;
  if (!bookingAvailable && !deliveryAvailable) {
    return (
      <section className="dashboard-load-state" role="alert">
        <div className="dashboard-load-state__mark">!</div>
        <div className="dashboard-load-state__copy">
          <strong>Documents are not available yet.</strong>
          <p>Start Booking or Delivery capture on this Journey before opening its documents here.</p>
        </div>
        <button type="button" className="user-menu-button" onClick={() => navigate(`/journeys/${journeyId}/overview`)}>Back to Journey Details</button>
      </section>
    );
  }

  return (
    <div className="screen-stack uc03-journey-documents-page">
      <div className="uc03-c1-topbar">
        <button type="button" className="uc03-c1-back" onClick={() => navigate(`/journeys/${journeyId}/overview`)}>← Journey Details</button>
      </div>

      <PageHeader
        eyebrow="Journey Documents"
        title="Review scanned documents & extracted values"
        description="Every uploaded document, section by section, with the values Document Intelligence extracted from it. Fields below 90% confidence can be corrected directly; fields at or above 90% go through a Team Lead-reviewed correction instead."
      />

      <div className="uc03-jd-stage-tabs" role="tablist" aria-label="Journey stage">
        <button type="button" role="tab" aria-selected={activeStage === 'BOOKING'} className={activeStage === 'BOOKING' ? 'is-active' : ''} disabled={!bookingAvailable} onClick={() => setStage('BOOKING')}>
          Booking
        </button>
        <button type="button" role="tab" aria-selected={activeStage === 'DELIVERY'} className={activeStage === 'DELIVERY' ? 'is-active' : ''} disabled={!deliveryAvailable} onClick={() => setStage('DELIVERY')}>
          Delivery
        </button>
      </div>

      {activeStage === 'BOOKING' && bookingQuery.data ? (
        <StagePanel stage="BOOKING" review={bookingQuery.data} tenantId={project.tenantId} journeyId={journeyId} accessToken={accessToken} onEvidence={setSelectedSource} />
      ) : null}
      {activeStage === 'DELIVERY' && deliveryQuery.data ? (
        <StagePanel stage="DELIVERY" review={deliveryQuery.data} tenantId={project.tenantId} journeyId={journeyId} accessToken={accessToken} onEvidence={setSelectedSource} />
      ) : null}

      {selectedSource ? (
        <AttributeEvidenceViewer tenantId={project.tenantId} journeyId={journeyId} accessToken={accessToken} source={selectedSource} onClose={() => setSelectedSource(undefined)} />
      ) : null}
    </div>
  );
}
