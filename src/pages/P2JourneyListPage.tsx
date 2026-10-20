import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import '../styles/uc03-p2.css';
import '../styles/uc03-p2-workspace.css';
import '../styles/uc03-p2-cards.css';

import PageHeader from '../components/PageHeader';
import JourneyListTabs from '../features/uc03-p2/bookings/JourneyListTabs';
import { getP2BookingsSummary, type P2JourneyCounts } from '../services/audit-core/uc03P2';
import { useProjectContextStore } from '../store/projectContextStore';
import { useSessionStore } from '../store/sessionStore';

/**
 * Booking & Delivery: the journeys in tabs (JourneyListTabs), paged on the
 * server -- a PC's own work first, a TL / PM's exceptions first. Each row says
 * what it needs next; its Actions menu opens the documents workspace,
 * Journey 360, the compliance report or the tasks for your role.
 */
function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function firstName(displayName: string, email: string): string {
  const source = (displayName || email.split('@')[0] || '').replace(/[._-]+/g, ' ').trim();
  return source.split(/\s+/)[0] || 'there';
}

export default function P2JourneyListPage() {
  const project = useProjectContextStore((s) => s.selectedProject);
  const tenantId = project?.tenantId;
  const role = project?.operatingRole;
  const accessToken = useSessionStore((s) => s.accessToken);
  const displayName = useSessionStore((s) => s.displayName);
  const email = useSessionStore((s) => s.email);
  const [counts, setCounts] = useState<P2JourneyCounts | undefined>();
  const summary = useQuery({
    queryKey: ['p2-bookings-summary', tenantId],
    queryFn: () => getP2BookingsSummary(tenantId!, accessToken),
    enabled: Boolean(tenantId && accessToken && counts),
    staleTime: 60_000,
  });
  const s = summary.data;
  // The signed-in role's open tasks, counted the way each row counts them.
  const heroTasks = s?.tasks ? (role === 'TL' ? s.tasks.tl : role === 'PC' ? s.tasks.pc : s.tasks.open) ?? s.tasks.open : undefined;
  const needCount = counts ? (role === 'PC' ? counts.needs_action : counts.needs_tl) : undefined;
  const overdueCount = counts?.overdue ?? 0;
  const subClauses = [
    overdueCount ? `${overdueCount} overdue` : null,
    heroTasks ? `${heroTasks} open task${heroTasks === 1 ? '' : 's'}` : null,
  ].filter(Boolean);

  return (
    <div className="screen-stack p2-screen p2w">
      <PageHeader
        eyebrow="Booking & Delivery"
        title="Booking & Delivery"
        description="Your journeys in tabs, most urgent first. Each row says what it needs next."
      />

      <section className="p2w-hero" aria-labelledby="p2w-hero-title">
        <div className="p2w-hero__top">
          <p className="p2w-hero__greet">{greeting()}, {firstName(displayName, email)}</p>
          {role === 'PC' ? (
            <Link className="p2w-hero__capture" to="/p2/journeys/new/documents">
              <span aria-hidden="true">＋</span>
              <span>Capture new booking</span>
            </Link>
          ) : null}
        </div>
        <h2 id="p2w-hero-title" className="p2w-hero__headline">
          {needCount === undefined ? 'Loading your work…'
            : needCount ? <>{`${needCount} thing${needCount === 1 ? '' : 's'} `}<b>need{needCount === 1 ? 's' : ''} you</b>{' right now'}</>
              : <b>You&rsquo;re all caught up</b>}
        </h2>
        <p className="p2w-hero__sub">
          {needCount === undefined ? 'Counting bookings and deliveries…'
            : subClauses.length ? subClauses.join(' · ')
              : 'Nothing needs your attention right now. New bookings and deliveries will show up here.'}
        </p>
        {/* A TL / PM / Executive sees the same figures in the summary cards
            below; shown twice they read as duplicate (product owner
            2026-10-20). A PC keeps them here. */}
        {role === 'PC' ? <div className="p2w-hero__kpis" aria-label="Summary">
          <div className="p2w-kpi"><b>{s ? s.open.bookings : '—'}</b><span>Bookings open</span></div>
          <div className="p2w-kpi"><b>{s ? s.open.deliveries : '—'}</b><span>Deliveries open</span></div>
          <div className="p2w-kpi"><b>{s ? s.closed?.bookings ?? '—' : '—'}</b><span>Bookings closed</span></div>
          <div className="p2w-kpi"><b>{s ? s.closed?.deliveries ?? '—' : '—'}</b><span>Deliveries closed</span></div>
          <Link className={`p2w-kpi${heroTasks ? ' p2w-kpi--flag' : ''}`} to="/p2/tasks"><b>{s ? heroTasks ?? '—' : '—'}</b><span>Tasks open</span></Link>
        </div> : null}
      </section>

      <JourneyListTabs tenantId={tenantId} accessToken={accessToken} role={role} onCounts={setCounts} />
    </div>
  );
}
