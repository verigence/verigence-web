import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import PageHeader from '../../components/PageHeader';
import { hrErrorMessage } from '../../services/hr/client';
import { listMessageTemplates, MESSAGE_PERMISSION } from '../../services/hr/messages';
import { useSessionStore } from '../../store/sessionStore';
import { useHrAccess } from '../../features/hr/hrQueries';
import HistoryTab from '../../features/hr/messages/HistoryTab';
import SendTab from '../../features/hr/messages/SendTab';
import TemplatesTab from '../../features/hr/messages/TemplatesTab';
import { messageKeys } from '../../features/hr/messages/messageKeys';
import '../../styles/hr-messages.css';

type Tab = 'send' | 'templates' | 'history';

const TABS: Array<{ key: Tab; label: string }> = [
  { key: 'send', label: 'Send' },
  { key: 'templates', label: 'Templates' },
  { key: 'history', label: 'History' },
];

export default function HrMessagesPage() {
  const accessToken = useSessionStore((state) => state.accessToken);
  const access = useHrAccess();
  const [tab, setTab] = useState<Tab>('send');
  const allowed = Boolean(accessToken) && access.can(MESSAGE_PERMISSION.send);

  // One request for the templates and which channels are set up. Never retried by itself.
  const templates = useQuery({
    queryKey: messageKeys.templates,
    queryFn: () => listMessageTemplates(accessToken!),
    enabled: allowed,
    retry: false,
    refetchOnWindowFocus: false,
  });

  if (access.loading) return <div className="uc01-admin-state">Loading…</div>;
  if (!allowed || !accessToken) {
    return (
      <section className="uc01-admin-page" aria-label="Employee messages">
        <PageHeader eyebrow="HR" title="Employee messages" />
        <div className="uc01-admin-state uc01-admin-state--error">
          <strong>You do not have access to employee messages.</strong>
          <span>Ask an administrator to give you an HR role that can manage employees.</span>
        </div>
      </section>
    );
  }

  const data = templates.data;

  return (
    <section className="uc01-admin-page hr-page hrm-page" aria-label="Employee messages">
      <PageHeader
        eyebrow="HR"
        title="Employee messages"
        description="Email employees a general message or their login details, edit the saved wording, and see what was sent."
      />

      <div className="hr-tabs" role="tablist" aria-label="Message sections">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            id={`hrm-tab-${t.key}`}
            aria-selected={tab === t.key}
            aria-controls={`hrm-panel-${t.key}`}
            className={`hr-tab${tab === t.key ? ' is-active' : ''}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {templates.isLoading && tab !== 'history' && <div className="uc01-admin-state">Loading messages…</div>}
      {templates.isError && tab !== 'history' && (
        <div className="uc01-admin-state uc01-admin-state--error" role="alert">
          <strong>The messages could not be loaded.</strong>
          <span>{hrErrorMessage(templates.error)}</span>
          <button type="button" className="uc01-admin-button" onClick={() => templates.refetch()}>Try again</button>
        </div>
      )}

      {/* The Send tab stays mounted so a chosen list and a running send are not lost when switching tabs. */}
      {data && (
        <div role="tabpanel" id="hrm-panel-send" aria-labelledby="hrm-tab-send" hidden={tab !== 'send'}>
          <SendTab accessToken={accessToken} templates={data.items} mailConfigured={data.mailConfigured} />
        </div>
      )}
      {data && tab === 'templates' && (
        <div role="tabpanel" id="hrm-panel-templates" aria-labelledby="hrm-tab-templates">
          <TemplatesTab accessToken={accessToken} templates={data.items} canEdit={access.can(MESSAGE_PERMISSION.editTemplates)} />
        </div>
      )}
      {tab === 'history' && (
        <div role="tabpanel" id="hrm-panel-history" aria-labelledby="hrm-tab-history">
          <HistoryTab accessToken={accessToken} myUserId={access.me?.userId ?? null} />
        </div>
      )}
    </section>
  );
}
