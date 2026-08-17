import { useQuery } from '@tanstack/react-query';

import PageHeader from '../components/PageHeader';
import SectionCard from '../components/SectionCard';
import StatusPill from '../components/StatusPill';
import { loadOrganization } from '../services/webRepository';
import { useSessionStore } from '../store/sessionStore';

export default function OrganizationAdminPage() {
  const accessToken = useSessionStore((s) => s.accessToken);
  const query = useQuery({ queryKey: ['organization'], queryFn: () => loadOrganization({ accessToken }) });
  const data = query.data;
  return (
    <div className="screen-stack">
      <PageHeader eyebrow="Administration" title="Organization setup" description="Tenant project, dealer and outlet hierarchy. Administrative configuration is genuine master data, so this is intentionally separate from evidence-led audit screens." backing={data?.backing} />
      <div className="metric-grid metric-grid--three"><article className="metric-card"><span className="metric-card__label">Project</span><strong className="metric-card__value metric-card__value--small">{data?.project.projectCode || '—'}</strong><span className="metric-card__detail">{data?.project.projectName || 'Loading'}</span></article><article className="metric-card"><span className="metric-card__label">Dealers</span><strong className="metric-card__value">{data?.dealers.length || 0}</strong><span className="metric-card__detail">Tenant hierarchy</span></article><article className="metric-card"><span className="metric-card__label">Outlets</span><strong className="metric-card__value">{data?.outlets.length || 0}</strong><span className="metric-card__detail">Operating locations</span></article></div>
      <SectionCard title="Dealers and outlets">
        <div className="organization-grid">{(data?.dealers || []).map((dealer) => <article className="organization-card" key={dealer.dealerId}><div className="organization-card__top"><span><strong>{dealer.dealerName}</strong><small>{dealer.dealerCode}</small></span><StatusPill value={dealer.status} compact /></div><p>{dealer.legalName || 'Legal name not configured'}</p><div className="outlet-list">{(data?.outlets || []).filter((o) => o.dealerId === dealer.dealerId).map((outlet) => <div key={outlet.outletId}><span><strong>{outlet.outletName}</strong><small>{outlet.outletCode} · {outlet.outletClassification}</small></span><span><small>{[outlet.city, outlet.stateRegion].filter(Boolean).join(', ')}</small><StatusPill value={outlet.status} compact /></span></div>)}</div></article>)}</div>
      </SectionCard>
    </div>
  );
}
