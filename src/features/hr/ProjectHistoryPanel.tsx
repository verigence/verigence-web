import { useQuery } from '@tanstack/react-query';

import SectionCard from '../../components/SectionCard';
import { hrErrorMessage } from '../../services/hr/client';
import { getProjectHistory } from '../../services/hr/workAssignments';
import { useSessionStore } from '../../store/sessionStore';

const day = (iso: string) =>
  new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });

/** Every project this person is or has been tagged to, with the dates. Read-only; loaded when the page opens. */
export default function ProjectHistoryPanel({ employeeId }: { employeeId: string }) {
  const accessToken = useSessionStore((state) => state.accessToken);
  const history = useQuery({
    queryKey: ['hr', 'project-history', employeeId],
    queryFn: () => getProjectHistory(accessToken!, employeeId),
    enabled: Boolean(accessToken && employeeId),
    retry: false,
    refetchOnWindowFocus: false,
  });
  return (
    <SectionCard title="Project history" description="Every project this person is or has been tagged to. Mapping is changed in Audit Core and arrives in HR daily.">
      {history.isLoading && <p className="hr-muted">Loading…</p>}
      {history.isError && <p className="hr-muted">Project history could not be loaded. {hrErrorMessage(history.error)}</p>}
      {history.data && !history.data.linked && (
        <p className="hr-muted">No Verigence login is linked to this employee, so projects cannot be matched yet.</p>
      )}
      {history.data?.linked && history.data.items.length === 0 && <p className="hr-muted">Not tagged to any project yet.</p>}
      {history.data?.linked && history.data.items.length > 0 && (
        <>
          <div className="uc01-admin-table-wrap">
            <table className="uc01-admin-table hr-table">
              <thead>
                <tr><th>Project</th><th>Role</th><th>Dealer and outlet</th><th>From</th><th>To</th></tr>
              </thead>
              <tbody>
                {history.data.items.map((line, index) => (
                  <tr key={`${line.projectCode}-${line.role}-${line.outletName ?? ''}-${index}`}>
                    <td data-label="Project"><strong>{line.projectName ?? line.projectCode ?? '—'}</strong></td>
                    <td data-label="Role"><span>{line.role}</span></td>
                    <td data-label="Dealer and outlet"><span>{[line.dealerName, line.outletName].filter(Boolean).join(' · ') || '—'}</span></td>
                    <td data-label="From"><span>{day(line.since)}</span></td>
                    <td data-label="To"><span>{line.current ? 'Current' : line.until ? day(line.until) : '—'}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {history.data.syncedAt && <small className="hr-muted">Copied from Audit Core on {day(history.data.syncedAt)}. End dates are as exact as that copy.</small>}
        </>
      )}
    </SectionCard>
  );
}
