import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  STATUS_LABEL,
  addFiles,
  applyDateToAll,
  batchSummary,
  publishOrder,
  statusAfterCheck,
  withDate,
  type BatchItem,
} from '../features/priceMasters/batch';
import {
  downloadOemMasterTemplate,
  listOemMasterUploads,
  previewOemMaster,
  publishOemMaster,
  saveDownloadedFile,
} from '../services/audit-core/oemMasters';
import { PriceMasterRedirect, ProjectPicker, usePriceMasterProject } from './priceMasterProject';
import '../styles/oem-masters.css';
import '../styles/price-masters.css';

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong.';
}

function modelsOf(item: BatchItem): string {
  const models = item.preview?.rowCounts?.models;
  return Array.isArray(models) ? models.map(String).join(', ') : '';
}

function vehiclesOf(item: BatchItem): string {
  const rows = item.preview?.rowCounts?.priceRows;
  return typeof rows === 'number' ? `${rows} vehicle${rows === 1 ? '' : 's'}` : '';
}

export default function PriceMasterUploadPage() {
  const project = usePriceMasterProject('upload');
  const queryClient = useQueryClient();
  const [items, setItems] = useState<BatchItem[]>([]);
  const [allDate, setAllDate] = useState('');
  const [busy, setBusy] = useState(false);
  const latest = useRef<BatchItem[]>([]);
  latest.current = items;

  const historyQuery = useQuery({
    queryKey: ['oem-master-uploads', project.tenantId],
    enabled: Boolean(project.accessToken && project.tenantId && project.allowed),
    queryFn: () => listOemMasterUploads(project.tenantId, project.accessToken!),
  });

  const templateMutation = useMutation({
    mutationFn: () => downloadOemMasterTemplate(project.tenantId, 'PRICE_LIST', project.accessToken),
    onSuccess: ({ blob, filename }) => saveDownloadedFile(blob, filename),
  });

  const patch = (id: string, change: Partial<BatchItem>) =>
    setItems((previous) => previous.map((item) => (item.id === id ? { ...item, ...change } : item)));

  // Each file is read first with no date typed: its own date comes back and fills its box. One file at a time.
  const checkAll = async () => {
    setBusy(true);
    try {
      for (const item of latest.current.filter((i) => i.status === 'WAITING' || i.status === 'CHECK_FAILED')) {
        patch(item.id, { status: 'CHECKING', message: undefined });
        try {
          const preview = await previewOemMaster(project.tenantId, 'PRICE_LIST', '', item.file, project.accessToken);
          const date = item.date || preview.effectiveFrom || '';
          patch(item.id, { preview, date, status: statusAfterCheck(preview, date) });
        } catch (problem) {
          patch(item.id, { status: 'CHECK_FAILED', message: errorText(problem) });
        }
      }
    } finally {
      setBusy(false);
    }
  };

  // Only clean files with a date are published, oldest date first. A file that fails does not stop the others.
  const publishAll = async () => {
    setBusy(true);
    try {
      for (const item of publishOrder(latest.current)) {
        patch(item.id, { status: 'PUBLISHING', message: undefined });
        try {
          const result = await publishOemMaster(project.tenantId, 'PRICE_LIST', item.date, item.file, project.accessToken);
          patch(item.id, { preview: result, status: result.status === 'PUBLISHED' ? 'PUBLISHED' : 'PUBLISH_FAILED' });
        } catch (problem) {
          patch(item.id, { status: 'PUBLISH_FAILED', message: errorText(problem) });
        }
      }
      void queryClient.invalidateQueries({ queryKey: ['oem-master-uploads', project.tenantId] });
    } finally {
      setBusy(false);
    }
  };

  if (!project.allowed) return <PriceMasterRedirect />;

  const summary = batchSummary(items);
  const toCheck = items.filter((i) => i.status === 'WAITING' || i.status === 'CHECK_FAILED').length;
  const toPublish = publishOrder(items).length;
  const history = (historyQuery.data ?? []).filter((row) => row.masterKind === 'PRICE_LIST');

  return (
    <section className="oem-masters-page" aria-labelledby="price-upload-title">
      <div className="oem-masters-page__heading">
        <div>
          <span className="oem-masters-page__eyebrow">Master data</span>
          <h1 id="price-upload-title">Upload price masters</h1>
          <p>
            Choose one file or many at once (for example one file per model). Each file is checked first and nothing
            is saved until you publish. You confirm the WEF date (the date the prices take effect) for each file; a
            date typed here always wins over the one in the file. Every file keeps its original name.
          </p>
          <p>
            <strong>Upload the prices in the Verigence template only</strong> &mdash; it keeps every OEM in one
            format and avoids mistakes. One template file can hold every model (it has a Model column). Do not add,
            rename or remove a column.
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
            setItems([]);
          }}
        />
      )}

      {project.tenantId && (
        <article className="oem-masters__card">
          <header>
            <h3>Price list files</h3>
            <span className="oem-masters__accept">.xlsx</span>
          </header>
          <div className="oem-masters__actions">
            <button type="button" onClick={() => templateMutation.mutate()} disabled={templateMutation.isPending}>
              {templateMutation.isPending ? 'Preparing…' : 'Download template'}
            </button>
          </div>
          {templateMutation.isError && (
            <div className="oem-masters__list oem-masters__list--error" role="alert">
              {errorText(templateMutation.error)}
            </div>
          )}

          <div className="oem-masters__controls">
            <label className="oem-masters__file">
              <input
                type="file"
                accept=".xlsx"
                multiple
                disabled={busy}
                onChange={(event) => {
                  const chosen = Array.from(event.target.files ?? []);
                  setItems((previous) => addFiles(previous, chosen));
                  event.target.value = '';
                }}
              />
              <span>{items.length ? 'Add more files…' : 'Choose files…'}</span>
            </label>
            <label className="oem-masters__date">
              One WEF date for all files (optional)
              <input type="date" value={allDate} onChange={(event) => setAllDate(event.target.value)} />
              <small>Applies to every checked file that has no error. You can still change a single file below.</small>
            </label>
            <div className="oem-masters__actions">
              <button
                type="button"
                disabled={busy || !allDate || items.length === 0}
                onClick={() => setItems((previous) => applyDateToAll(previous, allDate))}
              >
                Use this date for all
              </button>
            </div>
          </div>

          <div className="oem-masters__actions">
            <button type="button" onClick={() => void checkAll()} disabled={busy || toCheck === 0}>
              {busy ? 'Working…' : 'Check files'}
            </button>
            <button type="button" className="oem-masters__publish" onClick={() => void publishAll()} disabled={busy || toPublish === 0}>
              {toPublish > 0 ? `Publish ${toPublish} ready file${toPublish === 1 ? '' : 's'}` : 'Publish'}
            </button>
            <button type="button" onClick={() => setItems([])} disabled={busy || items.length === 0}>
              Clear
            </button>
          </div>

          {items.length > 0 && (
            <>
              <p className="price-masters__summary">
                {summary.total} file{summary.total === 1 ? '' : 's'}: {summary.ready} ready, {summary.needDate} need a date,{' '}
                {summary.withErrors} with problems (never loaded), {summary.published} published
                {summary.failed ? `, ${summary.failed} not published` : ''}.
              </p>
              <div className="oem-masters__table-wrap">
                <table className="oem-masters__table">
                  <thead>
                    <tr>
                      <th>File</th>
                      <th>Models</th>
                      <th>WEF date</th>
                      <th>Status</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => (
                      <tr key={item.id}>
                        <td title={item.file.name}>{item.file.name}</td>
                        <td>
                          {modelsOf(item) || '—'}
                          {vehiclesOf(item) ? <small> · {vehiclesOf(item)}</small> : null}
                        </td>
                        <td>
                          <input
                            type="date"
                            aria-label={`WEF date for ${item.file.name}`}
                            value={item.date}
                            disabled={busy || !(item.status === 'READY' || item.status === 'NO_DATE' || item.status === 'WAITING')}
                            onChange={(event) =>
                              setItems((previous) =>
                                previous.map((other) => (other.id === item.id ? withDate(other, event.target.value) : other)),
                              )
                            }
                          />
                        </td>
                        <td>
                          <strong>{STATUS_LABEL[item.status]}</strong>
                          {item.message ? <div className="price-masters__fine">{item.message}</div> : null}
                          {item.preview && item.preview.errors.length > 0 && (
                            <ul className="price-masters__fine">
                              {item.preview.errors.slice(0, 8).map((line) => (
                                <li key={line}>{line}</li>
                              ))}
                            </ul>
                          )}
                          {item.preview && item.preview.errors.length === 0 && item.preview.warnings.length > 0 && (
                            <details>
                              <summary className="price-masters__fine">{item.preview.warnings.length} notes</summary>
                              <ul className="price-masters__fine">
                                {item.preview.warnings.slice(0, 20).map((line) => (
                                  <li key={line}>{line}</li>
                                ))}
                              </ul>
                            </details>
                          )}
                        </td>
                        <td>
                          <button
                            type="button"
                            disabled={busy || item.status === 'PUBLISHING'}
                            aria-label={`Remove ${item.file.name}`}
                            onClick={() => setItems((previous) => previous.filter((other) => other.id !== item.id))}
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
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
