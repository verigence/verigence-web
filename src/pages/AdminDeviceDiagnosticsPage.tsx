import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import PageHeader from '../components/PageHeader';
import SectionCard from '../components/SectionCard';
import { formatWhenIst } from '../features/announcements/announcementLogic';
import {
  clearDiagnosticLogs,
  getAdminDiagnostics,
  setDiagnosticsSwitch,
  type DiagnosticLog,
} from '../services/security/clientDiagnostics';
import { useSessionStore } from '../store/sessionStore';

const messageOf = (error: unknown) => (error instanceof Error && error.message ? error.message : 'The change could not be saved. Please try again.');
const queryKey = ['security', 'client-diagnostics'] as const;

/** SuperAdmin: switch device diagnostics on or off and read what phones have sent. Off by default. */
export default function AdminDeviceDiagnosticsPage() {
  const accessToken = useSessionStore((state) => state.accessToken);
  const queryClient = useQueryClient();
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const data = useQuery({ queryKey, queryFn: () => getAdminDiagnostics(accessToken!), enabled: Boolean(accessToken), retry: false });
  const change = useMutation({
    mutationFn: (run: { text: string; send: () => Promise<unknown> }) => run.send(),
    onSuccess: async (_d, run) => { setNotice({ ok: true, text: run.text }); await queryClient.invalidateQueries({ queryKey }); },
    onError: (error) => setNotice({ ok: false, text: messageOf(error) }),
  });
  const enabled = data.data?.enabled === true;
  const logs: DiagnosticLog[] = data.data?.logs ?? [];

  return (
    <section className="uc01-admin-page hr-page" aria-label="Device diagnostics">
      <PageHeader
        eyebrow="Administration"
        title="Device diagnostics"
        description="Off by default. When on, each phone sends a short technical log the next time it opens, so a problem on a device can be looked at here. Switch it off when you are done."
      />
      {notice && <div className={`uc01-admin-message uc01-admin-message--${notice.ok ? 'success' : 'error'}`} role={notice.ok ? 'status' : 'alert'}>{notice.text}</div>}
      {data.isError && <div className="uc01-admin-message uc01-admin-message--error" role="alert">Diagnostics could not be loaded. {messageOf(data.error)}</div>}

      <SectionCard title="Collection" description="Only SuperAdmin can change this or read the logs.">
        <div className={`announce-status announce-status--${enabled ? 'on' : 'off'}`}>
          <strong>{enabled ? 'ON' : 'OFF'}</strong>
          <span>{enabled ? 'Phones keep and send their log.' : 'Phones keep nothing and send nothing.'}</span>
        </div>
        <div className="hr-actions">
          <button
            type="button"
            className="uc01-admin-button uc01-admin-button--primary"
            disabled={change.isPending || data.isLoading}
            onClick={() => change.mutate({
              text: enabled ? 'Device diagnostics is now OFF.' : 'Device diagnostics is now ON. Logs arrive as phones open the app.',
              send: () => setDiagnosticsSwitch(accessToken!, !enabled),
            })}
          >
            {enabled ? 'Switch off' : 'Switch on'}
          </button>
        </div>
      </SectionCard>

      <SectionCard
        title="Received logs"
        description={logs.length ? `${logs.length} log${logs.length === 1 ? '' : 's'}, newest first.` : 'Nothing received yet.'}
        action={logs.length ? (
          <button type="button" className="uc01-admin-button" disabled={change.isPending} onClick={() => change.mutate({ text: 'All received logs are removed.', send: () => clearDiagnosticLogs(accessToken!) })}>
            Clear all
          </button>
        ) : undefined}
      >
        {logs.map((log) => (
          <div key={log.logId} className="hr-pay-row">
            <button type="button" className="uc01-admin-button" aria-expanded={open === log.logId} onClick={() => setOpen(open === log.logId ? null : log.logId)}>
              {log.person ?? 'Unknown person'} · {log.platform ?? 'device'}{log.appVersion ? ` · v${log.appVersion}` : ''} · {formatWhenIst(log.receivedAt)} · {log.entryCount} entries
            </button>
            {open === log.logId && (
              <pre className="announce-admin-text" style={{ whiteSpace: 'pre-wrap', overflowX: 'auto' }}>
                {log.entries.map((e) => `${formatWhenIst(e.time)}  ${e.step}  ${JSON.stringify(e.detail)}`).join('\n')}
              </pre>
            )}
          </div>
        ))}
      </SectionCard>
    </section>
  );
}
