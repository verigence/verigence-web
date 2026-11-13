import { Navigate, useSearchParams } from 'react-router-dom';
import '../styles/uc03-p2.css';
import '../styles/uc03-p2-workspace.css';
import '../styles/uc03-p2-my-work.css';
import '../styles/uc03-p2-project-tracker.css';
import '../styles/uc03-p2-daily-report.css';
import '../styles/uc03-p2-gate-pass.css';

import PageHeader from '../components/PageHeader';
import SectionCard from '../components/SectionCard';
import DailyWorkReport from '../features/uc03-p2/daily/DailyWorkReport';
import SupervisorGatePass from '../features/uc03-p2/gatepass/SupervisorGatePass';
import PerformanceView from '../features/uc03-p2/performance/PerformanceView';
import DmsDumpCalendarTab from '../features/uc03-p2/tracker/DmsDumpCalendarTab';
import JourneyBreakdownTab from '../features/uc03-p2/tracker/JourneyBreakdownTab';
import { istDate } from '../services/audit-core/uc03MyWork';
import {
  dailyProcessingDay,
  hasNextPeriod,
  shiftPeriod,
  trackerLabel,
  trackerTabFromSearch,
  trackerTabHref,
  trackerTabsFor,
  type TrackerTab,
} from '../services/audit-core/uc03ProjectTracker';
import { useProjectContextStore } from '../store/projectContextStore';
import { useSessionStore } from '../store/sessionStore';

/** The "Work done and files closed" tab: one day, the day picked here (and kept in the address). */
function DailyWorkTab({ tenantId, accessToken, today, timezone }: {
  tenantId: string; accessToken: string; today: string; timezone?: string | null;
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const day = dailyProcessingDay(searchParams, today);
  const go = (next: string) => setSearchParams(new URLSearchParams(trackerTabHref('daily-processing', next).split('?')[1]));
  return (
    <>
      <div className="p2mw-controls">
        <span className="p2mw-range">
          <button type="button" className="p2w-button p2w-button--ghost" aria-label="Previous day"
            onClick={() => go(shiftPeriod('DAY', day, -1))}>‹</button>
          <label>Day <input type="date" value={day} max={today} onChange={(e) => e.target.value && go(e.target.value)} /></label>
          <button type="button" className="p2w-button p2w-button--ghost" aria-label="Next day"
            disabled={!hasNextPeriod('DAY', day, today)} onClick={() => go(shiftPeriod('DAY', day, 1))}>›</button>
          <strong>{trackerLabel('DAY', day)}</strong>
          {day !== today ? <button type="button" className="p2w-button p2w-button--secondary" onClick={() => go(today)}>Today</button> : null}
        </span>
      </div>
      <DailyWorkReport tenantId={tenantId} accessToken={accessToken} day={day} fallbackTimezone={timezone} />
    </>
  );
}

/**
 * Project Tracker: the one place for a Team Lead, PM or Executive (2026-11-09). Without the
 * duplicates (product owner 2026-11-13: "Project Tracker has so much of duplicate information"):
 * - Performance, as it is: pending work, the team and outlets, efficiency, uploads with failures
 *   and duplicates, tasks and duties, over a date range;
 * - Work done and files closed: the "Work done on tasks" and "Delivery files closed" of a day;
 * - Deliveries and delivery files: the gate register calendar and the tasks raised from it.
 * Dropped as repeats of Performance: the tracker's figures (gate pass, files, Drive, reviews, failed
 * uploads, tasks, recurring tasks), the Daily processing task status and uploads by PC, and the
 * all-outlets gate pass table. The tab is in the address; old addresses (?tab=daily-processing&day=,
 * ?tab=gate-pass, the tracker's ?period=) still open a tab.
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

  // A PC or Reviewer has their own figures and performance on My Tracker.
  if (role === 'PC' || role === 'REVIEWER') return <Navigate to="/p2/tracker?tab=performance" replace />;

  const selectTab = (next: TrackerTab) => {
    if (next === tab) return;
    // The day carries over to the "Work done and files closed" tab.
    const day = tab === 'daily-processing' ? dailyProcessingDay(searchParams, today) : undefined;
    const href = trackerTabHref(next, day);
    setSearchParams(new URLSearchParams(href.includes('?') ? href.split('?')[1] : ''));
  };

  return (
    <div className="screen-stack p2-screen p2w p2mw p2pt">
      <PageHeader
        eyebrow="DealGuard"
        title="Project Tracker"
        description="How the team is doing over a date range; the work done on tasks and the delivery files closed on a day; and deliveries on the gate register against delivery files uploaded."
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
          {tab === 'performance' ? <PerformanceView tenantId={tenantId} accessToken={accessToken} today={today} /> : null}
          {tab === 'daily-processing'
            ? <DailyWorkTab tenantId={tenantId} accessToken={accessToken} today={today} timezone={project?.timezoneName} /> : null}
          {tab === 'gate-pass' ? <SupervisorGatePass tenantId={tenantId} accessToken={accessToken} /> : null}
        </div>
      )}
    </div>
  );
}
