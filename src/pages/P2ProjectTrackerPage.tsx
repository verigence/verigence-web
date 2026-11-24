import { Navigate, useSearchParams } from 'react-router-dom';
import '../styles/uc03-p2.css';
import '../styles/uc03-p2-workspace.css';
import '../styles/uc03-p2-my-work.css';
import '../styles/uc03-p2-project-tracker.css';
import '../styles/uc03-p2-daily-report.css';
import '../styles/uc03-p2-gate-pass.css';

import PageHeader from '../components/PageHeader';
import SectionCard from '../components/SectionCard';
import DutiesSection from '../features/duties/DutiesSection';
import SupervisorGatePass from '../features/uc03-p2/gatepass/SupervisorGatePass';
import PerformanceView from '../features/uc03-p2/performance/PerformanceView';
import DmsDumpCalendarTab from '../features/uc03-p2/tracker/DmsDumpCalendarTab';
import { istDate } from '../services/audit-core/uc03MyWork';
import {
  dailyProcessingDay,
  trackerTabFromSearch,
  trackerTabHref,
  trackerTabsFor,
  type TrackerTab,
} from '../services/audit-core/uc03ProjectTracker';
import { useProjectContextStore } from '../store/projectContextStore';
import { useSessionStore } from '../store/sessionStore';

/**
 * Project Tracker: the one place for a Team Lead, PM or Executive (2026-11-09). One row of tabs, no
 * tabs within tabs (product owner 2026-11-24): Team and outlets (a PC's row opens their day, an
 * outlet's its Journeys), Pending, Uploads and failures, Against the DMS (with the Team Lead's DMS
 * dump calendar), Gate Register and Daily duties. Overview, Efficiency, Tasks, Duties and Journeys
 * were dropped as repeats (uc03ProjectTracker.TRACKER_TABS). The tab is in the address; old
 * addresses open the tab that now holds what they showed, a Work done day on that day.
 */
export default function P2ProjectTrackerPage() {
  const project = useProjectContextStore((s) => s.selectedProject);
  const accessToken = useSessionStore((s) => s.accessToken);
  const tenantId = project?.tenantId;
  const role = project?.operatingRole;
  const team = role === 'TL' || role === 'PM' || role === 'EXECUTIVE';
  const [searchParams, setSearchParams] = useSearchParams();
  const today = istDate();
  const tabs = trackerTabsFor(role);
  const asked = trackerTabFromSearch(searchParams);
  const tab: TrackerTab = tabs.some((t) => t.key === asked) ? asked : 'team';
  // An old Work done address's ?day= (or ?date=) opens Team and outlets on that day.
  const day = dailyProcessingDay(searchParams, today);
  // Where an outlet's or a PC's Journeys open: the Team Lead's list is on their dashboard.
  const journeysPath = role === 'TL' ? '/dashboard' : '/p2/bookings';

  // A PC or Reviewer has their own figures and performance on My Tracker.
  if (role === 'PC' || role === 'REVIEWER') return <Navigate to="/p2/tracker?tab=performance" replace />;

  const selectTab = (next: TrackerTab) => {
    if (next === tab) return;
    const href = trackerTabHref(next);
    setSearchParams(new URLSearchParams(href.includes('?') ? href.split('?')[1] : ''));
  };

  return (
    <div className="screen-stack p2-screen p2w p2mw p2pt">
      <PageHeader
        eyebrow="DealGuard"
        title="Project Tracker"
        description="Who is doing what at your outlets, what is pending, how files come in, what the DMS says, the gate registers and the daily duties."
      />
      {team ? <div className="p2pt-tabs" role="tablist" aria-label="Project Tracker">
        {tabs.map((t) => (
          <button key={t.key} type="button" role="tab" id={`p2pt-tab-${t.key}`} aria-controls={`p2pt-panel-${t.key}`}
            aria-selected={tab === t.key} tabIndex={tab === t.key ? 0 : -1}
            className={tab === t.key ? 'is-active' : undefined} onClick={() => selectTab(t.key)}
            onKeyDown={(event) => {
              if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
              const index = tabs.findIndex((x) => x.key === tab);
              const step = event.key === 'ArrowRight' ? 1 : -1;
              const next = tabs[(index + step + tabs.length) % tabs.length].key;
              selectTab(next);
              document.getElementById(`p2pt-tab-${next}`)?.focus();
            }}>
            {t.label}
          </button>
        ))}
      </div> : null}

      {!team ? (
        <SectionCard><p className="p2w-muted">The Project Tracker is for a Team Lead, PM or Executive.</p></SectionCard>
      ) : !tenantId || !accessToken ? (
        <div className="p2w-alert p2w-alert--error" role="alert">Select a project to continue.</div>
      ) : (
        <div role="tabpanel" id={`p2pt-panel-${tab}`} aria-labelledby={`p2pt-tab-${tab}`} className="screen-stack">
          {/* Each Performance view the product owner keeps is a tab of its own (2026-11-24). The key
              gives each its own range: Team and outlets opens on the day, the others on 7 days. */}
          {tab === 'team' || tab === 'pending' || tab === 'uploads' || tab === 'dms' ? (
            <PerformanceView key={tab} tenantId={tenantId} accessToken={accessToken} today={today} fixedView={tab}
              initialFrom={tab === 'team' ? day : undefined} initialTo={tab === 'team' ? day : undefined}
              pcDays={tab === 'team'} journeysPath={journeysPath} />
          ) : null}
          {/* The Team Lead's DMS dumps calendar, with what the DMS says (it was a tab of its own). */}
          {tab === 'dms' && role === 'TL' ? <DmsDumpCalendarTab tenantId={tenantId} accessToken={accessToken} /> : null}
          {tab === 'gate-pass' ? <SupervisorGatePass tenantId={tenantId} accessToken={accessToken} /> : null}
          {tab === 'duties' ? <DutiesSection mode="project" tenantId={tenantId} accessToken={accessToken} /> : null}
        </div>
      )}
    </div>
  );
}
