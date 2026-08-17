import { useQuery } from '@tanstack/react-query';

import PageHeader from '../components/PageHeader';
import SectionCard from '../components/SectionCard';
import StatusPill from '../components/StatusPill';
import { loadDailyOps } from '../services/webRepository';
import { useSessionStore } from '../store/sessionStore';

export default function DailyOpsPage() {
  const accessToken = useSessionStore((s) => s.accessToken);
  const query = useQuery({ queryKey: ['daily-ops'], queryFn: () => loadDailyOps({ accessToken }) });
  return (
    <div className="screen-stack">
      <PageHeader eyebrow="Outlet operations" title="Daily operations" description="Operational run state for the current outlet. This screen tracks the audit run; journey facts continue to come from source evidence." backing={query.data?.backing} />
      <div className="metric-grid metric-grid--three"><article className="metric-card"><span className="metric-card__label">Business date</span><strong className="metric-card__value metric-card__value--small">{new Date().toLocaleDateString('en-IN')}</strong><span className="metric-card__detail">Current Web Preview date</span></article><article className="metric-card"><span className="metric-card__label">Runs shown</span><strong className="metric-card__value">{query.data?.items.length || 0}</strong><span className="metric-card__detail">Current outlet history</span></article><article className="metric-card"><span className="metric-card__label">Open run</span><strong className="metric-card__value">{query.data?.items.some((r) => r.status !== 'COMPLETED') ? '1' : '0'}</strong><span className="metric-card__detail">Needs completion</span></article></div>
      <SectionCard title="Run history">
        <div className="data-table-wrap"><table className="data-table"><thead><tr><th>Business date</th><th>Outlet</th><th>PC actor</th><th>Started</th><th>Completed</th><th>Status</th></tr></thead><tbody>{(query.data?.items || []).map((run) => <tr key={run.runId}><td><strong>{run.businessDate}</strong><small>{run.runId}</small></td><td>{run.outletName || run.outletId}</td><td>{run.pcActorId}</td><td>{new Date(run.startedAtUtc).toLocaleString('en-IN')}</td><td>{run.completedAtUtc ? new Date(run.completedAtUtc).toLocaleString('en-IN') : '—'}</td><td><StatusPill value={run.status} compact /></td></tr>)}</tbody></table></div>
      </SectionCard>
    </div>
  );
}
