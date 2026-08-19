import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import VerigenceButton from '../components/VerigenceButton';
import {
  decidePendingGlobalUser,
  getGlobalUser,
  listPendingGlobalUsers,
  type GlobalUserDirectoryItem,
  type OnboardingDecision,
} from '../services/security/onboardingAdmin';
import { useSessionStore } from '../store/sessionStore';

type DecisionMode = 'activate' | 'reject' | null;

export default function ApprovalQueuePage() {
  const queryClient = useQueryClient();
  const accessToken = useSessionStore((state) => state.accessToken);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [decisionMode, setDecisionMode] = useState<DecisionMode>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [decisionMessage, setDecisionMessage] = useState<string>();

  const pending = useQuery({
    queryKey: ['security', 'platform-users', 'PENDING'],
    queryFn: () => listPendingGlobalUsers(accessToken!),
    enabled: Boolean(accessToken),
  });

  const users = pending.data ?? [];
  const effectiveSelectedId = selectedId ?? users[0]?.userId ?? null;

  const detail = useQuery({
    queryKey: ['security', 'platform-users', effectiveSelectedId],
    queryFn: () => getGlobalUser(accessToken!, effectiveSelectedId!),
    enabled: Boolean(accessToken && effectiveSelectedId),
  });

  const selected = detail.data ?? users.find((user) => user.userId === effectiveSelectedId) ?? null;

  const decision = useMutation({
    mutationFn: ({ status, reason }: { status: OnboardingDecision; reason?: string }) => {
      if (!accessToken || !effectiveSelectedId) {
        throw new Error('An authenticated Security session is required.');
      }
      return decidePendingGlobalUser(accessToken, effectiveSelectedId, status, reason);
    },
    onSuccess: async (result) => {
      setDecisionMessage(
        result.status === 'ACTIVE'
          ? 'The user is now ACTIVE.'
          : 'The registration has been REJECTED.',
      );
      setDecisionMode(null);
      setRejectReason('');
      setSelectedId(null);
      await queryClient.invalidateQueries({ queryKey: ['security', 'platform-users', 'PENDING'] });
      queryClient.removeQueries({ queryKey: ['security', 'platform-users', result.userId] });
    },
    onError: async () => {
      await queryClient.invalidateQueries({ queryKey: ['security', 'platform-users', 'PENDING'] });
      if (effectiveSelectedId) {
        await queryClient.invalidateQueries({ queryKey: ['security', 'platform-users', effectiveSelectedId] });
      }
    },
  });

  const selectUser = (user: GlobalUserDirectoryItem) => {
    setSelectedId(user.userId);
    setDecisionMode(null);
    setRejectReason('');
    setDecisionMessage(undefined);
    decision.reset();
  };

  return (
    <section className="page-stack approval-page">
      <header className="approval-heading">
        <div>
          <span className="eyebrow">Administration · User onboarding</span>
          <h1>Pending user approval</h1>
          <p>
            Review the global Verigence USER created after email verification, then activate or reject
            the registration. Tenant, operating role, Dealer/Outlet and authorization scope are assigned
            separately and are not part of this decision.
          </p>
        </div>
        <div className="approval-heading__count"><span>Pending</span><strong>{users.length}</strong></div>
      </header>

      {!accessToken && (
        <div className="approval-state approval-state--error" role="alert">
          <strong>Security authentication is required for onboarding decisions.</strong>
          <span>
            This screen is wired to the protected Security SuperAdmin APIs. The canonical login/token
            integration is intentionally completed in the later login use case; Web preview authentication
            is not treated as authorization.
          </span>
        </div>
      )}

      {accessToken && pending.isLoading && <ApprovalLoading />}

      {accessToken && pending.isError && (
        <div className="approval-state approval-state--error" role="alert">
          <strong>Pending users could not be loaded.</strong>
          <span>{requestError(pending.error)}</span>
          <VerigenceButton fill="outline" onClick={() => pending.refetch()}>Try again</VerigenceButton>
        </div>
      )}

      {accessToken && !pending.isLoading && !pending.isError && users.length === 0 && (
        <div className="approval-state">
          <div className="approval-state__mark">✓</div>
          <strong>No registrations are waiting for approval.</strong>
          <span>New verified registrations will appear here while their global USER status is PENDING.</span>
        </div>
      )}

      {accessToken && selected && (
        <div className="approval-workspace">
          <aside className="approval-queue" aria-label="Pending users">
            <div className="approval-queue__header">
              <div>
                <strong>Pending users</strong>
                <span>Select a global USER to review.</span>
              </div>
            </div>
            <div className="approval-queue__list">
              {users.map((user) => {
                const active = user.userId === effectiveSelectedId;
                return (
                  <button
                    key={user.userId}
                    type="button"
                    className={`approval-request${active ? ' approval-request--active' : ''}`}
                    onClick={() => selectUser(user)}
                  >
                    <span className="approval-request__avatar">{initials(user.displayName)}</span>
                    <span className="approval-request__identity">
                      <strong>{user.displayName}</strong>
                      <small>{user.primaryEmail ?? 'No email returned'}</small>
                    </span>
                    <span className="approval-request__meta">
                      <strong>{user.status}</strong>
                      <small>{formatSubmitted(user.createdAtUtc)}</small>
                    </span>
                  </button>
                );
              })}
            </div>
          </aside>

          <article className="approval-detail">
            <div className="approval-detail__topline">
              <div>
                <span className="status-chip">Pending approval</span>
                <h2>{selected.displayName}</h2>
                <p>{selected.primaryEmail ?? 'No email returned'}</p>
              </div>
              <span className="approval-detail__reference">{selected.userId}</span>
            </div>

            {detail.isFetching && <p className="approval-detail__refreshing">Refreshing authoritative USER detail…</p>}
            {detail.isError && (
              <div className="form-alert form-alert--error" role="alert">
                USER detail could not be refreshed: {requestError(detail.error)}
              </div>
            )}

            <dl className="approval-detail__facts">
              <Fact label="Mobile" value={selected.primaryMobile ?? 'Not returned'} />
              <Fact label="USER status" value={selected.status} />
              <Fact label="Onboarding status" value={selected.onboardingStatus ?? 'Not returned'} />
              <Fact label="Created" value={formatSubmitted(selected.createdAtUtc)} />
            </dl>

            <section className="approval-decision-section">
              <div className="approval-section-heading">
                <span>Decision</span>
                <div>
                  <h3>Activate or reject registration</h3>
                  <p>
                    Security is authoritative for the transition. This action does not assign a Tenant,
                    operating role, Dealer/Outlet or permission scope.
                  </p>
                </div>
              </div>

              {decisionMessage && <div className="approval-success" role="status">{decisionMessage}</div>}
              {decision.isError && (
                <div className="form-alert form-alert--error" role="alert">
                  The decision was not completed. {requestError(decision.error)} The pending list and USER detail were refreshed.
                </div>
              )}

              <div className="approval-actions approval-actions--decision-only">
                <div className="approval-actions__approve">
                  <strong>Activate</strong>
                  <small>Transition the global USER from PENDING to ACTIVE.</small>
                  <VerigenceButton
                    expand="block"
                    disabled={decision.isPending || selected.status !== 'PENDING'}
                    onClick={() => {
                      setDecisionMode('activate');
                      setDecisionMessage(undefined);
                      decision.reset();
                    }}
                  >
                    Activate user
                  </VerigenceButton>
                </div>

                <div className="approval-actions__reject">
                  <strong>Reject</strong>
                  <small>Transition the global USER from PENDING to REJECTED.</small>
                  <VerigenceButton
                    className="verigence-button--danger"
                    fill="outline"
                    disabled={decision.isPending || selected.status !== 'PENDING'}
                    onClick={() => {
                      setDecisionMode('reject');
                      setDecisionMessage(undefined);
                      decision.reset();
                    }}
                  >
                    Reject registration
                  </VerigenceButton>
                </div>
              </div>

              {decisionMode === 'activate' && (
                <div className="approval-confirmation" role="group" aria-label="Confirm activation">
                  <div>
                    <strong>Confirm activation</strong>
                    <span>
                      Activate {selected.displayName}? Security will perform PENDING → ACTIVE. No role or business scope is assigned here.
                    </span>
                  </div>
                  <div className="approval-confirmation__actions">
                    <button type="button" onClick={() => setDecisionMode(null)} disabled={decision.isPending}>Cancel</button>
                    <VerigenceButton
                      disabled={decision.isPending}
                      onClick={() => decision.mutate({ status: 'ACTIVE' })}
                    >
                      {decision.isPending ? 'Activating…' : 'Confirm activation'}
                    </VerigenceButton>
                  </div>
                </div>
              )}

              {decisionMode === 'reject' && (
                <div className="approval-confirmation" role="group" aria-label="Confirm rejection">
                  <div>
                    <strong>Confirm rejection</strong>
                    <span>
                      Reject {selected.displayName}? Security will perform PENDING → REJECTED.
                    </span>
                  </div>
                  <label className="approval-confirmation__reason" htmlFor="onboarding-rejection-reason">
                    <span>Reason (optional)</span>
                    <textarea
                      id="onboarding-rejection-reason"
                      value={rejectReason}
                      onChange={(event) => setRejectReason(event.target.value)}
                      maxLength={1000}
                      rows={3}
                      placeholder="Optional administrative reason"
                    />
                  </label>
                  <div className="approval-confirmation__actions">
                    <button type="button" onClick={() => setDecisionMode(null)} disabled={decision.isPending}>Cancel</button>
                    <VerigenceButton
                      className="verigence-button--danger"
                      fill="outline"
                      disabled={decision.isPending}
                      onClick={() => decision.mutate({ status: 'REJECTED', reason: rejectReason })}
                    >
                      {decision.isPending ? 'Rejecting…' : 'Confirm rejection'}
                    </VerigenceButton>
                  </div>
                </div>
              )}
            </section>
          </article>
        </div>
      )}
    </section>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return <div><dt>{label}</dt><dd>{value}</dd></div>;
}

function ApprovalLoading() {
  return <div className="approval-loading" aria-label="Loading pending users"><div /><div /><div /></div>;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return `${parts[0][0] ?? ''}${parts.length > 1 ? parts.at(-1)?.[0] ?? '' : ''}`.toUpperCase();
}

function formatSubmitted(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function requestError(error: unknown): string {
  return error instanceof Error ? error.message : 'Security request failed. Please try again.';
}
