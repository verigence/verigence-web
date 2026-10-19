import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';

import PageHeader from '../components/PageHeader';
import { runSkuResolutionForProject } from '../services/audit-core/skuResolution';
import { listProjects } from '../services/audit-core/uc02Admin';
import { useSessionStore } from '../store/sessionStore';

export default function AdminSkuResolutionPage() {
  const accessToken = useSessionStore((state) => state.accessToken);
  const [tenantId, setTenantId] = useState('');

  const projectsQuery = useQuery({
    queryKey: ['admin-sku-resolution-projects'],
    queryFn: () => listProjects(accessToken),
    enabled: Boolean(accessToken),
    staleTime: 30_000,
    retry: 1,
  });
  const run = useMutation({
    mutationFn: () => runSkuResolutionForProject(tenantId, accessToken!),
  });

  const result = run.data;
  const project = projectsQuery.data?.find((p) => p.tenantId === tenantId);

  return (
    <section className="admin-landing screen-stack">
      <PageHeader
        eyebrow="Administration · SKU Resolution"
        title="Run SKU Resolution"
        description="Matches every Booking's model against the Project's price masters (and the Delivery invoice where needed) and pins the SKU. Use it after price masters are loaded or changed. It is safe to run again."
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
              onChange={(event) => { setTenantId(event.target.value); run.reset(); }}
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
            {run.isPending ? 'Running…' : `Run SKU resolution${project ? ` for ${project.projectName}` : ''}`}
          </button>
          {run.isError ? (
            <div className="uc01-admin-message uc01-admin-message--error" role="alert">
              {run.error instanceof Error ? run.error.message : 'The run could not be completed.'}
            </div>
          ) : null}
          {result ? (
            <div className="uc01-admin-message" role="status">
              <strong>Done.</strong> {result.journeysProcessed} of {result.journeysConsidered} Journeys processed.
              <br />
              With a SKU: {result.withSkuBefore} → {result.withSkuAfter}. Still without a SKU: {result.withoutSkuAfter}
              {result.withoutSkuAfter > 0 ? ' (each has a "model not identified" item for the PC to confirm).' : '.'}
              {result.stepErrors > 0 ? <><br />{result.stepErrors} step(s) reported an internal error; run again, and tell support if it repeats.</> : null}
              {result.journeysFailed.length > 0 ? (
                <><br />Failed Journeys: <code>{result.journeysFailed.join(', ')}</code></>
              ) : null}
            </div>
          ) : null}
        </article>
      </div>
    </section>
  );
}
