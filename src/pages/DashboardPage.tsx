import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

import MetricCard from '../components/MetricCard';
import PageHeader from '../components/PageHeader';
import SectionCard from '../components/SectionCard';
import StatusPill from '../components/StatusPill';
import { loadDashboard } from '../services/webRepository';
import { useSessionStore } from '../store/sessionStore';

export default function DashboardPage() {
  const role = useSessionStore((state) => state.role);
  const accessToken = useSessionStore((state) => state.accessToken);
  const query = useQuery({ queryKey: ['dashboard', role], queryFn: () => loadDashboard(role, { accessToken }) });
  const model = query.data;

  return (
    <div className="screen-stack">
      <PageHeader
        eyebrow="Your Workspace"
        title="Today at a Glance"
        description="See the work that needs your attention, recent journeys and important exceptions."
      />

      {query.isError ? (
        <section className="dashboard-load-state" role="status" aria-live="polite">
          <div className="dashboard-load-state__mark" aria-hidden="true">!</div>
          <div className="dashboard-load-state__copy">
            <strong>We couldn't load your workspace.</strong>
            <p>Please try again. If the problem continues, contact your Verigence administrator.</p>
          </div>
          <button className="user-menu-button dashboard-load-state__retry" type="button" onClick={() => query.refetch()} disabled={query.isFetching}>
            {query.isFetching ? 'Trying again…' : 'Try Again'}
          </button>
        </section>
      ) : (
        <>
          <div className="metric-grid">
            {(model?.metrics || Array.from({ length: 4 }, () => ({ label: 'Loading', value: '—', detail: 'Please wait' }))).map((metric, index) => (
              <MetricCard key={`${metric.label}-${index}`} metric={metric} />
            ))}
          </div>

          <div className="dashboard-grid">
            <SectionCard title="Priority Work" description="Items that need your attention first.">
              <div className="compact-list">
                {(model?.priorityWork || []).map((item) => (
                  <Link className="compact-list__row" key={item.taskId} to={`/journeys/${item.journeyId}?review=1`}>
                    <span>
                      <strong>{item.customerName}</strong>
                      <small>{item.journeyReference} · {item.outletName}</small>
                    </span>
                    <span className="compact-list__meta">
                      <StatusPill value={item.severity} compact />
                      <small>{item.exceptionCount} exceptions</small>
                    </span>
                  </Link>
                ))}
                {model && model.priorityWork.length === 0 && <p className="muted-copy">No priority work right now.</p>}
              </div>
            </SectionCard>

            <SectionCard title="Recent Journeys" action={<Link className="text-link" to="/journeys">View All</Link>}>
              <div className="compact-list">
                {(model?.recentJourneys || []).map((journey) => (
                  <Link className="compact-list__row" key={journey.journeyId} to={`/journeys/${journey.journeyId}`}>
                    <span>
                      <strong>{journey.customerName}</strong>
                      <small>{journey.journeyReference} · {journey.productLabel || 'Vehicle details pending'}</small>
                    </span>
                    <span className="compact-list__meta">
                      <StatusPill value={journey.auditState} compact />
                      <small>{journey.evidenceCount} evidence</small>
                    </span>
                  </Link>
                ))}
              </div>
            </SectionCard>
          </div>

          <section className="evidence-principle-banner">
            <div className="evidence-principle-banner__mark">EV</div>
            <div>
              <strong>Capture evidence once.</strong>
              <p>Add the document or screenshot and Verigence carries the available information into the journey for you.</p>
            </div>
            <Link className="secondary-link-button secondary-link-button--compact" to="/evidence">Open Evidence</Link>
          </section>
        </>
      )}
    </div>
  );
}
