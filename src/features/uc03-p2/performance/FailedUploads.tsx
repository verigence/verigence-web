import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

import { FAILURE_WHY, getFailedUploads, type FailedRow } from '../../../services/audit-core/uc03ProjectTracker';

function failedWhen(at: string | null): string {
  return at ? new Date(at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
    timeZone: 'Asia/Kolkata' }) : '—';
}

/**
 * Why each failed upload of the period failed (product owner 2026-11-13: "if some files are failed
 * to be uploaded and all their retries are exhausted can we have information why that happened"):
 * the files uploaded in the period, page by page, with the reason, the attempts and a link to the page.
 */
export default function FailedUploads({ tenantId, accessToken, first, last }: {
  tenantId: string; accessToken: string | undefined; first: string; last: string;
}) {
  const query = useQuery({
    queryKey: ['p2-failed-uploads', tenantId, first, last],
    queryFn: () => getFailedUploads(tenantId, first, last, accessToken),
    enabled: Boolean(tenantId && accessToken),
    staleTime: 30_000,
  });
  if (query.isLoading) return <p className="p2w-muted">Loading the failed uploads…</p>;
  if (query.isError) {
    return (
      <div className="p2w-alert p2w-alert--error" role="alert">
        The failed uploads could not be loaded.{' '}
        <button type="button" className="p2w-button p2w-button--ghost" onClick={() => query.refetch()}>Try again</button>
      </div>
    );
  }
  const rows: FailedRow[] = query.data?.rows ?? [];
  if (!rows.length) return <p className="p2w-muted">No upload of this period failed.</p>;
  return (
    <>
      <div className="p2pt-scroll">
        <table className="p2w-table p2mw-table" aria-label="Failed uploads and why">
          <thead>
            <tr><th>Uploaded</th><th>PC</th><th>Customer / file</th><th>Pages</th><th>Why</th><th>Reason</th><th>Tries</th><th /></tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const why = row.why ? FAILURE_WHY[row.why] : undefined;
              return (
                <tr key={`${row.kind}-${row.journeyId}-${row.filename}-${row.pageNumbers.join(',')}-${row.failedAtUtc}`}>
                  <td>{failedWhen(row.uploadedAtUtc)}</td>
                  <td>{row.uploadedByName || '—'}</td>
                  <td>
                    <Link to={`/p2/journeys/${row.journeyId}/documents`}>{row.customerName || row.journeyReference || 'Journey'}</Link>
                    <div className="p2w-muted">{row.filename}{row.outletName ? ` · ${row.outletName}` : ''}</div>
                  </td>
                  <td>{row.kind === 'FILE' ? 'Whole file' : row.pageNumbers.join(', ')}</td>
                  <td title={why?.hint}>{why?.label ?? '—'}</td>
                  <td>{row.reason}{row.clearedFromJourney ? <div className="p2w-muted">Cleared from the Journey until it is sent again.</div> : null}</td>
                  <td>{row.attempts ?? '—'}</td>
                  <td>{row.openUrl ? <a href={row.openUrl} target="_blank" rel="noreferrer">Open</a> : null}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {query.data?.truncated ? <p className="p2w-muted">Showing the latest {rows.length}; choose a shorter period for the rest.</p> : null}
    </>
  );
}
