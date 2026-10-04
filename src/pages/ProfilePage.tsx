import { Link } from 'react-router-dom';

import PageHeader from '../components/PageHeader';
import SectionCard from '../components/SectionCard';
import { initialsOf } from '../features/hr/EmployeeAvatar';
import PhotoPicker from '../features/hr/PhotoPicker';
import { useMyHrIdentity, useUploadMyPhoto } from '../features/hr/myIdentity';
import { chooseDisplayName, workContextLabels } from '../features/profile/workContext';
import { useProjectContextStore } from '../store/projectContextStore';
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
  const selectedProject = useProjectContextStore((s) => s.selectedProject);
  const me = useMyHrIdentity();
  const upload = useUploadMyPhoto();
  const name = chooseDisplayName(me.fullName, state.displayName);
  const context = workContextLabels(selectedProject, state.outletId);

  return (
    <div className="screen-stack profile-page">
      <PageHeader eyebrow="Account" title="Profile" description="Your Verigence account and current work context." />
      <div className="profile-grid">
        <SectionCard title="Your Details">
          <div className="profile-photo">
            <span className="hr-avatar hr-avatar--lg" role="img" aria-label={name ? `Photo of ${name}` : 'Profile photo'}>
              {me.photoUrl ? <img src={me.photoUrl} alt="" /> : <span aria-hidden="true">{initialsOf(name || '?')}</span>}
            </span>
            {me.hasRecord && (
              <PhotoPicker label={me.hasPhoto ? 'Change photo' : 'Upload photo'} busy={upload.isPending} onPick={async (p) => { await upload.mutateAsync(p); }} />
            )}
          </div>
          <dl className="definition-list">
            <div><dt>Name</dt><dd>{name || 'Not available'}</dd></div>
            <div><dt>Email</dt><dd>{state.email || 'Not available'}</dd></div>
            <div><dt>Role</dt><dd>{roleLabels[state.role] || state.role}</dd></div>
          </dl>
        </SectionCard>
        <SectionCard title="Work Context">
          <dl className="definition-list">
            <div><dt>Project</dt><dd>{context.project}</dd></div>
            <div><dt>Dealer</dt><dd>{context.dealer}</dd></div>
            <div><dt>Outlet</dt><dd>{context.outlet}</dd></div>
          </dl>
        </SectionCard>
        <SectionCard title="Verigence Mobile App">
          <p>Install the official Verigence Android application from our secure app portal.</p>
          <Link className="button-primary" to="/apps">Download Android App</Link>
        </SectionCard>
      </div>
    </div>
  );
}
