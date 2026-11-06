import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { getP2UploadedFiles, getP2UploadFileLink, type P2UploadedFile } from '../../../services/audit-core/uc03P2';
import { formatDateTime } from '../workspace/p2Format';

/** What each upload status means to the person downloading the file. */
const STATUS_TEXT: Record<string, string> = {
  UPLOADED: 'Received',
  SPLITTING: 'Being split into pages',
  PROCESSING: 'Being read',
  COMPLETED: 'Read',
  PARTIAL_FAILURE: 'Read, some pages not',
  FAILED: 'Not read',
  CANCELLED: 'Removed or a repeat',
};

export function sizeText(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

/** Opens the file exactly as uploaded, through a fresh short-lived link
 * asked for on the click (the tab is opened first so a pop-up blocker allows it). */
function DownloadButton({ file, tenantId, journeyId, accessToken }: {
  file: P2UploadedFile; tenantId: string; journeyId: string; accessToken?: string;
}) {
  const [state, setState] = useState<'idle' | 'busy' | 'failed'>('idle');
  const download = async () => {
    setState('busy');
    const tab = window.open('about:blank', '_blank');
    if (tab) tab.opener = null;
    try {
      const { url } = await getP2UploadFileLink(tenantId, journeyId, file.batchId, accessToken);
      if (tab) tab.location.href = url; else window.location.assign(url);
      setState('idle');
    } catch {
      tab?.close();
      setState('failed');
    }
  };
  return (
    <>
      <button type="button" className="p2w-link" data-file-download disabled={state === 'busy'} onClick={() => void download()}>
        {state === 'busy' ? 'Opening…' : 'Download'}
      </button>
      {state === 'failed' ? <span className="p2w-muted"> could not be opened, try again</span> : null}
    </>
  );
}

/**
 * Every file uploaded to the journey, as it was uploaded -- the full PDF or
 * photo, before it was split into pages -- to download (product owner
 * 2026-11-06: "an option to download the full pdf which the PC uploaded in
 * each journey").
 */
export default function UploadedFilesTab({ tenantId, journeyId, accessToken }: {
  tenantId: string; journeyId: string; accessToken?: string;
}) {
  const files = useQuery({
    queryKey: ['p2-uploaded-files', tenantId, journeyId],
    queryFn: () => getP2UploadedFiles(tenantId, journeyId, accessToken),
    staleTime: 30_000,
  });
  if (files.isLoading) return <div className="p2w-skeleton" aria-busy="true">Loading…</div>;
  if (files.isError) {
    return (
      <div className="p2w-alert p2w-alert--error" role="alert">
        The uploaded files could not be listed.
        <button type="button" className="p2w-link" onClick={() => void files.refetch()}>Try again</button>
      </div>
    );
  }
  const list = files.data?.files ?? [];
  if (!list.length) return <p className="p2w-muted">No file has been uploaded to this journey yet.</p>;
  return (
    <section className="j360-card" aria-label="Uploaded files">
      <p className="p2w-muted">Each file as it was uploaded, before it was split into pages. Newest first.</p>
      <div className="j360-table-wrap">
        <table className="j360-table">
          <thead>
            <tr>
              <th scope="col">File</th><th scope="col">Uploaded</th><th scope="col">By</th>
              <th scope="col" className="is-num">Pages</th><th scope="col">Status</th><th scope="col"><span className="visually-hidden">Download</span></th>
            </tr>
          </thead>
          <tbody>
            {list.map((file) => (
              <tr key={file.batchId}>
                <th scope="row">
                  {file.filename}
                  <span className="p2w-muted"> · {sizeText(file.sizeBytes)}{file.replacesDocument ? ' · replacement' : ''}</span>
                </th>
                <td data-label="Uploaded">{file.uploadedAtUtc ? formatDateTime(file.uploadedAtUtc) : '—'}</td>
                <td data-label="By">{file.uploadedBy ?? '—'}</td>
                <td className="is-num" data-label="Pages">{file.pages || '—'}</td>
                <td data-label="Status">{STATUS_TEXT[file.status] ?? file.status}</td>
                <td data-label="Download">
                  <DownloadButton file={file} tenantId={tenantId} journeyId={journeyId} accessToken={accessToken} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
