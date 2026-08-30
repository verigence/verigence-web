import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import {
  getProjectDeletionImpact,
  hardDeleteProjectFromImpact,
  purgeJourneyHousekeeping,
} from '../../services/audit-core/housekeeping';

interface CompleteProjectDeletionPanelProps {
  tenantId: string;
  accessToken?: string;
}

function newIdempotencyKey(tenantId: string): string {
  const suffix = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `housekeeping-project-delete:${tenantId}:${suffix}`;
}

export default function CompleteProjectDeletionPanel({
  tenantId,
  accessToken,
}: CompleteProjectDeletionPanelProps) {
  const queryClient = useQueryClient();
  const [confirmation, setConfirmation] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();
  const [idempotencyKey, setIdempotencyKey] = useState('');

  const impactQuery = useQuery({
    queryKey: ['admin-project-deletion-impact', tenantId],
    queryFn: () => getProjectDeletionImpact(tenantId, accessToken!),
    enabled: Boolean(tenantId && accessToken),
    staleTime: 0,
    retry: 1,
  });

  useEffect(() => {
    setConfirmation('');
    setMessage(undefined);
    setError(undefined);
    setIdempotencyKey('');
  }, [tenantId]);

  const impact = impactQuery.data;
  const canDelete = Boolean(
    impact
      && confirmation === tenantId
      && !deleting,
  );

  const handleDelete = async () => {
    if (!accessToken || !impact || confirmation !== tenantId) return;

    setDeleting(true);
    setMessage(undefined);
    setError(undefined);
    const operationKey = idempotencyKey || newIdempotencyKey(tenantId);
    if (!idempotencyKey) setIdempotencyKey(operationKey);

    try {
      if (impact.journeyCount > 0) {
        await purgeJourneyHousekeeping(
          tenantId,
          { scope: 'TENANT' },
          tenantId,
          accessToken,
        );
      }

      await hardDeleteProjectFromImpact(
        impact,
        operationKey,
        accessToken,
      );

      setConfirmation('');
      setIdempotencyKey('');
      await queryClient.invalidateQueries({ queryKey: ['admin-housekeeping-projects'] });
      setMessage(
        'The selected workspace was permanently deleted from Document Intelligence, Security and Audit Core. '
        + 'Select another workspace to continue housekeeping.',
      );
    } catch (cause: unknown) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Complete Project deletion could not be completed. Retry the same action safely.',
      );
    } finally {
      setDeleting(false);
    }
  };

  return (
    <section className="admin-landing__projects" aria-labelledby="complete-project-delete-title">
      <header>
        <div>
          <span className="eyebrow">Complete Project housekeeping</span>
          <h2 id="complete-project-delete-title">Delete Complete Project</h2>
          <p>
            Permanently remove the selected Project and all of its Project-owned data from
            Document Intelligence, Security and Audit Core.
          </p>
        </div>
        <button
          type="button"
          className="uc01-admin-button"
          disabled={impactQuery.isFetching || deleting}
          onClick={() => void impactQuery.refetch()}
        >
          {impactQuery.isFetching ? 'Refreshing…' : 'Refresh Impact'}
        </button>
      </header>

      {impactQuery.isPending ? (
        <div className="admin-landing__project-state">Loading complete Project deletion impact…</div>
      ) : null}
      {impactQuery.isError ? (
        <div className="admin-landing__project-state admin-landing__project-state--error">
          Project deletion impact could not be loaded.
        </div>
      ) : null}

      {impact ? (
        <div className="uc01-admin-config-grid">
          <article className="uc01-admin-config-card">
            <span className="eyebrow">Permanent deletion</span>
            <h2>Selected workspace</h2>
            <p><strong>Project status:</strong> {impact.projectStatus}</p>
            <p><strong>Journeys:</strong> {impact.journeyCount}</p>
            {impact.journeyCount > 0 ? (
              <div className="uc01-admin-message uc01-admin-message--error" role="alert">
                This Project has {impact.journeyCount} Journey{impact.journeyCount === 1 ? '' : 's'}.
                Complete deletion will first purge all Journey transactions and linked DI documents,
                then remove the Project from all three systems.
              </div>
            ) : null}
            <p>
              This action cannot be undone. To confirm, type the workspace tenant ID shown below:
            </p>
            <label className="uc03-booking-field">
              <span>{tenantId}</span>
              <input
                type="text"
                value={confirmation}
                disabled={deleting}
                autoComplete="off"
                spellCheck={false}
                onChange={(event) => setConfirmation(event.target.value)}
                placeholder="Enter exact tenant ID"
              />
            </label>
            <button
              type="button"
              className="uc01-admin-button uc01-admin-button--primary"
              disabled={!canDelete}
              onClick={() => void handleDelete()}
            >
              {deleting ? 'Deleting Project…' : 'Delete Complete Project'}
            </button>
          </article>

          <aside className="uc01-admin-capability-card">
            <span>Authority</span><strong>SuperAdmin only</strong>
            <span>Document Intelligence</span><strong>Project data + configuration deleted</strong>
            <span>Security</span><strong>Tenant + Project security data deleted</strong>
            <span>Audit Core</span><strong>Journeys + setup + masters + Project deleted</strong>
            <span>Auditability</span><strong>Administrative deletion receipt retained</strong>
            <p>
              Execution is sequenced so linked Journey data is cleared first when required,
              followed by the existing cross-system Project deletion workflow.
            </p>
          </aside>
        </div>
      ) : null}

      {message ? <div className="uc01-admin-message uc01-admin-message--success" role="status">{message}</div> : null}
      {error ? <div className="uc01-admin-message uc01-admin-message--error" role="alert">{error}</div> : null}
    </section>
  );
}
