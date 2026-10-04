import SectionCard from '../../components/SectionCard';
import type { Employee } from '../../services/hr/employees';
import { experienceLabel, formatDate, statusLabels } from './hrLabels';

const genderLabels = { MALE: 'Male', FEMALE: 'Female', OTHER: 'Other' } as const;
const dash = (v: string | null | undefined) => (v && v.trim() ? v : '—');

interface Props {
  employee: Employee;
  /** The self-service page hides HR-only facts and adds no edit controls here. */
  scope: 'hr' | 'self';
}

export default function EmployeeSummary({ employee: e, scope }: Props) {
  return (
    <>
      <SectionCard title="Personal details">
        <dl className="definition-list hr-definitions">
          <div><dt>Employee code</dt><dd>{e.employeeCode}</dd></div>
          <div><dt>Date of birth</dt><dd>{formatDate(e.dateOfBirth)}</dd></div>
          <div><dt>Gender</dt><dd>{e.gender ? genderLabels[e.gender] : '—'}</dd></div>
          <div><dt>Total experience</dt><dd>{experienceLabel(e.totalExperienceYears)}</dd></div>
          <div><dt>Qualification (as stated)</dt><dd>{dash(e.qualification)}</dd></div>
        </dl>
      </SectionCard>
      <SectionCard title="Employment">
        <dl className="definition-list hr-definitions">
          <div><dt>Department</dt><dd>{dash(e.department)}</dd></div>
          <div><dt>Designation</dt><dd>{e.designation ?? 'Not set'}</dd></div>
          <div><dt>Date of joining</dt><dd>{formatDate(e.dateOfJoining)}</dd></div>
          {scope === 'hr' && <div><dt>Status</dt><dd>{statusLabels[e.employmentStatus]}</dd></div>}
        </dl>
      </SectionCard>
      <SectionCard title="Contact">
        <dl className="definition-list hr-definitions">
          <div><dt>Personal email</dt><dd>{e.personalEmail}</dd></div>
          {scope === 'self' && <div><dt>Secondary email</dt><dd>{dash(e.secondaryEmail)}</dd></div>}
          <div><dt>Mobile</dt><dd>{dash(e.mobile)}</dd></div>
          <div className="hr-definitions__wide"><dt>Address</dt><dd>{dash(e.address)}</dd></div>
          <div><dt>State</dt><dd>{dash(e.state)}</dd></div>
          <div><dt>Pincode</dt><dd>{dash(e.pincode)}</dd></div>
        </dl>
      </SectionCard>
      <SectionCard title="Emergency contact">
        <dl className="definition-list hr-definitions">
          <div><dt>Name</dt><dd>{dash(e.emergencyContactName)}</dd></div>
          <div><dt>Mobile</dt><dd>{dash(e.emergencyContactNumber)}</dd></div>
          <div className="hr-definitions__wide"><dt>Address</dt><dd>{dash(e.emergencyContactAddress)}</dd></div>
        </dl>
      </SectionCard>
    </>
  );
}
