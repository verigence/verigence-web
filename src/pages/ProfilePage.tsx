import PageHeader from '../components/PageHeader';
import SectionCard from '../components/SectionCard';
import { runtimeConfig } from '../services/runtime';
import { useSessionStore } from '../store/sessionStore';

export default function ProfilePage() {
  const state = useSessionStore();
  return (
    <div className="screen-stack">
      <PageHeader eyebrow="Account" title="Profile & session" description="Development identity and active business scope. Tenant, dealer and outlet are runtime session values established by the login/landing flow; they are never Cloudflare build variables." />
      <div className="profile-grid">
        <SectionCard title="User"><dl className="definition-list"><div><dt>Name</dt><dd>{state.displayName || '—'}</dd></div><div><dt>Email</dt><dd>{state.email || '—'}</dd></div><div><dt>Development role</dt><dd>{state.role}</dd></div></dl></SectionCard>
        <SectionCard title="Active business context"><dl className="definition-list"><div><dt>Tenant</dt><dd>{state.tenantId || 'Established at login'}</dd></div><div><dt>Dealer</dt><dd>{state.dealerId || 'Established at login'}</dd></div><div><dt>Outlet</dt><dd>{state.outletId || 'Established at login'}</dd></div></dl></SectionCard>
        <SectionCard title="Runtime"><dl className="definition-list"><div><dt>Audit Core</dt><dd>{import.meta.env.VITE_AUDIT_CORE_BASE_URL || 'Not configured'}</dd></div><div><dt>Business data</dt><dd>{runtimeConfig.auditCoreConfigured ? 'Audit Core for supported APIs' : 'Audit Core URL required'}</dd></div><div><dt>Scope source</dt><dd>Authenticated runtime session</dd></div></dl></SectionCard>
      </div>
    </div>
  );
}
