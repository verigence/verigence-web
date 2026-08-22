import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

import PageHeader from '../components/PageHeader';
import SectionCard from '../components/SectionCard';
import StatusPill from '../components/StatusPill';
import { loadCrmRegister } from '../services/webRepository';

function readableLabel(value: string) {
  return value
    .replaceAll('_', ' ')
    .toLowerCase()
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export default function CrmPage() {
  const query = useQuery({ queryKey: ['crm-register'], queryFn: loadCrmRegister });
  const items = query.data?.items || [];

  return (
    <div className="screen-stack">
      <PageHeader eyebrow="Customer Follow-up" title="CRM Workspace" description="Review customer follow-ups, interaction status and notes linked to each journey." />
      <SectionCard>
        <div className="crm-grid">
          {items.map((item) => (
            <article className="crm-card" key={item.crmInteractionId}>
              <div className="crm-card__top"><span className="document-mark">CRM</span><StatusPill value={item.interactionStatus} compact /></div>
              <h3>{readableLabel(item.interactionType)}</h3>
              <p>{item.customerName} · {item.journeyReference}</p>
              <div className="crm-card__note">{item.notes || 'No notes added.'}</div>
              <Link className="text-link" to={`/journeys/${item.journeyId}`}>Open Customer Journey</Link>
            </article>
          ))}
          {items.length === 0 && <div className="adaptive-list-empty">No customer follow-ups are currently available.</div>}
        </div>
      </SectionCard>
    </div>
  );
}
