import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

import PageHeader from '../../components/PageHeader';
import SectionCard from '../../components/SectionCard';
import { hrErrorMessage, HrHttpError } from '../../services/hr/client';
import {
  getMyEmployee,
  revealMySensitive,
  updateMyEmployee,
  uploadMyPhoto,
  type EmployeeDetail,
} from '../../services/hr/employees';
import { useSessionStore } from '../../store/sessionStore';
import EmployeeAvatar from '../../features/hr/EmployeeAvatar';
import EmployeeSummary from '../../features/hr/EmployeeSummary';
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

  const merge = (data: Omit<EmployeeDetail, 'qualifications'>) =>
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
          emergency_contact_number: 'emergencyContactNumber',
          secondary_email: 'secondaryEmail',
        };
        for (const p of error.problems) {
          const key = map[p.field.split('.').pop() ?? ''];
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
    setErrors(found);
    if (Object.keys(found).length > 0) {
      setFormError('Some details need attention. They are marked below.');
      return;
    }
    const payload = buildSelfPayload(employee, values);
    if (Object.keys(payload).length === 0) {
      setEditing(false);
      setNotice('Nothing was changed.');
      return;
    }
    setFormError('');
    save.mutate(payload);
  };

  return (
    <section className="uc01-admin-page hr-page" aria-label="My employee profile">
      <PageHeader
        eyebrow="HR"
        title="My employee profile"
        description="Your details on record with HR. Contact HR to correct anything you cannot change here."
        actions={!editing ? (
          <button type="button" className="uc01-admin-button uc01-admin-button--primary" onClick={() => { setValues(selfFormFromEmployee(employee)); setErrors({}); setFormError(''); setNotice(''); setEditing(true); }}>
            Update my contact details
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
          <PhotoPicker label={employee.hasPhoto ? 'Change photo' : 'Add photo'} busy={photo.isPending} onPick={async (p) => { await photo.mutateAsync(p); }} />
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
          <SectionCard title="Contact" description="Only these details can be changed by you. Name, mobile, PAN and Aadhaar are kept by HR.">
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
          <EmployeeSummary employee={employee} scope="self" />
          <SensitiveNumbers employee={employee} canReveal reveal={() => revealMySensitive(accessToken!)} />
          <QualificationsPanel qualifications={employee.qualifications} degrees={degrees.data ?? []} />
        </div>
      )}
      <p className="hr-muted">
        Looking for your Verigence account details? <Link to="/profile">Open account profile</Link>.
      </p>
    </section>
  );
}
