import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

import PageHeader from '../../components/PageHeader';
import SectionCard from '../../components/SectionCard';
import { hrErrorMessage, HrHttpError } from '../../services/hr/client';
import {
  addMyExperience,
  addMyQualification,
  getMyEmployee,
  removeMyExperience,
  removeMyQualification,
  replaceMyExperience,
  replaceMyQualification,
  revealMySensitive,
  updateMyEmployee,
  uploadMyPhoto,
  type EmployeeDetail,
  type ExperienceInput,
  type QualificationInput,
} from '../../services/hr/employees';
import { useSessionStore } from '../../store/sessionStore';
import EmployeeAvatar from '../../features/hr/EmployeeAvatar';
import EmployeeSummary from '../../features/hr/EmployeeSummary';
import ExperiencePanel from '../../features/hr/ExperiencePanel';
import Field from '../../features/hr/Field';
import PhotoPicker from '../../features/hr/PhotoPicker';
import QualificationsPanel from '../../features/hr/QualificationsPanel';
import SensitiveNumbers from '../../features/hr/SensitiveNumbers';
import {
  buildSelfPayload,
  selfFormFromEmployee,
  validateSelfForm,
  type SelfFormValues,
} from '../../features/hr/employeeValidation';
import { hrKeys, useHrAccess } from '../../features/hr/hrQueries';
import { useDegrees, useStates } from '../../features/hr/referenceData';

type Errors = Partial<Record<keyof SelfFormValues, string>>;

export default function HrMyProfilePage() {
  const accessToken = useSessionStore((state) => state.accessToken);
  const access = useHrAccess();
  const queryClient = useQueryClient();
  const states = useStates();
  const degrees = useDegrees();

  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState<SelfFormValues | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  // District is not part of the shared self form values, so it is kept beside them here.
  const [district, setDistrict] = useState('');
  const [districtError, setDistrictError] = useState('');
  const [formError, setFormError] = useState('');
  const [notice, setNotice] = useState('');

  const query = useQuery({
    queryKey: hrKeys.myEmployee,
    queryFn: () => getMyEmployee(accessToken!),
    enabled: Boolean(accessToken) && access.isEmployee,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const employee = query.data;

  const merge = (data: Omit<EmployeeDetail, 'qualifications' | 'experiences'>) =>
    queryClient.setQueryData<EmployeeDetail>(hrKeys.myEmployee, (old) => ({ ...(old as EmployeeDetail), ...data }));

  const save = useMutation({
    mutationFn: (payload: ReturnType<typeof buildSelfPayload>) => updateMyEmployee(accessToken!, payload),
    onSuccess: (data) => {
      merge(data);
      setEditing(false);
      setNotice('Your details are saved.');
    },
    onError: (error) => {
      if (error instanceof HrHttpError && error.problems.length) {
        const next: Errors = {};
        const map: Record<string, keyof SelfFormValues> = {
          pincode: 'pincode',
          state: 'state',
          address: 'address',
          emergency_contact_number: 'emergencyContactNumber',
          secondary_email: 'secondaryEmail',
        };
        for (const p of error.problems) {
          const field = p.field.split('.').pop() ?? '';
          if (field === 'district') setDistrictError(p.message);
          const key = map[field];
          if (key) next[key] = p.message;
        }
        setErrors(next);
      }
      setFormError(hrErrorMessage(error));
    },
  });

  const photo = useMutation({
    mutationFn: (p: { blob: Blob; name: string }) => uploadMyPhoto(accessToken!, p.blob, p.name),
    onSuccess: async (data) => {
      merge(data);
      await queryClient.invalidateQueries({ queryKey: hrKeys.photo('me') });
      setNotice('Your photo is updated.');
    },
  });

  const qualificationChange = useMutation({
    mutationFn: (run: () => Promise<EmployeeDetail>) => run(),
    onSuccess: (data) => queryClient.setQueryData<EmployeeDetail>(hrKeys.myEmployee, data),
  });

  const experienceChange = useMutation({
    mutationFn: (run: () => Promise<EmployeeDetail>) => run(),
    onSuccess: (data) => queryClient.setQueryData<EmployeeDetail>(hrKeys.myEmployee, data),
  });

  if (access.loading) return <div className="uc01-admin-state">Loading…</div>;
  if (!access.isEmployee) {
    return (
      <section className="uc01-admin-page" aria-label="My employee profile">
        <PageHeader eyebrow="HR" title="My employee profile" />
        <div className="uc01-admin-state">
          <strong>No employee record is linked to your login.</strong>
          <span>If you should have one, ask HR to check that your sign-in email matches your employee record.</span>
        </div>
      </section>
    );
  }
  if (query.isLoading) return <div className="uc01-admin-state">Loading your profile…</div>;
  if (query.isError || !employee) {
    return (
      <section className="uc01-admin-page" aria-label="My employee profile">
        <PageHeader eyebrow="HR" title="My employee profile" />
        <div className="uc01-admin-state uc01-admin-state--error" role="alert">
          <strong>Your profile could not be loaded.</strong>
          <span>{hrErrorMessage(query.error)}</span>
          <button type="button" className="uc01-admin-button" onClick={() => query.refetch()}>Try again</button>
        </div>
      </section>
    );
  }

  const set = (key: keyof SelfFormValues) => (event: { target: { value: string } }) => {
    setValues((current) => (current ? { ...current, [key]: event.target.value } : current));
    setErrors((current) => ({ ...current, [key]: undefined }));
  };

  const submit = () => {
    if (!values) return;
    const found = validateSelfForm(values);
    const districtProblem = district.trim().length > 80 ? 'Keep the district within 80 characters.' : '';
    setErrors(found);
    setDistrictError(districtProblem);
    if (Object.keys(found).length > 0 || districtProblem) {
      setFormError('Some details need attention. They are marked below.');
      return;
    }
    const payload: ReturnType<typeof buildSelfPayload> = buildSelfPayload(employee, values);
    const nextDistrict = district.trim().replace(/\s+/g, ' ');
    if ((employee.district ?? '') !== nextDistrict) payload.district = nextDistrict || null;
    if (Object.keys(payload).length === 0) {
      setEditing(false);
      setNotice('Nothing was changed.');
      return;
    }
    setFormError('');
    save.mutate(payload);
  };

  const qualificationEditing = {
    busy: qualificationChange.isPending,
    error: qualificationChange.isError ? hrErrorMessage(qualificationChange.error) : undefined,
    onAdd: (input: QualificationInput) => qualificationChange.mutateAsync(() => addMyQualification(accessToken!, input)),
    onReplace: (id: string, input: QualificationInput) => qualificationChange.mutateAsync(() => replaceMyQualification(accessToken!, id, input)),
    onRemove: (id: string) => qualificationChange.mutateAsync(() => removeMyQualification(accessToken!, id)),
  };

  const experienceEditing = {
    busy: experienceChange.isPending,
    error: experienceChange.isError ? hrErrorMessage(experienceChange.error) : undefined,
    onAdd: (input: ExperienceInput) => experienceChange.mutateAsync(() => addMyExperience(accessToken!, input)),
    onReplace: (id: string, input: ExperienceInput) => experienceChange.mutateAsync(() => replaceMyExperience(accessToken!, id, input)),
    onRemove: (id: string) => experienceChange.mutateAsync(() => removeMyExperience(accessToken!, id)),
  };

  return (
    <section className="uc01-admin-page hr-page" aria-label="My employee profile">
      <PageHeader
        eyebrow="HR"
        title="My employee profile"
        description="Your details on record with HR. You can update your address, emergency contact and qualifications. For anything else, contact HR."
        actions={!editing ? (
          <button type="button" className="uc01-admin-button uc01-admin-button--primary" onClick={() => { setValues(selfFormFromEmployee(employee)); setDistrict(employee.district ?? ''); setDistrictError(''); setErrors({}); setFormError(''); setNotice(''); setEditing(true); }}>
            Update my details
          </button>
        ) : undefined}
      />

      <div className="hr-identity">
        <EmployeeAvatar name={employee.fullName} hasPhoto={employee.hasPhoto} scope="me" size="lg" />
        <div className="hr-identity__facts">
          <strong className="hr-identity__name">{employee.fullName}</strong>
          <span className="hr-muted">{employee.employeeCode}{employee.designation ? ` · ${employee.designation}` : ''}</span>
        </div>
        <div className="hr-identity__photo">
          <PhotoPicker selfie label={employee.hasPhoto ? 'Change photo' : 'Add photo'} busy={photo.isPending} onPick={async (p) => { await photo.mutateAsync(p); }} />
        </div>
      </div>

      {notice && <div className="uc01-admin-message uc01-admin-message--success" role="status">{notice}</div>}

      {editing && values ? (
        <form
          className="hr-form"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <SectionCard title="Contact" description="You can change your address and secondary email. Name, PAN and Aadhaar are kept by HR.">
            <dl className="definition-list hr-definitions">
              <div><dt>Personal email</dt><dd>{employee.personalEmail}</dd></div>
              <div><dt>Mobile</dt><dd>{employee.mobile || '—'}</dd></div>
            </dl>
            <p className="hr-muted hr-form-note">To change your email or mobile, contact HR.</p>
            <div className="hr-form-grid">
              <Field label="Secondary email" htmlFor="me-email2" error={errors.secondaryEmail}>
                <input id="me-email2" type="email" inputMode="email" value={values.secondaryEmail} onChange={set('secondaryEmail')} />
              </Field>
              <Field label="Address" htmlFor="me-address" error={errors.address} wide>
                <textarea id="me-address" rows={2} maxLength={500} value={values.address} onChange={set('address')} />
              </Field>
              <Field label="State" htmlFor="me-state" error={errors.state}>
                <select id="me-state" value={values.state} onChange={set('state')}>
                  <option value="">Choose a state…</option>
                  {(states.data ?? []).map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </Field>
              <Field label="District" htmlFor="me-district" error={districtError}>
                <input id="me-district" maxLength={80} autoComplete="off" value={district} onChange={(event) => { setDistrict(event.target.value); setDistrictError(''); }} />
              </Field>
              <Field label="Pincode" htmlFor="me-pincode" error={errors.pincode}>
                <input id="me-pincode" inputMode="numeric" maxLength={6} value={values.pincode} onChange={set('pincode')} />
              </Field>
            </div>
          </SectionCard>
          <SectionCard title="Emergency contact">
            <div className="hr-form-grid">
              <Field label="Name" htmlFor="me-ec-name" error={errors.emergencyContactName}>
                <input id="me-ec-name" maxLength={120} value={values.emergencyContactName} onChange={set('emergencyContactName')} />
              </Field>
              <Field label="Mobile" htmlFor="me-ec-number" error={errors.emergencyContactNumber}>
                <input id="me-ec-number" type="tel" inputMode="tel" value={values.emergencyContactNumber} onChange={set('emergencyContactNumber')} />
              </Field>
              <Field label="Address" htmlFor="me-ec-address" error={errors.emergencyContactAddress} wide>
                <textarea id="me-ec-address" rows={2} maxLength={500} value={values.emergencyContactAddress} onChange={set('emergencyContactAddress')} />
              </Field>
            </div>
          </SectionCard>
          {formError && <div className="uc01-admin-message uc01-admin-message--error" role="alert">{formError}</div>}
          <div className="hr-actions hr-actions--form">
            <button type="submit" className="uc01-admin-button uc01-admin-button--primary" disabled={save.isPending}>{save.isPending ? 'Saving…' : 'Save'}</button>
            <button type="button" className="uc01-admin-button" disabled={save.isPending} onClick={() => setEditing(false)}>Cancel</button>
          </div>
        </form>
      ) : (
        <div className="hr-sections">
          <p className="hr-muted">To change your email or mobile, contact HR.</p>
          <EmployeeSummary employee={employee} scope="self" />
          <SensitiveNumbers employee={employee} canReveal reveal={() => revealMySensitive(accessToken!)} />
          <QualificationsPanel qualifications={employee.qualifications} degrees={degrees.data ?? []} editing={qualificationEditing} />
          <ExperiencePanel experiences={employee.experiences ?? []} editing={experienceEditing} />
        </div>
      )}
      <p className="hr-muted">
        Looking for your Verigence account details? <Link to="/profile">Open account profile</Link>.
      </p>
    </section>
  );
}
