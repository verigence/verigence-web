import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

import PageHeader from '../components/PageHeader';
import {
  changeGlobalUserLifecycleStatus,
  hardDeleteGlobalUser,
  listGlobalUsers,
  requestGlobalUserDeletion,
  type GlobalUserDirectoryItem,
  type GlobalUserLifecycleStatus,
} from '../services/security/onboardingAdmin';
import { useSessionStore } from '../store/sessionStore';

type StatusAction = {
  kind: 'status';
  user: GlobalUserDirectoryItem;
  target: GlobalUserLifecycleStatus;
  title: string;
  confirmLabel: string;
};

type DeleteAction = {
  kind: 'delete';
  user: GlobalUserDirectoryItem;
  title: string;
  confirmLabel: string;
};

type LifecycleAction = StatusAction | DeleteAction;

const lifecycleStatuses = ['ALL', 'PENDING', 'REJECTED', 'ACTIVE', 'SUSPENDED', 'DISABLED'] as const;

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
    onError: async () => {
      await queryClient.invalidateQueries({ queryKey: ['security', 'platform-users'] });
    },
  });

  const deletion = useMutation({
    mutationFn: async ({ user, reasonText }: { user: GlobalUserDirectoryItem; reasonText: string }) => {
      const current = user.status.toUpperCase();
      let requestedInThisOperation = false;

      if (current === 'ACTIVE' || current === 'REJECTED') {
        await requestGlobalUserDeletion(accessToken!, user.userId, reasonText);
        requestedInThisOperation = true;
      } else if (current !== 'DISABLED') {
        throw new Error('Only an ACTIVE, REJECTED or DISABLED user can be permanently deleted.');
      }

      try {
        return await hardDeleteGlobalUser(accessToken!, user.userId);
      } catch (error) {
        if (requestedInThisOperation) {
          const detail = error instanceof Error ? error.message : 'Security hard delete failed.';
          throw new Error(`The deletion request was recorded, but permanent deletion did not complete. ${detail}`);
        }
        throw error;
      }
    },
    onSuccess: async () => {
      setFeedback('User permanently deleted.');
      setAction(null);
      setReason('');
      await queryClient.invalidateQueries({ queryKey: ['security', 'platform-users'] });
    },
    onSettled: async () => {
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
  const suspendedCount = users.filter((user) => user.status.toUpperCase() === 'SUSPENDED').length;

  const resetActionState = () => {
    setFeedback('');
    lifecycle.reset();
    deletion.reset();
    setReason('');
  };

  const openStatusAction = (
    user: GlobalUserDirectoryItem,
    target: GlobalUserLifecycleStatus,
    title: string,
    confirmLabel: string,
  ) => {
    resetActionState();
    setAction({ kind: 'status', user, target, title, confirmLabel });
  };

  const openDeleteAction = (user: GlobalUserDirectoryItem) => {
    resetActionState();
    setAction({
      kind: 'delete',
      user,
      title: user.status.toUpperCase() === 'DISABLED' ? 'Complete user deletion' : 'Permanently delete user',
      confirmLabel: 'Delete User',
    });
  };

  const confirmAction = () => {
    if (!action || !accessToken) return;
    if (action.kind === 'delete') {
      deletion.mutate({ user: action.user, reasonText: reason });
      return;
    }
    lifecycle.mutate({ userId: action.user.userId, target: action.target, reasonText: reason });
  };

  const actionError = lifecycle.isError
    ? lifecycle.error
    : deletion.isError
      ? deletion.error
      : null;
  const actionPending = lifecycle.isPending || deletion.isPending;

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
      {actionError && (
        <div className="uc01-admin-message uc01-admin-message--error">
          {actionError instanceof Error ? actionError.message : 'The user lifecycle operation could not be completed.'}
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
              {visibleUsers.map((user) => {
                const currentStatus = user.status.toUpperCase();
                return (
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
                        {currentStatus === 'PENDING' && (
                          <Link className="uc01-admin-button uc01-admin-button--compact" to="/admin/users/pending">Review</Link>
                        )}
                        {currentStatus === 'ACTIVE' && (
                          <button
                            type="button"
                            className="uc01-admin-button uc01-admin-button--compact"
                            onClick={() => openStatusAction(user, 'SUSPENDED', 'Suspend user', 'Suspend User')}
                          >
                            Suspend
                          </button>
                        )}
                        {['SUSPENDED', 'DISABLED'].includes(currentStatus) && (
                          <button
                            type="button"
                            className="uc01-admin-button uc01-admin-button--compact"
                            onClick={() => openStatusAction(user, 'ACTIVE', 'Reinstate user', 'Reinstate User')}
                          >
                            Reinstate
                          </button>
                        )}
                        {currentStatus === 'REJECTED' && (
                          <button
                            type="button"
                            className="uc01-admin-button uc01-admin-button--compact"
                            onClick={() => openStatusAction(user, 'ACTIVE', 'Activate rejected user', 'Activate User')}
                          >
                            Activate
                          </button>
                        )}
                        {['ACTIVE', 'REJECTED', 'DISABLED'].includes(currentStatus) && (
                          <button
                            type="button"
                            className="uc01-admin-button uc01-admin-button--compact uc01-admin-button--danger"
                            onClick={() => openDeleteAction(user)}
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
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
                {action.kind === 'delete'
                  ? action.user.status.toUpperCase() === 'DISABLED'
                    ? `Complete the existing deletion request for ${action.user.displayName}. Security will permanently remove the live USER and Clerk identity while retaining approved audit/tombstone evidence.`
                    : action.user.status.toUpperCase() === 'REJECTED'
                      ? `Permanently delete rejected user ${action.user.displayName}. Security will record a governed deletion request and then remove the live USER and Clerk identity while retaining approved audit/tombstone evidence.`
                      : `Permanently delete ${action.user.displayName}. Security will first disable access and record the deletion request, then the SuperAdmin hard-delete will remove the live USER and Clerk identity while retaining approved audit/tombstone evidence.`
                  : `Change ${action.user.displayName} from ${action.user.status} to ${action.target}.`}
              </p>
            </div>
            <dl className="uc01-admin-dialog__facts">
              <div><dt>User</dt><dd>{action.user.displayName}</dd></div>
              <div><dt>Email</dt><dd>{action.user.primaryEmail ?? 'Unavailable'}</dd></div>
              <div><dt>Result</dt><dd>{action.kind === 'delete' ? 'DELETED' : action.target}</dd></div>
            </dl>
            <label className="uc01-admin-reason">
              <span>{action.kind === 'delete' ? 'Deletion reason' : 'Administrative reason'} <small>(optional)</small></span>
              <textarea value={reason} maxLength={1000} onChange={(event) => setReason(event.target.value)} placeholder="Add context for the lifecycle change" />
            </label>
            <div className="uc01-admin-dialog__actions">
              <button type="button" className="uc01-admin-button" disabled={actionPending} onClick={() => setAction(null)}>Cancel</button>
              <button
                type="button"
                className={`uc01-admin-button uc01-admin-button--primary${action.kind === 'delete' ? ' uc01-admin-button--danger-primary' : ''}`}
                disabled={actionPending}
                onClick={confirmAction}
              >
                {actionPending ? (action.kind === 'delete' ? 'Deleting…' : 'Updating…') : action.confirmLabel}
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
