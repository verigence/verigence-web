import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

import PageHeader from '../components/PageHeader';
import SectionCard from '../components/SectionCard';
import StatusPill from '../components/StatusPill';
import { loadCrmRegister } from '../services/webRepository';

export default function CrmPage() {
  const query = useQuery({ queryKey: ['crm-register'], queryFn: loadCrmRegister });
  return (
    <div className="screen-stack">
      <PageHeader eyebrow="Customer follow-up" title="CRM workspace" description="Customer interaction tasks triggered by the audit workflow. This aggregate view is Web-backed until Core exposes a cross-journey CRM queue." backing={query.data?.backing} />
      <SectionCard>
        <div className="crm-grid">{(query.data?.items || []).map((item) => <article className="crm-card" key={item.crmInteractionId}><div className="crm-card__top"><span className="document-mark">CRM</span><StatusPill value={item.interactionStatus} compact /></div><h3>{item.interactionType.replaceAll('_', ' ')}</h3><p>{item.customerName} · {item.journeyReference}</p><div className="crm-card__note">{item.notes || 'No notes.'}</div><Link className="text-link" to={`/journeys/${item.journeyId}`}>Open customer journey</Link></article>)}</div>
      </SectionCard>
    </div>
  );
}
