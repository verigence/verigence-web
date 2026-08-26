import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import {
  previewSecurityHousekeeping,
  purgeSecurityHousekeeping,
} from '../../services/security/housekeeping';

interface SecurityHousekeepingPanelProps {
  tenantId: string;
  accessToken?: string;
}

function todayLocalIso(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export default function SecurityHousekeepingPanel({
  tenantId,
  accessToken,
}: SecurityHousekeepingPanelProps) {
  const [cutoffDate, setCutoffDate] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [purging, setPurging] = useState(false);
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();

  const previewQuery = useQuery({
    queryKey: ['admin-security-housekeeping-preview', tenantId, cutoffDate],
    queryFn: () => previewSecurityHousekeeping(tenantId, cutoffDate, accessToken!),
    enabled: Boolean(tenantId && cutoffDate && accessToken),
    staleTime: 0,
    retry: 1,
  });

  const preview = previewQuery.data;
  const eligibleTotal = preview
    ? preview.eligible.accessContextEvaluations
      + preview.eligible.accessSessions
      + preview.eligible.securityEvents
    : 0;
  const canPurge = Boolean(
    preview
      && cutoffDate
      && confirmation === cutoffDate
      && eligibleTotal > 0
      && !purging,
  );

  const handlePurge = async () => {
    if (!accessToken || !cutoffDate || confirmation !== cutoffDate) return;
    setPurging(true);
    setMessage(undefined);
    setError(undefined);
    try {
      const result = await purgeSecurityHousekeeping(tenantId, cutoffDate, accessToken);
      await previewQuery.refetch();
      setConfirmation('');
      setMessage(
        `Security housekeeping completed through ${result.cutoffDate}. `
        + `${result.deleted.accessContextEvaluations} access evaluation${result.deleted.accessContextEvaluations === 1 ? '' : 's'}, `
        + `${result.deleted.accessSessions} session${result.deleted.accessSessions === 1 ? '' : 's'}, and `
        + `${result.deleted.securityEvents} security event${result.deleted.securityEvents === 1 ? '' : 's'} were removed.`,
      );
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'Security housekeeping could not be completed.');
    } finally {
      setPurging(false);
    }
  };

  const policy = preview?.retentionPolicy;

  return (
    <section className="admin-landing__projects" aria-labelledby="security-housekeeping-title">
      <header>
        <div>
          <span className="eyebrow">Security housekeeping</span>
          <h2 id="security-housekeeping-title">Purge Security Operational History</h2>
          <p>
            Delete Security sessions, access-context evaluations and Security events through a
            cutoff date chosen by SuperAdmin. Configured retention remains unchanged.
          </p>
        </div>
        <button
          type="button"
          className="uc01-admin-button"
          disabled={!cutoffDate || previewQuery.isFetching || purging}
          onClick={() => void previewQuery.refetch()}
        >
          {previewQuery.isFetching ? 'Refreshing…' : 'Refresh Counts'}
        </button>
      </header>

      <div className="uc01-admin-config-grid">
        <article className="uc01-admin-config-card">
          <label className="uc03-booking-field">
            <span>Delete records through date</span>
            <input
              type="date"
              value={cutoffDate}
              max={todayLocalIso()}
              disabled={purging}
              onChange={(event) => {
                setCutoffDate(event.target.value);
                setConfirmation('');
                setMessage(undefined);
                setError(undefined);
              }}
            />
          </label>
          <p>
            The selected date is inclusive. Security records dated on or before this date are
            eligible for deletion for the selected Tenant.
          </p>
        </article>

        <aside className="uc01-admin-capability-card">
          <span>Configured retention</span><strong>Reference only</strong>
          <span>Access evaluations</span>
          <strong>{policy?.accessContextRetentionDays ?? 'Not configured'}{policy?.accessContextRetentionDays ? ' days' : ''}</strong>
          <span>Access sessions</span>
          <strong>{policy?.accessSessionRetentionDays ?? 'Not configured'}{policy?.accessSessionRetentionDays ? ' days' : ''}</strong>
          <span>Security events</span>
          <strong>{policy?.securityEventRetentionDays ?? 'Not configured'}{policy?.securityEventRetentionDays ? ' days' : ''}</strong>
          <p>Manual housekeeping does not modify these retention settings.</p>
        </aside>
      </div>

      {previewQuery.isPending && cutoffDate ? (
        <div className="admin-landing__project-state">Loading Security transaction counts…</div>
      ) : null}
      {previewQuery.isError ? (
        <div className="admin-landing__project-state admin-landing__project-state--error">
          Security transaction counts could not be loaded.
        </div>
      ) : null}

      {preview ? (
        <>
          <div className="admin-landing__metrics" aria-label="Security housekeeping counts">
            <article className="admin-landing__metric">
              <span>Access Evaluations</span>
              <strong>{preview.eligible.accessContextEvaluations}</strong>
              <small>Eligible · {preview.total.accessContextEvaluations} total</small>
            </article>
            <article className="admin-landing__metric">
              <span>Access Sessions</span>
              <strong>{preview.eligible.accessSessions}</strong>
              <small>Eligible · {preview.total.accessSessions} total</small>
            </article>
            <article className="admin-landing__metric">
              <span>Security Events</span>
              <strong>{preview.eligible.securityEvents}</strong>
              <small>Eligible · {preview.total.securityEvents} total</small>
            </article>
          </div>

          <div className="uc01-admin-config-grid">
            <article className="uc01-admin-config-card">
              <span className="eyebrow">Destructive housekeeping</span>
              <h2>Confirm Security Purge</h2>
              {eligibleTotal === 0 ? (
                <p>No Security operational records are eligible through {cutoffDate}.</p>
              ) : (
                <>
                  <p>
                    This permanently deletes the eligible Security operational history through
                    <strong> {cutoffDate}</strong>. Active identity, users, roles, permissions,
                    devices, Tenant configuration and retention settings are preserved.
                  </p>
                  <p>To confirm, type the cutoff date exactly:</p>
                  <label className="uc03-booking-field">
                    <span>{cutoffDate}</span>
                    <input
                      type="text"
                      value={confirmation}
                      disabled={purging}
                      autoComplete="off"
                      spellCheck={false}
                      onChange={(event) => setConfirmation(event.target.value)}
                      placeholder="YYYY-MM-DD"
                    />
                  </label>
                  <button
                    type="button"
                    className="uc01-admin-button uc01-admin-button--primary"
                    disabled={!canPurge}
                    onClick={() => void handlePurge()}
                  >
                    {purging ? 'Purging…' : 'Purge Security History'}
                  </button>
                </>
              )}
            </article>

            <aside className="uc01-admin-capability-card">
              <span>Deleted</span><strong>Operational Security history through cutoff</strong>
              <span>Preserved</span><strong>Users + RBAC + devices + Tenant configuration</strong>
              <p>
                A fresh aggregate Security housekeeping event is written after the purge so the
                manual administrative action itself remains auditable.
              </p>
            </aside>
          </div>
        </>
      ) : null}

      {message ? <div className="uc01-admin-message uc01-admin-message--success" role="status">{message}</div> : null}
      {error ? <div className="uc01-admin-message uc01-admin-message--error" role="alert">{error}</div> : null}
    </section>
  );
}
