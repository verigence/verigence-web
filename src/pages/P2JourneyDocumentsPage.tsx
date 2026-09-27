import { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';

import PageHeader from '../components/PageHeader';
import SectionCard from '../components/SectionCard';
import StatusPill from '../components/StatusPill';
import P2JourneyTabs from '../features/uc03-p2/P2JourneyTabs';
import { getP2Documents, uploadP2Files } from '../services/audit-core/uc03P2';
import { useProjectContextStore } from '../store/projectContextStore';
import { useSessionStore } from '../store/sessionStore';

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
  const [message, setMessage] = useState('');

  const query = useQuery({
    queryKey: ['p2-documents', tenantId, journeyId],
    queryFn: () => getP2Documents(tenantId!, journeyId, accessToken),
    enabled: Boolean(tenantId && journeyId && accessToken),
    refetchInterval: (state) => {
      const batches = state.state.data?.batches ?? [];
      return batches.some((batch) => ACTIVE.has(batch.batch_status)
        || batch.pages.some((page) => ACTIVE.has(page.queue_status))) ? 1_000 : false;
    },
  });

  const upload = useMutation({
    mutationFn: (files: File[]) => uploadP2Files(tenantId!, journeyId, files, accessToken),
    onSuccess: () => {
      setMessage('Upload accepted. Processing continues in the background.');
      void queryClient.invalidateQueries({ queryKey: ['p2-documents', tenantId, journeyId] });
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

  return (
    <div className="screen-stack p2-screen">
      <PageHeader
        eyebrow="Phase 2 · Documents"
        title="Upload & Verify"
        description="Upload individual files or a multi-page PDF. Each page is durably queued, classified and extracted through the existing DI service."
        actions={<Link className="text-link" to="/p2/work-queue">Back to Phase 2 queue</Link>}
      />
      <P2JourneyTabs />

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
        {upload.isError ? (
          <div className="form-alert form-alert--error">
            {upload.error instanceof Error ? upload.error.message : 'Upload failed.'}
          </div>
        ) : null}
      </SectionCard>

      <div className="p2-inline-stats">
        <span><strong>{totals.batches}</strong> batches</span>
        <span><strong>{totals.pages}</strong> document pages</span>
        <span><strong>{totals.ready}</strong> ready</span>
        <span className={totals.attention ? 'p2-attention' : ''}><strong>{totals.attention}</strong> need attention</span>
      </div>

      <SectionCard>
        <div className="p2-table-wrap">
          <table className="p2-table">
            <thead>
              <tr>
                <th>File / Page</th>
                <th>Classified as</th>
                <th>Stage</th>
                <th>Processing</th>
                <th>Extracted fields</th>
                <th aria-label="Action" />
              </tr>
            </thead>
            <tbody>
              {(query.data?.batches ?? []).flatMap((batch) => (
                batch.pages.length ? batch.pages.map((page) => (
                  <tr key={page.queueId}>
                    <td>
                      <strong>{batch.original_filename}</strong>
                      <small>Page {page.page_number} of {batch.page_count || batch.pages.length}</small>
                    </td>
                    <td>{page.classified_document_type?.replaceAll('_', ' ') || 'Pending classification'}</td>
                    <td>{page.business_stage || '—'}</td>
                    <td>
                      <StatusPill value={page.queue_status} compact />
                      {page.last_error ? <small className="p2-attention">{page.last_error}</small> : null}
                    </td>
                    <td>{page.extracted_field_count}</td>
                    <td className="p2-table__action">
                      {page.queue_status === 'READY' ? (
                        <Link className="text-link" to={`/journeys/${journeyId}/documents`}>Review</Link>
                      ) : null}
                    </td>
                  </tr>
                )) : [(
                  <tr key={batch.batchId}>
                    <td><strong>{batch.original_filename}</strong></td>
                    <td>—</td><td>—</td>
                    <td><StatusPill value={batch.batch_status} compact /></td>
                    <td>—</td><td />
                  </tr>
                )]
              ))}
              {!query.isLoading && (query.data?.batches.length ?? 0) === 0 ? (
                <tr><td colSpan={6} className="p2-empty">No Phase 2 uploads yet.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}
