import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

import PageHeader from '../components/PageHeader';
import SectionCard from '../components/SectionCard';
import StatusPill from '../components/StatusPill';
import { loadReviews } from '../services/webRepository';
import { useSessionStore } from '../store/sessionStore';

const roleLabels: Record<string, string> = {
  TL: 'Team Lead',
  PM: 'Project Manager',
};

export default function ReviewQueuePage() {
  const role = useSessionStore((s) => s.role);
  const [filter, setFilter] = useState<'ALL' | 'TL' | 'PM'>(role === 'PM' ? 'PM' : role === 'TL' ? 'TL' : 'ALL');
  const query = useQuery({ queryKey: ['review-queue'], queryFn: loadReviews });
  const items = useMemo(() => (query.data?.items || []).filter((item) => filter === 'ALL' || item.assignedRole === filter), [query.data, filter]);

  return (
    <div className="screen-stack">
      <PageHeader eyebrow="Assurance" title="Review Queue" description="Review submitted journeys, compare the supporting evidence and findings, and complete the required decision." backing={query.data?.backing} />
      <SectionCard>
        <div className="toolbar-row"><div className="segmented-control" aria-label="Review role"><button className={filter === 'ALL' ? 'active' : ''} onClick={() => setFilter('ALL')}>All</button><button className={filter === 'TL' ? 'active' : ''} onClick={() => setFilter('TL')}>Team Lead</button><button className={filter === 'PM' ? 'active' : ''} onClick={() => setFilter('PM')}>Project Manager</button></div><span className="toolbar-count">{items.length} pending</span></div>
        <div className="review-queue-grid">
          {items.map((item) => (
            <Link to={`/journeys/${item.journeyId}?review=1`} className="review-card" key={item.taskId}>
              <div className="review-card__top"><StatusPill value={item.severity} compact /><span>{roleLabels[item.assignedRole] || item.assignedRole} Review</span></div>
              <h3>{item.customerName}</h3><p>{item.journeyReference} · {item.outletName}</p>
              <div className="review-card__stats"><span><strong>{item.evidenceCount}</strong> evidence</span><span><strong>{item.exceptionCount}</strong> exceptions</span></div>
              <div className="review-card__footer"><span>Submitted {new Date(item.submittedAt).toLocaleString('en-IN')}</span><strong>Review →</strong></div>
            </Link>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}
