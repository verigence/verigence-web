import type { ChangeEvent } from 'react';

import type { Designation } from '../../services/hr/employees';
import SectionCard from '../../components/SectionCard';
import Field from './Field';
import type { EmployeeFormValues, FormErrors } from './employeeValidation';

/** Departments seen in the company's current employee list; any other text is accepted too. */
const DEPARTMENT_SUGGESTIONS = ['PC', 'RM', 'HR', 'CRM'];

interface Props {
  mode: 'create' | 'edit';
  values: EmployeeFormValues;
  errors: FormErrors;
  states: string[];
  designations: Designation[];
  onChange: (patch: Partial<EmployeeFormValues>) => void;
  /** Edit mode shows the stored (masked) numbers so HR knows what is on file. */
  panMasked?: string | null;
  aadhaarMasked?: string | null;
}

export default function EmployeeFormFields({
  mode,
  values,
  errors,
  states,
  designations,
  onChange,
  panMasked,
  aadhaarMasked,
}: Props) {
  const text =
    (key: keyof EmployeeFormValues) =>
    (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      onChange({ [key]: event.target.value } as Partial<EmployeeFormValues>);

  return (
    <>
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
          <Field label="Total experience (years)" htmlFor="hr-exp" error={errors.totalExperienceYears} hint="Before and including this company.">
            <input id="hr-exp" inputMode="decimal" value={values.totalExperienceYears} onChange={text('totalExperienceYears')} />
          </Field>
          <Field label="Highest qualification (as stated)" htmlFor="hr-qual" error={errors.qualification} hint="Free text. Add degree-wise marks under Qualifications.">
            <input id="hr-qual" value={values.qualification} maxLength={120} onChange={text('qualification')} />
          </Field>
        </div>
      </SectionCard>

      <SectionCard title="Contact">
        <div className="hr-form-grid">
          <Field label="Personal email" htmlFor="hr-email" error={errors.personalEmail} required hint={mode === 'create' ? 'Used as the Verigence sign-in.' : undefined}>
            <input id="hr-email" type="email" inputMode="email" autoComplete="off" value={values.personalEmail} onChange={text('personalEmail')} />
          </Field>
          <Field label="Mobile" htmlFor="hr-mobile" error={errors.mobile} hint="10-digit Indian mobile.">
            <input id="hr-mobile" type="tel" inputMode="tel" autoComplete="off" value={values.mobile} onChange={text('mobile')} />
          </Field>
          <Field label="Address" htmlFor="hr-address" error={errors.address} wide>
            <textarea id="hr-address" rows={2} maxLength={500} value={values.address} onChange={text('address')} />
          </Field>
          <Field label="State" htmlFor="hr-state" error={errors.state}>
            <select id="hr-state" value={values.state} onChange={text('state')}>
              <option value="">Choose a state…</option>
              {states.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="Pincode" htmlFor="hr-pincode" error={errors.pincode}>
            <input id="hr-pincode" inputMode="numeric" maxLength={6} value={values.pincode} onChange={text('pincode')} />
          </Field>
        </div>
      </SectionCard>

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

      <SectionCard title="Employment">
        <div className="hr-form-grid">
          <Field label="Department" htmlFor="hr-dept" error={errors.department}>
            <input id="hr-dept" list="hr-dept-options" value={values.department} maxLength={60} onChange={text('department')} />
            <datalist id="hr-dept-options">
              {DEPARTMENT_SUGGESTIONS.map((d) => <option key={d} value={d} />)}
            </datalist>
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
    </>
  );
}
