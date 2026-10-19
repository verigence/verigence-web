import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import PageHeader from '../components/PageHeader';
import {
  getSkuResolutionRun,
  listSkuResolutionRuns,
  runSkuResolutionForProject,
  type SkuRunCursor,
  type SkuResolutionRunDetail,
  type SkuResolutionRunSummary,
  type SkuRunOutcome,
} from '../services/audit-core/skuResolution';
import { listProjects } from '../services/audit-core/uc02Admin';
import { useSessionStore } from '../store/sessionStore';

const OUTCOME_LABEL: Record<SkuRunOutcome, string> = {
  NEWLY_MATCHED: 'Matched now',
  ALREADY_HAD_SKU: 'Already had a SKU',
  STILL_UNMATCHED: 'Not matched',
  FAILED: 'Failed',
};

function when(value: string | null) {
  return value ? new Date(value).toLocaleString() : '—';
}

function RunSummary({ run }: { run: SkuResolutionRunSummary }) {
  return (
    <p>
      <strong>{run.status === 'COMPLETE' ? 'Done' : 'Running'}.</strong>{' '}
      {run.journeysProcessed} of {run.journeysTotal} Journeys processed.
      <br />
      Matched now: <strong>{run.newlyMatched}</strong> · Already had a SKU: {run.alreadyHadSku} · Not matched:{' '}
      <strong>{run.stillUnmatched}</strong> · Failed: <strong>{run.failed}</strong>
      <br />
      Journeys with a SKU: {run.withSkuBefore} → {run.withSkuAfter}
    </p>
  );
}

function RunDetail({ run }: { run: SkuResolutionRunDetail }) {
  return (
    <div className="oem-masters__table-wrap">
      <table className="oem-masters__table">
        <thead>
          <tr><th>Journey</th><th>Vehicle (as booked)</th><th>Result</th><th>SKU</th><th>Note</th></tr>
        </thead>
        <tbody>
          {run.items.map((item) => (
            <tr key={item.journeyId}>
              <td>{item.journeyLabel || item.journeyId.slice(0, 8)}</td>
              <td>{item.modelLabel || '—'}</td>
              <td>{OUTCOME_LABEL[item.outcome]}</td>
              <td>{item.skuCode || '—'}</td>
              <td>{item.detail || ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function AdminSkuResolutionPage() {
  const accessToken = useSessionStore((state) => state.accessToken);
  const queryClient = useQueryClient();
  const [tenantId, setTenantId] = useState('');
  const cursor = useRef<SkuRunCursor>({ offset: 0, processed: 0, total: 0 });
  const [progress, setProgress] = useState<SkuRunCursor>();
  const [openRunId, setOpenRunId] = useState<string>();

  const projectsQuery = useQuery({
    queryKey: ['admin-sku-resolution-projects'],
    queryFn: () => listProjects(accessToken),
    enabled: Boolean(accessToken),
    staleTime: 30_000,
    retry: 1,
  });
  const runsQuery = useQuery({
    queryKey: ['admin-sku-resolution-runs', tenantId],
    queryFn: () => listSkuResolutionRuns(tenantId, accessToken!),
    enabled: Boolean(tenantId && accessToken),
    retry: 1,
  });
  const detailQuery = useQuery({
    queryKey: ['admin-sku-resolution-run', tenantId, openRunId],
    queryFn: () => getSkuResolutionRun(tenantId, openRunId!, accessToken!),
    enabled: Boolean(tenantId && openRunId && accessToken),
    retry: 1,
  });
  const run = useMutation({
    mutationFn: () => runSkuResolutionForProject(tenantId, accessToken!, cursor.current, setProgress),
    onSuccess: (runId) => {
      cursor.current = { offset: 0, processed: 0, total: 0 };
      setProgress(undefined);
      setOpenRunId(runId);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['admin-sku-resolution-runs', tenantId] }),
  });

  const project = projectsQuery.data?.find((p) => p.tenantId === tenantId);

  return (
    <section className="admin-landing screen-stack">
      <PageHeader
        eyebrow="Administration · SKU Resolution"
        title="Run SKU Resolution"
        description="Matches every Booking's model against the Project's price masters (and the Delivery invoice where needed) and pins the SKU. Use it after price masters are loaded or changed. It is safe to run again, and every run's summary is kept below."
      />
      <div className="uc01-admin-config-grid">
        <article className="uc01-admin-config-card">
          <span className="eyebrow">Project</span>
          <h2>Run for all Journeys in a Project</h2>
          <label className="uc03-booking-field">
            <span>Project / Tenant</span>
            <select
              value={tenantId}
              disabled={projectsQuery.isPending || run.isPending}
              onChange={(event) => {
                setTenantId(event.target.value);
                setOpenRunId(undefined);
                cursor.current = { offset: 0, processed: 0, total: 0 };
                setProgress(undefined);
                run.reset();
              }}
            >
              <option value="">Select Project</option>
              {(projectsQuery.data ?? []).map((p) => (
                <option key={p.tenantId} value={p.tenantId}>{p.projectName} · {p.projectCode}</option>
              ))}
            </select>
          </label>
          {projectsQuery.isError ? (
            <div className="uc01-admin-message uc01-admin-message--error">Projects could not be loaded.</div>
          ) : null}
          <button
            type="button"
            className="button button--primary"
            disabled={!tenantId || !accessToken || run.isPending}
            onClick={() => run.mutate()}
          >
            {run.isPending
              ? (progress ? `Running… ${progress.processed} of ${progress.total} Journeys` : 'Running…')
              : run.isError && progress
                ? `Resume (${progress.processed} of ${progress.total} done)`
                : `Run SKU resolution${project ? ` for ${project.projectName}` : ''}`}
          </button>
          {run.isError ? (
            <div className="uc01-admin-message uc01-admin-message--error" role="alert">
              {run.error instanceof Error ? run.error.message : 'The run could not be completed.'}
              {progress ? ` Stopped after ${progress.processed} of ${progress.total} Journeys. Press Resume to carry on from there; what was done is kept.` : ''}
            </div>
          ) : null}
        </article>

        {tenantId ? (
          <article className="uc01-admin-config-card">
            <span className="eyebrow">History</span>
            <h2>Previous runs</h2>
            {runsQuery.isPending ? <p>Loading…</p> : null}
            {runsQuery.isError ? <div className="uc01-admin-message uc01-admin-message--error">Runs could not be loaded.</div> : null}
            {runsQuery.data?.length === 0 ? <p>No runs yet for this Project.</p> : null}
            {(runsQuery.data ?? []).map((item) => (
              <div key={item.runId}>
                <button type="button" className="button" onClick={() => setOpenRunId(openRunId === item.runId ? undefined : item.runId)}>
                  {when(item.startedAtUtc)} · {item.journeysProcessed}/{item.journeysTotal} processed · {item.stillUnmatched} not matched · {item.failed} failed
                </button>
                {openRunId === item.runId ? (
                  <>
                    <RunSummary run={item} />
                    {detailQuery.isPending ? <p>Loading Journeys…</p> : null}
                    {detailQuery.data ? <RunDetail run={detailQuery.data} /> : null}
                  </>
                ) : null}
              </div>
            ))}
          </article>
        ) : null}
      </div>
    </section>
  );
}
