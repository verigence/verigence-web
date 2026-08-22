import PageHeader from '../components/PageHeader';
import SectionCard from '../components/SectionCard';
import { useSessionStore } from '../store/sessionStore';

const roleLabels: Record<string, string> = {
  PC: 'Process Consultant',
  TL: 'Team Lead',
  PM: 'Project Manager',
  CRM: 'CRM',
  TENANT_ADMIN: 'Tenant Admin',
  SUPER_ADMIN: 'SuperAdmin',
  Executive: 'Executive',
};

export default function ProfilePage() {
  const state = useSessionStore();
  const assigned = (value: string) => value ? 'Assigned' : 'Not assigned';

  return (
    <div className="screen-stack profile-page">
      <PageHeader eyebrow="Account" title="Profile" description="Your Verigence account and current work context." />
      <div className="profile-grid">
        <SectionCard title="Your Details">
          <dl className="definition-list">
            <div><dt>Name</dt><dd>{state.displayName || 'Not available'}</dd></div>
            <div><dt>Email</dt><dd>{state.email || 'Not available'}</dd></div>
            <div><dt>Role</dt><dd>{roleLabels[state.role] || state.role}</dd></div>
          </dl>
        </SectionCard>
        <SectionCard title="Work Context">
          <dl className="definition-list">
            <div><dt>Project</dt><dd>{assigned(state.tenantId)}</dd></div>
            <div><dt>Dealer</dt><dd>{assigned(state.dealerId)}</dd></div>
            <div><dt>Outlet</dt><dd>{assigned(state.outletId)}</dd></div>
          </dl>
        </SectionCard>
      </div>
    </div>
  );
}
