import { useQuery } from '@tanstack/react-query';

import { getNightlyReprocessingStatus } from '../services/audit-core/nightlyReprocessing';
import { useSessionStore } from '../store/sessionStore';

function formatRunAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown time';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

// Reads the log DI's nightly batch writes after each run (see
// verigence-audit-core uc03_nightly_reprocessing_reports.py) -- a thin
// "did it run, roughly how much did it queue" signal, not a document-level
// view. A document's own status stays visible on Journey 360.
export default function NightlyReprocessingStatusTile() {
  const accessToken = useSessionStore((state) => state.accessToken);

  const query = useQuery({
    queryKey: ['nightly-reprocessing-status'],
    queryFn: () => getNightlyReprocessingStatus(accessToken),
    enabled: Boolean(accessToken),
    retry: 1,
    staleTime: 5 * 60_000,
  });

  // Secondary status indicator, not core functionality -- fail quiet rather
  // than disrupt the dashboard it sits on.
  if (query.isError) return null;

  const latestRun = query.data?.recentRuns[0];

  return (
    <section className="nightly-reprocess-tile" aria-label="Failed Extraction Reprocessing status">
      <div className="nightly-reprocess-tile__heading">
        <strong>Failed Extraction Reprocessing</strong>
        <span>Nightly retry pass for documents that failed extraction</span>
      </div>
      {query.isPending ? (
        <span className="nightly-reprocess-tile__loading">Loading…</span>
      ) : !latestRun ? (
        <span className="nightly-reprocess-tile__empty">No runs recorded yet.</span>
      ) : (
        <div className={`nightly-reprocess-tile__result${latestRun.error ? ' is-failed' : ' is-ok'}`}>
          <span className="nightly-reprocess-tile__dot" aria-hidden="true" />
          <div>
            <strong>{latestRun.error ? 'Last run failed' : 'Last run completed'}</strong>
            <span>
              {formatRunAt(latestRun.ranAtUtc)}
              {!latestRun.error && ` · ${latestRun.documentsQueued ?? 0} document${latestRun.documentsQueued === 1 ? '' : 's'} queued`}
            </span>
            {latestRun.error && <small>{latestRun.error}</small>}
          </div>
        </div>
      )}
    </section>
  );
}
