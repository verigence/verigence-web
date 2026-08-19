import { useMemo, useState } from 'react';

import PageHeader from '../components/PageHeader';
import SectionCard from '../components/SectionCard';
import StatusPill from '../components/StatusPill';

const assignments = [
  { name: 'Ananya Sharma', email: 'ananya.sharma@example.test', role: 'PC', project: 'North Region Audit Programme', scope: 'Northstar Motors · Chandigarh Central', effective: '01 Aug 2026', status: 'ACTIVE' },
  { name: 'Nitin Gupta', email: 'nitin.gupta@example.test', role: 'PC', project: 'North Region Audit Programme', scope: 'Northstar Motors · Mohali Airport Road', effective: '01 Aug 2026', status: 'ACTIVE' },
  { name: 'Rohan Kapoor', email: 'rohan.kapoor@example.test', role: 'TL', project: 'North Region Audit Programme', scope: 'Northstar Motors · All outlets', effective: '01 Aug 2026', status: 'ACTIVE' },
  { name: 'Priya Sethi', email: 'priya.sethi@example.test', role: 'PM', project: 'North Region Audit Programme', scope: 'All dealers / outlets', effective: '01 Aug 2026', status: 'ACTIVE' },
  { name: 'Maya Arora', email: 'maya.arora@example.test', role: 'CRM', project: 'North Region Audit Programme', scope: 'All dealers / outlets', effective: '05 Aug 2026', status: 'ACTIVE' },
];

const dealershipPeople = [
  { name: 'Vikas Batra', participantRole: 'Sales Consultant', dealer: 'Northstar Motors', outlet: 'Chandigarh Central', reference: 'SC-184' },
  { name: 'Gaurav Anand', participantRole: 'Sales Manager', dealer: 'Northstar Motors', outlet: 'Chandigarh Central', reference: 'SM-042' },
  { name: 'Neha Sood', participantRole: 'Accounts', dealer: 'Northstar Motors', outlet: 'Chandigarh Central', reference: 'ACC-017' },
  { name: 'Karan Walia', participantRole: 'Delivery Coordinator', dealer: 'Northstar Motors', outlet: 'Mohali Airport Road', reference: 'DEL-028' },
];

export default function TeamAssignmentsPage() {
  const [role, setRole] = useState('ALL');
  const filtered = useMemo(() => assignments.filter((item) => role === 'ALL' || item.role === role), [role]);
  return (
    <div className="screen-stack">
      <PageHeader eyebrow="Administration" title="Team & assignments" description="Project, dealer and outlet scope assignments for Verigence users, plus dealership participant references required for audit traceability. Historical assignment ownership must remain preserved when backend persistence is added." backing="WEB_DEMO" />
      <SectionCard title="Verigence project team" description="Role and operating scope by Project/Dealer/Outlet.">
        <div className="toolbar-row"><label className="filter-select"><span>Role</span><select value={role} onChange={(event) => setRole(event.target.value)}><option value="ALL">All roles</option><option value="PC">PC</option><option value="TL">TL</option><option value="PM">PM</option><option value="CRM">CRM</option></select></label><span className="toolbar-count">{filtered.length} assignments</span></div>
        <div className="data-table-wrap"><table className="data-table"><thead><tr><th>Person</th><th>Role</th><th>Project</th><th>Business scope</th><th>Effective</th><th>Status</th></tr></thead><tbody>{filtered.map((item) => <tr key={item.email}><td><strong>{item.name}</strong><small>{item.email}</small></td><td>{item.role}</td><td>{item.project}</td><td>{item.scope}</td><td>{item.effective}</td><td><StatusPill value={item.status} compact /></td></tr>)}</tbody></table></div>
      </SectionCard>
      <SectionCard title="Dealership participants" description="Dealership staff are audit participants/references; they are not automatically Verigence application users.">
        <div className="participant-grid">{dealershipPeople.map((person) => <article className="participant-card" key={person.reference}><span className="participant-card__avatar">{person.name.split(' ').map((part) => part[0]).join('').slice(0, 2)}</span><div><strong>{person.name}</strong><span>{person.participantRole}</span><small>{person.dealer} · {person.outlet}</small><small>{person.reference}</small></div></article>)}</div>
      </SectionCard>
      <div className="backend-gap-banner"><strong>Backend follow-up later</strong><span>Assignment history and dealership-participant administration do not have a public Audit Core Web contract in the current mounted API. The screen is complete in Web Preview; persistence is intentionally deferred.</span></div>
    </div>
  );
}
