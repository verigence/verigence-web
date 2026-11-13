import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import SectionCard from '../../../components/SectionCard';
import { formatWhen } from '../../task-manager/tmFormat';
import {
  getJobs, setDailyJobTime, setDriveRunTime, type JobsOverview,
} from '../../../services/audit-core/systemHealth';
import { clockLabel, coverageText, isHhMm, sleepText } from './jobsLogic';

export const jobsKey = ['admin', 'system-health', 'jobs'] as const;

type Notice = { ok: boolean; text: string } | null;

/** A time a SuperAdmin can change: the input, what it reads as, and Save. */
function TimeCell({ label, value, busy, onSave }: {
  label: string; value: string; busy: boolean; onSave: (time: string) => void;
}) {
  const [time, setTime] = useState(value);
  useEffect(() => setTime(value), [value]);
  const valid = isHhMm(time);
  return (
    <span className="sh-jobs-time">
      <input type="time" aria-label={`${label} time (India time)`} value={time} disabled={busy}
        onChange={(e) => setTime(e.target.value)} />
      <button type="button" className="p2w-button p2w-button--primary"
        disabled={busy || !valid || time === value} onClick={() => onSave(time)}>Save</button>
    </span>
  );
}

function SleepFlag({ inside }: { inside: boolean }) {
  return inside
    ? <span className="sh-jobs-flag sh-jobs-flag--warn"><span className="sh-dot sh-dot--warn" aria-hidden="true" />Inside the sleep: wakes the system</span>
    : <span className="sh-jobs-flag"><span className="sh-dot sh-dot--ok" aria-hidden="true" />Before the sleep</span>;
}

/**
 * Every job the platform runs on a clock, in one place (product owner 2026-11-13: "create
 * dashboard of all jobs which get executed for Superadmin and allow him to change the time").
 * The daily jobs and each Project's Drive run have a time he sets here; what runs every few
 * seconds or minutes, and the jobs other modules run, are listed so nothing is missing.
 * SuperAdmin only, enforced by Audit Core.
 */
export default function JobsTab({ accessToken }: { accessToken: string }) {
  const queryClient = useQueryClient();
  const [notice, setNotice] = useState<Notice>(null);
  const query = useQuery({
    queryKey: jobsKey,
    queryFn: () => getJobs(accessToken),
    refetchInterval: 300_000,
    retry: false,
  });
  const save = useMutation({
    mutationFn: (input: { kind: 'daily' | 'drive'; id: string; name: string; time: string }) => (
      input.kind === 'daily' ? setDailyJobTime(input.id, input.time, accessToken) : setDriveRunTime(input.id, input.time, accessToken)
    ),
    onSuccess: (data: JobsOverview, input) => {
      queryClient.setQueryData(jobsKey, data);
      setNotice({ ok: true, text: `${input.name} now runs at ${clockLabel(input.time)} India time. The worker follows within a minute.` });
    },
    onError: (error) => setNotice({ ok: false, text: error instanceof Error && error.message ? error.message : 'The time could not be saved.' }),
  });
  const data = query.data;
  const busy = save.isPending;

  return (
    <div className="screen-stack">
      {query.isError ? (
        <div className="p2w-alert p2w-alert--error" role="alert">
          {query.error instanceof Error ? query.error.message : 'The jobs could not be loaded.'}
        </div>
      ) : null}
      {query.isLoading ? <div className="p2w-skeleton">Loading…</div> : null}
      {notice ? <div className={`p2w-alert ${notice.ok ? 'p2w-alert--success' : 'p2w-alert--error'}`} role="status">{notice.text}</div> : null}

      {data ? (
        <>
          <div className={`sh-archive-status sh-archive-status--${data.sleepWindow.enabled ? 'ok' : 'warn'}`} role="status">
            <strong>Night&apos;s sleep</strong>
            <span>{sleepText(data.sleepWindow)}</span>
          </div>

          <SectionCard>
            <div className="p2w-card__title">
              <h3>Daily jobs</h3>
              <p className="p2w-muted">Each runs once a day for every live Project, at the time set here (India time).</p>
            </div>
            <div className="p2dr-scroll">
              <table className="p2dr-table sh-jobs-table">
                <thead>
                  <tr><th>Job</th><th>Runs at</th><th>Night&apos;s sleep</th><th>Last run</th><th>Changed</th></tr>
                </thead>
                <tbody>
                  {data.daily.map((job) => (
                    <tr key={job.key}>
                      <td><strong>{job.name}</strong><small>{job.what}</small><small>{job.service}</small></td>
                      <td>
                        {job.editable && job.enabled
                          ? <TimeCell label={job.name} value={job.timeIst} busy={busy}
                              onSave={(time) => { setNotice(null); save.mutate({ kind: 'daily', id: job.key, name: job.name, time }); }} />
                          : <span>{job.enabled ? clockLabel(job.timeIst) : 'Switched off'}</span>}
                        <small>{`${clockLabel(job.timeIst)} · default ${clockLabel(job.defaultTimeIst)}`}</small>
                      </td>
                      <td>{job.enabled ? <SleepFlag inside={job.insideSleepWindow} /> : '—'}</td>
                      <td>{formatWhen(job.lastRunAtUtc)}<small>{coverageText(job)}</small></td>
                      <td>{job.changedAtUtc ? <>{formatWhen(job.changedAtUtc)}<small>{job.changedBy ?? ''}</small></> : <span className="p2w-muted">Default</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>

          <SectionCard>
            <div className="p2w-card__title">
              <h3>Google Drive run</h3>
              <p className="p2w-muted">Each Project&apos;s own daily run. The same time as on the Project&apos;s Drive page.</p>
            </div>
            {data.driveRuns.length === 0 ? <p className="p2w-muted">No Project has Google Drive connected.</p> : (
              <div className="p2dr-scroll">
                <table className="p2dr-table sh-jobs-table">
                  <thead><tr><th>Project</th><th>Runs at</th><th>Night&apos;s sleep</th><th>Last run</th></tr></thead>
                  <tbody>
                    {data.driveRuns.map((run) => (
                      <tr key={run.tenantId}>
                        <td><strong>{run.projectName}</strong>{run.enabled ? null : <small>Daily run switched off on the Project</small>}</td>
                        <td>
                          <TimeCell label={`${run.projectName} Drive run`} value={run.timeIst} busy={busy}
                            onSave={(time) => { setNotice(null); save.mutate({ kind: 'drive', id: run.tenantId, name: `${run.projectName} Drive run`, time }); }} />
                          <small>{clockLabel(run.timeIst)}</small>
                        </td>
                        <td><SleepFlag inside={run.insideSleepWindow} /></td>
                        <td>{formatWhen(run.lastRunAtUtc)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>

          <SectionCard>
            <div className="p2w-card__title">
              <h3>Runs all day</h3>
              <p className="p2w-muted">Short clocks fixed in the code. All of them stop while the system sleeps.</p>
            </div>
            <div className="p2dr-scroll">
              <table className="p2dr-table sh-jobs-table">
                <thead><tr><th>Job</th><th>Every</th><th>Service</th></tr></thead>
                <tbody>
                  {data.recurring.map((job) => (
                    <tr key={`${job.service}-${job.name}`}>
                      <td><strong>{job.name}</strong><small>{job.what}</small></td>
                      <td>{job.every}</td>
                      <td>{job.service}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>

          <SectionCard>
            <div className="p2w-card__title">
              <h3>Run by other modules</h3>
              <p className="p2w-muted">Not set on this page. Listed so every job on a clock is here.</p>
            </div>
            <div className="p2dr-scroll">
              <table className="p2dr-table sh-jobs-table">
                <thead><tr><th>Job</th><th>When</th><th>Module</th><th>Note</th></tr></thead>
                <tbody>
                  {data.external.map((job) => (
                    <tr key={`${job.service}-${job.name}`}>
                      <td><strong>{job.name}</strong><small>{job.what}</small></td>
                      <td>{job.when}</td>
                      <td>{job.service}</td>
                      <td>{job.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>

          <SectionCard>
            <div className="p2w-card__title"><h3>Changes</h3></div>
            {data.changes.length === 0 ? <p className="p2w-muted">No time has been changed yet.</p> : (
              <div className="p2dr-scroll">
                <table className="p2dr-table sh-jobs-table">
                  <thead><tr><th>When</th><th>Job</th><th>From</th><th>To</th><th>By</th></tr></thead>
                  <tbody>
                    {data.changes.map((change) => (
                      <tr key={`${change.jobKey}-${change.changedAtUtc}-${change.newTimeIst}`}>
                        <td>{formatWhen(change.changedAtUtc)}</td>
                        <td>{change.job}</td>
                        <td>{clockLabel(change.oldTimeIst)}</td>
                        <td>{clockLabel(change.newTimeIst)}</td>
                        <td>{change.changedBy ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>
        </>
      ) : null}
    </div>
  );
}
