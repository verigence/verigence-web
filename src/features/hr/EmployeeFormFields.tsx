import type { ChangeEvent } from 'react';

import type { Designation } from '../../services/hr/employees';
import SectionCard from '../../components/SectionCard';
import Field from './Field';
import type { EmployeeFormValues, FormErrors } from './employeeValidation';

interface SectionProps {
  mode: 'create' | 'edit';
  values: EmployeeFormValues;
  errors: FormErrors;
  onChange: (patch: Partial<EmployeeFormValues>) => void;
}

type Input = ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>;
const textOf = (onChange: SectionProps['onChange'], key: keyof EmployeeFormValues) => (event: Input) =>
  onChange({ [key]: event.target.value } as Partial<EmployeeFormValues>);

/** Code, name, birth date and gender. The guided flow leaves experience and qualification to its Qualification step. */
export function PersonalSection({ mode, values, errors, onChange, withExperience = true }: SectionProps & { withExperience?: boolean }) {
  const text = (key: keyof EmployeeFormValues) => textOf(onChange, key);
  return (
    <SectionCard title="Personal details">
      <div className="hr-form-grid">
        <Field label="Employee code" htmlFor="hr-code" error={errors.employeeCode} required hint={mode === 'edit' ? 'The code cannot be changed.' : 'For example JBR033.'}>
          <input id="hr-code" value={values.employeeCode} disabled={mode === 'edit'} maxLength={20} autoCapitalize="characters" onChange={text('employeeCode')} />
        </Field>
        <Field label="Full name" htmlFor="hr-name" error={errors.fullName} required>
          <input id="hr-name" value={values.fullName} maxLength={120} autoComplete="off" onChange={text('fullName')} />
        </Field>
        <Field label="Date of birth" htmlFor="hr-dob" error={errors.dateOfBirth}>
          <input id="hr-dob" type="date" value={values.dateOfBirth} onChange={text('dateOfBirth')} />
        </Field>
        <Field label="Gender" htmlFor="hr-gender" error={errors.gender}>
          <select id="hr-gender" value={values.gender} onChange={text('gender')}>
            <option value="">Not stated</option>
            <option value="MALE">Male</option>
            <option value="FEMALE">Female</option>
            <option value="OTHER">Other</option>
          </select>
        </Field>
        {withExperience && <ExperienceFields values={values} errors={errors} onChange={onChange} />}
      </div>
    </SectionCard>
  );
}

/** Years of experience and the free-text highest qualification (fields inside a grid). */
export function ExperienceFields({ values, errors, onChange }: Omit<SectionProps, 'mode'>) {
  const text = (key: keyof EmployeeFormValues) => textOf(onChange, key);
  return (
    <>
      <Field label="Total experience (years)" htmlFor="hr-exp" error={errors.totalExperienceYears} hint="Before and including this company.">
        <input id="hr-exp" inputMode="decimal" value={values.totalExperienceYears} onChange={text('totalExperienceYears')} />
      </Field>
      <Field label="Highest qualification (as stated)" htmlFor="hr-qual" error={errors.qualification} hint="Free text. Add degree-wise marks under Qualifications.">
        <input id="hr-qual" value={values.qualification} maxLength={120} onChange={text('qualification')} />
      </Field>
    </>
  );
}

export function ContactSection({ mode, values, errors, onChange, states, withAddress = true, hasLogin = false }: SectionProps & { states: string[]; withAddress?: boolean; hasLogin?: boolean }) {
  const text = (key: keyof EmployeeFormValues) => textOf(onChange, key);
  return (
    <SectionCard title="Contact">
      <div className="hr-form-grid">
        <Field label="Personal email" htmlFor="hr-email" error={errors.personalEmail} required hint={mode === 'create' ? 'Used as the Verigence sign-in.' : hasLogin ? 'This is also the Verigence sign-in. Changing it here changes the login email. The password stays the same.' : undefined}>
          <input id="hr-email" type="email" inputMode="email" autoComplete="off" value={values.personalEmail} onChange={text('personalEmail')} />
        </Field>
        <Field label="Mobile" htmlFor="hr-mobile" error={errors.mobile} hint={hasLogin && mode === 'edit' ? '10-digit Indian mobile. Also saved on the Verigence login.' : '10-digit Indian mobile.'}>
          <input id="hr-mobile" type="tel" inputMode="tel" autoComplete="off" value={values.mobile} onChange={text('mobile')} />
        </Field>
        {withAddress && <AddressFields values={values} errors={errors} onChange={onChange} states={states} />}
      </div>
    </SectionCard>
  );
}

/** Address, state, district and pincode (fields inside a grid). District is expected but may be left empty. */
export function AddressFields({ values, errors, onChange, states }: Omit<SectionProps, 'mode'> & { states: string[] }) {
  const text = (key: keyof EmployeeFormValues) => textOf(onChange, key);
  return (
    <>
      <Field label="Address" htmlFor="hr-address" error={errors.address} wide>
        <textarea id="hr-address" rows={2} maxLength={500} value={values.address} onChange={text('address')} />
      </Field>
      <Field label="State" htmlFor="hr-state" error={errors.state}>
        <select id="hr-state" value={values.state} onChange={text('state')}>
          <option value="">Choose a state…</option>
          {states.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </Field>
      <Field label="District" htmlFor="hr-district" error={errors.district} required hint="If left empty, it is listed under Pending details.">
        <input id="hr-district" value={values.district} maxLength={80} autoComplete="off" aria-required="true" onChange={text('district')} />
      </Field>
      <Field label="Pincode" htmlFor="hr-pincode" error={errors.pincode}>
        <input id="hr-pincode" inputMode="numeric" maxLength={6} value={values.pincode} onChange={text('pincode')} />
      </Field>
    </>
  );
}

export function EmergencySection({ values, errors, onChange }: Omit<SectionProps, 'mode'>) {
  const text = (key: keyof EmployeeFormValues) => textOf(onChange, key);
  return (
    <SectionCard title="Emergency contact">
      <div className="hr-form-grid">
        <Field label="Name" htmlFor="hr-ec-name" error={errors.emergencyContactName}>
          <input id="hr-ec-name" value={values.emergencyContactName} maxLength={120} onChange={text('emergencyContactName')} />
        </Field>
        <Field label="Mobile" htmlFor="hr-ec-number" error={errors.emergencyContactNumber}>
          <input id="hr-ec-number" type="tel" inputMode="tel" value={values.emergencyContactNumber} onChange={text('emergencyContactNumber')} />
        </Field>
        <Field label="Address" htmlFor="hr-ec-address" error={errors.emergencyContactAddress} wide>
          <textarea id="hr-ec-address" rows={2} maxLength={500} value={values.emergencyContactAddress} onChange={text('emergencyContactAddress')} />
        </Field>
      </div>
    </SectionCard>
  );
}

export function EmploymentSection({ mode, values, errors, onChange, designations, departments }: SectionProps & { designations: Designation[]; departments: string[] }) {
  const text = (key: keyof EmployeeFormValues) => textOf(onChange, key);
  return (
    <SectionCard title="Employment">
      <div className="hr-form-grid">
        <Field label="Department" htmlFor="hr-dept" error={errors.department}>
          {/* An older record may hold some other text; it shows as "Choose a department" until a listed one is picked. */}
          <select id="hr-dept" value={departments.includes(values.department) ? values.department : ''} onChange={text('department')}>
            <option value="">Choose a department</option>
            {departments.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </Field>
        <Field label="Designation" htmlFor="hr-designation" error={errors.designationCode} hint="Set by HR. Separate from the project role (PC, TL, PM).">
          <select id="hr-designation" value={values.designationCode} onChange={text('designationCode')}>
            <option value="">Not set</option>
            {designations.map((d) => <option key={d.code} value={d.code}>{d.label}</option>)}
          </select>
        </Field>
        <Field label="Date of joining" htmlFor="hr-doj" error={errors.dateOfJoining}>
          <input id="hr-doj" type="date" value={values.dateOfJoining} onChange={text('dateOfJoining')} />
        </Field>
        {mode === 'edit' && (
          <Field label="Employment status" htmlFor="hr-status" error={errors.employmentStatus}>
            <select id="hr-status" value={values.employmentStatus} onChange={text('employmentStatus')}>
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
              <option value="EXITED">Exited</option>
            </select>
          </Field>
        )}
      </div>
    </SectionCard>
  );
}

export function IdentitySection({
  mode,
  values,
  errors,
  onChange,
  panMasked,
  aadhaarMasked,
}: SectionProps & {
  /** Edit mode shows the stored (masked) numbers so HR knows what is on file. */
  panMasked?: string | null;
  aadhaarMasked?: string | null;
}) {
  const text = (key: keyof EmployeeFormValues) => textOf(onChange, key);
  return (
    <SectionCard
      title="Identity numbers"
      description="Optional now. A missing or repeated PAN does not block saving; it is flagged on the employee so it can be fixed."
    >
      <div className="hr-form-grid">
        <Field
          label="PAN"
          htmlFor="hr-pan"
          error={errors.pan}
          hint={mode === 'edit' ? (panMasked ? `On file: ${panMasked}. Leave blank to keep it.` : 'None on file.') : 'For example ABCDE1234F.'}
        >
          <input id="hr-pan" value={values.pan} maxLength={10} autoCapitalize="characters" autoComplete="off" onChange={text('pan')} />
        </Field>
        <Field
          label="Aadhaar"
          htmlFor="hr-aadhaar"
          error={errors.aadhaar}
          hint={mode === 'edit' ? (aadhaarMasked ? `On file: ${aadhaarMasked}. Leave blank to keep it.` : 'None on file.') : '12 digits.'}
        >
          <input id="hr-aadhaar" inputMode="numeric" value={values.aadhaar} maxLength={14} autoComplete="off" onChange={text('aadhaar')} />
        </Field>
      </div>
    </SectionCard>
  );
}

interface Props extends SectionProps {
  states: string[];
  designations: Designation[];
  departments: string[];
  panMasked?: string | null;
  aadhaarMasked?: string | null;
  /** The employee has a Verigence login: email and mobile changes also change the login. */
  hasLogin?: boolean;
}

/** The whole record in one form (used when editing an employee). */
export default function EmployeeFormFields({ mode, values, errors, states, designations, departments, onChange, panMasked, aadhaarMasked, hasLogin }: Props) {
  const common = { mode, values, errors, onChange };
  return (
    <>
      <PersonalSection {...common} />
      <ContactSection {...common} states={states} hasLogin={hasLogin} />
      <EmergencySection {...common} />
      <EmploymentSection {...common} designations={designations} departments={departments} />
      <IdentitySection {...common} panMasked={panMasked} aadhaarMasked={aadhaarMasked} />
    </>
  );
}
