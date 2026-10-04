import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import SectionCard from '../../../components/SectionCard';
import { hrErrorMessage } from '../../../services/hr/client';
import { listEmployees } from '../../../services/hr/employees';
import { listMessageLog, type MessageLogEntry } from '../../../services/hr/messages';
import { formatDateTime } from '../hrLabels';
import { messageKeys } from './messageKeys';
import { channelText, reasonLabel, resultStatusClass, resultStatusText, templateText } from './messagePlan';

interface Props {
  accessToken: string;
  myUserId: string | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function senderLabel(sentBy: string, myUserId: string | null): string {
  if (myUserId && sentBy === myUserId) return 'You';
  return UUID.test(sentBy) ? `User ${sentBy.slice(0, 8)}` : sentBy;
}

export default function HistoryTab({ accessToken, myUserId }: Props) {
  const [employeeId, setEmployeeId] = useState('');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');

  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(search.trim()), 350);
    return () => window.clearTimeout(timer);
  }, [search]);

  const people = useQuery({
    queryKey: messageKeys.people(query),
    queryFn: () => listEmployees(accessToken, { q: query, limit: 100 }),
    retry: false,
    refetchOnWindowFocus: false,
    placeholderData: (previous) => previous,
  });
  const log = useQuery({
    queryKey: messageKeys.log(employeeId),
    queryFn: () => listMessageLog(accessToken, { employeeId: employeeId || undefined, limit: 50 }),
    retry: false,
    refetchOnWindowFocus: false,
  });

  const options = people.data?.items ?? [];
  const items = log.data?.items ?? [];
  const chosenName = items.find((i) => i.employeeId === employeeId)?.employeeName;

  return (
    <div className="hrm-panel">
      <SectionCard title="Message history" description="The 50 most recent messages. Passwords are never recorded here.">
        <div className="hrm-history-tools">
          <label className="uc01-admin-search">
            <span>Find a person</span>
            <input type="search" value={search} placeholder="Name, code or email" onChange={(e) => setSearch(e.target.value)} />
          </label>
          <label className="uc01-admin-filter">
            <span>Show messages for</span>
            <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
              <option value="">Everyone</option>
              {employeeId && !options.some((o) => o.employeeId === employeeId) && (
                <option value={employeeId}>{chosenName ?? 'Chosen person'}</option>
              )}
              {options.map((o) => <option key={o.employeeId} value={o.employeeId}>{o.fullName} ({o.employeeCode})</option>)}
            </select>
          </label>
          <button type="button" className="uc01-admin-button" onClick={() => log.refetch()} disabled={log.isFetching}>
            {log.isFetching ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
        {people.isError && <p className="hr-muted" role="alert">The list of people could not be loaded. {hrErrorMessage(people.error)}</p>}
      </SectionCard>

      {log.isLoading && <div className="uc01-admin-state">Loading history…</div>}
      {log.isError && (
        <div className="uc01-admin-state uc01-admin-state--error" role="alert">
          <strong>History could not be loaded.</strong>
          <span>{hrErrorMessage(log.error)}</span>
          <button type="button" className="uc01-admin-button" onClick={() => log.refetch()}>Try again</button>
        </div>
      )}
      {log.data && (
        <div className="uc01-admin-table-wrap">
          <table className="uc01-admin-table hr-table hrm-table">
            <thead>
              <tr><th>Person</th><th>Channel</th><th>Message</th><th>Status</th><th>Reason</th><th>Sent by</th><th>When (IST)</th></tr>
            </thead>
            <tbody>
              {items.map((row: MessageLogEntry) => (
                <tr key={row.logId}>
                  <td data-label="Person"><strong>{row.employeeName}</strong><small>{row.employeeCode}</small></td>
                  <td data-label="Channel"><span>{channelText[row.channel] ?? row.channel}</span></td>
                  <td data-label="Message"><span>{templateText[row.template] ?? row.template}</span></td>
                  <td data-label="Status">
                    <span className={`uc01-admin-status uc01-admin-status--${resultStatusClass[row.status as keyof typeof resultStatusClass] ?? 'rejected'}`}>
                      {resultStatusText[row.status as keyof typeof resultStatusText] ?? row.status}
                    </span>
                  </td>
                  <td data-label="Reason">{row.reason ? <span>{reasonLabel(row.reason)}</span> : <span className="hr-muted">—</span>}</td>
                  <td data-label="Sent by"><span title={row.sentBy}>{senderLabel(row.sentBy, myUserId)}</span></td>
                  <td data-label="When (IST)"><span>{formatDateTime(row.sentAt)}</span></td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr><td colSpan={7} className="uc01-admin-empty">
                  {employeeId ? 'No messages have been sent to this person yet.' : 'No messages have been sent yet.'}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
