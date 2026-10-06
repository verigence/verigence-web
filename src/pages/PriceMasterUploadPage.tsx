import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  listOemMasterUploads,
  previewOemMaster,
  publishOemMaster,
  type OemMasterUploadPreview,
} from '../services/audit-core/oemMasters';
import { PriceMasterRedirect, ProjectPicker, usePriceMasterProject } from './priceMasterProject';
import '../styles/oem-masters.css';
import '../styles/price-masters.css';

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong.';
}

const DATE_SOURCE: Record<string, string> = {
  SHEET: 'the date written in the file',
  FILENAME: 'the date in the file name',
  ADMIN: 'the date you entered',
};

export default function PriceMasterUploadPage() {
  const project = usePriceMasterProject('upload');
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [wefDate, setWefDate] = useState('');
  const [preview, setPreview] = useState<OemMasterUploadPreview | null>(null);

  const historyQuery = useQuery({
    queryKey: ['oem-master-uploads', project.tenantId],
    enabled: Boolean(project.accessToken && project.tenantId && project.allowed),
    queryFn: () => listOemMasterUploads(project.tenantId, project.accessToken!),
  });

  // The file is read first with no date typed: the file's own date comes back and fills the box.
  const checkMutation = useMutation({
    mutationFn: () => previewOemMaster(project.tenantId, 'PRICE_LIST', '', file!, project.accessToken),
    onSuccess: (result) => {
      setPreview(result);
      setWefDate(result.effectiveFrom);
    },
  });
  const publishMutation = useMutation({
    mutationFn: () => publishOemMaster(project.tenantId, 'PRICE_LIST', wefDate, file!, project.accessToken),
    onSuccess: (result) => {
      setPreview(result);
      void queryClient.invalidateQueries({ queryKey: ['oem-master-uploads', project.tenantId] });
    },
  });

  if (!project.allowed) return <PriceMasterRedirect />;

  const busy = checkMutation.isPending || publishMutation.isPending;
  const published = preview?.status === 'PUBLISHED';
  const canPublish = Boolean(file && preview && preview.status === 'PREVIEW' && preview.errors.length === 0 && wefDate);
  const dateDiffers = Boolean(preview && wefDate && wefDate !== preview.effectiveFrom);
  const history = (historyQuery.data ?? []).filter((row) => row.masterKind === 'PRICE_LIST');

  return (
    <section className="oem-masters-page" aria-labelledby="price-upload-title">
      <div className="oem-masters-page__heading">
        <div>
          <span className="oem-masters-page__eyebrow">Master data</span>
          <h1 id="price-upload-title">Upload price master</h1>
          <p>
            Choose the OEM&rsquo;s price file. It is checked first and nothing is saved until you publish. You
            confirm the WEF date (the date the prices take effect); a date typed here always wins over the one in
            the file. The file keeps its original name.
          </p>
        </div>
      </div>

      {project.needsPicker && (
        <ProjectPicker
          projects={project.projects}
          value={project.tenantId}
          loading={project.projectsLoading}
          onChange={(tenantId) => {
            project.pick(tenantId);
            setPreview(null);
          }}
        />
      )}

      {project.tenantId && (
        <article className="oem-masters__card">
          <header>
            <h3>Price list</h3>
            <span className="oem-masters__accept">.xlsx</span>
          </header>
          <div className="oem-masters__controls">
            <label className="oem-masters__file">
              <input
                type="file"
                accept=".xlsx"
                onChange={(event) => {
                  setFile(event.target.files?.[0] ?? null);
                  setPreview(null);
                  setWefDate('');
                  checkMutation.reset();
                  publishMutation.reset();
                }}
              />
              <span>{file ? file.name : 'Choose file…'}</span>
            </label>
            <label className="oem-masters__date">
              WEF date
              <input
                type="date"
                value={wefDate}
                onChange={(event) => setWefDate(event.target.value)}
                disabled={!preview || published}
                required
              />
              <small>
                {preview
                  ? `Found: ${preview.effectiveFrom} (${DATE_SOURCE[preview.effectiveFromSource ?? ''] ?? 'the file'}). Change it if it is wrong.`
                  : 'Filled in from the file once it has been checked.'}
              </small>
            </label>
          </div>

          <div className="oem-masters__actions">
            <button type="button" onClick={() => checkMutation.mutate()} disabled={!file || busy}>
              {checkMutation.isPending ? 'Checking…' : 'Check file'}
            </button>
            <button
              type="button"
              className="oem-masters__publish"
              onClick={() => publishMutation.mutate()}
              disabled={!canPublish || busy}
            >
              {publishMutation.isPending ? 'Publishing…' : wefDate ? `Publish with WEF ${wefDate}` : 'Publish'}
            </button>
          </div>

          {(checkMutation.isError || publishMutation.isError) && (
            <div className="oem-masters__list oem-masters__list--error" role="alert">
              {errorText(checkMutation.error ?? publishMutation.error)}
            </div>
          )}

          {preview && (
            <div className="oem-masters__preview">
              <p className="price-masters__fine">
                File: <strong>{preview.sourceFilename}</strong>
                {preview.oemCode ? ` · ${preview.oemCode}` : ''}
              </p>
              <div className="oem-masters__badges">
                {Object.entries(preview.rowCounts)
                  .filter(([, value]) => typeof value === 'number' || typeof value === 'string')
                  .map(([key, value]) => (
                    <span key={key} className="oem-masters__badge">
                      <strong>{String(value)}</strong> {key.replace(/([A-Z])/g, ' $1').toLowerCase()}
                    </span>
                  ))}
              </div>
              {dateDiffers && (
                <div className="oem-masters__list oem-masters__list--warn">
                  The file says {preview.effectiveFrom}; {wefDate} will be used because you entered it.
                </div>
              )}
              {preview.errors.length > 0 && (
                <div className="oem-masters__list oem-masters__list--error" role="alert">
                  <strong>
                    {preview.errors.length} problem{preview.errors.length === 1 ? '' : 's'} in the file: nothing is
                    loaded until the file is corrected and uploaded again
                  </strong>
                  <ul>
                    {preview.errors.slice(0, 20).map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                </div>
              )}
              {preview.warnings.length > 0 && (
                <details className="oem-masters__list oem-masters__list--muted">
                  <summary>{preview.warnings.length} notes</summary>
                  <ul>
                    {preview.warnings.slice(0, 40).map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                </details>
              )}
              {published && (
                <div className="oem-masters__published">
                  Published. These prices apply from {preview.effectiveFrom}. You can find them under Price masters.
                </div>
              )}
            </div>
          )}
        </article>
      )}

      {project.tenantId && (
        <div className="oem-masters-page__history">
          <div className="oem-masters-page__history-head">
            <h2>Price lists uploaded</h2>
            <button type="button" onClick={() => historyQuery.refetch()} disabled={historyQuery.isFetching}>
              {historyQuery.isFetching ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
          {historyQuery.isError && (
            <div className="oem-masters__list oem-masters__list--error" role="alert">
              {errorText(historyQuery.error)}
            </div>
          )}
          {historyQuery.data && history.length === 0 && (
            <p className="oem-masters-page__empty">No price list uploaded for this project yet.</p>
          )}
          {history.length > 0 && (
            <div className="oem-masters__table-wrap">
              <table className="oem-masters__table">
                <thead>
                  <tr>
                    <th>File</th>
                    <th>WEF date</th>
                    <th>Status</th>
                    <th>Uploaded</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((row) => (
                    <tr key={row.uploadId}>
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
      )}
    </section>
  );
}
