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
        throw new Error('Current user details must be loaded before a decision.');
      }
      if (authoritativeSelected.status !== 'PENDING') {
        throw new Error('This registration is no longer pending.');
      }
      return decidePendingGlobalUser(accessToken, selectedId, status);
    },
    onSuccess: async (result) => {
      setDecisionMode(null);
      setDecisionResult({
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
          <strong>Please sign in to review pending registrations.</strong>
          <span>Use an authorized Verigence account to continue.</span>
        </div>
      )}

      {accessToken && pending.isLoading && <ApprovalLoading />}

      {accessToken && pending.isError && (
        <div className="approval-state approval-state--error" role="alert">
          <strong>Pending registrations could not be loaded.</strong>
          <span>{requestError()}</span>
          <VerigenceButton fill="outline" onClick={() => pending.refetch()}>Try Again</VerigenceButton>
        </div>
      )}

      {accessToken && decisionResult && (
        <DecisionResultPanel result={decisionResult} onBack={backToPendingUsers} />
      )}

      {accessToken && !decisionResult && !pending.isLoading && !pending.isError && users.length === 0 && !selectedId && (
        <div className="approval-state">
          <div className="approval-state__mark">✓</div>
          <strong>No registrations are waiting for approval.</strong>
          <span>New registrations that need your review will appear here.</span>
        </div>
      )}

      {accessToken && !decisionResult && !pending.isLoading && !pending.isError && showWorkspace && (
        <div className={`approval-workspace${selectedId ? ' approval-workspace--detail' : ''}`}>
          <aside className="approval-queue" aria-label="Pending Requests">
            <div className="approval-queue__header">
              <div>
                <strong>Pending Requests</strong>
                <span>Registrations waiting for your review.</span>
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
                      <small>{user.primaryEmail ?? 'Email unavailable'}</small>
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
                <span>Review the registration details before activating or rejecting the user.</span>
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
                <strong>User details could not be loaded.</strong>
                <span>{requestError()}</span>
                <VerigenceButton fill="outline" onClick={() => detail.refetch()}>Try Again</VerigenceButton>
              </div>
            </article>
          )}

          {selected && (
            <article className="approval-detail">
              <button className="approval-mobile-back" type="button" onClick={() => setSelectedId(null)}>← Pending Requests</button>

              <div className="approval-detail__intro">
                <h2>Review User</h2>
                <p>Confirm the registration details before making a decision.</p>
              </div>

              <div className="approval-user-hero">
                <span className="approval-user-hero__avatar">{initials(selected.displayName)}</span>
                <div className="approval-user-hero__identity">
                  <h3>{selected.displayName}</h3>
                  <span>{selected.primaryEmail ?? 'Email unavailable'}</span>
                  <span>{selected.primaryMobile ?? 'Mobile unavailable'}</span>
                </div>
                <span className="approval-user-hero__status">
                  {selected.status === 'PENDING' ? 'PENDING APPROVAL' : selected.status}
                </span>
              </div>

              {detail.isFetching && authoritativeSelected && (
                <p className="approval-detail__refreshing">Refreshing user details…</p>
              )}

              <dl className="approval-detail__facts">
                <Fact label="Account status" value={selected.status} />
                <Fact label="Registration status" value={selected.onboardingStatus ?? 'Pending review'} />
                <Fact label="Registered on" value={formatSubmitted(selected.createdAtUtc)} />
              </dl>

              <div className="approval-identity-note">
                <strong>Approval scope</strong>
                <span>This decision activates or rejects the user account. Project, role and business assignments are managed separately.</span>
              </div>

              {detail.isError ? (
                <div className="approval-conflict" role="alert">
                  <strong>The latest user details are unavailable.</strong>
                  <span>{requestError()}</span>
                  <VerigenceButton fill="outline" onClick={() => detail.refetch()}>Try Again</VerigenceButton>
                </div>
              ) : !authoritativeSelected ? (
                <div className="approval-conflict" role="status">
                  <strong>Checking the latest registration status.</strong>
                  <span>Approval actions will be available when the current status is confirmed.</span>
                </div>
              ) : authoritativeSelected.status !== 'PENDING' ? (
                <div className="approval-conflict" role="status">
                  <strong>This user is no longer pending.</strong>
                  <span>The registration status changed while you were reviewing it.</span>
                  <VerigenceButton fill="outline" onClick={refreshSelected}>Refresh</VerigenceButton>
                </div>
              ) : (
                <section className="approval-decision-section">
                  {decision.isError && (
                    <div className="form-alert form-alert--error" role="alert">
                      We could not complete the decision. Please review the latest status and try again.
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
                      Reject Registration
                    </VerigenceButton>
                    <VerigenceButton
                      disabled={decision.isPending}
                      onClick={() => {
                        setDecisionMode('activate');
                        decision.reset();
                      }}
                    >
                      Activate User
                    </VerigenceButton>
                  </div>

                  {decisionMode === 'activate' && (
                    <div className="approval-confirmation" role="group" aria-label="Confirm activation">
                      <div>
                        <strong>Confirm Activation</strong>
                        <span>Activate {authoritativeSelected.displayName}? Project, role and business assignments are managed separately.</span>
                      </div>
                      <div className="approval-confirmation__actions">
                        <button type="button" onClick={() => setDecisionMode(null)} disabled={decision.isPending}>Cancel</button>
                        <VerigenceButton
                          disabled={decision.isPending}
                          onClick={() => decision.mutate({ status: 'ACTIVE' })}
                        >
                          {decision.isPending ? 'Activating…' : 'Confirm Activation'}
                        </VerigenceButton>
                      </div>
                    </div>
                  )}

                  {decisionMode === 'reject' && (
                    <div className="approval-confirmation" role="group" aria-label="Confirm rejection">
                      <div>
                        <strong>Confirm Rejection</strong>
                        <span>Reject {authoritativeSelected.displayName}'s registration?</span>
                      </div>
                      <div className="approval-confirmation__actions">
                        <button type="button" onClick={() => setDecisionMode(null)} disabled={decision.isPending}>Cancel</button>
                        <VerigenceButton
                          className="verigence-button--danger"
                          fill="outline"
                          disabled={decision.isPending}
                          onClick={() => decision.mutate({ status: 'REJECTED' })}
                        >
                          {decision.isPending ? 'Rejecting…' : 'Confirm Rejection'}
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
      <span className="eyebrow">Approval Completed</span>
      <h2>{activated ? 'User Activated' : 'Registration Rejected'}</h2>
      <p>{result.displayName}</p>
      <dl>
        <div><dt>Status</dt><dd>{result.status}</dd></div>
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

function requestError(): string {
  return 'We could not complete this request. Please try again.';
}
