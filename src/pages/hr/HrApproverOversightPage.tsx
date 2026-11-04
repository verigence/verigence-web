import { Fragment, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import PageHeader from '../../components/PageHeader';
import SectionCard from '../../components/SectionCard';
import { getApproverOversight, getApproverPending, type ApproverOversight } from '../../services/hr/oversight';
import { useSessionStore } from '../../store/sessionStore';
import { formatDateTimeIst } from '../../features/hr/approvals/approvalFormat';
import PendingItemList from '../../features/hr/oversight/PendingItemList';
import {
  formatAgeHours,
  isForbidden,
  oversightErrorMessage,
  oversightKeys,
  roleLabel,
} from '../../features/hr/oversight/oversightFormat';
import '../../styles/hr-approvals.css';

const COLUMNS = 7;

/** The drill-down for one approver: what is waiting with them, loaded when the row is opened. */
function ApproverPendingDetail({ approver }: { approver: ApproverOversight }) {
  const accessToken = useSessionStore((state) => state.accessToken);
  const query = useQuery({
    queryKey: oversightKeys.pending(approver.userId),
    queryFn: () => getApproverPending(accessToken!, approver.userId, false),
    enabled: Boolean(accessToken),
    retry: false,
    refetchOnWindowFocus: false,
  });
  if (query.isLoading) return <div className="uc01-admin-state">Loading what is waiting…</div>;
  if (query.isError) {
    return (
      <div className="uc01-admin-state uc01-admin-state--error" role="alert">
        <strong>This list could not be loaded.</strong>
        <span>{oversightErrorMessage(query.error)}</span>
        <button type="button" className="uc01-admin-button" onClick={() => query.refetch()}>Try again</button>
      </div>
    );
  }
  return <PendingItemList items={query.data?.items ?? []} emptyText={`Nothing is waiting with ${approver.name}.`} />;
}

function Roles({ approver }: { approver: ApproverOversight }) {
  if (approver.roles.length === 0) return null;
  return (
    <small>
      {approver.roles.map((r) => `${roleLabel(r.role)}, ${r.project}`).join(' · ')}
    </small>
  );
}

/**
 * Team Lead approvals. The server decides who may see this (an Executive for their projects, HR
 * and the CEO for all) and the order of the rows; anyone else gets a plain message.
 */
export default function HrApproverOversightPage() {
  const accessToken = useSessionStore((state) => state.accessToken);
  const [open, setOpen] = useState<string | null>(null);

  const query = useQuery({
    queryKey: oversightKeys.approvers,
    queryFn: () => getApproverOversight(accessToken!),
    enabled: Boolean(accessToken),
    retry: false,
    refetchOnWindowFocus: false,
  });

  const header = (
    <PageHeader
      eyebrow="HR"
      title="Team Lead approvals"
      description="What is waiting with each Team Lead and Project Manager, and since when. Anything raised in a week is due by 09:00 on the following Monday."
    />
  );

  if (query.isError && isForbidden(query.error)) {
    return (
      <section className="uc01-admin-page" aria-label="Team Lead approvals">
        {header}
        <div className="uc01-admin-state uc01-admin-state--error">
          <strong>Only an Executive, HR or the CEO can see this.</strong>
        </div>
      </section>
    );
  }

  const data = query.data;
  const items = data?.items ?? [];
  const nobody = data?.withoutApprover ?? [];

  return (
    <section className="uc01-admin-page hr-page hr-appr-page hr-ovs-page" aria-label="Team Lead approvals">
      {header}

      <div className="hr-appr-bar">
        <p className="hr-count" aria-live="polite">
          {data
            ? `${items.length === 1 ? '1 approver' : `${items.length} approvers`} · ${data.scope === 'ALL' ? 'All projects' : 'Your projects'} · As of ${formatDateTimeIst(data.asOf)}`
            : ''}
        </p>
        <button type="button" className="uc01-admin-button hr-appr-refresh" onClick={() => query.refetch()} disabled={query.isFetching}>
          {query.isFetching ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {query.isLoading && <div className="uc01-admin-state">Loading…</div>}
      {query.isError && (
        <div className="uc01-admin-state uc01-admin-state--error" role="alert">
          <strong>This could not be loaded.</strong>
          <span>{oversightErrorMessage(query.error)}</span>
          <button type="button" className="uc01-admin-button" onClick={() => query.refetch()}>Try again</button>
        </div>
      )}

      {data && (
        <div className="uc01-admin-table-wrap">
          <table className="uc01-admin-table hr-table hr-ovs-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Pending</th>
                <th>Past deadline</th>
                <th>Oldest waiting</th>
                <th>Decided in last 30 days</th>
                <th>Average time to decide</th>
                <th><span className="hr-visually-hidden">Details</span></th>
              </tr>
            </thead>
            <tbody>
              {items.map((a) => {
                const isOpen = open === a.userId;
                const detailId = `hr-ovs-detail-${a.userId}`;
                return (
                  <Fragment key={a.userId}>
                    <tr className={isOpen ? 'is-open' : undefined}>
                      <td data-label="Name">
                        <strong>{a.name}</strong>
                        <Roles approver={a} />
                      </td>
                      <td data-label="Pending">
                        <strong>{a.pending.total}</strong>
                        <small>Attendance {a.pending.ATTENDANCE} · Leave {a.pending.LEAVE} · Claims {a.pending.CLAIM}</small>
                      </td>
                      <td data-label="Past deadline">
                        {a.overdue > 0
                          ? <span className="uc01-admin-status uc01-admin-status--suspended">{a.overdue} past deadline</span>
                          : <span className="hr-muted">0</span>}
                      </td>
                      <td data-label="Oldest waiting">
                        <span className={a.overdue > 0 ? 'hr-appr-age is-old' : undefined}>{formatAgeHours(a.oldestAgeHours)}</span>
                        {a.oldestRaisedAt && <small>Since {formatDateTimeIst(a.oldestRaisedAt)}</small>}
                      </td>
                      <td data-label="Decided in last 30 days"><span>{a.decidedLast30Days}</span></td>
                      <td data-label="Average time to decide"><span>{formatAgeHours(a.averageDecisionHours)}</span></td>
                      <td data-label="Details">
                        <div className="uc01-admin-row-actions">
                          <button
                            type="button"
                            className="uc01-admin-button"
                            aria-expanded={isOpen}
                            aria-controls={detailId}
                            disabled={a.pending.total === 0}
                            onClick={() => setOpen(isOpen ? null : a.userId)}
                          >
                            {a.pending.total === 0 ? 'Nothing waiting' : isOpen ? 'Hide items' : 'Show items'}
                          </button>
                        </div>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr className="hr-ovs-detail-row">
                        <td colSpan={COLUMNS} id={detailId}>
                          <ApproverPendingDetail approver={a} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
              {items.length === 0 && (
                <tr><td colSpan={COLUMNS} className="uc01-admin-empty">There are no Team Leads or Project Managers to show.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {nobody.length > 0 && (
        <SectionCard title="Waiting with nobody" description="No Team Lead or Project Manager can decide these items.">
          <PendingItemList items={nobody} emptyText="" />
        </SectionCard>
      )}
    </section>
  );
}
