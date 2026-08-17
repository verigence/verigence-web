import PageHeader from '../components/PageHeader';
import SectionCard from '../components/SectionCard';
import { runtimeConfig } from '../services/runtime';
import { useSessionStore } from '../store/sessionStore';

export default function ProfilePage() {
  const state = useSessionStore();
  return (
    <div className="screen-stack">
      <PageHeader eyebrow="Account" title="Profile & session" description="Development identity context. Business screens use Audit Core directly where the API exists; the temporary role selector is not an authorization source." />
      <div className="profile-grid">
        <SectionCard title="User"><dl className="definition-list"><div><dt>Name</dt><dd>{state.displayName}</dd></div><div><dt>Email</dt><dd>{state.email}</dd></div><div><dt>Development role</dt><dd>{state.role}</dd></div><div><dt>Tenant</dt><dd>{state.tenantId}</dd></div></dl></SectionCard>
        <SectionCard title="Runtime"><dl className="definition-list"><div><dt>Web environment</dt><dd>Development</dd></div><div><dt>Audit Core</dt><dd>{import.meta.env.VITE_AUDIT_CORE_BASE_URL || 'Not configured'}</dd></div><div><dt>Default outlet</dt><dd>{runtimeConfig.defaultOutletId}</dd></div><div><dt>Business data</dt><dd>{runtimeConfig.auditCoreConfigured ? 'Audit Core for supported APIs' : 'Audit Core URL required'}</dd></div><div><dt>Authentication</dt><dd>Temporary Web development bridge</dd></div></dl></SectionCard>
      </div>
    </div>
  );
}
