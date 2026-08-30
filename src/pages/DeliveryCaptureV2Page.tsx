import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';

import PageHeader from '../components/PageHeader';
import StatusPill from '../components/StatusPill';
import { getDeliveryWorkspace, startDelivery } from '../services/audit-core/uc03Delivery';
import {
  deleteDeliveryCaptureV2Document,
  deliveryCaptureV2IsProcessing,
  getDeliveryCaptureV2,
  submitDeliveryCaptureV2,
  uploadDeliveryCaptureV2Files,
} from '../services/audit-core/uc03DeliveryCaptureV2';
import type { CaptureV2Requirement } from '../services/audit-core/uc03DocumentCaptureV2';
import { useProjectContextStore } from '../store/projectContextStore';
import { useSessionStore } from '../store/sessionStore';
import '../styles/uc03-document-capture-v2.css';
import '../styles/uc03-delivery-capture-v2.css';

const POLL_MS = 1_000;

type DeliveryGroupKey = 'INVOICES' | 'PAYMENTS' | 'OTHERS';

function normalize(value: string): string {
  return value.replace(/[_-]+/g, ' ').trim().toLowerCase();
}

function groupFor(requirement: CaptureV2Requirement): DeliveryGroupKey {
  const text = normalize(`${requirement.requirementKey} ${requirement.documentTypeKey} ${requirement.label}`);
  if (text.includes('invoice')) return 'INVOICES';
  if (text.includes('payment') || text.includes('receipt') || text.includes('transaction') || text.includes('bank')) return 'PAYMENTS';
  return 'OTHERS';
}

function groupTitle(key: DeliveryGroupKey): string {
  if (key === 'INVOICES') return 'Invoices';
  if (key === 'PAYMENTS') return 'Payment receipts';
  return 'Other documents';
}

function groupDescription(key: DeliveryGroupKey): string {
  if (key === 'INVOICES') return 'Vehicle, tax and commercial invoices configured for this Delivery.';
  if (key === 'PAYMENTS') return 'Receipts and payment evidence available for this Delivery.';
  return 'Other mandatory or optional Delivery evidence.';
}

function elapsed(startedAt: number): string {
  const seconds = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
  const minutes = Math.floor(seconds / 60).toString().padStart(2, '0');
  const remaining = (seconds % 60).toString().padStart(2, '0');
  return `${minutes}:${remaining}`;
}

function rowStatus(requirement: CaptureV2Requirement): string {
  if (requirement.state === 'UPLOADED') return 'UPLOADED';
  if (requirement.state === 'NOT_APPLICABLE') return 'NOT APPLICABLE';
  return requirement.requirementLevel === 'REQUIRED' ? 'NOT UPLOADED' : 'OPTIONAL';
}

function RequirementRow({
  requirement,
  deletingId,
  submitted,
  onDelete,
}: {
  requirement: CaptureV2Requirement;
  deletingId?: string;
  submitted: boolean;
  onDelete: (documentId: string) => Promise<void>;
}) {
  const document = requirement.document;
  return (
    <article className={`uc03-delivery-v2-row ${document ? 'is-uploaded' : ''}`}>
      <div className="uc03-delivery-v2-row__name">
        <strong>{requirement.label}</strong>
        <span>{requirement.requirementLevel === 'REQUIRED' ? 'Mandatory' : 'Optional / if applicable'}</span>
      </div>
      <div className="uc03-delivery-v2-row__status">
        <StatusPill value={rowStatus(requirement)} compact />
        {document ? (
          <span>{document.classifiedDocumentTypeKey || requirement.documentTypeKey}{document.processingStatus ? ` · ${document.processingStatus}` : ''}</span>
        ) : (
          <span>{requirement.requirementLevel === 'REQUIRED' ? 'Not received yet' : 'Add only when applicable'}</span>
        )}
      </div>
      <div className="uc03-delivery-v2-row__actions">
        {document?.contentUrl ? <a href={document.contentUrl} target="_blank" rel="noreferrer">View</a> : null}
        {document && !submitted ? (
          <button
            type="button"
            disabled={deletingId === document.documentId}
            onClick={() => void onDelete(document.documentId)}
          >{deletingId === document.documentId ? 'Deleting…' : 'Delete'}</button>
        ) : null}
      </div>
    </article>
  );
}

export default function DeliveryCaptureV2Page() {
  const { journeyId = '' } = useParams();
  const navigate = useNavigate();
  const project = useProjectContextStore((state) => state.selectedProject);
  const accessToken = useSessionStore((state) => state.accessToken);
  const [starting, setStarting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string>();
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();
  const [helpOpen, setHelpOpen] = useState(false);
  const [clock, setClock] = useState('00:00');
  const startedAt = useRef(Date.now());

  const enabled = Boolean(project?.tenantId && journeyId && accessToken);
  const workspaceQuery = useQuery({
    queryKey: ['uc03-delivery-workspace-v2-entry', project?.tenantId, journeyId],
    queryFn: () => getDeliveryWorkspace(project!.tenantId, journeyId, accessToken),
    enabled,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const deliveryStarted = Boolean(workspaceQuery.data?.delivery.businessStatus);
  const captureQuery = useQuery({
    queryKey: ['uc03-delivery-capture-v2', project?.tenantId, journeyId],
    queryFn: () => getDeliveryCaptureV2(project!.tenantId, journeyId, accessToken),
    enabled: enabled && deliveryStarted,
    retry: false,
    refetchOnWindowFocus: false,
    refetchInterval: (query) => deliveryCaptureV2IsProcessing(query.state.data) ? POLL_MS : false,
  });

  useEffect(() => {
    const timer = window.setInterval(() => setClock(elapsed(startedAt.current)), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  const capture = captureQuery.data;
  const groups = useMemo(() => {
    const result: Record<DeliveryGroupKey, CaptureV2Requirement[]> = { INVOICES: [], PAYMENTS: [], OTHERS: [] };
    capture?.requirements.forEach((requirement) => result[groupFor(requirement)].push(requirement));
    return result;
  }, [capture?.requirements]);

  if (!project || !journeyId) return null;

  const handleStart = async () => {
    setStarting(true);
    setError(undefined);
    try {
      await startDelivery(project.tenantId, journeyId, accessToken);
      await workspaceQuery.refetch();
      startedAt.current = Date.now();
      setMessage('Delivery started. Add the documents available for this handover.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Delivery could not be started.');
    } finally {
      setStarting(false);
    }
  };

  const handleUpload = async (files: File[]) => {
    if (!files.length) return;
    setUploading(true);
    setError(undefined);
    setMessage('Documents uploading…');
    try {
      await uploadDeliveryCaptureV2Files(project.tenantId, journeyId, files, accessToken);
      await captureQuery.refetch();
      setMessage('Documents received. They are being classified and prepared for review.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'One or more Delivery documents could not be uploaded.');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (documentId: string) => {
    setDeletingId(documentId);
    setError(undefined);
    try {
      await deleteDeliveryCaptureV2Document(project.tenantId, journeyId, documentId, accessToken);
      await captureQuery.refetch();
      setMessage('Document removed from this Delivery submission.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The Delivery document could not be removed.');
    } finally {
      setDeletingId(undefined);
    }
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(undefined);
    try {
      await submitDeliveryCaptureV2(project.tenantId, journeyId, accessToken);
      navigate(`/v2/deliveries/${journeyId}/review`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Delivery documents could not be submitted.');
      setSubmitting(false);
    }
  };

  if (workspaceQuery.isPending) return <div className="uc03-c1-loading" role="status">Loading Delivery…</div>;

  if (workspaceQuery.isError && !deliveryStarted) {
    return (
      <div className="screen-stack uc03-delivery-v2-page">
        <div className="uc03-c1-topbar"><button type="button" className="uc03-c1-back" onClick={() => navigate('/dashboard')}>← Work List</button></div>
        <PageHeader eyebrow="Delivery · V2" title="Start Delivery" description="Start the Delivery event, then upload whatever evidence is available. Audit observations never block the business process." />
        {error ? <div className="uc03-booking-journey-feedback is-error" role="alert">{error}</div> : null}
        <section className="uc03-c1-start-panel">
          <div><span className="uc03-c1-eyebrow">Delivery Journey</span><h2>Start Delivery Capture</h2></div>
          <button type="button" className="uc03-c1-primary" disabled={starting} onClick={() => void handleStart()}>{starting ? 'Starting…' : 'Start Delivery'}</button>
        </section>
      </div>
    );
  }

  if (captureQuery.isPending || !capture) return <div className="uc03-c1-loading" role="status">Loading Delivery documents…</div>;

  const classified = capture.uploads.filter((document) => document.state.toUpperCase() === 'CLASSIFIED' && document.classifiedDocumentTypeKey).length;
  const processing = deliveryCaptureV2IsProcessing(capture);
  const mandatory = capture.requirements.filter((item) => item.requirementLevel === 'REQUIRED' && item.applicabilityState !== 'NOT_APPLICABLE');
  const mandatoryReceived = mandatory.filter((item) => Boolean(item.document)).length;

  if (capture.submitted) {
    return (
      <div className="screen-stack uc03-delivery-v2-page">
        <div className="uc03-c1-topbar"><button type="button" className="uc03-c1-back" onClick={() => navigate('/dashboard')}>← Work List</button></div>
        <PageHeader eyebrow="Delivery · V2" title="Delivery documents submitted" description="The submitted evidence remains available in the Delivery Review. Any exceptions are audit observations only and do not block Delivery." />
        <section className="uc03-delivery-v2-submit-complete">
          <strong>Delivery evidence submitted</strong>
          <button type="button" className="uc03-c1-primary" onClick={() => navigate(`/v2/deliveries/${journeyId}/review`)}>Open Delivery Review →</button>
        </section>
      </div>
    );
  }

  return (
    <div className="screen-stack uc03-delivery-v2-page">
      <div className="uc03-c1-topbar">
        <button type="button" className="uc03-c1-back" onClick={() => navigate('/dashboard')}>← Work List</button>

      </div>
      <PageHeader
        eyebrow="Delivery · V2"
        title="Delivery documents"
        description="Upload the documents available at Delivery. Missing or inconsistent evidence is flagged for audit follow-up; it never blocks Delivery progression."
      />

      {message ? <div className="uc03-booking-journey-feedback is-success" role="status">{message}</div> : null}
      {error ? <div className="uc03-booking-journey-feedback is-error" role="alert">{error}</div> : null}

      <section className="uc03-delivery-v2-summary" aria-label="Delivery document status">
        <div><span>Documents received</span><strong>{capture.uploads.length}</strong></div>
        <div><span>Documents classified</span><strong>{classified}</strong></div>
        <div><span>Mandatory received</span><strong>{mandatoryReceived}/{mandatory.length}</strong></div>
        <div className={processing ? 'is-processing' : 'is-ready'}><span>{processing ? 'Documents being classified' : 'Documents uploaded'}</span><strong>{clock}</strong></div>
      </section>

      <section className="uc03-delivery-v2-upload-panel">
        <div className="uc03-delivery-v2-upload-copy">
          <div className="uc03-delivery-v2-upload-title">
            <strong>Upload Delivery documents</strong>
            <button type="button" className="uc03-delivery-v2-help" aria-label="Delivery document help" aria-expanded={helpOpen} onClick={() => setHelpOpen((current) => !current)}>?</button>
          </div>
          <span>Select multiple files together. Verigence will identify the document types.</span>
          {helpOpen ? (
            <div className="uc03-delivery-v2-help-panel">
              <strong>Document guide</strong>
              <p><b>Mandatory:</b> {mandatory.length ? mandatory.map((item) => item.label).join(', ') : 'No mandatory document configured.'}</p>
              <p><b>Optional / if applicable:</b> {capture.requirements.filter((item) => item.requirementLevel !== 'REQUIRED').map((item) => item.label).join(', ') || 'None configured.'}</p>
              <small>Missing evidence creates an audit exception; it does not stop Delivery.</small>
            </div>
          ) : null}
        </div>
        <div className="uc03-v2-upload-actions">
          <label className="uc03-c1-primary">
            {uploading ? 'Uploading…' : 'Choose Files'}
            <input type="file" accept="image/*,.pdf" multiple disabled={uploading} onChange={(event) => {
              const files = Array.from(event.currentTarget.files ?? []);
              event.currentTarget.value = '';
              void handleUpload(files);
            }} />
          </label>
          <label className="uc03-v2-camera-action">
            Take Photo
            <input type="file" accept="image/*" capture="environment" disabled={uploading} onChange={(event) => {
              const files = Array.from(event.currentTarget.files ?? []);
              event.currentTarget.value = '';
              void handleUpload(files);
            }} />
          </label>
        </div>
      </section>

      <div className="uc03-delivery-v2-groups">
        {(['INVOICES', 'PAYMENTS', 'OTHERS'] as DeliveryGroupKey[]).map((key) => (
          <section key={key} className="uc03-delivery-v2-group">
            <header><div><h2>{groupTitle(key)}</h2><p>{groupDescription(key)}</p></div><span>{groups[key].length}</span></header>
            {groups[key].length ? groups[key].map((requirement) => (
              <RequirementRow key={requirement.requirementKey} requirement={requirement} deletingId={deletingId} submitted={capture.submitted} onDelete={handleDelete} />
            )) : <p className="uc03-delivery-v2-empty">No configured documents in this group.</p>}
          </section>
        ))}
      </div>

      <section className="uc03-delivery-v2-submit-bar">
        <div>
          <strong>{processing ? 'Documents being classified' : 'Ready to continue'}</strong>
          <span>Submit whenever the PC is done uploading. Audit exceptions remain non-blocking.</span>
        </div>
        <button type="button" className="uc03-c1-primary" disabled={uploading || submitting} onClick={() => void handleSubmit()}>
          {submitting ? 'Submitting…' : 'Submit & Review →'}
        </button>
      </section>
    </div>
  );
}
