import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

import PageHeader from '../components/PageHeader';
import SectionCard from '../components/SectionCard';
import StatusPill from '../components/StatusPill';
import { loadEscalationsRegister } from '../services/webRepository';

export default function EscalationsPage() {
  const query = useQuery({ queryKey: ['escalations-register'], queryFn: loadEscalationsRegister });
  return (
    <div className="screen-stack">
      <PageHeader eyebrow="Governance" title="Escalations" description="Material exceptions requiring a higher-level owner. Per-journey escalation APIs are already wired; this cross-journey register remains a Web aggregate." backing={query.data?.backing} />
      <SectionCard>
        <div className="finding-list">{(query.data?.items || []).map((item) => <article className="finding-card" key={item.escalationId}><div className="finding-card__severity"><StatusPill value={item.severity} compact /><StatusPill value={item.status} compact /></div><div><h3>{item.summary}</h3><p>{item.escalationType.replaceAll('_', ' ')} · Assigned {item.assignedRoleCode || 'unassigned'}</p><small>Opened {new Date(item.openedAtUtc).toLocaleString('en-IN')}</small></div><div className="finding-card__link"><span>{item.journeyReference}</span><Link className="text-link" to={`/journeys/${item.journeyId}`}>Open journey</Link></div></article>)}</div>
      </SectionCard>
    </div>
  );
}
