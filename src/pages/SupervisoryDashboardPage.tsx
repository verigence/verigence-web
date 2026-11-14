import type { ReactElement } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import '../styles/uc03-p2.css';
import '../styles/uc03-p2-workspace.css';
import '../styles/uc03-p2-cards.css';

import NightlyReprocessingStatusTile from '../components/NightlyReprocessingStatusTile';
import JourneyListTabs from '../features/uc03-p2/bookings/JourneyListTabs';
import TeamTodayCard from '../features/uc03-p2/dashboard/TeamTodayCard';
import {
  focusCardsFor,
  scopeSummary,
  SUPERVISORY_ROLE_LABEL,
  supervisoryRole,
  type FocusKey,
  type SupervisoryRole,
} from '../features/uc03-p2/dashboard/supervisoryDashboard';
import { getTmTasks } from '../services/audit-core/taskManager';
import { getReviewQueueSummary } from '../services/audit-core/uc03Audit';
import { getP2Tasks } from '../services/audit-core/uc03P2';
import { istDate } from '../services/audit-core/uc03MyWork';
import { getProjectTracker, PROJECT_TRACKER_PATH } from '../services/audit-core/uc03ProjectTracker';
import { useProjectContextStore } from '../store/projectContextStore';
import { useSessionStore } from '../store/sessionStore';

// The supervisory landing page of a Team Lead, a Project Manager and an
// Executive (product owner 2026-11-09: the TL dashboard's "complete info" for
// Exec and PM, as their landing page). Its focus cards route attention to the
// places each role works from its own menu (supervisoryDashboard.focusCardsFor);
// nobody captures a Booking/Delivery here (that stays PC-only). Every count
// comes from the same endpoint the destination page reads, with the same
// query key as its menu badge where there is one, so nothing here can drift
// from what the destination shows.
type FocusTone = 'violation' | 'queue' | 'ops';

function FocusCard({
  tone,
  eyebrow,
  title,
  value,
  detail,
  cta,
  loading,
  onOpen,
}: {
  tone: FocusTone;
  eyebrow: string;
  title: string;
  value: number;
  detail: string;
  cta: string;
  loading: boolean;
  onOpen: () => void;
}) {
  return (
    <button type="button" className={`uc03-tl-focus uc03-tl-focus--${tone}`} onClick={onOpen}>
      <span className="uc03-tl-focus__eyebrow">{eyebrow}</span>
      <strong className="uc03-tl-focus__title">{title}</strong>
      <span className="uc03-tl-focus__value">{loading ? '—' : value}</span>
      <span className="uc03-tl-focus__detail">{detail}</span>
      <span className="uc03-tl-focus__cta">{cta} →</span>
    </button>
  );
}

const HERO_NOTE: Record<SupervisoryRole, string> = {
  TL: 'Journeys still with the PC are counted under Bookings open. TL review is optional.',
  PM: 'Every dealership, outlet and PC of the Project. Search by customer name or mobile number.',
  EXECUTIVE: 'Every dealership, outlet and PC of the Project. Search by customer name or mobile number.',
};

export default function SupervisoryDashboardPage() {
  const project = useProjectContextStore((state) => state.selectedProject);
  const accessToken = useSessionStore((state) => state.accessToken);
  const navigate = useNavigate();
  const role = supervisoryRole(project?.operatingRole);
  const cards: FocusKey[] = role ? focusCardsFor(role) : [];
  const ready = Boolean(project?.tenantId && accessToken && role);
  const today = istDate();

  // The Booking & Delivery Task Queue of a TL / PM (the Phase 1 queue is off
  // for PC, TL and PM, 2026-10-29): the same query as the menu badge.
  const taskQuery = useQuery({
    queryKey: ['p2-tasks-badge', project?.tenantId, role],
    queryFn: () => getP2Tasks(project!.tenantId, accessToken, undefined, { view: 'open', role: role! }),
    enabled: ready && cards.includes('tasks'),
  });
  const dailyOpsSummaryQuery = useQuery({
    queryKey: ['uc03-review-queue-summary', project?.tenantId, 'DAILY_OPS'],
    queryFn: () => getReviewQueueSummary(project!.tenantId, accessToken, 'DAILY_OPS', true),
    enabled: ready && cards.includes('dailyOps'),
  });
  // Today's Project Tracker: the same query (and cache) as the tracker page's Day view.
  const trackerQuery = useQuery({
    queryKey: ['p2-project-tracker', project?.tenantId, 'DAY', today],
    queryFn: () => getProjectTracker(project!.tenantId, 'DAY', today, accessToken ?? undefined),
    enabled: ready && cards.includes('projectTracker'),
    staleTime: 30_000,
  });
  // The Executive's Task Manager: the same query as their menu badge.
  const taskManagerQuery = useQuery({
    queryKey: ['tm-badge', project?.tenantId, role],
    queryFn: () => getTmTasks('project', project!.tenantId, 'mine', 'open', accessToken),
    enabled: ready && cards.includes('taskManager'),
    staleTime: 60_000,
  });

  if (!project || !role) return null;

  const taskData = taskQuery.data;
  // The queue's true size and overdue count (the list itself is capped at 500: "500 / 500 overdue"
  // was its length, 2026-11-14); the list's own figures only when an older API answers.
  const now = Date.now();
  const queueTotal = taskData?.total?.open ?? taskData?.counts?.ALL ?? taskData?.items.length ?? 0;
  const queueOverdue = taskData?.total?.overdue
    ?? (taskData?.items ?? []).filter((t) => t.due_at_utc && Date.parse(t.due_at_utc) < now).length;
  const dailyOpsOpen = dailyOpsSummaryQuery.data?.total ?? 0;
  const tracker = trackerQuery.data?.totals;
  const tmAction = taskManagerQuery.data?.counts?.ACTION ?? 0;

  const focus: Record<FocusKey, () => ReactElement> = {
    tasks: () => (
      <FocusCard
        key="tasks"
        tone="queue"
        eyebrow="Actionable"
        title="Task Queue"
        value={queueTotal}
        detail={queueOverdue > 0 ? `${queueOverdue} overdue` : 'open across your scope'}
        cta="Open Task Queue"
        loading={taskQuery.isPending}
        onOpen={() => navigate('/p2/tasks')}
      />
    ),
    dailyOps: () => (
      <FocusCard
        key="dailyOps"
        tone="ops"
        eyebrow="Outlets"
        title="Daily Operations"
        value={dailyOpsOpen}
        detail={dailyOpsOpen === 1 ? 'open item' : 'open items'}
        cta="Open Daily Operations"
        loading={dailyOpsSummaryQuery.isPending}
        onOpen={() => navigate('/daily-ops')}
      />
    ),
    projectTracker: () => (
      <FocusCard
        key="projectTracker"
        tone="ops"
        eyebrow="Today"
        title="Project Tracker"
        value={tracker?.uploads.files ?? 0}
        detail={tracker
          ? `files uploaded · ${tracker.closed.deliveryFiles} delivery file${tracker.closed.deliveryFiles === 1 ? '' : 's'} closed · ${tracker.gatePass.missing} gate pass missing`
          : trackerQuery.isError ? 'Figures could not be loaded' : 'files uploaded today'}
        cta="Open Project Tracker"
        loading={trackerQuery.isPending}
        onOpen={() => navigate(PROJECT_TRACKER_PATH)}
      />
    ),
    taskManager: () => (
      <FocusCard
        key="taskManager"
        tone="queue"
        eyebrow="Actionable"
        title="Task Manager"
        value={tmAction}
        detail={tmAction === 1 ? 'task waiting on you' : 'tasks waiting on you'}
        cta="Open Task Manager"
        loading={taskManagerQuery.isPending}
        onOpen={() => navigate('/p2/task-manager')}
      />
    ),
  };

  return (
    <div className="screen-stack uc03-tl-dashboard">
      <section className="uc03-tl-hero">
        <div>
          <span className="uc03-tl-hero__eyebrow">{SUPERVISORY_ROLE_LABEL[role]} · Supervisory View</span>
          <h1>Dealer Operations Overview</h1>
          <p>{scopeSummary(project.scope)}</p>
        </div>
        <div className="uc03-tl-hero__note">
          <strong>Every journey</strong>
          <span>{HERO_NOTE[role]}</span>
        </div>
      </section>

      {/* Where each role's day happens, ahead of the booking/delivery
          breakdown below. Counts come straight from the endpoint each
          destination page itself reads. */}
      <section className="uc03-tl-focus-grid" aria-label="Your focus areas">
        {cards.map((card) => focus[card]())}
      </section>

      {/* Who of the team has reached the outlet today, from myHR attendance (product owner
          2026-11-09: "instead of asking manually, the TL/PM can check there itself"). Its own
          request: when myHR is unavailable it says so in one line and nothing else changes. */}
      <TeamTodayCard accessToken={accessToken} projectCode={project.projectCode} />

      <NightlyReprocessingStatusTile />

      {/* Every journey in scope, in tabs and paged on the server (about 1,200
          a month): exceptions first, with each Dealership's, outlet's and PC's
          open, overdue and high-risk counts one click from the list, and a
          search by customer name or mobile number. Of the current calendar
          month by default (product owner 2026-11-07): bookings by booking
          date, deliveries by delivery date, other months on the picker. */}
      <section className="p2w uc03-tl-journeys" aria-label="Journeys">
        {/* The Dealership-wise / Outlet-wise / PC-wise panels are in the Project Tracker's Journeys
            tab for a Team Lead (product owner 2026-11-13). */}
        <JourneyListTabs tenantId={project.tenantId} accessToken={accessToken} role={role} calendarMonth
          showBreakdown={role !== 'TL'} />
      </section>
    </div>
  );
}
