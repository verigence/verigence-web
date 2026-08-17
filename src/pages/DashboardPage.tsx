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
        eyebrow="Role workspace"
        title="Today at a glance"
        description="Prioritized work, audit journeys and exceptions for your current operating role."
        backing={model?.backing}
      />

      <div className="metric-grid">
        {(model?.metrics || Array.from({ length: 4 }, () => ({ label: 'Loading', value: '—', detail: 'Retrieving workspace' }))).map((metric, index) => (
          <MetricCard key={`${metric.label}-${index}`} metric={metric} />
        ))}
      </div>

      <div className="dashboard-grid">
        <SectionCard title="Priority work" description="Items that need attention before lower-risk work.">
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
            {model && model.priorityWork.length === 0 && <p className="muted-copy">No priority work in this preview role.</p>}
          </div>
        </SectionCard>

        <SectionCard title="Recent journeys" action={<Link className="text-link" to="/journeys">View all</Link>}>
          <div className="compact-list">
            {(model?.recentJourneys || []).map((journey) => (
              <Link className="compact-list__row" key={journey.journeyId} to={`/journeys/${journey.journeyId}`}>
                <span>
                  <strong>{journey.customerName}</strong>
                  <small>{journey.journeyReference} · {journey.productLabel || 'Product pending'}</small>
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
          <strong>Evidence first, not data entry.</strong>
          <p>Operational audit screens show facts derived from documents, screenshots or source systems. Upload the evidence; Verigence carries the facts forward.</p>
        </div>
        <Link className="secondary-link-button secondary-link-button--compact" to="/evidence">Open evidence</Link>
      </section>
    </div>
  );
}
