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
type DecisionResult = {
  userId: string;
  displayName: string;
  status: OnboardingDecision;
};

export default function ApprovalQueuePage() {
  const queryClient = useQueryClient();
  const accessToken = useSessionStore((state) => state.accessToken);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [decisionMode, setDecisionMode] = useState<DecisionMode>(null);
  const [decisionResult, setDecisionResult] = useState<DecisionResult | null>(null);

  const pending = useQuery({
    queryKey: ['security', 'platform-users', 'PENDING'],
    queryFn: () => listPendingGlobalUsers(accessToken!),
    enabled: Boolean(accessToken),
  });

  const users = pending.data ?? [];

  const detail = useQuery({
    queryKey: ['security', 'platform-users', selectedId],
    queryFn: () => getGlobalUser(accessToken!, selectedId!),
    enabled: Boolean(accessToken && selectedId),
  });

  const listSelected = users.find((user) => user.userId === selectedId) ?? null;
  const authoritativeSelected = detail.data ?? null;
  const selected = authoritativeSelected ?? listSelected;

  const decision = useMutation({
    mutationFn: ({ status }: { status: OnboardingDecision }) => {
      if (!accessToken || !selectedId || !authoritativeSelected) {
        throw new Error('The authoritative Security USER detail must be loaded before a decision.');
      }
      if (authoritativeSelected.status !== 'PENDING') {
        throw new Error(`This USER is no longer PENDING. Current status: ${authoritativeSelected.status}.`);
      }
      return decidePendingGlobalUser(accessToken, selectedId, status);
    },
    onSuccess: async (result) => {
      setDecisionMode(null);
      setDecisionResult({
        userId: result.userId,
        displayName: authoritativeSelected?.displayName ?? 'Verigence user',
        status: result.status === 'REJECTED' ? 'REJECTED' : 'ACTIVE',
      });
      setSelectedId(null);
      await queryClient.invalidateQueries({ queryKey: ['security', 'platform-users', 'PENDING'] });
      queryClient.removeQueries({ queryKey: ['security', 'platform-users', result.userId] });
    },
    onError: async () => {
      await queryClient.invalidateQueries({ queryKey: ['security', 'platform-users', 'PENDING'] });
      if (selectedId) {
        await queryClient.invalidateQueries({ queryKey: ['security', 'platform-users', selectedId] });
      }
    },
  });

  const selectUser = (user: GlobalUserDirectoryItem) => {
    setSelectedId(user.userId);
    setDecisionMode(null);
    setDecisionResult(null);
    decision.reset();
  };

  const backToPendingUsers = async () => {
    setDecisionResult(null);
    setSelectedId(null);
    setDecisionMode(null);
    decision.reset();
    await pending.refetch();
  };

  const refreshSelected = async () => {
    await pending.refetch();
    if (selectedId) await detail.refetch();
  };

  const showWorkspace = Boolean(selectedId || users.length > 0);

  return (
    <section className="approval-page" aria-label="Pending Approval">
      <div className="approval-tabs" role="tablist" aria-label="Pending Approval">
        <button
          id="pending-requests-tab"
          className="approval-tab approval-tab--active"
          type="button"
          role="tab"
          aria-selected="true"
        >
          Pending Requests
        </button>
        <button
          className="approval-tab"
          type="button"
          role="tab"
          aria-selected="false"
          aria-disabled="true"
          disabled
        >
          Current Employees &amp; Engagements
        </button>
      </div>

      {!accessToken && (
        <div className="approval-state approval-state--error" role="alert">
          <strong>Your Security session is required to review pending users.</strong>
          <span>Sign in with an authorized Verigence account before opening Pending Approval.</span>
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

      {accessToken && decisionResult && (
        <DecisionResultPanel result={decisionResult} onBack={backToPendingUsers} />
      )}

      {accessToken && !decisionResult && !pending.isLoading && !pending.isError && users.length === 0 && !selectedId && (
        <div className="approval-state">
          <div className="approval-state__mark">✓</div>
          <strong>No registrations are waiting for approval.</strong>
          <span>New verified registrations will appear here while their global USER status is PENDING.</span>
        </div>
      )}

      {accessToken && !decisionResult && !pending.isLoading && !pending.isError && showWorkspace && (
        <div className={`approval-workspace${selectedId ? ' approval-workspace--detail' : ''}`}>
          <aside className="approval-queue" aria-label="Pending Requests">
            <div className="approval-queue__header">
              <div>
                <strong>Pending Requests</strong>
                <span>Verified registrations waiting for SuperAdmin review.</span>
              </div>
              <span className="approval-queue__count">{users.length}</span>
            </div>
            <div className="approval-queue__list">
              {users.map((user) => {
                const active = user.userId === selectedId;
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

          {!selectedId && (
            <article className="approval-detail approval-detail--placeholder">
              <div className="approval-detail-placeholder">
                <div className="approval-detail-placeholder__mark">→</div>
                <strong>Select a pending user</strong>
                <span>
                  Review identity details before activating or rejecting the global Verigence USER.
                  Project, role and business scope are handled separately.
                </span>
              </div>
            </article>
          )}

          {selectedId && !selected && detail.isLoading && (
            <article className="approval-detail"><ApprovalLoading /></article>
          )}

          {selectedId && !selected && detail.isError && (
            <article className="approval-detail">
              <button className="approval-mobile-back" type="button" onClick={() => setSelectedId(null)}>← Pending Requests</button>
              <div className="approval-state approval-state--error" role="alert">
                <strong>USER detail could not be loaded.</strong>
                <span>{requestError(detail.error)}</span>
                <VerigenceButton fill="outline" onClick={() => detail.refetch()}>Try again</VerigenceButton>
              </div>
            </article>
          )}

          {selected && (
            <article className="approval-detail">
              <button className="approval-mobile-back" type="button" onClick={() => setSelectedId(null)}>← Pending Requests</button>

              <div className="approval-detail__intro">
                <h2>Review User</h2>
                <p>Security USER detail is authoritative for this decision.</p>
              </div>

              <div className="approval-user-hero">
                <span className="approval-user-hero__avatar">{initials(selected.displayName)}</span>
                <div className="approval-user-hero__identity">
                  <h3>{selected.displayName}</h3>
                  <span>{selected.primaryEmail ?? 'No email returned'}</span>
                  <span>{selected.primaryMobile ?? 'Not returned'}</span>
                </div>
                <span className="approval-user-hero__status">
                  {selected.status === 'PENDING' ? 'PENDING APPROVAL' : selected.status}
                </span>
              </div>

              {detail.isFetching && authoritativeSelected && (
                <p className="approval-detail__refreshing">Refreshing authoritative USER detail…</p>
              )}

              <dl className="approval-detail__facts">
                <Fact label="USER status" value={selected.status} />
                <Fact label="Onboarding status" value={selected.onboardingStatus ?? 'Not returned'} />
                <Fact label="Registered on" value={formatSubmitted(selected.createdAtUtc)} />
                <Fact label="USER ID" value={selected.userId} />
              </dl>

              <div className="approval-identity-note">
                <strong>Identity-only onboarding decision</strong>
                <span>
                  This decision activates or rejects the global Verigence USER only. Project, role and
                  business scope are assigned separately.
                </span>
              </div>

              {detail.isError ? (
                <div className="approval-conflict" role="alert">
                  <strong>Authoritative USER detail is unavailable.</strong>
                  <span>{requestError(detail.error)}</span>
                  <VerigenceButton fill="outline" onClick={() => detail.refetch()}>Try again</VerigenceButton>
                </div>
              ) : !authoritativeSelected ? (
                <div className="approval-conflict" role="status">
                  <strong>Loading authoritative USER detail.</strong>
                  <span>Activation and rejection remain unavailable until Security confirms the current USER state.</span>
                </div>
              ) : authoritativeSelected.status !== 'PENDING' ? (
                <div className="approval-conflict" role="status">
                  <strong>This user is no longer pending.</strong>
                  <span>Current Security status: {authoritativeSelected.status}</span>
                  <VerigenceButton fill="outline" onClick={refreshSelected}>Refresh</VerigenceButton>
                </div>
              ) : (
                <section className="approval-decision-section">
                  {decision.isError && (
                    <div className="form-alert form-alert--error" role="alert">
                      The decision was not completed. {requestError(decision.error)} The authoritative USER state was refreshed.
                    </div>
                  )}

                  <div className="approval-actions approval-actions--frozen">
                    <VerigenceButton
                      className="verigence-button--danger"
                      fill="outline"
                      disabled={decision.isPending}
                      onClick={() => {
                        setDecisionMode('reject');
                        decision.reset();
                      }}
                    >
                      Reject registration
                    </VerigenceButton>
                    <VerigenceButton
                      disabled={decision.isPending}
                      onClick={() => {
                        setDecisionMode('activate');
                        decision.reset();
                      }}
                    >
                      Activate user
                    </VerigenceButton>
                  </div>

                  {decisionMode === 'activate' && (
                    <div className="approval-confirmation" role="group" aria-label="Confirm activation">
                      <div>
                        <strong>Confirm activation</strong>
                        <span>
                          Activate {authoritativeSelected.displayName}? Security will perform PENDING → ACTIVE. No role or business scope is assigned here.
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
                          Reject {authoritativeSelected.displayName}? Security will perform PENDING → REJECTED.
                        </span>
                      </div>
                      <div className="approval-confirmation__actions">
                        <button type="button" onClick={() => setDecisionMode(null)} disabled={decision.isPending}>Cancel</button>
                        <VerigenceButton
                          className="verigence-button--danger"
                          fill="outline"
                          disabled={decision.isPending}
                          onClick={() => decision.mutate({ status: 'REJECTED' })}
                        >
                          {decision.isPending ? 'Rejecting…' : 'Confirm rejection'}
                        </VerigenceButton>
                      </div>
                    </div>
                  )}
                </section>
              )}
            </article>
          )}
        </div>
      )}
    </section>
  );
}

function DecisionResultPanel({ result, onBack }: { result: DecisionResult; onBack: () => void | Promise<void> }) {
  const activated = result.status === 'ACTIVE';
  return (
    <div className="approval-result" role="status">
      <div className="approval-result__mark">✓</div>
      <span className="eyebrow">Onboarding decision completed</span>
      <h2>{activated ? 'User activated' : 'User rejected'}</h2>
      <p>{result.displayName}</p>
      <dl>
        <div><dt>Status</dt><dd>{result.status}</dd></div>
        <div><dt>USER ID</dt><dd>{result.userId}</dd></div>
      </dl>
      <VerigenceButton onClick={onBack}>Back to Pending Requests</VerigenceButton>
    </div>
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
