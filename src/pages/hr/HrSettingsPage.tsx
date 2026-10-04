import { useState } from 'react';

import PageHeader from '../../components/PageHeader';
import { useSessionStore } from '../../store/sessionStore';
import ClaimCategoriesTab from '../../features/hr/settings/ClaimCategoriesTab';
import HolidaysTab from '../../features/hr/settings/HolidaysTab';
import RulesTab from '../../features/hr/settings/RulesTab';
import WorkContextTab from '../../features/hr/settings/WorkContextTab';
import { HR_PERMISSION } from '../../services/hr/employees';
import { useHrAccess } from '../../features/hr/hrQueries';
import '../../styles/hr-settings.css';

type Tab = 'rules' | 'holidays' | 'categories' | 'work';

const TABS: Array<{ key: Tab; label: string }> = [
  { key: 'rules', label: 'Rules' },
  { key: 'holidays', label: 'Holidays' },
  { key: 'categories', label: 'Claim categories' },
  { key: 'work', label: 'Work context' },
];

export default function HrSettingsPage() {
  const accessToken = useSessionStore((state) => state.accessToken);
  const access = useHrAccess();
  const [tab, setTab] = useState<Tab>('rules');

  if (access.loading) return <div className="uc01-admin-state">Loading…</div>;
  if (!access.can(HR_PERMISSION.settingsManage) || !accessToken) {
    return (
      <section className="uc01-admin-page" aria-label="HR settings">
        <PageHeader eyebrow="HR" title="HR settings" />
        <div className="uc01-admin-state uc01-admin-state--error">
          <strong>You do not have access to HR settings.</strong>
          <span>Ask an administrator to give you an HR role.</span>
        </div>
      </section>
    );
  }

  return (
    <section className="uc01-admin-page hr-page hrs-page" aria-label="HR settings">
      <PageHeader
        eyebrow="HR"
        title="HR settings"
        description="Company rules, holidays, claim categories and the sync of project work from Audit Core."
      />

      <div className="hr-tabs" role="tablist" aria-label="HR settings sections">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            id={`hrs-tab-${t.key}`}
            aria-selected={tab === t.key}
            aria-controls={`hrs-panel-${t.key}`}
            className={`hr-tab${tab === t.key ? ' is-active' : ''}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`hrs-panel-${tab}`} aria-labelledby={`hrs-tab-${tab}`} className="hrs-panel">
        {tab === 'rules' && <RulesTab accessToken={accessToken} />}
        {tab === 'holidays' && <HolidaysTab accessToken={accessToken} />}
        {tab === 'categories' && <ClaimCategoriesTab accessToken={accessToken} />}
        {tab === 'work' && <WorkContextTab accessToken={accessToken} />}
      </div>
    </section>
  );
}
