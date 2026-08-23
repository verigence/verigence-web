import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

import PageHeader from '../components/PageHeader';
import {
  changeGlobalUserLifecycleStatus,
  listGlobalUsers,
  type GlobalUserDirectoryItem,
  type GlobalUserLifecycleStatus,
} from '../services/security/onboardingAdmin';
import { useSessionStore } from '../store/sessionStore';

type LifecycleAction = {
  user: GlobalUserDirectoryItem;
  target: GlobalUserLifecycleStatus;
  title: string;
  confirmLabel: string;
  danger?: boolean;
};

const lifecycleStatuses = ['ALL', 'PENDING', 'ACTIVE', 'SUSPENDED', 'DISABLED', 'EXITED'] as const;

export default function AdminUsersPage() {
  const accessToken = useSessionStore((state) => state.accessToken);
  const queryClient = useQueryClient();
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<(typeof lifecycleStatuses)[number]>('ALL');
  const [action, setAction] = useState<LifecycleAction | null>(null);
  const [reason, setReason] = useState('');
  const [feedback, setFeedback] = useState('');

  const usersQuery = useQuery({
    queryKey: ['security', 'platform-users', 'all'],
    queryFn: () => listGlobalUsers(accessToken!),
    enabled: Boolean(accessToken),
  });

  const lifecycle = useMutation({
    mutationFn: ({ userId, target, reasonText }: { userId: string; target: GlobalUserLifecycleStatus; reasonText: string }) =>
      changeGlobalUserLifecycleStatus(accessToken!, userId, target, reasonText),
    onSuccess: async (result) => {
      setFeedback(`User status updated to ${result.status}.`);
      setAction(null);
      setReason('');
      await queryClient.invalidateQueries({ queryKey: ['security', 'platform-users'] });
    },
  });

  const users = usersQuery.data ?? [];
  const visibleUsers = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return users.filter((user) => {
      const matchesStatus = statusFilter === 'ALL' || user.status.toUpperCase() === statusFilter;
      const matchesQuery = !needle || [user.displayName, user.primaryEmail, user.primaryMobile, user.status]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle));
      return matchesStatus && matchesQuery;
    });
  }, [query, statusFilter, users]);

  const pendingCount = users.filter((user) => user.status.toUpperCase() === 'PENDING').length;
  const activeCount = users.filter((user) => user.status.toUpperCase() === 'ACTIVE').length;
  const suspendedCount = users.filter((user) => ['SUSPENDED', 'DISABLED'].includes(user.status.toUpperCase())).length;

  const openAction = (
    user: GlobalUserDirectoryItem,
    target: GlobalUserLifecycleStatus,
    title: string,
    confirmLabel: string,
    danger = false,
  ) => {
    setFeedback('');
    lifecycle.reset();
    setReason('');
    setAction({ user, target, title, confirmLabel, danger });
  };

  const confirmAction = () => {
    if (!action || !accessToken) return;
    lifecycle.mutate({ userId: action.user.userId, target: action.target, reasonText: reason });
  };

  return (
    <section className="uc01-admin-page" aria-label="User Administration">
      <PageHeader
        eyebrow="Administration"
        title="Users"
        description="Review the global Verigence user directory, account status and administrative access. Operational project roles remain in UC02 Project Role Mapping."
        actions={(
          <Link className="uc01-admin-button uc01-admin-button--primary" to="/admin/users/pending">
            Pending Approvals{pendingCount > 0 ? ` (${pendingCount})` : ''}
          </Link>
        )}
      />

      <div className="uc01-admin-metrics" aria-label="User status summary">
        <div><span>Total Users</span><strong>{users.length}</strong></div>
        <div><span>Active</span><strong>{activeCount}</strong></div>
        <div><span>Pending</span><strong>{pendingCount}</strong></div>
        <div><span>Suspended</span><strong>{suspendedCount}</strong></div>
      </div>

      {feedback && <div className="uc01-admin-message uc01-admin-message--success">{feedback}</div>}
      {lifecycle.isError && (
        <div className="uc01-admin-message uc01-admin-message--error">
          {lifecycle.error instanceof Error ? lifecycle.error.message : 'The user status could not be updated.'}
        </div>
      )}

      <div className="uc01-admin-toolbar">
        <label className="uc01-admin-search">
          <span>Search users</span>
          <input
            type="search"
            value={query}
            placeholder="Name, email, mobile or status"
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <label className="uc01-admin-filter">
          <span>Status</span>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as (typeof lifecycleStatuses)[number])}>
            {lifecycleStatuses.map((status) => <option key={status} value={status}>{status}</option>)}
          </select>
        </label>
        <button type="button" className="uc01-admin-button" onClick={() => usersQuery.refetch()} disabled={usersQuery.isFetching}>
          {usersQuery.isFetching ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {!accessToken && (
        <div className="uc01-admin-state uc01-admin-state--error">A Security-authenticated administrator session is required.</div>
      )}
      {accessToken && usersQuery.isLoading && <div className="uc01-admin-state">Loading users…</div>}
      {accessToken && usersQuery.isError && (
        <div className="uc01-admin-state uc01-admin-state--error">
          <strong>User directory could not be loaded.</strong>
          <span>{usersQuery.error instanceof Error ? usersQuery.error.message : 'Please try again.'}</span>
          <button type="button" className="uc01-admin-button" onClick={() => usersQuery.refetch()}>Try Again</button>
        </div>
      )}

      {accessToken && !usersQuery.isLoading && !usersQuery.isError && (
        <div className="uc01-admin-table-wrap">
          <table className="uc01-admin-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Contact</th>
                <th>Status</th>
                <th>Administrative roles</th>
                <th>Updated</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {visibleUsers.map((user) => (
                <tr key={user.userId}>
                  <td data-label="User">
                    <strong>{user.displayName}</strong>
                    <small>{user.userId}</small>
                  </td>
                  <td data-label="Contact">
                    <strong>{user.primaryEmail ?? 'Email unavailable'}</strong>
                    <small>{user.primaryMobile ?? 'Mobile unavailable'}</small>
                  </td>
                  <td data-label="Status"><StatusBadge status={user.status} /></td>
                  <td data-label="Administrative roles">
                    <Link to={`/admin/roles-permissions?userId=${encodeURIComponent(user.userId)}`}>Manage roles</Link>
                    <small>Project Admin / Module Admin</small>
                  </td>
                  <td data-label="Updated"><span>{formatDate(user.updatedAtUtc)}</span></td>
                  <td data-label="Actions">
                    <div className="uc01-admin-row-actions">
                      {user.status.toUpperCase() === 'PENDING' && (
                        <Link className="uc01-admin-button uc01-admin-button--compact" to="/admin/users/pending">Review</Link>
                      )}
                      {user.status.toUpperCase() === 'ACTIVE' && (
                        <button
                          type="button"
                          className="uc01-admin-button uc01-admin-button--compact"
                          onClick={() => openAction(user, 'SUSPENDED', 'Suspend user', 'Suspend User')}
                        >
                          Suspend
                        </button>
                      )}
                      {['SUSPENDED', 'DISABLED'].includes(user.status.toUpperCase()) && (
                        <button
                          type="button"
                          className="uc01-admin-button uc01-admin-button--compact"
                          onClick={() => openAction(user, 'ACTIVE', 'Reinstate user', 'Reinstate User')}
                        >
                          Reinstate
                        </button>
                      )}
                      {user.status.toUpperCase() !== 'EXITED' && user.status.toUpperCase() !== 'PENDING' && (
                        <button
                          type="button"
                          className="uc01-admin-button uc01-admin-button--compact uc01-admin-button--danger"
                          onClick={() => openAction(user, 'EXITED', 'Delete / offboard user', 'Delete User', true)}
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {visibleUsers.length === 0 && (
                <tr><td colSpan={6}><div className="uc01-admin-empty">No users match the current filters.</div></td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {action && (
        <div className="uc01-admin-dialog-backdrop" role="presentation">
          <section className="uc01-admin-dialog" role="dialog" aria-modal="true" aria-labelledby="uc01-user-action-title">
            <div>
              <span className="eyebrow">User Lifecycle</span>
              <h2 id="uc01-user-action-title">{action.title}</h2>
              <p>
                {action.target === 'EXITED'
                  ? 'Delete User performs controlled logical offboarding. The account is blocked from future access while historical audit references and the immutable user ID are retained.'
                  : `Change ${action.user.displayName} from ${action.user.status} to ${action.target}.`}
              </p>
            </div>
            <dl className="uc01-admin-dialog__facts">
              <div><dt>User</dt><dd>{action.user.displayName}</dd></div>
              <div><dt>Email</dt><dd>{action.user.primaryEmail ?? 'Unavailable'}</dd></div>
              <div><dt>New status</dt><dd>{action.target}</dd></div>
            </dl>
            <label className="uc01-admin-reason">
              <span>Administrative reason <small>(optional)</small></span>
              <textarea value={reason} maxLength={1000} onChange={(event) => setReason(event.target.value)} placeholder="Add context for the lifecycle change" />
            </label>
            <div className="uc01-admin-dialog__actions">
              <button type="button" className="uc01-admin-button" disabled={lifecycle.isPending} onClick={() => setAction(null)}>Cancel</button>
              <button
                type="button"
                className={`uc01-admin-button uc01-admin-button--primary${action.danger ? ' uc01-admin-button--danger-primary' : ''}`}
                disabled={lifecycle.isPending}
                onClick={confirmAction}
              >
                {lifecycle.isPending ? 'Updating…' : action.confirmLabel}
              </button>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}

function StatusBadge({ status }: { status: string }) {
  return <span className={`uc01-admin-status uc01-admin-status--${status.toLowerCase()}`}>{status}</span>;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}
