import { useQuery } from '@tanstack/react-query';

import PageHeader from '../components/PageHeader';
import SectionCard from '../components/SectionCard';
import StatusPill from '../components/StatusPill';
import { loadDailyOps } from '../services/webRepository';
import { useSessionStore } from '../store/sessionStore';

export default function DailyOpsPage() {
  const accessToken = useSessionStore((s) => s.accessToken);
  const query = useQuery({ queryKey: ['daily-ops'], queryFn: () => loadDailyOps({ accessToken }) });
  const items = query.data?.items || [];

  return (
    <div className="screen-stack">
      <PageHeader eyebrow="Outlet Operations" title="Daily Operations" description="Track the current day’s operating activity and review recent run history for your outlet." />
      <div className="metric-grid metric-grid--three">
        <article className="metric-card"><span className="metric-card__label">Business Date</span><strong className="metric-card__value metric-card__value--small">{new Date().toLocaleDateString('en-IN')}</strong><span className="metric-card__detail">Today</span></article>
        <article className="metric-card"><span className="metric-card__label">Runs Shown</span><strong className="metric-card__value">{items.length}</strong><span className="metric-card__detail">Recent outlet activity</span></article>
        <article className="metric-card"><span className="metric-card__label">Open Run</span><strong className="metric-card__value">{items.some((run) => run.status !== 'COMPLETED') ? '1' : '0'}</strong><span className="metric-card__detail">Needs completion</span></article>
      </div>
      <SectionCard title="Run History">
        <div className="adaptive-list__desktop">
          <div className="data-table-wrap"><table className="data-table"><thead><tr><th>Business Date</th><th>Outlet</th><th>Process Coordinator</th><th>Started</th><th>Completed</th><th>Status</th></tr></thead><tbody>{items.map((run) => <tr key={run.runId}><td><strong>{run.businessDate}</strong></td><td>{run.outletName || 'Current outlet'}</td><td>{run.pcActorId ? 'Assigned' : 'Not assigned'}</td><td>{new Date(run.startedAtUtc).toLocaleString('en-IN')}</td><td>{run.completedAtUtc ? new Date(run.completedAtUtc).toLocaleString('en-IN') : '—'}</td><td><StatusPill value={run.status} compact /></td></tr>)}</tbody></table></div>
        </div>
        <div className="adaptive-list adaptive-list__mobile">
          {items.map((run) => (
            <article className="adaptive-list-card" key={run.runId}>
              <div className="adaptive-list-card__head"><div><strong>{run.outletName || 'Current Outlet'}</strong><span>{run.businessDate}</span></div><StatusPill value={run.status} compact /></div>
              <div className="adaptive-list-card__details">
                <span>Coordinator <strong>{run.pcActorId ? 'Assigned' : 'Not assigned'}</strong></span>
                <span>Started <strong>{new Date(run.startedAtUtc).toLocaleString('en-IN')}</strong></span>
                <span>Completed <strong>{run.completedAtUtc ? new Date(run.completedAtUtc).toLocaleString('en-IN') : 'Not completed'}</strong></span>
              </div>
            </article>
          ))}
          {items.length === 0 && <div className="adaptive-list-empty">No run history is available for this outlet.</div>}
        </div>
      </SectionCard>
    </div>
  );
}
