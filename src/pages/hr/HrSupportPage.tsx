import { Link } from 'react-router-dom';

import PageHeader from '../../components/PageHeader';
import { hrErrorMessage } from '../../services/hr/client';
import { HR_PERMISSION } from '../../services/hr/employees';
import { formatDateTime } from '../../features/hr/hrLabels';
import { useHrAccess } from '../../features/hr/hrQueries';
import { useTickets } from '../../features/hr/support/supportQueries';
import TicketStatus from '../../features/hr/support/TicketStatus';
import '../../styles/hr-support.css';

/** Feedback & Support. SuperAdmin sees every ticket; everyone else sees the ones they raised. */
export default function HrSupportPage() {
  const access = useHrAccess();
  const support = access.can(HR_PERMISSION.supportManage);
  const tickets = useTickets(support, support || access.isEmployee);

  if (access.loading) return <div className="uc01-admin-state">Loading…</div>;
  if (!support && !access.isEmployee) {
    return (
      <section className="uc01-admin-page hr-page" aria-label="Feedback and support">
        <PageHeader eyebrow="HR" title="Feedback & Support" />
        <div className="uc01-admin-state">
          <strong>Your login is not linked to an employee record.</strong>
          <span>Tickets are raised by employees. Ask HR to link your login to your employee record.</span>
        </div>
      </section>
    );
  }

  const data = tickets.data;
  return (
    <section className="uc01-admin-page hr-page" aria-label="Feedback and support">
      <PageHeader
        eyebrow="HR"
        title="Feedback & Support"
        description={support ? 'All tickets raised by team members. Reply, update the status and add a note to close.' : 'Raise a ticket for anything that did not work, and follow the answer here.'}
        actions={access.isEmployee ? <Link className="uc01-admin-button uc01-admin-button--primary" to="/hr/support/new">+ Raise a ticket</Link> : undefined}
      />

      {tickets.isLoading && <div className="uc01-admin-state">Loading tickets…</div>}
      {tickets.isError && (
        <div className="uc01-admin-state uc01-admin-state--error" role="alert">
          <strong>Tickets could not be loaded.</strong>
          <span>{hrErrorMessage(tickets.error)}</span>
          <button type="button" className="uc01-admin-button" onClick={() => void tickets.refetch()}>Try again</button>
        </div>
      )}

      {data && (
        <>
          <p className="hrs-count" aria-live="polite">
            <strong>{data.total === 1 ? '1 ticket' : `${data.total} tickets`}</strong>
            <span className="uc01-admin-status uc01-admin-status--suspended">{data.open} open</span>
          </p>
          <div className="uc01-admin-table-wrap">
            <table className="uc01-admin-table hr-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Summary</th>
                  {support && <th>Raised by</th>}
                  <th>Raised</th>
                  <th>Files</th>
                  <th>Status</th>
                  <th>Admin note</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {data.items.map((t) => (
                  <tr key={t.ticketId}>
                    <td data-label="#">#{t.ticketNo}</td>
                    <td data-label="Summary" className="hrs-summary">
                      <strong>{t.summary}</strong>
                      {t.messageCount > 1 && <small>{t.messageCount - 1} {t.messageCount === 2 ? 'reply' : 'replies'}</small>}
                    </td>
                    {support && (
                      <td data-label="Raised by" className="hrs-person">
                        <strong>{t.employeeName}</strong>
                        <small>{t.employeeEmail}</small>
                      </td>
                    )}
                    <td data-label="Raised">{formatDateTime(t.createdAt)}</td>
                    <td data-label="Files">{t.fileCount}</td>
                    <td data-label="Status"><TicketStatus status={t.status} /></td>
                    <td data-label="Admin note" className="hrs-note">{t.adminNote ?? '—'}</td>
                    <td data-label="Actions">
                      <span className="hrs-actions">
                        <Link className="uc01-admin-button" to={`/hr/support/${t.ticketId}`}>View</Link>
                        {support && <Link className="uc01-admin-button uc01-admin-button--primary" to={`/hr/support/${t.ticketId}?update=1`}>Update</Link>}
                      </span>
                    </td>
                  </tr>
                ))}
                {data.items.length === 0 && (
                  <tr><td colSpan={support ? 8 : 7} className="uc01-admin-empty">{support ? 'No tickets yet.' : 'You have not raised any tickets yet.'}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
