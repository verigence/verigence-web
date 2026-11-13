import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';

import SectionCard from '../../../components/SectionCard';
import { formatWhen } from '../../task-manager/tmFormat';
import { getSystemHealthArchive } from '../../../services/audit-core/systemHealth';
import { archiveTone, archiveToneLabel, durationText, nightLabel, runTone, tableLabel } from './archiveLogic';
import { bytesText } from './systemHealthLogic';

const NIGHTS = [7, 14, 30];

/**
 * The nightly data archive (product owner 2026-11-09: "in System health need to add the status of
 * archive"): red / amber / green, every run per night and Project, rows archived to date, the
 * archived table's size now and the archive settings (names and switches only, never a key).
 * Read-only; SuperAdmin only, enforced by Audit Core.
 */
export default function DataArchiveTab({ accessToken }: { accessToken: string }) {
  const [nights, setNights] = useState(14);
  const query = useQuery({
    queryKey: ['admin', 'system-health', 'archive', nights],
    queryFn: () => getSystemHealthArchive(nights, accessToken),
    placeholderData: keepPreviousData,
    refetchInterval: 300_000,
    retry: false,
  });
  const data = query.data;

  return (
    <div className="screen-stack">
      <div className="p2w-listbar">
        <div className="p2w-segment" role="tablist" aria-label="Nights">
          {NIGHTS.map((n) => (
            <button key={n} type="button" role="tab" aria-selected={nights === n} className={nights === n ? 'is-active' : ''}
              onClick={() => setNights(n)}>{n} nights</button>
          ))}
        </div>
        {data ? <span className="p2w-muted">Updated {formatWhen(data.generatedAtUtc)}</span> : null}
      </div>
      {query.isError ? (
        <div className="p2w-alert p2w-alert--error" role="alert">
          {query.error instanceof Error ? query.error.message : 'The data archive status could not be loaded.'}
        </div>
      ) : null}
      {query.isLoading ? <div className="p2w-skeleton">Loading…</div> : null}

      {data ? (
        <>
          <div className={`sh-archive-status sh-archive-status--${archiveTone(data.status.tone)}`} role="status">
            <span className={`sh-dot sh-dot--${archiveTone(data.status.tone)}`} aria-hidden="true" />
            <strong>{archiveToneLabel(data.status.tone)}</strong>
            <span>{data.status.reason}</span>
          </div>

          <dl className="sh-archive-facts">
            <div><dt>Last successful run</dt><dd>{data.lastSucceededAtUtc ? formatWhen(data.lastSucceededAtUtc) : '—'}</dd>
              <span>{data.lastLiveSuccess ? `last live: ${data.lastLiveSuccess.projectName ?? data.lastLiveSuccess.tenantId ?? 'platform'}` : 'no live run has succeeded yet'}</span></div>
            <div><dt>Rows archived to date</dt><dd>{data.archivedToDate.toLocaleString('en-IN')}</dd>
              <span>{data.batchesToDate} files{data.lastArchivedAtUtc ? ` · last ${formatWhen(data.lastArchivedAtUtc)}` : ''}</span></div>
            {data.tables.map((t) => (
              <div key={t.table}><dt>{tableLabel(t.table)} now</dt>
                <dd>{t.rowsEstimate === null ? '—' : `≈ ${t.rowsEstimate.toLocaleString('en-IN')} rows`}</dd>
                <span>{bytesText(t.totalBytes)} on disk (table {bytesText(t.tableBytes)})</span></div>
            ))}
          </dl>

          <SectionCard>
            <div className="p2w-card__title">
              <h3>Runs by night</h3>
              <p className="p2w-muted">One row per Project and table each night (at the Data archive job&apos;s time; see the Jobs tab). Failed runs keep every row they had not archived.</p>
            </div>
            {data.nights.length === 0 ? <p className="p2w-muted">No archive run in these nights.</p> : (
              <div className="p2dr-scroll">
                <table className="p2dr-table sh-archive-table">
                  <thead>
                    <tr>
                      <th>Night</th><th>Project</th><th>Table</th><th>Mode</th><th>Status</th><th>Candidates</th>
                      <th>Archived</th><th>Files</th><th>Duration</th><th>Error</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.nights.flatMap((night) => night.runs.map((run, index) => (
                      <tr key={`${run.runId}-${run.tenantId ?? ''}`} className={index === 0 ? 'sh-archive-night' : undefined}>
                        <td>{index === 0 ? <strong>{nightLabel(night.night)}</strong> : null}</td>
                        <td>{run.projectName ?? run.tenantId ?? '—'}</td>
                        <td>{tableLabel(run.table)}</td>
                        <td>{run.mode === 'DRY_RUN' ? 'Dry run' : run.mode === 'LIVE' ? 'Live' : run.mode}</td>
                        <td><span className={`sh-dot sh-dot--${runTone(run)}`} aria-hidden="true" />{run.status}</td>
                        <td>{run.candidates.toLocaleString('en-IN')}</td>
                        <td>{run.archived.toLocaleString('en-IN')}</td>
                        <td>{run.objects}</td>
                        <td>{durationText(run.durationSeconds)}</td>
                        <td className="sh-archive-error" title={run.error ?? undefined}>{run.error ?? ''}</td>
                      </tr>
                    )))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>

          <SectionCard>
            <div className="p2w-card__title">
              <h3>Settings</h3>
              <p className="p2w-muted">
                As the Audit Core API&apos;s environment holds them (AUDIT_CORE_ARCHIVE_*). The nightly job runs in the P2 worker:
                a run&apos;s mode shows what the worker did. Storage keys are never shown.
              </p>
            </div>
            {data.settings.problem ? <div className="p2w-alert p2w-alert--error" role="alert">{data.settings.problem}</div> : null}
            <dl className="sh-archive-facts">
              <div><dt>Bucket</dt><dd>{data.settings.bucket ?? 'Not set'}</dd><span>{data.settings.bucket ? 'R2' : 'live archiving is refused without it'}</span></div>
              <div><dt>Retention</dt><dd>{data.settings.retentionDays === null ? '—' : `${data.settings.retentionDays} days`}</dd><span>archive files kept in R2</span></div>
              <div><dt>Batch</dt><dd>{data.settings.batchSize.toLocaleString('en-IN')} rows</dd><span>{`up to ${data.settings.maxRowsPerTable.toLocaleString('en-IN')} a night per table`}</span></div>
              {data.settings.tables.map((t) => (
                <div key={t.key}><dt>{tableLabel(t.table)}</dt><dd>{t.enabled ? 'Live' : 'Dry run only'}</dd><span>{`rows older than ${t.ageDays} days`}</span></div>
              ))}
            </dl>
          </SectionCard>
        </>
      ) : null}
    </div>
  );
}
