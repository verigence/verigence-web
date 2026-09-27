import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import '../styles/uc03-p2.css';

import PageHeader from '../components/PageHeader';
import SectionCard from '../components/SectionCard';
import StatusPill from '../components/StatusPill';
import P2JourneyTabs from '../features/uc03-p2/P2JourneyTabs';
import {
  deleteP2Document,
  getP2Documents,
  getP2Events,
  getP2Stage,
  replaceP2Document,
  uploadP2Files,
} from '../services/audit-core/uc03P2';
import { useProjectContextStore } from '../store/projectContextStore';
import { useSessionStore } from '../store/sessionStore';

const BOOKING_GATE_LABELS: Record<string, string> = {
  BOOKING_FORM_EXTRACTED: 'Booking Form',
  PAN_EXTRACTED: 'PAN',
  AADHAAR_EXTRACTED: 'Aadhaar',
  MINIMUM_BOOKING_PAYMENT: 'Minimum Booking payment',
  NO_MANUAL_VERIFICATION_PENDING: 'Manual verification',
};

const ACTIVE = new Set([
  'AWAITING_UPLOAD', 'UPLOADED', 'SPLITTING', 'PROCESSING',
  'QUEUED', 'PREPARING_PAGE', 'DI_UPLOAD_PREPARING', 'DI_UPLOADING',
  'DI_FINALIZING', 'CLASSIFYING', 'EXTRACTING', 'SYNCING_TO_AUDIT_CORE', 'RETRY_WAIT',
]);

export default function P2JourneyDocumentsPage() {
  const { journeyId = '' } = useParams();
  const tenantId = useProjectContextStore((s) => s.selectedProject?.tenantId);
  const accessToken = useSessionStore((s) => s.accessToken);
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const eventCursorRef = useRef(0);
  const [message, setMessage] = useState('');
  const [replaceTarget, setReplaceTarget] = useState<string>();
  const [expandedBatches, setExpandedBatches] = useState<Set<string>>(() => new Set());

  const query = useQuery({
    queryKey: ['p2-documents', tenantId, journeyId],
    queryFn: () => getP2Documents(tenantId!, journeyId, accessToken),
    enabled: Boolean(tenantId && journeyId && accessToken),
    staleTime: 5_000,
  });

  const stageQuery = useQuery({
    queryKey: ['p2-stage', tenantId, journeyId],
    queryFn: () => getP2Stage(tenantId!, journeyId, accessToken),
    enabled: Boolean(tenantId && journeyId && accessToken),
    staleTime: 5_000,
  });

  const processingActive = useMemo(() => {
    const batches = query.data?.batches ?? [];
    return batches.some((batch) => ACTIVE.has(batch.batch_status)
      || batch.pages.some((page) => ACTIVE.has(page.queue_status)));
  }, [query.data]);

  useEffect(() => {
    if (!processingActive || !tenantId || !journeyId || !accessToken) return undefined;

    let cancelled = false;
    let timer: number | undefined;

    const poll = async () => {
      try {
        const response = await getP2Events(
          tenantId,
          journeyId,
          eventCursorRef.current,
          accessToken,
        );
        if (cancelled) return;
        const ids = response.events
          .map((event) => Number(event.event_id))
          .filter((value) => Number.isFinite(value));
        if (ids.length > 0) {
          eventCursorRef.current = Math.max(eventCursorRef.current, ...ids);
          void queryClient.invalidateQueries({ queryKey: ['p2-documents', tenantId, journeyId] });
          void queryClient.invalidateQueries({ queryKey: ['p2-overview', tenantId, journeyId] });
          void queryClient.invalidateQueries({ queryKey: ['p2-stage', tenantId, journeyId] });
          void queryClient.invalidateQueries({ queryKey: ['p2-tasks', tenantId] });
        }
      } catch {
        // The durable queue remains authoritative. A transient event-feed
        // failure is retried on the next cursor poll rather than turning the
        // processing screen into an error state.
      }
      if (!cancelled) timer = window.setTimeout(() => void poll(), 1_000);
    };

    void poll();
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [accessToken, journeyId, processingActive, queryClient, tenantId]);

  const upload = useMutation({
    mutationFn: (files: File[]) => uploadP2Files(tenantId!, journeyId, files, accessToken),
    onSuccess: () => {
      setMessage('Upload accepted. Processing continues in the background.');
      void queryClient.invalidateQueries({ queryKey: ['p2-documents', tenantId, journeyId] });
      void queryClient.invalidateQueries({ queryKey: ['p2-stage', tenantId, journeyId] });
    },
  });

  const replaceDocument = useMutation({
    mutationFn: ({ documentId, file }: { documentId: string; file: File }) =>
      replaceP2Document(tenantId!, journeyId, documentId, file, accessToken),
    onSuccess: () => {
      setMessage('Replacement accepted. The current document remains in the audit trail until the replacement is ready.');
      setReplaceTarget(undefined);
      void queryClient.invalidateQueries({ queryKey: ['p2-documents', tenantId, journeyId] });
      void queryClient.invalidateQueries({ queryKey: ['p2-overview', tenantId, journeyId] });
    },
  });

  const removeDocument = useMutation({
    mutationFn: (documentId: string) =>
      deleteP2Document(tenantId!, journeyId, documentId, accessToken),
    onSuccess: () => {
      setMessage('Document removed from the active Journey. Audit history has been retained.');
      void queryClient.invalidateQueries({ queryKey: ['p2-documents', tenantId, journeyId] });
      void queryClient.invalidateQueries({ queryKey: ['p2-overview', tenantId, journeyId] });
      void queryClient.invalidateQueries({ queryKey: ['p2-stage', tenantId, journeyId] });
    },
  });

  const totals = useMemo(() => {
    const batches = query.data?.batches ?? [];
    const pages = batches.flatMap((batch) => batch.pages);
    return {
      batches: batches.length,
      pages: pages.length,
      ready: pages.filter((page) => page.queue_status === 'READY').length,
      attention: pages.filter((page) => ['NEEDS_REVIEW', 'FAILED', 'DEAD_LETTER'].includes(page.queue_status)).length,
    };
  }, [query.data]);

  const documentLineage = useMemo(() => {
    const batchDocumentIds = new Set(
      (query.data?.batches ?? [])
        .flatMap((batch) => batch.pages)
        .map((page) => page.diDocumentId)
        .filter((value): value is string => Boolean(value)),
    );
    const documents = query.data?.documents ?? [];
    return {
      existingActive: documents.filter(
        (document) => document.association_status === 'ACTIVE'
          && !batchDocumentIds.has(document.documentId),
      ),
      superseded: documents.filter(
        (document) => document.association_status === 'SUPERSEDED',
      ),
    };
  }, [query.data]);

  const bookingReadiness = useMemo(() => {
    const booking = stageQuery.data?.booking;
    if (!booking) return undefined;
    const gates = Object.entries(booking.gates);
    const passed = gates.filter(([, gate]) => gate.passed).length;
    const blocker = gates.find(([, gate]) => !gate.passed)?.[0];
    return {
      booking,
      passed,
      total: gates.length,
      blocker: blocker ? BOOKING_GATE_LABELS[blocker] || blocker.replaceAll('_', ' ') : undefined,
    };
  }, [stageQuery.data]);

  return (
    <div className="screen-stack p2-screen">
      <PageHeader
        eyebrow="Phase 2"
        title="Documents"
        description="Upload documents and review processing or verification issues that need attention."
        actions={<Link className="text-link" to="/p2/work-queue">All journeys</Link>}
      />
      <P2JourneyTabs />

      {bookingReadiness ? (
        <div className="p2-stage-strip">
          <div>
            <span>Current stage</span>
            <StatusPill value={bookingReadiness.booking.stage} compact />
          </div>
          <div>
            <span>Booking readiness</span>
            <strong>{bookingReadiness.passed}/{bookingReadiness.total} checks complete</strong>
          </div>
          <div>
            <span>Booking payment</span>
            <strong>{new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(bookingReadiness.booking.bookingReceiptTotal || 0))} / {new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(bookingReadiness.booking.minimumBookingAmount || 0))}</strong>
          </div>
          <div className={bookingReadiness.blocker ? 'p2-stage-strip__blocker' : ''}>
            <span>{bookingReadiness.blocker ? 'Next blocker' : 'Booking'}</span>
            <strong>{bookingReadiness.blocker || 'Ready to complete'}</strong>
          </div>
        </div>
      ) : null}

      <SectionCard>
        <div className="p2-upload-row">
          <div className="p2-upload-copy">
            <strong>Upload documents</strong>
            <span>PDF, JPG or PNG. Multi-page PDFs are split and processed page-by-page.</span>
          </div>
          <input
            ref={inputRef}
            className="p2-file-input"
            type="file"
            multiple
            accept="application/pdf,image/jpeg,image/png"
            onChange={(event) => {
              const files = Array.from(event.target.files ?? []);
              if (files.length) upload.mutate(files);
              event.currentTarget.value = '';
            }}
          />
          <input
            ref={replaceInputRef}
            className="p2-file-input"
            type="file"
            accept="application/pdf,image/jpeg,image/png"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file && replaceTarget) {
                replaceDocument.mutate({ documentId: replaceTarget, file });
              }
              event.currentTarget.value = '';
            }}
          />
          <button
            className="p2-primary-action"
            type="button"
            disabled={upload.isPending}
            onClick={() => inputRef.current?.click()}
          >
            {upload.isPending ? 'Uploading…' : 'Upload Documents'}
          </button>
        </div>
        {message ? <div className="form-alert form-alert--success">{message}</div> : null}
        {upload.isError || replaceDocument.isError || removeDocument.isError ? (
          <div className="form-alert form-alert--error">
            {upload.error instanceof Error
              ? upload.error.message
              : replaceDocument.error instanceof Error
                ? replaceDocument.error.message
                : removeDocument.error instanceof Error
                  ? removeDocument.error.message
                  : 'Document action failed.'}
          </div>
        ) : null}
      </SectionCard>

      <div className="p2-inline-stats">
        <span><strong>{totals.pages}</strong> pages</span>
        <span><strong>{totals.ready}</strong> ready</span>
        <span className={totals.attention ? 'p2-attention' : ''}><strong>{totals.attention}</strong> need attention</span>
      </div>

      <SectionCard>
        <div className="p2-table-wrap">
          <table className="p2-table p2-documents-table">
            <thead>
              <tr>
                <th>File / Page</th>
                <th>Document type</th>
                <th>Stage</th>
                <th>Processing</th>
                <th>Review / Issue</th>
                <th aria-label="Action" />
              </tr>
            </thead>
            <tbody>
              {(query.data?.batches ?? []).flatMap((batch) => {
                const isMultiPage = (batch.page_count || batch.pages.length) > 1;
                const expanded = expandedBatches.has(batch.batchId);
                const rows = [];

                if (isMultiPage) {
                  rows.push(
                    <tr className="p2-document-batch-row" key={`${batch.batchId}-summary`}>
                      <td colSpan={6}>
                        <div className="p2-batch-summary">
                          <div>
                            <strong>{batch.original_filename}</strong>
                            <small>{batch.page_count || batch.pages.length} pages · <StatusPill value={batch.batch_status} compact /></small>
                          </div>
                          <button
                            type="button"
                            className="p2-link-button"
                            onClick={() => setExpandedBatches((current) => {
                              const next = new Set(current);
                              if (next.has(batch.batchId)) next.delete(batch.batchId);
                              else next.add(batch.batchId);
                              return next;
                            })}
                          >
                            {expanded ? 'Hide pages' : `Show ${batch.page_count || batch.pages.length} pages`}
                          </button>
                        </div>
                      </td>
                    </tr>,
                  );
                }

                if (!isMultiPage || expanded) {
                  if (batch.pages.length) {
                    rows.push(...batch.pages.map((page) => (
                      <tr key={page.queueId}>
                        <td>
                          <strong>{batch.original_filename}</strong>
                          <small>{isMultiPage ? `Page ${page.page_number} of ${batch.page_count || batch.pages.length}` : 'Single document'}</small>
                        </td>
                        <td>{page.classified_document_type?.replaceAll('_', ' ') || 'Pending classification'}</td>
                        <td>{page.business_stage || '—'}</td>
                        <td>
                          <StatusPill value={page.queue_status} compact />
                          {page.last_error ? <small className="p2-attention">{page.last_error}</small> : null}
                        </td>
                        <td>
                          {page.queue_status === 'READY' ? (
                            <>
                              <strong>Ready</strong>
                              <small>{page.extracted_field_count} fields extracted</small>
                            </>
                          ) : ['NEEDS_REVIEW', 'FAILED', 'DEAD_LETTER'].includes(page.queue_status) ? (
                            <>
                              <strong className="p2-attention">{page.queue_status === 'NEEDS_REVIEW' ? 'Review required' : 'Attention required'}</strong>
                              {page.last_error ? <small>{page.last_error}</small> : null}
                            </>
                          ) : (
                            <span>Processing</span>
                          )}
                        </td>
                        <td className="p2-table__action">
                          <div className="p2-row-actions">
                            {page.diDocumentId && ['READY', 'NEEDS_REVIEW'].includes(page.queue_status) ? (
                              <Link className="p2-primary-link" to={`/p2/journeys/${journeyId}/documents/${page.diDocumentId}`}>
                                {page.queue_status === 'NEEDS_REVIEW' ? 'Review & Correct' : 'Review'}
                              </Link>
                            ) : null}
                            {page.diDocumentId ? (
                              <>
                                <button
                                  className="p2-link-button"
                                  type="button"
                                  disabled={replaceDocument.isPending}
                                  onClick={() => {
                                    setReplaceTarget(page.diDocumentId);
                                    replaceInputRef.current?.click();
                                  }}
                                >
                                  Replace
                                </button>
                                <button
                                  className="p2-link-button"
                                  type="button"
                                  disabled={removeDocument.isPending}
                                  onClick={() => {
                                    if (window.confirm('Remove this document from the active Journey? Audit history will be retained.')) {
                                      removeDocument.mutate(page.diDocumentId!);
                                    }
                                  }}
                                >
                                  Remove
                                </button>
                              </>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    )));
                  } else {
                    rows.push(
                      <tr key={batch.batchId}>
                        <td><strong>{batch.original_filename}</strong></td>
                        <td>—</td><td>—</td>
                        <td><StatusPill value={batch.batch_status} compact /></td>
                        <td>—</td><td />
                      </tr>,
                    );
                  }
                }
                return rows;
              })}
              {documentLineage.existingActive.map((document) => (
                <tr key={`existing-${document.documentId}`}>
                  <td>
                    <strong>{document.original_filename || 'Existing document'}</strong>
                    <small>Existing Journey evidence</small>
                  </td>
                  <td>{document.document_type_key?.replaceAll('_', ' ') || 'Document'}</td>
                  <td>{document.process_area || '—'}</td>
                  <td><StatusPill value={document.processing_status_cache || 'READY'} compact /></td>
                  <td>
                    <strong>{document.verification_status_cache?.replaceAll('_', ' ') || 'Available for review'}</strong>
                    {document.confirmation_status_cache ? <small>{document.confirmation_status_cache.replaceAll('_', ' ')}</small> : null}
                  </td>
                  <td className="p2-table__action">
                    <div className="p2-row-actions">
                      <Link className="p2-primary-link" to={`/p2/journeys/${journeyId}/documents/${document.documentId}`}>
                        Review
                      </Link>
                      <button
                        className="p2-link-button"
                        type="button"
                        disabled={replaceDocument.isPending}
                        onClick={() => {
                          setReplaceTarget(document.documentId);
                          replaceInputRef.current?.click();
                        }}
                      >
                        Replace
                      </button>
                      <button
                        className="p2-link-button"
                        type="button"
                        disabled={removeDocument.isPending}
                        onClick={() => {
                          if (window.confirm('Remove this document from the active Journey? Audit history will be retained.')) {
                            removeDocument.mutate(document.documentId);
                          }
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!query.isLoading
                && (query.data?.batches.length ?? 0) === 0
                && documentLineage.existingActive.length === 0 ? (
                <tr><td colSpan={6} className="p2-empty">No documents have been uploaded for this Journey.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </SectionCard>

      {documentLineage.superseded.length > 0 ? (
        <details className="p2-document-history">
          <summary>Document history · {documentLineage.superseded.length} replaced</summary>
          <div className="p2-table-wrap">
            <table className="p2-table">
              <thead><tr><th>Document</th><th>Type</th><th>Stage</th><th>Status</th></tr></thead>
              <tbody>
                {documentLineage.superseded.map((document) => (
                  <tr key={`history-${document.evidenceId}`}>
                    <td>
                      <strong>{document.original_filename || 'Document'}</strong>
                      <small>{document.documentId.slice(0, 8)}</small>
                    </td>
                    <td>{document.document_type_key?.replaceAll('_', ' ') || '—'}</td>
                    <td>{document.process_area || '—'}</td>
                    <td><StatusPill value="SUPERSEDED" compact /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      ) : null}
    </div>
  );
}
