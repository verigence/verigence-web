import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';

import PageHeader from '../components/PageHeader';
import AttributeEvidenceViewer, { hasBoxedEvidence } from '../features/uc03/AttributeEvidenceViewer';
import {
  getBookingReviewV2,
  getDeliveryReviewV2,
  submitFieldCorrection,
  type BookingReviewV2,
  type DeliveryReviewV2,
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

function isHighConfidence(confidenceScore: number | null): boolean {
  return confidenceScore !== null && confidenceScore !== undefined && confidenceScore >= REVIEW_THRESHOLD;
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

function fieldRowKey(field: ReviewV2Field): string {
  return `${field.canonicalFieldId}:${field.fieldKey}:${field.sourceFactVersion}`;
}

type LocalCorrectionState =
  | { kind: 'APPLIED'; value: unknown }
  | { kind: 'PENDING' };

/**
 * One field, one correction action. Every field -- whatever its confidence
 * -- gets the same inline form; what differs is server-side behavior (see
 * submitFieldCorrection's doc comment): a <90% save applies immediately and
 * closes on its own, a >=90% save raises a Team-Lead-adjudicated proposal
 * and stays visibly pending until someone acts on it. Saving here NEVER
 * touches the stage's Review Confirm/Submit flow -- each field is its own
 * small, always-repeatable action, not a batch queued for one big Save.
 */
function FieldCorrectionRow({
  stage,
  document,
  field,
  local,
  onLocalChange,
  onEvidence,
  tenantId,
  journeyId,
  accessToken,
}: {
  stage: Stage;
  document: ReviewV2Document;
  field: ReviewV2Field;
  local?: LocalCorrectionState;
  onLocalChange: (state: LocalCorrectionState) => void;
  onEvidence: (source: ReviewV2SourceValue) => void;
  tenantId: string;
  journeyId: string;
  accessToken?: string;
}) {
  const [open, setOpen] = useState(false);
  const [draftValue, setDraftValue] = useState('');
  const [remarks, setRemarks] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const currentValue = local?.kind === 'APPLIED' ? local.value : field.value;
  const highConf = isHighConfidence(field.confidenceScore);
  const source = fieldSource(document, field);
  const boxed = hasBoxedEvidence(source);
  const pending = local?.kind === 'PENDING';

  const openForm = () => {
    setDraftValue(displayValue(currentValue) === 'Not extracted' ? '' : displayValue(currentValue));
    setRemarks('');
    setError(undefined);
    setOpen(true);
  };

  const submit = async () => {
    if (!draftValue.trim()) return;
    if (highConf && !remarks.trim()) {
      setError('Remarks are required for a value at or above 90% confidence.');
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      await submitFieldCorrection(tenantId, journeyId, {
        stage,
        documentId: document.documentId,
        documentTypeKey: document.documentTypeKey || 'unknown',
        fieldKey: field.fieldKey,
        canonicalFieldId: field.canonicalFieldId,
        sourceFactVersion: field.sourceFactVersion,
        confidenceScore: field.confidenceScore,
        evidenceId: document.evidenceId,
        originalValue: field.value,
        newValue: draftValue,
        remarks: remarks.trim() || undefined,
      }, accessToken);
      onLocalChange(highConf ? { kind: 'PENDING' } : { kind: 'APPLIED', value: draftValue });
      setOpen(false);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'This correction could not be saved. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <tr className={field.reviewState === 'NEEDS_REVIEW' && !local ? 'needs-review' : ''}>
      <td><strong>{displayFieldKey(field.fieldKey)}</strong></td>
      <td>
        {displayValue(currentValue)}
        {local?.kind === 'APPLIED' ? <span className="uc03-jd-applied-badge">Corrected</span> : null}
      </td>
      <td>{field.confidenceScore === null || field.confidenceScore === undefined ? '—' : `${field.confidenceScore.toFixed(field.confidenceScore % 1 === 0 ? 0 : 1)}%`}</td>
      <td>
        {boxed ? (
          <button type="button" className="uc03-attribute-evidence-link" onClick={() => onEvidence(source)}>View boxed evidence</button>
        ) : <span className="uc03-jd-muted">Location unavailable</span>}
      </td>
      <td>
        {pending ? (
          <span className="uc03-jd-proposed-badge">Proposed — pending Team Lead review</span>
        ) : open ? (
          <form
            className="uc03-jd-propose-form"
            onSubmit={(event) => { event.preventDefault(); void submit(); }}
          >
            <label>
              {highConf ? 'Corrected value' : 'New value'}
              <input value={draftValue} onChange={(event) => setDraftValue(event.target.value)} required disabled={busy} />
            </label>
            {highConf ? (
              <label>
                Remarks — why is the extracted value wrong?
                <textarea value={remarks} onChange={(event) => setRemarks(event.target.value)} required rows={2} disabled={busy} />
              </label>
            ) : null}
            <div className="uc03-jd-propose-actions">
              <button type="button" onClick={() => setOpen(false)} disabled={busy}>Cancel</button>
              <button type="submit" disabled={busy || !draftValue.trim()}>
                {busy ? 'Saving…' : highConf ? 'Submit for Team Lead review' : 'Save'}
              </button>
            </div>
            {error ? <div className="uc03-jd-error" role="alert">{error}</div> : null}
          </form>
        ) : (
          <button type="button" className="uc03-jd-propose-link" onClick={openForm}>
            {highConf ? 'Propose correction' : 'Correct this value'}
          </button>
        )}
      </td>
    </tr>
  );
}

function DocumentFieldsPanel({
  stage,
  document,
  localByField,
  onLocalChange,
  onEvidence,
  tenantId,
  journeyId,
  accessToken,
}: {
  stage: Stage;
  document: ReviewV2Document;
  localByField: Map<string, LocalCorrectionState>;
  onLocalChange: (key: string, state: LocalCorrectionState) => void;
  onEvidence: (source: ReviewV2SourceValue) => void;
  tenantId: string;
  journeyId: string;
  accessToken?: string;
}) {
  if (!document.fields.length) {
    return <p className="uc03-jd-empty">No fields have been extracted from this document yet.</p>;
  }

  return (
    <div className="uc03-jd-fields-table-wrap">
      <table className="uc03-jd-fields-table">
        <thead>
          <tr>
            <th>Field</th>
            <th>Value</th>
            <th>Confidence</th>
            <th>Evidence</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {document.fields.map((field) => {
            const key = fieldRowKey(field);
            return (
              <FieldCorrectionRow
                key={key}
                stage={stage}
                document={document}
                field={field}
                local={localByField.get(key)}
                onLocalChange={(state) => onLocalChange(key, state)}
                onEvidence={onEvidence}
                tenantId={tenantId}
                journeyId={journeyId}
                accessToken={accessToken}
              />
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function StagePanel({
  stage,
  review,
  onEvidence,
  tenantId,
  journeyId,
  accessToken,
}: {
  stage: Stage;
  review: BookingReviewV2 | DeliveryReviewV2;
  onEvidence: (source: ReviewV2SourceValue) => void;
  tenantId: string;
  journeyId: string;
  accessToken?: string;
}) {
  const [activeDocumentId, setActiveDocumentId] = useState<string>();
  const [localByField, setLocalByField] = useState<Map<string, LocalCorrectionState>>(new Map());

  const documents = review.documents;
  const currentDocumentId = activeDocumentId && documents.some((document) => document.documentId === activeDocumentId)
    ? activeDocumentId
    : documents[0]?.documentId;
  const currentDocument = documents.find((document) => document.documentId === currentDocumentId);

  const setLocal = (key: string, state: LocalCorrectionState) => {
    setLocalByField((current) => {
      const next = new Map(current);
      next.set(key, state);
      return next;
    });
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
            localByField={localByField}
            onLocalChange={setLocal}
            onEvidence={onEvidence}
            tenantId={tenantId}
            journeyId={journeyId}
            accessToken={accessToken}
          />
        </section>
      ) : null}

      <p className="uc03-jd-readonly-note">
        A correction below 90% confidence is saved and applied immediately — there is nothing further to submit.
        A correction at or above 90% confidence is sent to a Team Lead for review before it takes effect.
      </p>
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
        description="Every uploaded document, section by section, with the values Document Intelligence extracted from it. Fields below 90% confidence can be corrected directly and take effect immediately; fields at or above 90% go through a Team Lead-reviewed correction instead."
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
        <StagePanel stage="BOOKING" review={bookingQuery.data} onEvidence={setSelectedSource} tenantId={project.tenantId} journeyId={journeyId} accessToken={accessToken} />
      ) : null}
      {activeStage === 'DELIVERY' && deliveryQuery.data ? (
        <StagePanel stage="DELIVERY" review={deliveryQuery.data} onEvidence={setSelectedSource} tenantId={project.tenantId} journeyId={journeyId} accessToken={accessToken} />
      ) : null}

      {selectedSource ? (
        <AttributeEvidenceViewer tenantId={project.tenantId} journeyId={journeyId} accessToken={accessToken} source={selectedSource} onClose={() => setSelectedSource(undefined)} />
      ) : null}
    </div>
  );
}
