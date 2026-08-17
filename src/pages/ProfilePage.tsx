import PageHeader from '../components/PageHeader';
import SectionCard from '../components/SectionCard';
import { runtimeConfig } from '../services/runtime';
import { useSessionStore } from '../store/sessionStore';

export default function ProfilePage() {
  const state = useSessionStore();
  return (
    <div className="screen-stack">
      <PageHeader eyebrow="Account" title="Profile & session" description="Web identity context. In Core mode the authoritative role and permissions will come from Security-issued access tokens; Web Preview never becomes the authorization source." />
      <div className="profile-grid">
        <SectionCard title="User"><dl className="definition-list"><div><dt>Name</dt><dd>{state.displayName}</dd></div><div><dt>Email</dt><dd>{state.email}</dd></div><div><dt>Preview role</dt><dd>{state.role}</dd></div><div><dt>Tenant</dt><dd>{state.tenantId}</dd></div></dl></SectionCard>
        <SectionCard title="Runtime"><dl className="definition-list"><div><dt>Mode</dt><dd>{runtimeConfig.mode.toUpperCase()}</dd></div><div><dt>Audit Core</dt><dd>{import.meta.env.VITE_AUDIT_CORE_BASE_URL || 'Not configured'}</dd></div><div><dt>Default outlet</dt><dd>{runtimeConfig.defaultOutletId}</dd></div><div><dt>Authorization</dt><dd>{runtimeConfig.mode === 'demo' ? 'Web Preview only' : 'Bearer token required'}</dd></div></dl></SectionCard>
      </div>
    </div>
  );
}
