import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';

import PageHeader from '../components/PageHeader';
import CaptureUploadInventory from '../features/uc03/CaptureUploadInventory';
import { getDeliveryWorkspace, startDelivery } from '../services/audit-core/uc03Delivery';
import {
  deleteDeliveryCaptureV2Document,
  deliveryCaptureV2IsProcessing,
  getDeliveryCaptureV2,
  uploadDeliveryCaptureV2Files,
} from '../services/audit-core/uc03DeliveryCaptureV2';
import type { CaptureV2Document, CaptureV2Requirement } from '../services/audit-core/uc03DocumentCaptureV2';
import { useProjectContextStore } from '../store/projectContextStore';
import { useSessionStore } from '../store/sessionStore';
import DeliveryDetailsV2Page from './DeliveryDetailsV2Page';
import '../styles/uc03-document-capture-v2.css';
import '../styles/uc03-delivery-capture-v2.css';

const POLL_MS = 1_000;

type DeliveryGroupKey = 'INVOICES' | 'PAYMENTS' | 'OTHERS';
type CardStatus = 'uploaded' | 'classified' | 'extracted' | 'failed';

const CARD_STATUS_LABEL: Record<CardStatus, string> = {
  uploaded: 'Uploaded',
  classified: 'Classified',
  extracted: 'Extracted',
  failed: 'Needs attention',
};

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

function elapsed(startedAt: number): string {
  const seconds = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
  const minutes = Math.floor(seconds / 60).toString().padStart(2, '0');
  const remaining = (seconds % 60).toString().padStart(2, '0');
  return `${minutes}:${remaining}`;
}

function cardStatus(document: CaptureV2Document): CardStatus {
  const state = document.state.trim().toUpperCase();
  const processing = document.processingStatus?.trim().toUpperCase();
  if (state === 'FAILED' || processing === 'FAILED') return 'failed';
  if (state !== 'CLASSIFIED' || !document.classifiedDocumentTypeKey) return 'uploaded';
  if (processing === 'PROCESSED') return 'extracted';
  return 'classified';
}

function DocumentCard({
  document,
  index,
  busy,
  readOnly,
  onDelete,
}: {
  document: CaptureV2Document;
  index: number;
  busy?: boolean;
  readOnly?: boolean;
  onDelete?: (documentId: string) => Promise<void>;
}) {
  const status = cardStatus(document);
  return (
    <article className={`uc03-doc-card is-${status}`}>
      <header>
        <span className="uc03-doc-card__index">Doc {index + 1}</span>
        {!readOnly && onDelete ? (
          <button
            type="button"
            className="uc03-doc-card__delete"
            disabled={busy}
            onClick={() => void onDelete(document.documentId)}
            aria-label={`Remove ${document.originalFilename}`}
          >
            {busy ? '…' : '×'}
          </button>
        ) : null}
      </header>
      <strong className="uc03-doc-card__name" title={document.originalFilename}>{document.originalFilename}</strong>
      <div className="uc03-doc-card__status">
        <span className="uc03-doc-card__dot" aria-hidden="true" />
        {CARD_STATUS_LABEL[status]}
      </div>
      {document.classifiedDocumentTypeKey ? <span className="uc03-doc-card__type">{document.classifiedDocumentTypeKey}</span> : null}
      {document.contentUrl ? <a className="uc03-doc-card__view" href={document.contentUrl} target="_blank" rel="noreferrer">View original</a> : null}
    </article>
  );
}

function RequirementChecklistRow({ requirement }: { requirement: CaptureV2Requirement }) {
  const received = Boolean(requirement.document);
  return (
    <div className={`uc03-checklist-row ${received ? 'is-received' : ''}`}>
      <span className="uc03-checklist-row__dot" aria-hidden="true" />
      <div>
        <strong>{requirement.label}</strong>
        <span>{requirement.requirementLevel === 'REQUIRED' ? 'Mandatory' : 'Optional / if applicable'}</span>
      </div>
      <em>{received ? 'Received' : 'Not received'}</em>
    </div>
  );
}

export default function DeliveryCaptureV2Page() {
  const { journeyId = '' } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const project = useProjectContextStore((state) => state.selectedProject);
  const accessToken = useSessionStore((state) => state.accessToken);
  const [starting, setStarting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string>();
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();
  const [checklistOpen, setChecklistOpen] = useState(false);
  const [clock, setClock] = useState('00:00');
  const startedAt = useRef(Date.now());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

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

  // Clicking "Capture Delivery" is already the user's explicit intent to start
  // Delivery -- an intermediate "Start Delivery" screen requiring a second,
  // purely mechanical click added no business value. Start it automatically
  // the moment the workspace confirms it isn't started yet, so the very next
  // thing the PC sees is the real upload screen.
  useEffect(() => {
    if (workspaceQuery.isSuccess && !deliveryStarted && !starting) {
      setStarting(true);
      setError(undefined);
      startDelivery(project!.tenantId, journeyId, accessToken)
        .then(() => workspaceQuery.refetch())
        .then(() => { startedAt.current = Date.now(); })
        .catch((cause) => setError(cause instanceof Error ? cause.message : 'Delivery could not be started.'))
        .finally(() => setStarting(false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceQuery.isSuccess, deliveryStarted, starting]);

  const capture = captureQuery.data;
  const groups = useMemo(() => {
    const result: Record<DeliveryGroupKey, CaptureV2Requirement[]> = { INVOICES: [], PAYMENTS: [], OTHERS: [] };
    capture?.requirements.forEach((requirement) => result[groupFor(requirement)].push(requirement));
    return result;
  }, [capture?.requirements]);

  if (!project || !journeyId) return null;

  if (searchParams.get('step') === 'details') {
    return <DeliveryDetailsV2Page />;
  }

  const handleUpload = async (files: File[]) => {
    if (!files.length) return;
    setUploading(true);
    setError(undefined);
    setMessage('Documents uploading…');
    try {
      await uploadDeliveryCaptureV2Files(project.tenantId, journeyId, files, accessToken);
      setMessage('Documents received. Classification continues in the background and does not block Delivery.');
      await captureQuery.refetch();
    } catch (cause) {
      setMessage(undefined);
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

  if (workspaceQuery.isPending) return <div className="uc03-c1-loading" role="status">Loading Delivery…</div>;

  if (workspaceQuery.isError) {
    return (
      <div className="screen-stack uc03-v2-capture uc03-delivery-v2-page">
        <div className="uc03-c1-topbar"><button type="button" className="uc03-c1-back" onClick={() => navigate('/dashboard')}>← Work List</button></div>
        <PageHeader eyebrow="Delivery · V2" title="Delivery unavailable" description="The Delivery workspace could not be loaded. Retry without leaving this journey." />
        <div className="uc03-booking-journey-feedback is-error" role="alert">
          {workspaceQuery.error instanceof Error ? workspaceQuery.error.message : 'Delivery could not be loaded.'}
        </div>
        <section className="uc03-c1-start-panel">
          <div><span className="uc03-c1-eyebrow">Delivery Journey</span><h2>Retry Delivery</h2></div>
          <button type="button" className="uc03-c1-primary" onClick={() => void workspaceQuery.refetch()}>Retry</button>
        </section>
      </div>
    );
  }

  if (!deliveryStarted) {
    return (
      <div className="screen-stack uc03-v2-capture uc03-delivery-v2-page">
        <div className="uc03-c1-topbar"><button type="button" className="uc03-c1-back" onClick={() => navigate('/dashboard')}>← Work List</button></div>
        <PageHeader eyebrow="Delivery · V2" title="Delivery documents" description="Starting this Delivery so you can upload whatever evidence is available. Audit observations never block the business process." />
        {error ? (
          <div className="uc03-booking-journey-feedback is-error" role="alert">
            {error}
            <button
              type="button"
              className="uc03-c1-primary"
              disabled={starting}
              onClick={() => { setError(undefined); void workspaceQuery.refetch(); }}
            >{starting ? 'Retrying…' : 'Retry'}</button>
          </div>
        ) : (
          <div className="uc03-c1-loading" role="status">Starting Delivery…</div>
        )}
      </div>
    );
  }

  if (captureQuery.isError) {
    return (
      <div className="screen-stack uc03-v2-capture uc03-delivery-v2-page">
        <div className="uc03-c1-topbar"><button type="button" className="uc03-c1-back" onClick={() => navigate('/dashboard')}>← Work List</button></div>
        <PageHeader eyebrow="Delivery · V2" title="Delivery documents" description="Delivery has started, but its document workspace could not be loaded." />
        <div className="uc03-booking-journey-feedback is-error" role="alert">
          {captureQuery.error instanceof Error ? captureQuery.error.message : 'Delivery documents could not be loaded.'}
        </div>
        <section className="uc03-delivery-v2-retry-panel">
          <strong>Document workspace unavailable</strong>
          <button type="button" className="uc03-delivery-v2-upload-button is-primary" onClick={() => void captureQuery.refetch()}>Retry</button>
        </section>
      </div>
    );
  }

  if (captureQuery.isPending || !capture) return <div className="uc03-c1-loading" role="status">Loading Delivery documents…</div>;

  const classified = capture.uploads.filter((document) => (
    document.state.toUpperCase() === 'CLASSIFIED' && Boolean(document.classifiedDocumentTypeKey)
  )).length;
  const extracted = capture.uploads.filter((document) => (document.processingStatus ?? '').toUpperCase() === 'PROCESSED').length;
  // Classification/extraction are asynchronous audit status only. They must never
  // gate progression to Delivery Details.
  const canGoNext = !uploading && !deletingId;
  const mandatory = capture.requirements.filter((item) => item.requirementLevel === 'REQUIRED' && item.applicabilityState !== 'NOT_APPLICABLE');
  const mandatoryReceived = mandatory.filter((item) => Boolean(item.document)).length;
  const optional = capture.requirements.filter((item) => item.requirementLevel !== 'REQUIRED');

  if (capture.submitted) {
    return (
      <div className="screen-stack uc03-v2-capture uc03-delivery-v2-page">
        <div className="uc03-c1-topbar"><button type="button" className="uc03-c1-back" onClick={() => navigate('/dashboard')}>← Work List</button></div>
        <PageHeader
          eyebrow="Delivery · V2"
          title="Delivery documents"
          description="Step 1 of 2 · These documents were submitted by the earlier Delivery flow. Continue to Delivery Details; background document processing does not block the journey."
        />
        <nav className="uc03-booking-steps" aria-label="Delivery capture steps">
          <button type="button" className="is-active" disabled>1 <span>Documents</span></button>
          <button type="button" disabled>2 <span>Delivery Details</span></button>
        </nav>
        <section className="uc03-delivery-v2-summary" aria-label="Delivery document status">
          <div><span>Documents received</span><strong>{capture.uploads.length}</strong></div>
          <div><span>Documents classified</span><strong>{classified}/{capture.uploads.length}</strong></div>
          <div><span>Configured mandatory received</span><strong>{mandatoryReceived}/{mandatory.length}</strong></div>
          <div className={extracted === capture.uploads.length ? 'is-ready' : 'is-processing'}><span>{extracted === capture.uploads.length ? 'All documents extracted' : 'Classification continuing'}</span><strong>{clock}</strong></div>
        </section>
        <CaptureUploadInventory uploads={capture.uploads} readOnly title="Submitted Delivery documents" />
        <section className="uc03-delivery-v2-submit-complete">
          <div>
            <strong>Ready for Delivery Details</strong>
            <span>{classified} of {capture.uploads.length} uploaded document{capture.uploads.length === 1 ? '' : 's'} classified. Classification continues in the background and does not block Next.</span>
          </div>
          <button
            type="button"
            className="uc03-c1-primary"
            onClick={() => navigate(`/v2/deliveries/${journeyId}?step=details&captureSubmitted=1`)}
          >
            Next →
          </button>
        </section>
      </div>
    );
  }

  return (
    <div className="screen-stack uc03-v2-capture uc03-delivery-v2-page uc03-delivery-v2-page--cards">
      <div className="uc03-delivery-v2-topbar">
        <button type="button" className="uc03-delivery-v2-back" onClick={() => navigate('/dashboard')}>← Work List</button>
        <div className="uc03-delivery-v2-topbar__stats">
          <div className="uc03-delivery-v2-stat">
            <span>Uploaded</span>
            <strong>{capture.uploads.length}</strong>
          </div>
          <div className="uc03-delivery-v2-stat">
            <span>Classified</span>
            <strong>{classified}</strong>
          </div>
          <div className={`uc03-delivery-v2-stat ${capture.uploads.length > 0 && extracted === capture.uploads.length ? 'is-ready' : ''}`}>
            <span>Extracted</span>
            <strong>{extracted}</strong>
          </div>
        </div>
        <button
          type="button"
          className="uc03-delivery-v2-checklist-toggle"
          aria-expanded={checklistOpen}
          onClick={() => setChecklistOpen((current) => !current)}
        >
          Checklist <em>{mandatoryReceived}/{mandatory.length}</em>
        </button>
      </div>

      <PageHeader
        eyebrow="Delivery · V2"
        title="Delivery documents"
        description="Step 1 of 2 · Missing documents and background classification are audit status only and do not block Next."
      />

      {message ? <div className="uc03-booking-journey-feedback is-success" role="status">{message}</div> : null}
      {error ? <div className="uc03-booking-journey-feedback is-error" role="alert">{error}</div> : null}

      <section className="uc03-delivery-v2-hero">
        <div className="uc03-delivery-v2-hero__actions">
          <button
            type="button"
            className="uc03-delivery-v2-upload-button is-primary"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
          >
            {uploading ? 'Uploading…' : 'Choose Files'}
          </button>
          <button
            type="button"
            className="uc03-delivery-v2-upload-button"
            disabled={uploading}
            onClick={() => cameraInputRef.current?.click()}
          >
            Take Photo
          </button>
          <input
            ref={fileInputRef}
            className="uc03-delivery-v2-file-input"
            type="file"
            accept="image/*,.pdf"
            multiple
            disabled={uploading}
            onChange={(event) => {
              const files = Array.from(event.currentTarget.files ?? []);
              event.currentTarget.value = '';
              void handleUpload(files);
            }}
          />
          <input
            ref={cameraInputRef}
            className="uc03-delivery-v2-file-input"
            type="file"
            accept="image/*"
            capture="environment"
            disabled={uploading}
            onChange={(event) => {
              const files = Array.from(event.currentTarget.files ?? []);
              event.currentTarget.value = '';
              void handleUpload(files);
            }}
          />
        </div>
        <p>Select multiple files together — Verigence identifies each document type in the background.</p>
      </section>

      {capture.uploads.length > 0 ? (
        <div className="uc03-doc-card-grid">
          {capture.uploads.map((document, index) => (
            <DocumentCard
              key={document.documentId}
              document={document}
              index={index}
              busy={deletingId === document.documentId}
              onDelete={handleDelete}
            />
          ))}
        </div>
      ) : (
        <p className="uc03-doc-card-grid__empty">No documents yet — choose files above to get started.</p>
      )}

      {checklistOpen ? (
        <aside className="uc03-delivery-v2-checklist-panel" role="dialog" aria-label="Delivery document checklist">
          <header>
            <strong>Document checklist</strong>
            <button type="button" onClick={() => setChecklistOpen(false)} aria-label="Close checklist">×</button>
          </header>
          <p>These are audit expectations. A missing or still-processing document never blocks Next.</p>
          {(['INVOICES', 'PAYMENTS', 'OTHERS'] as DeliveryGroupKey[]).map((key) => (
            groups[key].length ? (
              <section key={key} className="uc03-checklist-group">
                <h3>{groupTitle(key)} <span>{groups[key].length}</span></h3>
                {groups[key].map((requirement) => (
                  <RequirementChecklistRow key={requirement.requirementKey} requirement={requirement} />
                ))}
              </section>
            ) : null
          ))}
          {optional.length === 0 && mandatory.length === 0 ? <p className="uc03-checklist-empty">No configured checklist for this Delivery.</p> : null}
        </aside>
      ) : null}

      <section className="uc03-delivery-v2-submit-bar">
        <div>
          <strong>Ready for Delivery Details</strong>
          <span>{classified} of {capture.uploads.length} uploaded document{capture.uploads.length === 1 ? '' : 's'} classified. Classification continues in the background and does not block Next.</span>
        </div>
        <button
          type="button"
          className="uc03-c1-primary"
          disabled={!canGoNext}
          onClick={() => navigate(`/v2/deliveries/${journeyId}?step=details`)}
        >
          {uploading ? 'Uploading…' : 'Next →'}
        </button>
      </section>
    </div>
  );
}
