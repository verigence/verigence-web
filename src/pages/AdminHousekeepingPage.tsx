import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import PageHeader from '../components/PageHeader';
import { listProjects } from '../services/audit-core/uc02Admin';
import {
  getTenantTransactionDataStatus,
  purgeTenantTransactionData,
} from '../services/di/housekeeping';
import { useSessionStore } from '../store/sessionStore';

export default function AdminHousekeepingPage() {
  const accessToken = useSessionStore((state) => state.accessToken);
  const queryClient = useQueryClient();
  const [tenantId, setTenantId] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [purging, setPurging] = useState(false);
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();

  const projectsQuery = useQuery({
    queryKey: ['admin-housekeeping-projects'],
    queryFn: () => listProjects(accessToken),
    enabled: Boolean(accessToken),
    staleTime: 30_000,
    retry: 1,
  });

  const statusQuery = useQuery({
    queryKey: ['admin-di-housekeeping-status', tenantId],
    queryFn: () => getTenantTransactionDataStatus(tenantId, accessToken!),
    enabled: Boolean(tenantId && accessToken),
    staleTime: 0,
    retry: 1,
  });

  const selectedProject = useMemo(
    () => projectsQuery.data?.find((project) => project.tenantId === tenantId),
    [projectsQuery.data, tenantId],
  );
  const status = statusQuery.data;
  const canPurge = Boolean(tenantId && confirmation === tenantId && !purging && status);

  const handleTenantChange = (nextTenantId: string) => {
    setTenantId(nextTenantId);
    setConfirmation('');
    setMessage(undefined);
    setError(undefined);
  };

  const handlePurge = async () => {
    if (!accessToken || !tenantId || confirmation !== tenantId) return;
    setPurging(true);
    setMessage(undefined);
    setError(undefined);
    try {
      const result = await purgeTenantTransactionData(tenantId, accessToken);
      await statusQuery.refetch();
      await queryClient.invalidateQueries({ queryKey: ['admin-di-housekeeping-status', tenantId] });
      setConfirmation('');
      setMessage(
        `Housekeeping completed. ${result.deletedDocuments} document record${result.deletedDocuments === 1 ? '' : 's'} and ${result.deletedStorageObjects} stored object${result.deletedStorageObjects === 1 ? '' : 's'} were removed. DI configuration was preserved.`,
      );
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'DI housekeeping could not be completed.');
    } finally {
      setPurging(false);
    }
  };

  const metrics = status ? [
    ['Documents', status.documents],
    ['Stored Objects', status.storageObjects],
    ['Extracted Facts', status.extractedFacts],
    ['Accepted Field Values', status.acceptedFieldValues],
    ['Processing Jobs', status.processingJobs],
    ['Processing Runs', status.processingRuns],
    ['Processor Invocations', status.processorInvocations],
  ] as const : [];

  return (
    <section className="admin-landing screen-stack">
      <PageHeader
        eyebrow="Administration · Housekeeping"
        title="DI Transaction Housekeeping"
        description="Remove Document Intelligence transaction data for one Project/Tenant without deleting its DI configuration."
      />

      <div className="uc01-admin-config-grid">
        <article className="uc01-admin-config-card">
          <span className="eyebrow">Tenant selection</span>
          <h2>Select Project / Tenant</h2>
          <p>Housekeeping affects only the selected Tenant. It does not delete the Project, tenant provisioning, Document Types, Canonical Fields or Extraction Profiles.</p>
          <label className="uc03-booking-field">
            <span>Project / Tenant</span>
            <select
              value={tenantId}
              disabled={projectsQuery.isPending || purging}
              onChange={(event) => handleTenantChange(event.target.value)}
            >
              <option value="">Select Project</option>
              {(projectsQuery.data ?? []).map((project) => (
                <option key={project.tenantId} value={project.tenantId}>
                  {project.projectName} · {project.projectCode}
                </option>
              ))}
            </select>
          </label>
          {tenantId ? <p><strong>Tenant ID:</strong> <code>{tenantId}</code></p> : null}
          {projectsQuery.isError ? <div className="uc01-admin-message uc01-admin-message--error">Projects could not be loaded.</div> : null}
        </article>

        <aside className="uc01-admin-capability-card">
          <span>Authority</span><strong>SuperAdmin only</strong>
          <span>Scope</span><strong>DI transaction data only</strong>
          <p>Stored documents and their processing/extraction records are permanently deleted. Project and DI configuration remain available for fresh document processing.</p>
        </aside>
      </div>

      {tenantId ? (
        <section className="admin-landing__projects" aria-labelledby="housekeeping-volume-title">
          <header>
            <div>
              <span className="eyebrow">Current usage</span>
              <h2 id="housekeeping-volume-title">{selectedProject?.projectName ?? 'Selected Tenant'}</h2>
              <p>Review the current DI transaction volume before deleting it.</p>
            </div>
            <button
              type="button"
              className="uc01-admin-button"
              disabled={statusQuery.isFetching || purging}
              onClick={() => void statusQuery.refetch()}
            >
              {statusQuery.isFetching ? 'Refreshing…' : 'Refresh Counts'}
            </button>
          </header>

          {statusQuery.isPending ? <div className="admin-landing__project-state">Loading DI transaction counts…</div> : null}
          {statusQuery.isError ? <div className="admin-landing__project-state admin-landing__project-state--error">DI transaction counts could not be loaded.</div> : null}
          {status ? (
            <div className="admin-landing__metrics" aria-label="DI transaction counts">
              {metrics.map(([label, value]) => (
                <article className="admin-landing__metric" key={label}>
                  <span>{label}</span><strong>{value}</strong><small>Selected Tenant</small>
                </article>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      {status ? (
        <section className="uc01-admin-config-grid" aria-label="Purge DI transaction data">
          <article className="uc01-admin-config-card">
            <span className="eyebrow">Destructive housekeeping</span>
            <h2>Purge Transaction Data</h2>
            <p>This action permanently removes the selected Tenant's document transactions and stored document objects. It cannot be undone from this screen.</p>
            <p>To confirm, type the Tenant ID exactly:</p>
            <label className="uc03-booking-field">
              <span>{tenantId}</span>
              <input
                type="text"
                value={confirmation}
                disabled={purging}
                autoComplete="off"
                spellCheck={false}
                onChange={(event) => setConfirmation(event.target.value)}
                placeholder="Enter Tenant ID"
              />
            </label>
            <button
              type="button"
              className="uc01-admin-button uc01-admin-button--primary"
              disabled={!canPurge}
              onClick={() => void handlePurge()}
            >
              {purging ? 'Purging…' : 'Purge DI Transaction Data'}
            </button>
          </article>

          <aside className="uc01-admin-capability-card">
            <span>Deleted</span><strong>Documents + processing/extracted data</strong>
            <span>Preserved</span><strong>Tenant + DI configuration</strong>
            <p>Subjects and Audit storage contexts are also preserved so existing Project integration context remains intact.</p>
          </aside>
        </section>
      ) : null}

      {message ? <div className="uc01-admin-message uc01-admin-message--success" role="status">{message}</div> : null}
      {error ? <div className="uc01-admin-message uc01-admin-message--error" role="alert">{error}</div> : null}
    </section>
  );
}
