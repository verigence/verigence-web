import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
import { getTemplates, PAYROLL_PERMISSION, payrollKeys, proposeStructure } from '../../services/hr/payroll';
import { useSessionStore } from '../../store/sessionStore';
import { PendingDetailsNotice } from '../../features/hr/EmployeeBadges';
import {
  AddressFields,
  ContactSection,
  EmergencySection,
  EmploymentSection,
  ExperienceFields,
  IdentitySection,
  PersonalSection,
} from '../../features/hr/EmployeeFormFields';
import PhotoPicker from '../../features/hr/PhotoPicker';
import QualificationEditor from '../../features/hr/QualificationEditor';
import SalaryEntryFields, {
  emptySalaryDraft,
  isSalaryDraftEmpty,
  validateSalaryDraft,
  type SalaryDraft,
} from '../../features/hr/SalaryEntryFields';
import { buildProposal, type ProposalErrors } from '../../features/hr/payroll/salaryRules';
import { payrollErrorMessage } from '../../features/hr/payroll/payrollErrors';
import {
  buildCreatePayload,
  emptyEmployeeForm,
  previewMissingDetails,
  validateEmployeeForm,
  type EmployeeFormValues,
  type FormErrors,
} from '../../features/hr/employeeValidation';
import { formatDate, loginProblem, missingDetailLabels } from '../../features/hr/hrLabels';
import { hrKeys, useHrAccess } from '../../features/hr/hrQueries';
import { useDegrees, useDesignations, useStates } from '../../features/hr/referenceData';

interface PendingQualification {
  input: QualificationInput;
  label: string;
}

type StepKey = 'basic' | 'contact' | 'qualification' | 'salary' | 'review';
const STEPS: Array<{ key: StepKey; label: string }> = [
  { key: 'basic', label: 'Basic details' },
  { key: 'contact', label: 'Contact & address' },
  { key: 'qualification', label: 'Qualification' },
  { key: 'salary', label: 'Salary' },
  { key: 'review', label: 'Review & create' },
];

/** Which form fields belong to which step, so a step is only blocked by its own mistakes. */
const stepFields: Record<StepKey, Array<keyof FormErrors>> = {
  basic: ['employeeCode', 'fullName', 'personalEmail', 'mobile', 'dateOfBirth', 'gender', 'department', 'designationCode', 'dateOfJoining', 'pan', 'aadhaar'],
  contact: ['address', 'state', 'district', 'pincode', 'emergencyContactName', 'emergencyContactNumber', 'emergencyContactAddress'],
  qualification: ['totalExperienceYears', 'qualification'],
  salary: [],
  review: [],
};

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
  district: 'district',
  emergency_contact_number: 'emergencyContactNumber',
  total_experience_years: 'totalExperienceYears',
};

type SalaryOutcome = { kind: 'none' } | { kind: 'proposed' } | { kind: 'failed'; message: string };

export default function HrEmployeeCreatePage() {
  const accessToken = useSessionStore((state) => state.accessToken);
  const access = useHrAccess();
  const queryClient = useQueryClient();
  const degrees = useDegrees();
  const states = useStates();
  const designations = useDesignations();
  const canPropose = access.can(PAYROLL_PERMISSION.salaryPropose);

  const [step, setStep] = useState(0);
  const [values, setValues] = useState<EmployeeFormValues>(emptyEmployeeForm);
  const [errors, setErrors] = useState<FormErrors>({});
  const [qualifications, setQualifications] = useState<PendingQualification[]>([]);
  const [addingQualification, setAddingQualification] = useState(false);
  const [salary, setSalary] = useState<SalaryDraft>(emptySalaryDraft);
  const [salaryErrors, setSalaryErrors] = useState<ProposalErrors>({});
  // The step whose empty "required" details were already pointed out; a second Next carries on.
  const [warnedStep, setWarnedStep] = useState<StepKey | null>(null);
  const [photo, setPhoto] = useState<{ blob: Blob; name: string } | null>(null);
  const [formError, setFormError] = useState('');
  // Held only in this component's memory: shown once, never cached, never stored.
  const [result, setResult] = useState<{ data: CreateEmployeeResult; photoFailed: boolean; salary: SalaryOutcome } | null>(null);
  const [copied, setCopied] = useState(false);

  const current = STEPS[step].key;
  const salaryEntered = canPropose && !isSalaryDraftEmpty(salary);

  const templates = useQuery({
    queryKey: payrollKeys.templates,
    queryFn: () => getTemplates(accessToken!),
    enabled: Boolean(accessToken) && canPropose && current === 'salary',
    retry: false,
    refetchOnWindowFocus: false,
  });

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
      let outcome: SalaryOutcome = { kind: 'none' };
      if (salaryEntered) {
        try {
          await proposeStructure(accessToken!, buildProposal({ ...salary, employeeId: data.employee.employeeId }));
          outcome = { kind: 'proposed' };
        } catch (problem) {
          // The employee is already saved: never lose it because the salary was refused.
          outcome = { kind: 'failed', message: payrollErrorMessage(problem) };
        }
      }
      return { data, photoFailed, salary: outcome };
    },
    onSuccess: async (done) => {
      setResult(done);
      await queryClient.invalidateQueries({ queryKey: hrKeys.employees });
      if (done.salary.kind === 'proposed') await queryClient.invalidateQueries({ queryKey: payrollKeys.structuresAll });
    },
    onError: (error) => {
      if (error instanceof HrHttpError && error.problems.length) {
        const next: FormErrors = {};
        for (const p of error.problems) {
          const key = serverFieldMap[p.field.split('.').pop() ?? ''];
          if (key) next[key] = p.message;
        }
        setErrors(next);
        const first = STEPS.findIndex((s) => stepFields[s.key].some((k) => next[k]));
        if (first >= 0) setStep(first);
      }
      if (error instanceof HrHttpError && error.code === 'EMPLOYEE_CODE_EXISTS') {
        setErrors({ employeeCode: error.message });
        setStep(0);
      }
      if (error instanceof HrHttpError && error.code === 'EMPLOYEE_EMAIL_EXISTS') {
        setErrors({ personalEmail: error.message });
        setStep(0);
      }
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
    // The service worked the list out before the salary was proposed.
    const pending = result.salary.kind === 'proposed' ? employee.missingDetails.filter((m) => m !== 'SALARY') : employee.missingDetails;
    return (
      <section className="uc01-admin-page hr-page" aria-label="Employee created">
        <PageHeader eyebrow="HR" title="Employee added" description={`${employee.fullName} (${employee.employeeCode}) is saved.`} />
        <SectionCard title="Verigence login">
          {loginOk ? (
            <div className="hr-credential">
              <p>The login is created and waits for SuperAdmin to allow it (Users → Pending Approvals); the employee can sign in only after that. Share these details with the employee securely. <strong>The password is shown only now and cannot be shown again.</strong></p>
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
        {result.salary.kind === 'proposed' && (
          <div className="uc01-admin-message uc01-admin-message--success" role="status">Salary proposed. It now waits for Finance to approve it.</div>
        )}
        {result.salary.kind === 'failed' && (
          <div className="uc01-admin-message uc01-admin-message--error" role="alert">
            The employee was created, but the salary could not be added: {result.salary.message} You can add the salary from the employee page.
          </div>
        )}
        <PendingDetailsNotice missing={pending} />
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
              setSalary(emptySalaryDraft);
              setSalaryErrors({});
              setStep(0);
              setWarnedStep(null);
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
    setValues((c) => ({ ...c, ...change }));
    setErrors((c) => {
      const next = { ...c };
      for (const key of Object.keys(change)) delete next[key as keyof FormErrors];
      return next;
    });
  };
  const patchSalary = (change: Partial<SalaryDraft>) => {
    setSalary((c) => ({ ...c, ...change }));
    setSalaryErrors((c) => {
      const next = { ...c };
      for (const key of Object.keys(change) as Array<keyof SalaryDraft>) delete next[key];
      return next;
    });
  };

  const draftQualifications = qualifications.map((q) => q.input);
  const missing = previewMissingDetails(values, draftQualifications, salaryEntered);
  /** Expected details left empty on this step: pointed out once, never a blocker. */
  const gapsFor = (key: StepKey) => {
    if (key === 'contact') return missing.filter((m) => m === 'DISTRICT');
    if (key === 'qualification') return missing.filter((m) => m === 'UNIVERSITY_COLLEGE');
    return [];
  };
  const gaps = gapsFor(current);

  const goTo = (index: number) => {
    setFormError('');
    setStep(index);
    window.scrollTo?.({ top: 0 });
  };

  const next = () => {
    setFormError('');
    if (current === 'qualification' && addingQualification) {
      setFormError('Add the qualification you are entering, or cancel it, before continuing.');
      return;
    }
    if (current === 'salary') {
      if (canPropose && !isSalaryDraftEmpty(salary)) {
        const found = validateSalaryDraft(salary);
        setSalaryErrors(found);
        if (Object.keys(found).length > 0) {
          setFormError('Some salary details need attention. They are marked below.');
          return;
        }
      }
      goTo(step + 1);
      return;
    }
    const found = validateEmployeeForm(values, 'create');
    const mine: FormErrors = {};
    for (const key of stepFields[current]) if (found[key]) mine[key] = found[key];
    setErrors((c) => ({ ...c, ...mine }));
    if (Object.keys(mine).length > 0) {
      setFormError('Some details need attention. They are marked below.');
      return;
    }
    if (gaps.length > 0 && warnedStep !== current) {
      setWarnedStep(current);
      return;
    }
    goTo(step + 1);
  };

  const submit = () => {
    setFormError('');
    const found = validateEmployeeForm(values, 'create');
    setErrors(found);
    const bad = STEPS.findIndex((s) => stepFields[s.key].some((k) => found[k]));
    if (Object.keys(found).length > 0) {
      setFormError('Some details need attention. Go back to the step marked below.');
      if (bad >= 0) setStep(bad);
      return;
    }
    create.mutate();
  };

  const skipSalary = () => {
    setSalary(emptySalaryDraft);
    setSalaryErrors({});
    goTo(step + 1);
  };

  return (
    <section className="uc01-admin-page hr-page" aria-label="Add employee">
      <PageHeader
        eyebrow="HR"
        title="Add employee"
        description="Creates the employee record and, unless you turn it off, their Verigence login."
        actions={<Link className="uc01-admin-button" to="/hr/employees">Cancel</Link>}
      />

      <ol className="hr-stepper" aria-label={`Step ${step + 1} of ${STEPS.length}`}>
        {STEPS.map((s, index) => (
          <li key={s.key} className={index === step ? 'is-active' : index < step ? 'is-done' : ''} aria-current={index === step ? 'step' : undefined}>
            {index < step ? (
              <button type="button" className="hr-stepper__dot" aria-label={`Back to ${s.label}`} disabled={create.isPending} onClick={() => goTo(index)}>✓</button>
            ) : (
              <span className="hr-stepper__dot">{index + 1}</span>
            )}
            <span className="hr-stepper__label">{s.label}</span>
          </li>
        ))}
      </ol>

      <form
        className="hr-form hr-wizard"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          if (current === 'review') submit();
          else next();
        }}
      >
        {current === 'basic' && (
          <>
            <PersonalSection mode="create" values={values} errors={errors} onChange={patch} withExperience={false} />
            <ContactSection mode="create" values={values} errors={errors} onChange={patch} states={[]} withAddress={false} />
            <EmploymentSection mode="create" values={values} errors={errors} onChange={patch} designations={designations.data ?? []} />
            <IdentitySection mode="create" values={values} errors={errors} onChange={patch} />
            <SectionCard title="Photo (optional)">
              <div className="hr-photo-row">
                <span className="hr-muted">{photo ? 'Photo chosen. It is uploaded when you create the employee.' : 'No photo chosen.'}</span>
                <PhotoPicker label={photo ? 'Choose a different photo' : 'Choose photo'} onPick={(p) => setPhoto(p)} />
                {photo && <button type="button" className="uc01-admin-button uc01-admin-button--compact" onClick={() => setPhoto(null)}>Remove</button>}
              </div>
            </SectionCard>
          </>
        )}

        {current === 'contact' && (
          <>
            <SectionCard title="Address">
              <div className="hr-form-grid">
                <AddressFields values={values} errors={errors} onChange={patch} states={states.data ?? []} />
              </div>
            </SectionCard>
            <EmergencySection values={values} errors={errors} onChange={patch} />
          </>
        )}

        {current === 'qualification' && (
          <>
            <SectionCard title="Experience">
              <div className="hr-form-grid">
                <ExperienceFields values={values} errors={errors} onChange={patch} />
              </div>
            </SectionCard>
            <SectionCard title="Qualifications" description="Degree, marks, year of passing, university and college. Add as many as needed.">
              {qualifications.length > 0 && (
                <ul className="hr-qualification-list">
                  {qualifications.map((q, index) => (
                    <li key={`${q.label}-${index}`}>
                      <span>
                        <strong>{q.label}</strong>
                        <small>{q.input.percentage}% · {q.input.year_of_passing}</small>
                        <small>{q.input.university ?? 'University not given'} · {q.input.college ?? 'College not given'}</small>
                      </span>
                      <button type="button" className="uc01-admin-button uc01-admin-button--compact uc01-admin-button--danger" onClick={() => setQualifications((list) => list.filter((_, i) => i !== index))}>Remove</button>
                    </li>
                  ))}
                </ul>
              )}
              {degrees.isError && <div className="uc01-admin-message uc01-admin-message--error">The degree list could not be loaded. Create the employee now and add qualifications from their page.</div>}
              {addingQualification && degrees.data ? (
                <QualificationEditor
                  degrees={degrees.data}
                  idPrefix="hr-new-qual"
                  submitLabel="Add qualification"
                  onSubmit={(input) => {
                    const found = degrees.data.find((d) => d.code === input.degree_code);
                    setQualifications((list) => [...list, { input, label: input.degree_code === 'OTHER' ? input.degree_other ?? 'Other' : found?.label ?? input.degree_code }]);
                    setAddingQualification(false);
                    setFormError('');
                  }}
                  onCancel={() => setAddingQualification(false)}
                />
              ) : (
                <button type="button" className="uc01-admin-button" disabled={!degrees.data || qualifications.length >= 10} onClick={() => setAddingQualification(true)}>
                  {qualifications.length === 0 ? 'Add a qualification' : 'Add another qualification'}
                </button>
              )}
            </SectionCard>
          </>
        )}

        {current === 'salary' && (
          <SectionCard title="Salary" description="Salary is always needed, but it can be added later from the employee page. Finance approves it before it counts.">
            {canPropose ? (
              <SalaryEntryFields
                idPrefix="new-salary"
                draft={salary}
                errors={salaryErrors}
                disabled={create.isPending}
                templates={templates.data?.items ?? []}
                templatesLoading={templates.isLoading}
                templatesError={templates.isError ? payrollErrorMessage(templates.error) : ''}
                onChange={(change) => {
                  // Start from the joining date when the person begins typing a salary.
                  patchSalary(!salary.effectiveFrom && values.dateOfJoining && !change.effectiveFrom ? { ...change, effectiveFrom: values.dateOfJoining } : change);
                }}
              />
            ) : (
              <div className="uc01-admin-message uc01-admin-message--info">
                You do not have permission to propose a salary. Create the employee now; someone with that permission can add the salary from the employee page.
              </div>
            )}
          </SectionCard>
        )}

        {current === 'review' && (
          <>
            <SectionCard title="Review">
              <dl className="definition-list hr-definitions">
                <div><dt>Employee</dt><dd>{values.fullName.trim() || '—'} ({values.employeeCode.trim().toUpperCase() || '—'})</dd></div>
                <div><dt>Personal email</dt><dd>{values.personalEmail.trim() || '—'}</dd></div>
                <div><dt>Mobile</dt><dd>{values.mobile.trim() || '—'}</dd></div>
                <div><dt>State · District · Pincode</dt><dd>{[values.state, values.district, values.pincode].map((x) => x.trim()).filter(Boolean).join(' · ') || '—'}</dd></div>
                <div><dt>Qualifications</dt><dd>{qualifications.length === 0 ? 'None added' : qualifications.map((q) => q.label).join(', ')}</dd></div>
                <div>
                  <dt>Salary</dt>
                  <dd>{salaryEntered ? `₹${salary.gross.trim()} a month from ${formatDate(salary.effectiveFrom)}` : 'To be added later'}</dd>
                </div>
              </dl>
            </SectionCard>
            {missing.length > 0 ? (
              <div className="hr-pending" role="status">
                <strong>These will be noted as Pending details</strong>
                <ul>{missing.map((m) => <li key={m}>{missingDetailLabels[m]}</li>)}</ul>
                <small>You can still create the employee now and fill these in later. Use Back to add them first.</small>
              </div>
            ) : (
              <div className="uc01-admin-message uc01-admin-message--success" role="status">Nothing is pending. All expected details are filled in.</div>
            )}
            <SectionCard title="Verigence login">
              <label className="hr-check">
                <input type="checkbox" checked={values.createLogin} onChange={(e) => patch({ createLogin: e.target.checked })} />
                <span>
                  Create the Verigence login now
                  <small>Signs in with the personal email and a generated password, shown once after saving. No one-time code is needed.</small>
                </span>
              </label>
            </SectionCard>
          </>
        )}

        {gaps.length > 0 && warnedStep === current && (
          <div className="uc01-admin-message uc01-admin-message--info" role="status">
            Still empty: {gaps.map((g) => missingDetailLabels[g]).join(', ')}. You can continue; it will be noted under Pending details. Press Next again to continue.
          </div>
        )}
        {formError && <div className="uc01-admin-message uc01-admin-message--error" role="alert">{formError}</div>}

        <div className="hr-wizard__nav">
          <button type="button" className="uc01-admin-button" disabled={step === 0 || create.isPending} onClick={() => goTo(step - 1)}>Back</button>
          {current === 'salary' && canPropose && (
            <button type="button" className="uc01-admin-button" onClick={skipSalary}>Add salary later</button>
          )}
          {current === 'review' ? (
            <button type="submit" className="uc01-admin-button uc01-admin-button--primary" disabled={create.isPending}>
              {create.isPending ? 'Saving…' : 'Create employee'}
            </button>
          ) : (
            <button type="submit" className="uc01-admin-button uc01-admin-button--primary">
              {current === 'salary' && !canPropose ? 'Continue' : 'Next'}
            </button>
          )}
        </div>
      </form>
    </section>
  );
}
