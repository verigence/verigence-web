import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { listProjects } from '../services/audit-core/uc02Admin';
import {
  OEM_MASTER_KINDS,
  listOemMasterUploads,
  previewOemMaster,
  publishOemMaster,
  type OemMasterKind,
  type OemMasterUploadPreview,
} from '../services/audit-core/oemMasters';
import { useSessionStore } from '../store/sessionStore';
import '../styles/oem-masters.css';

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong.';
}

function CountBadges({ counts }: { counts: Record<string, unknown> }) {
  const entries = Object.entries(counts).filter(
    ([, value]) => typeof value === 'number' || typeof value === 'string',
  );
  if (entries.length === 0) return null;
  return (
    <div className="oem-masters__badges">
      {entries.map(([key, value]) => (
        <span key={key} className="oem-masters__badge">
          <strong>{String(value)}</strong> {key.replace(/([A-Z])/g, ' $1').toLowerCase()}
        </span>
      ))}
    </div>
  );
}

function SampleTable({ sample }: { sample: Record<string, unknown>[] }) {
  if (!sample.length) return null;
  const columns = Object.keys(sample[0]);
  return (
    <div className="oem-masters__table-wrap">
      <table className="oem-masters__table">
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col}>{col}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sample.slice(0, 15).map((row, index) => (
            <tr key={index}>
              {columns.map((col) => (
                <td key={col}>
                  {Array.isArray(row[col]) ? (row[col] as unknown[]).join(', ') : String(row[col] ?? '')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PreviewPanel({ preview }: { preview: OemMasterUploadPreview }) {
  const summary = preview.discountSchemeSummary as {
    published?: number;
    tombstoned?: number;
    companies?: number;
  };
  return (
    <div className="oem-masters__preview">
      <CountBadges counts={preview.rowCounts} />

      {preview.errors.length > 0 && (
        <div className="oem-masters__list oem-masters__list--error" role="alert">
          <strong>{preview.errors.length} rows do not reconcile — fix the source and re-upload</strong>
          <ul>
            {preview.errors.slice(0, 10).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      )}

      {preview.unresolved.length > 0 && (
        <div className="oem-masters__list oem-masters__list--warn">
          <strong>{preview.unresolved.length} references could not be resolved (not applied)</strong>
          <ul>
            {preview.unresolved.slice(0, 10).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      )}

      {preview.warnings.length > 0 && (
        <details className="oem-masters__list oem-masters__list--muted">
          <summary>{preview.warnings.length} notes</summary>
          <ul>
            {preview.warnings.slice(0, 25).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </details>
      )}

      {preview.status === 'PUBLISHED' && (
        <div className="oem-masters__published">
          Published{preview.priceListVersionId ? ` · price list version ${preview.priceListVersionId.slice(0, 8)}` : ''}
          {typeof summary.published === 'number' ? ` · ${summary.published} schemes` : ''}
          {typeof summary.tombstoned === 'number' && summary.tombstoned > 0 ? ` · ${summary.tombstoned} withdrawn` : ''}
          {typeof summary.companies === 'number' ? ` · ${summary.companies} companies` : ''}
        </div>
      )}

      <SampleTable sample={preview.sample} />
    </div>
  );
}

function MasterCard({
  tenantId,
  kind,
  label,
  accept,
  hint,
  accessToken,
  onPublished,
}: {
  tenantId: string;
  kind: OemMasterKind;
  label: string;
  accept: string;
  hint: string;
  accessToken: string;
  onPublished: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [effectiveFrom, setEffectiveFrom] = useState(today());
  const [preview, setPreview] = useState<OemMasterUploadPreview | null>(null);

  const previewMutation = useMutation({
    mutationFn: () => previewOemMaster(tenantId, kind, effectiveFrom, file!, accessToken),
    onSuccess: setPreview,
  });
  const publishMutation = useMutation({
    mutationFn: () => publishOemMaster(tenantId, kind, effectiveFrom, file!, accessToken),
    onSuccess: (result) => {
      setPreview(result);
      onPublished();
    },
  });

  const busy = previewMutation.isPending || publishMutation.isPending;
  const canPublish = Boolean(preview) && preview!.status === 'PREVIEW' && preview!.errors.length === 0;

  return (
    <article className="oem-masters__card">
      <header>
        <h3>{label}</h3>
        <span className="oem-masters__accept">{accept}</span>
      </header>
      <p className="oem-masters__hint">{hint}</p>

      <div className="oem-masters__controls">
        <label className="oem-masters__file">
          <input
            type="file"
            accept={accept}
            onChange={(event) => {
              setFile(event.target.files?.[0] ?? null);
              setPreview(null);
            }}
          />
          <span>{file ? file.name : 'Choose file…'}</span>
        </label>
        <label className="oem-masters__date">
          Effective from
          <input
            type="date"
            value={effectiveFrom}
            onChange={(event) => setEffectiveFrom(event.target.value)}
          />
        </label>
      </div>

      <div className="oem-masters__actions">
        <button
          type="button"
          onClick={() => previewMutation.mutate()}
          disabled={!file || busy}
        >
          {previewMutation.isPending ? 'Parsing…' : 'Preview'}
        </button>
        <button
          type="button"
          className="oem-masters__publish"
          onClick={() => publishMutation.mutate()}
          disabled={!canPublish || busy}
        >
          {publishMutation.isPending ? 'Publishing…' : 'Publish'}
        </button>
      </div>

      {(previewMutation.isError || publishMutation.isError) && (
        <div className="oem-masters__list oem-masters__list--error" role="alert">
          {errorText(previewMutation.error ?? publishMutation.error)}
        </div>
      )}

      {preview && <PreviewPanel preview={preview} />}
    </article>
  );
}

export default function OemMastersPage() {
  const accessToken = useSessionStore((state) => state.accessToken);
  const queryClient = useQueryClient();
  const [tenantId, setTenantId] = useState('');

  const projectsQuery = useQuery({
    queryKey: ['admin-projects'],
    enabled: Boolean(accessToken),
    queryFn: () => listProjects(accessToken!),
  });

  const historyQuery = useQuery({
    queryKey: ['oem-master-uploads', tenantId],
    enabled: Boolean(accessToken && tenantId),
    queryFn: () => listOemMasterUploads(tenantId, accessToken!),
  });

  const selectedProject = useMemo(
    () => projectsQuery.data?.find((project) => project.tenantId === tenantId),
    [projectsQuery.data, tenantId],
  );

  const refreshHistory = () =>
    queryClient.invalidateQueries({ queryKey: ['oem-master-uploads', tenantId] });

  return (
    <section className="oem-masters-page" aria-labelledby="oem-masters-title">
      <div className="oem-masters-page__heading">
        <div>
          <span className="oem-masters-page__eyebrow">Master data</span>
          <h1 id="oem-masters-title">OEM native masters</h1>
          <p>
            Upload an OEM&rsquo;s own price list and discount documents. They load into the
            selected project&rsquo;s price and discount masters, effective-dated. A newer
            upload supersedes the previous one automatically; until then this master applies.
          </p>
        </div>
      </div>

      <label className="oem-masters-page__project">
        Project
        <select
          value={tenantId}
          onChange={(event) => setTenantId(event.target.value)}
          disabled={projectsQuery.isLoading}
        >
          <option value="">Select a project…</option>
          {(projectsQuery.data ?? []).map((project) => (
            <option key={project.tenantId} value={project.tenantId}>
              {project.projectName} ({project.projectCode})
            </option>
          ))}
        </select>
      </label>

      {tenantId && accessToken && (
        <>
          <div className="oem-masters__grid">
            {OEM_MASTER_KINDS.map(({ kind, label, accept, hint }) => (
              <MasterCard
                key={kind}
                tenantId={tenantId}
                kind={kind}
                label={label}
                accept={accept}
                hint={hint}
                accessToken={accessToken}
                onPublished={refreshHistory}
              />
            ))}
          </div>

          <div className="oem-masters-page__history">
            <div className="oem-masters-page__history-head">
              <h2>Upload history{selectedProject ? ` · ${selectedProject.projectName}` : ''}</h2>
              <button type="button" onClick={() => historyQuery.refetch()} disabled={historyQuery.isFetching}>
                {historyQuery.isFetching ? 'Refreshing…' : 'Refresh'}
              </button>
            </div>
            {historyQuery.data && historyQuery.data.length === 0 && (
              <p className="oem-masters-page__empty">Nothing uploaded for this project yet.</p>
            )}
            {historyQuery.data && historyQuery.data.length > 0 && (
              <div className="oem-masters__table-wrap">
                <table className="oem-masters__table">
                  <thead>
                    <tr>
                      <th>Master</th>
                      <th>File</th>
                      <th>Effective from</th>
                      <th>Status</th>
                      <th>Uploaded</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historyQuery.data.map((row) => (
                      <tr key={row.uploadId}>
                        <td>{row.masterKind.replace(/_/g, ' ').toLowerCase()}</td>
                        <td title={row.sourceSha256}>{row.sourceFilename}</td>
                        <td>{row.effectiveFrom}</td>
                        <td>
                          <span className={`oem-masters__status oem-masters__status--${row.status.toLowerCase()}`}>
                            {row.status.toLowerCase()}
                          </span>
                        </td>
                        <td>{new Date(row.uploadedAtUtc).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}
