import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

import PageHeader from '../../components/PageHeader';
import SectionCard from '../../components/SectionCard';
import { hrErrorMessage, HrHttpError } from '../../services/hr/client';
import {
  createEmployee,
  uploadEmployeePhoto,
  type CreateEmployeeResult,
  type QualificationInput,
} from '../../services/hr/employees';
import { useSessionStore } from '../../store/sessionStore';
import EmployeeFormFields from '../../features/hr/EmployeeFormFields';
import PhotoPicker from '../../features/hr/PhotoPicker';
import QualificationEditor from '../../features/hr/QualificationEditor';
import {
  buildCreatePayload,
  emptyEmployeeForm,
  validateEmployeeForm,
  type EmployeeFormValues,
  type FormErrors,
} from '../../features/hr/employeeValidation';
import { loginProblem } from '../../features/hr/hrLabels';
import { hrKeys, useHrAccess } from '../../features/hr/hrQueries';
import { useDegrees, useDesignations, useStates } from '../../features/hr/referenceData';

interface PendingQualification {
  input: QualificationInput;
  label: string;
}

/** Fields the service names in its errors, mapped to the form's field names. */
const serverFieldMap: Record<string, keyof EmployeeFormValues> = {
  employee_code: 'employeeCode',
  full_name: 'fullName',
  personal_email: 'personalEmail',
  mobile: 'mobile',
  date_of_birth: 'dateOfBirth',
  pan: 'pan',
  aadhaar: 'aadhaar',
  pincode: 'pincode',
  state: 'state',
  emergency_contact_number: 'emergencyContactNumber',
  total_experience_years: 'totalExperienceYears',
};

export default function HrEmployeeCreatePage() {
  const accessToken = useSessionStore((state) => state.accessToken);
  const access = useHrAccess();
  const queryClient = useQueryClient();
  const degrees = useDegrees();
  const states = useStates();
  const designations = useDesignations();

  const [values, setValues] = useState<EmployeeFormValues>(emptyEmployeeForm);
  const [errors, setErrors] = useState<FormErrors>({});
  const [qualifications, setQualifications] = useState<PendingQualification[]>([]);
  const [addingQualification, setAddingQualification] = useState(false);
  const [photo, setPhoto] = useState<{ blob: Blob; name: string } | null>(null);
  const [formError, setFormError] = useState('');
  // Held only in this component's memory: shown once, never cached, never stored.
  const [result, setResult] = useState<{ data: CreateEmployeeResult; photoFailed: boolean } | null>(null);
  const [copied, setCopied] = useState(false);

  const create = useMutation({
    mutationFn: async () => {
      const data = await createEmployee(accessToken!, buildCreatePayload(values, qualifications.map((q) => q.input)));
      let photoFailed = false;
      if (photo) {
        try {
          await uploadEmployeePhoto(accessToken!, data.employee.employeeId, photo.blob, photo.name);
        } catch {
          photoFailed = true; // the employee is saved; the photo can be added from their page
        }
      }
      return { data, photoFailed };
    },
    onSuccess: async (done) => {
      setResult(done);
      await queryClient.invalidateQueries({ queryKey: hrKeys.employees });
    },
    onError: (error) => {
      if (error instanceof HrHttpError && error.problems.length) {
        const next: FormErrors = {};
        for (const p of error.problems) {
          const key = serverFieldMap[p.field.split('.').pop() ?? ''];
          if (key) next[key] = p.message;
        }
        setErrors(next);
      }
      if (error instanceof HrHttpError && error.code === 'EMPLOYEE_CODE_EXISTS') setErrors({ employeeCode: error.message });
      if (error instanceof HrHttpError && error.code === 'EMPLOYEE_EMAIL_EXISTS') setErrors({ personalEmail: error.message });
      setFormError(hrErrorMessage(error));
    },
  });

  if (access.loading) return <div className="uc01-admin-state">Loading…</div>;
  if (!access.canManageEmployees) {
    return (
      <section className="uc01-admin-page" aria-label="Add employee">
        <PageHeader eyebrow="HR" title="Add employee" />
        <div className="uc01-admin-state uc01-admin-state--error">
          <strong>You do not have access to add employees.</strong>
          <Link to="/hr/employees">Back to employees</Link>
        </div>
      </section>
    );
  }

  if (result) {
    const { employee, initialPassword } = result.data;
    const loginOk = employee.loginStatus === 'CREATED' && initialPassword;
    return (
      <section className="uc01-admin-page hr-page" aria-label="Employee created">
        <PageHeader eyebrow="HR" title="Employee added" description={`${employee.fullName} (${employee.employeeCode}) is saved.`} />
        <SectionCard title="Verigence login">
          {loginOk ? (
            <div className="hr-credential">
              <p>The login is ready. Share these details with the employee securely. <strong>The password is shown only now and cannot be shown again.</strong></p>
              <dl className="definition-list">
                <div><dt>Sign-in email</dt><dd>{employee.personalEmail}</dd></div>
                <div><dt>Initial password</dt><dd><code className="hr-password">{initialPassword}</code></dd></div>
              </dl>
              <button
                type="button"
                className="uc01-admin-button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(initialPassword);
                    setCopied(true);
                  } catch {
                    setCopied(false);
                  }
                }}
              >
                {copied ? 'Copied' : 'Copy password'}
              </button>
            </div>
          ) : employee.loginStatus === 'FAILED' ? (
            <div className="uc01-admin-message uc01-admin-message--error" role="alert">
              {loginProblem(employee.loginErrorCode)} The employee record is saved. You can create the login from the employee page.
            </div>
          ) : (
            <p>No login was requested. You can create it from the employee page later.</p>
          )}
        </SectionCard>
        {result.photoFailed && (
          <div className="uc01-admin-message uc01-admin-message--error" role="alert">
            The employee was saved, but the photo could not be uploaded. Add it from the employee page.
          </div>
        )}
        {employee.dataFlags.length > 0 && (
          <div className="uc01-admin-message uc01-admin-message--info">
            Saved with items to fix later: {employee.dataFlags.join(', ').replace(/_/g, ' ').toLowerCase()}.
          </div>
        )}
        <div className="hr-actions">
          <Link className="uc01-admin-button uc01-admin-button--primary" to={`/hr/employees/${employee.employeeId}`}>Open employee</Link>
          <button
            type="button"
            className="uc01-admin-button"
            onClick={() => {
              setResult(null);
              setValues(emptyEmployeeForm);
              setQualifications([]);
              setPhoto(null);
              setErrors({});
              setFormError('');
              setCopied(false);
            }}
          >
            Add another
          </button>
          <Link className="uc01-admin-button" to="/hr/employees">All employees</Link>
        </div>
      </section>
    );
  }

  const patch = (change: Partial<EmployeeFormValues>) => {
    setValues((current) => ({ ...current, ...change }));
    setErrors((current) => {
      const next = { ...current };
      for (const key of Object.keys(change)) delete next[key as keyof FormErrors];
      return next;
    });
  };

  const submit = () => {
    setFormError('');
    const found = validateEmployeeForm(values, 'create');
    setErrors(found);
    if (Object.keys(found).length > 0) {
      setFormError('Some details need attention. They are marked below.');
      return;
    }
    create.mutate();
  };

  return (
    <section className="uc01-admin-page hr-page" aria-label="Add employee">
      <PageHeader
        eyebrow="HR"
        title="Add employee"
        description="Creates the employee record and, unless you turn it off, their Verigence login."
        actions={<Link className="uc01-admin-button" to="/hr/employees">Cancel</Link>}
      />

      <form
        className="hr-form"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <EmployeeFormFields
          mode="create"
          values={values}
          errors={errors}
          states={states.data ?? []}
          designations={designations.data ?? []}
          onChange={patch}
        />

        <SectionCard title="Qualifications" description="Degree, marks and year of passing. Add as many as needed.">
          {qualifications.length > 0 && (
            <ul className="hr-qualification-list">
              {qualifications.map((q, index) => (
                <li key={`${q.label}-${index}`}>
                  <span><strong>{q.label}</strong><small>{q.input.percentage}% · {q.input.year_of_passing}</small></span>
                  <button type="button" className="uc01-admin-button uc01-admin-button--compact uc01-admin-button--danger" onClick={() => setQualifications((list) => list.filter((_, i) => i !== index))}>Remove</button>
                </li>
              ))}
            </ul>
          )}
          {degrees.isError && <div className="uc01-admin-message uc01-admin-message--error">The degree list could not be loaded. Save the employee now and add qualifications from their page.</div>}
          {addingQualification && degrees.data ? (
            <QualificationEditor
              degrees={degrees.data}
              idPrefix="hr-new-qual"
              submitLabel="Add qualification"
              onSubmit={(input) => {
                const found = degrees.data.find((d) => d.code === input.degree_code);
                setQualifications((list) => [...list, { input, label: input.degree_code === 'OTHER' ? input.degree_other ?? 'Other' : found?.label ?? input.degree_code }]);
                setAddingQualification(false);
              }}
              onCancel={() => setAddingQualification(false)}
            />
          ) : (
            <button type="button" className="uc01-admin-button" disabled={!degrees.data || qualifications.length >= 10} onClick={() => setAddingQualification(true)}>
              {qualifications.length === 0 ? 'Add a qualification' : 'Add another qualification'}
            </button>
          )}
        </SectionCard>

        <SectionCard title="Photo (optional)">
          <div className="hr-photo-row">
            <span className="hr-muted">{photo ? 'Photo chosen. It is uploaded when you save.' : 'No photo chosen.'}</span>
            <PhotoPicker label={photo ? 'Choose a different photo' : 'Choose photo'} onPick={(p) => setPhoto(p)} />
            {photo && <button type="button" className="uc01-admin-button uc01-admin-button--compact" onClick={() => setPhoto(null)}>Remove</button>}
          </div>
        </SectionCard>

        <SectionCard title="Verigence login">
          <label className="hr-check">
            <input type="checkbox" checked={values.createLogin} onChange={(e) => patch({ createLogin: e.target.checked })} />
            <span>
              Create the Verigence login now
              <small>Signs in with the personal email above and a generated password, shown once after saving. No one-time code is needed.</small>
            </span>
          </label>
        </SectionCard>

        {formError && <div className="uc01-admin-message uc01-admin-message--error" role="alert">{formError}</div>}
        <div className="hr-actions hr-actions--form">
          <button type="submit" className="uc01-admin-button uc01-admin-button--primary" disabled={create.isPending}>
            {create.isPending ? 'Saving…' : 'Save employee'}
          </button>
          <Link className="uc01-admin-button" to="/hr/employees" onClick={(e) => { if (create.isPending) e.preventDefault(); }}>Cancel</Link>
        </div>
      </form>
    </section>
  );
}
