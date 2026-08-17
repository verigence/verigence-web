import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import VerigenceButton from '../components/VerigenceButton';
import type { AccessRequest, OperationalRoleKey } from '../features/onboarding/types';
import {
  approveAccessRequest,
  listPendingAccessRequests,
  rejectAccessRequest,
} from '../services/audit-core/onboarding';

const roles: Array<{ key: OperationalRoleKey; label: string; description: string }> = [
  {
    key: 'PC',
    label: 'Process Consultant',
    description: 'Capture journeys and source evidence; no formal verification-write authority.',
  },
  {
    key: 'TL',
    label: 'Team Lead',
    description: 'Review evidence, verification results, findings and operational work.',
  },
  {
    key: 'PM',
    label: 'Project Manager',
    description: 'Project-level review, governance, escalations and management operations.',
  },
  {
    key: 'CRM',
    label: 'CRM Operator',
    description: 'Customer follow-up and CRM operations with read-oriented audit access.',
  },
];

export default function ApprovalQueuePage() {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [roleKey, setRoleKey] = useState<OperationalRoleKey | ''>('');
  const [rejectReason, setRejectReason] = useState('');

  const pending = useQuery({
    queryKey: ['onboarding', 'access-requests', 'PENDING'],
    queryFn: listPendingAccessRequests,
  });

  const requests = pending.data ?? [];
  const selected = useMemo(
    () => requests.find((request) => request.requestId === selectedId) ?? requests[0] ?? null,
    [requests, selectedId],
  );

  const refreshQueue = async () => {
    setRoleKey('');
    setRejectReason('');
    await queryClient.invalidateQueries({ queryKey: ['onboarding', 'access-requests', 'PENDING'] });
  };

  const approve = useMutation({
    mutationFn: ({ requestId, approvedRole }: { requestId: string; approvedRole: OperationalRoleKey }) =>
      approveAccessRequest(requestId, approvedRole),
    onSuccess: refreshQueue,
  });

  const reject = useMutation({
    mutationFn: ({ requestId, reason }: { requestId: string; reason: string }) =>
      rejectAccessRequest(requestId, reason),
    onSuccess: refreshQueue,
  });

  const selectRequest = (request: AccessRequest) => {
    setSelectedId(request.requestId);
    setRoleKey('');
    setRejectReason('');
    approve.reset();
    reject.reset();
  };

  return (
    <section className="page-stack approval-page">
      <header className="approval-heading">
        <div>
          <span className="eyebrow">Administration · User onboarding</span>
          <h1>Access approval</h1>
          <p>
            Validate the requester and Tenant, then assign exactly one approved operating role. A
            pending request has no application permissions.
          </p>
        </div>
        <div className="approval-heading__count">
          <span>Pending</span>
          <strong>{requests.length}</strong>
        </div>
      </header>

      {pending.isLoading && <ApprovalLoading />}

      {pending.isError && (
        <div className="approval-state approval-state--error" role="alert">
          <strong>Pending requests could not be loaded.</strong>
          <span>The Approval Queue is wired to the Audit Core onboarding API contract.</span>
        </div>
      )}

      {!pending.isLoading && !pending.isError && requests.length === 0 && (
        <div className="approval-state">
          <div className="approval-state__mark">✓</div>
          <strong>No access requests are waiting.</strong>
          <span>New sign-up requests will appear here after they enter PENDING status.</span>
        </div>
      )}

      {selected && (
        <div className="approval-workspace">
          <aside className="approval-queue" aria-label="Pending access requests">
            <div className="approval-queue__header">
              <div>
                <strong>Pending requests</strong>
                <span>Oldest requests should be reviewed first.</span>
              </div>
            </div>

            <div className="approval-queue__list">
              {requests.map((request) => {
                const active = request.requestId === selected.requestId;
                return (
                  <button
                    key={request.requestId}
                    type="button"
                    className={`approval-request${active ? ' approval-request--active' : ''}`}
                    onClick={() => selectRequest(request)}
                  >
                    <span className="approval-request__avatar">{initials(request.fullName)}</span>
                    <span className="approval-request__identity">
                      <strong>{request.fullName}</strong>
                      <small>{request.workEmail}</small>
                    </span>
                    <span className="approval-request__meta">
                      <strong>{request.tenantCode}</strong>
                      <small>{formatSubmitted(request.submittedAt)}</small>
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
                <h2>{selected.fullName}</h2>
                <p>{selected.workEmail}</p>
              </div>
              <span className="approval-detail__reference">{selected.requestId}</span>
            </div>

            <dl className="approval-detail__facts">
              <Fact label="Organization / Tenant" value={selected.tenantCode} />
              <Fact label="Employee ID" value={selected.employeeId || 'Not provided'} />
              <Fact label="Mobile" value={selected.mobileNumber || 'Not provided'} />
              <Fact label="Submitted" value={formatSubmitted(selected.submittedAt)} />
            </dl>

            <section className="approval-role-section">
              <div className="approval-section-heading">
                <span>Step 1</span>
                <div>
                  <h3>Assign operating role</h3>
                  <p>
                    The requester did not choose a role. Select the role only after validating their
                    job responsibility.
                  </p>
                </div>
              </div>

              <div className="approval-role-grid">
                {roles.map((role) => (
                  <label
                    key={role.key}
                    className={`approval-role${roleKey === role.key ? ' approval-role--selected' : ''}`}
                  >
                    <input
                      type="radio"
                      name="approved-role"
                      value={role.key}
                      checked={roleKey === role.key}
                      onChange={() => setRoleKey(role.key)}
                    />
                    <span className="approval-role__code">{role.key}</span>
                    <span className="approval-role__copy">
                      <strong>{role.label}</strong>
                      <small>{role.description}</small>
                    </span>
                  </label>
                ))}
              </div>

              <div className="approval-guardrail">
                <strong>Privilege guardrail</strong>
                <span>
                  SUPER_ADMIN and TENANT_ADMIN are intentionally unavailable in ordinary sign-up
                  approval. Privileged administration access requires a separate controlled process.
                </span>
              </div>
            </section>

            <section className="approval-decision-section">
              <div className="approval-section-heading">
                <span>Step 2</span>
                <div>
                  <h3>Make decision</h3>
                  <p>Approval and rejection are explicit audited decisions.</p>
                </div>
              </div>

              {(approve.isError || reject.isError) && (
                <div className="form-alert form-alert--error" role="alert">
                  The decision could not be saved. No access change has been assumed.
                </div>
              )}

              <div className="approval-actions">
                <div className="approval-actions__approve">
                  <VerigenceButton
                    expand="block"
                    disabled={!roleKey || approve.isPending || reject.isPending}
                    onClick={() => {
                      if (roleKey) {
                        approve.mutate({ requestId: selected.requestId, approvedRole: roleKey });
                      }
                    }}
                  >
                    {approve.isPending ? 'Approving…' : 'Approve access'}
                  </VerigenceButton>
                  <small>
                    Approval sends the selected role to the backend activation flow; it does not grant
                    permissions in browser code.
                  </small>
                </div>

                <div className="approval-actions__reject">
                  <label htmlFor="reject-reason">Rejection reason</label>
                  <textarea
                    id="reject-reason"
                    value={rejectReason}
                    onChange={(event) => setRejectReason(event.target.value)}
                    placeholder="Reason shown in the approval audit record"
                    rows={3}
                  />
                  <VerigenceButton
                    className="verigence-button--danger"
                    fill="outline"
                    disabled={rejectReason.trim().length < 3 || approve.isPending || reject.isPending}
                    onClick={() =>
                      reject.mutate({
                        requestId: selected.requestId,
                        reason: rejectReason.trim(),
                      })
                    }
                  >
                    {reject.isPending ? 'Rejecting…' : 'Reject request'}
                  </VerigenceButton>
                </div>
              </div>
            </section>
          </article>
        </div>
      )}
    </section>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function ApprovalLoading() {
  return (
    <div className="approval-loading" aria-label="Loading pending access requests">
      <div />
      <div />
      <div />
    </div>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return `${parts[0][0] ?? ''}${parts.length > 1 ? parts.at(-1)?.[0] ?? '' : ''}`.toUpperCase();
}

function formatSubmitted(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}
