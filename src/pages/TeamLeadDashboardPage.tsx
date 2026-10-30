import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import '../styles/uc03-p2.css';
import '../styles/uc03-p2-workspace.css';
import '../styles/uc03-p2-cards.css';

import NightlyReprocessingStatusTile from '../components/NightlyReprocessingStatusTile';
import JourneyListTabs from '../features/uc03-p2/bookings/JourneyListTabs';
import DayStatsCard from '../features/uc03-p2/daily/DayStatsCard';
import { getReviewQueueSummary } from '../services/audit-core/uc03Audit';
import { getP2Tasks } from '../services/audit-core/uc03P2';
import { useProjectContextStore } from '../store/projectContextStore';
import { useSessionStore } from '../store/sessionStore';

// The three places a TL's day-to-day work actually happens -- deciding
// audit flags, working the cross-journey action queue, and logging outlet
// operations. A TL never captures a Booking/Delivery (that stays PC-only),
// so this dashboard's own job is routing attention to these three, not
// offering a fourth place to do capture work. Every count here comes
// straight from the same /review-queue/summary endpoint Task Queue itself
// reads (see ReviewQueuePage.tsx) -- clicking through lands on the exact
// scope/filter that produced the number, so nothing here can drift from
// what the destination page shows.
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

export default function TeamLeadDashboardPage() {
  const project = useProjectContextStore((state) => state.selectedProject);
  const accessToken = useSessionStore((state) => state.accessToken);
  const navigate = useNavigate();
  const enabled = Boolean(project?.tenantId && accessToken && project?.operatingRole === 'TL');

  // The Team Lead's Task Queue is the Booking & Delivery one (the Phase 1
  // queue is off for PC, TL and PM, 2026-10-29): same query as the menu badge.
  const taskQuery = useQuery({
    queryKey: ['p2-tasks-badge', project?.tenantId, 'TL'],
    queryFn: () => getP2Tasks(project!.tenantId, accessToken, undefined, { view: 'open', role: 'TL' }),
    enabled,
  });
  const dailyOpsSummaryQuery = useQuery({
    queryKey: ['uc03-review-queue-summary', project?.tenantId, 'DAILY_OPS'],
    queryFn: () => getReviewQueueSummary(project!.tenantId, accessToken, 'DAILY_OPS', true),
    enabled,
  });

  if (!project || project.operatingRole !== 'TL') return null;

  const scopeSummary = project.scope.allDealers
    ? 'All dealers · All outlets'
    : `${project.scope.dealerCount} dealer${project.scope.dealerCount === 1 ? '' : 's'} · ${project.scope.outletCount} outlet${project.scope.outletCount === 1 ? '' : 's'}`;
  const taskData = taskQuery.data;
  const dailyOpsSummary = dailyOpsSummaryQuery.data;
  const queueTotal = taskData?.counts?.ALL ?? taskData?.items.length ?? 0;
  const now = Date.now();
  const queueOverdue = (taskData?.items ?? []).filter((t) => t.due_at_utc && Date.parse(t.due_at_utc) < now).length;
  const dailyOpsOpen = dailyOpsSummary?.total ?? 0;

  return (
    <div className="screen-stack uc03-tl-dashboard">
      <section className="uc03-tl-hero">
        <div>
          <span className="uc03-tl-hero__eyebrow">Team Lead · Supervisory View</span>
          <h1>Dealer Operations Overview</h1>
          <p>{scopeSummary}</p>
        </div>
        <div className="uc03-tl-hero__note">
          <strong>Every journey</strong>
          <span>Journeys still with the PC are counted under Bookings open. TL review is optional.</span>
        </div>
      </section>

      {/* A TL never captures a Booking/Delivery -- that stays PC-only. These
          three are where a TL's day actually happens, so they lead the
          dashboard, ahead of the booking/delivery breakdown below. Counts
          come straight from the same summary endpoint each destination page
          itself reads, so what's promised here is what's found there. */}
      <section className="uc03-tl-focus-grid" aria-label="Your focus areas">
        <FocusCard
          tone="queue"
          eyebrow="Actionable"
          title="Task Queue"
          value={queueTotal}
          detail={queueOverdue > 0 ? `${queueOverdue} overdue` : 'open across your scope'}
          cta="Open Task Queue"
          loading={taskQuery.isPending}
          onOpen={() => navigate('/p2/tasks')}
        />
        <FocusCard
          tone="ops"
          eyebrow="Outlets"
          title="Daily Operations"
          value={dailyOpsOpen}
          detail={dailyOpsOpen === 1 ? 'open item' : 'open items'}
          cta="Open Daily Operations"
          loading={dailyOpsSummaryQuery.isPending}
          onOpen={() => navigate('/daily-ops')}
        />
      </section>

      {/* The day's stats per PC, outlet and dealership (product owner
          2026-10-30): files uploaded, tasks closed, the daily gate pass and
          deliveries against it, plus the TL's own closures and reviews. */}
      <DayStatsCard tenantId={project.tenantId} accessToken={accessToken} role="TL" />

      <NightlyReprocessingStatusTile />

      {/* Every journey in scope, in tabs and paged on the server (about 1,200
          a month): exceptions first, with each outlet's and PC's open,
          overdue and high-risk counts one click from the list. */}
      <section className="p2w uc03-tl-journeys" aria-label="Journeys">
        <JourneyListTabs tenantId={project.tenantId} accessToken={accessToken} role="TL" />
      </section>
    </div>
  );
}
