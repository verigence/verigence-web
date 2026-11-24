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
import JourneyBreakdownTab from '../features/uc03-p2/tracker/JourneyBreakdownTab';
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
 * Project Tracker: the one place for a Team Lead, PM or Executive (2026-11-09). It opens on
 * Performance's Team and outlets, today (product owner 2026-11-24: "team and outlet is better
 * view"); a PC's row opens their day -- Journeys, files, duties, gate register, pending work, the
 * tasks worked and delivery files closed -- in a side panel. That folded in the PCs' day and the
 * Work done and files closed tabs, which repeated it. The other tabs:
 * - Journeys: the Dealership-wise / Outlet-wise / PC-wise panels (2026-11-13);
 * - Gate Register: outlet-wise daily status or the calendar, and the tasks raised from it (2026-11-14);
 * - Daily duties: what was missed or not received, the full board, and the duty list and its switch;
 * - DMS dumps: the dealers' daily dumps like the gate register, for the Team Lead (2026-11-13).
 * The tab is in the address; old addresses (?tab=pc-day, ?tab=daily-processing&day=, the tracker's
 * ?period=) open Performance, on the day asked for.
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
  const tab: TrackerTab = tabs.some((t) => t.key === asked) ? asked : 'performance';
  // An old Work done address's ?day= (or ?date=) opens Team and outlets on that day.
  const day = dailyProcessingDay(searchParams, today);

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
        description="Who is doing what at your outlets: open a PC for their day. Journeys, the gate register, daily duties and the DMS dumps on their own tabs."
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
          {tab === 'journeys' ? <JourneyBreakdownTab tenantId={tenantId} accessToken={accessToken}
            listPath={role === 'TL' ? '/dashboard' : '/p2/bookings'} /> : null}
          {tab === 'dms-dumps' ? <DmsDumpCalendarTab tenantId={tenantId} accessToken={accessToken} /> : null}
          {tab === 'performance' ? (
            <PerformanceView tenantId={tenantId} accessToken={accessToken} today={today}
              initialView="team" initialFrom={day} initialTo={day} pcDays />
          ) : null}
          {tab === 'gate-pass' ? <SupervisorGatePass tenantId={tenantId} accessToken={accessToken} /> : null}
          {tab === 'duties' ? <DutiesSection mode="project" tenantId={tenantId} accessToken={accessToken} /> : null}
        </div>
      )}
    </div>
  );
}
