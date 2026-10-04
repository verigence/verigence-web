import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import SectionCard from '../../../components/SectionCard';
import { hrErrorMessage } from '../../../services/hr/client';
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
  const [search, setSearch] = useState('');

  // One request for the 50 latest messages. The name box below only narrows what is already loaded.
  const log = useQuery({
    queryKey: messageKeys.log,
    queryFn: () => listMessageLog(accessToken, { limit: 50 }),
    retry: false,
    refetchOnWindowFocus: false,
  });

  const all = log.data?.items ?? [];
  const needle = search.trim().toLowerCase();
  const items = needle ? all.filter((row) => (row.name ?? '').toLowerCase().includes(needle)) : all;

  return (
    <div className="hrm-panel">
      <SectionCard title="Message history" description="The 50 most recent messages. Passwords are never recorded here. Test emails are not listed.">
        <div className="hrm-history-tools">
          <label className="uc01-admin-search">
            <span>Find a user in this list</span>
            <input type="search" value={search} placeholder="Name" onChange={(e) => setSearch(e.target.value)} />
          </label>
          <button type="button" className="uc01-admin-button" onClick={() => log.refetch()} disabled={log.isFetching}>
            {log.isFetching ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
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
              <tr><th>User</th><th>Channel</th><th>Message</th><th>Status</th><th>Reason</th><th>Sent by</th><th>When (IST)</th></tr>
            </thead>
            <tbody>
              {items.map((row: MessageLogEntry) => (
                <tr key={row.logId}>
                  <td data-label="User">
                    <strong>{row.name ?? 'Unknown user'}</strong>
                    {row.employeeId && <small>Employee</small>}
                  </td>
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
                  {needle ? 'No one in the latest 50 messages matches this name.' : 'No messages have been sent yet.'}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
