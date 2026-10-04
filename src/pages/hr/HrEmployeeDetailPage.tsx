import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';

import PageHeader from '../../components/PageHeader';
import SectionCard from '../../components/SectionCard';
import { hrErrorMessage, HrHttpError } from '../../services/hr/client';
import {
  addQualification,
  getEmployee,
  removeQualification,
  replaceQualification,
  retryEmployeeLogin,
  linkEmployeeLogin,
  revealEmployeeSensitive,
  updateEmployee,
  uploadEmployeePhoto,
  type EmployeeDetail,
} from '../../services/hr/employees';
import { useSessionStore } from '../../store/sessionStore';
import AuditHistory from '../../features/hr/AuditHistory';
import EmployeeAvatar from '../../features/hr/EmployeeAvatar';
import EmployeeFormFields from '../../features/hr/EmployeeFormFields';
import EmployeeSummary from '../../features/hr/EmployeeSummary';
import PhotoPicker from '../../features/hr/PhotoPicker';
import QualificationsPanel from '../../features/hr/QualificationsPanel';
import SensitiveNumbers from '../../features/hr/SensitiveNumbers';
import {
  buildUpdatePayload,
  formFromEmployee,
  validateEmployeeForm,
  type EmployeeFormValues,
  type FormErrors,
} from '../../features/hr/employeeValidation';
import { dataFlagLabels, loginLabels, loginProblem, statusLabels } from '../../features/hr/hrLabels';
import { hrKeys, useHrAccess } from '../../features/hr/hrQueries';
import { useDegrees, useDesignations, useStates } from '../../features/hr/referenceData';

type Tab = 'profile' | 'qualifications' | 'history';

export default function HrEmployeeDetailPage() {
  const { employeeId = '' } = useParams();
  const accessToken = useSessionStore((state) => state.accessToken);
  const access = useHrAccess();
  const queryClient = useQueryClient();
  const degrees = useDegrees();
  const states = useStates();
  const designations = useDesignations();

  const [tab, setTab] = useState<Tab>('profile');
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState<EmployeeFormValues | null>(null);
  const [errors, setErrors] = useState<FormErrors>({});
  const [formError, setFormError] = useState('');
  const [notice, setNotice] = useState('');
  const [credential, setCredential] = useState<string | null>(null);

  const employeeQuery = useQuery({
    queryKey: hrKeys.employee(employeeId),
    queryFn: () => getEmployee(accessToken!, employeeId),
    enabled: Boolean(accessToken) && access.canReadEmployees && Boolean(employeeId),
    retry: false,
    refetchOnWindowFocus: false,
  });
  const employee = employeeQuery.data;

  const store = (data: EmployeeDetail | Omit<EmployeeDetail, 'qualifications'>) => {
    queryClient.setQueryData<EmployeeDetail>(hrKeys.employee(employeeId), (old) => ({
      ...(old as EmployeeDetail),
      ...data,
    }));
    void queryClient.invalidateQueries({ queryKey: hrKeys.employees });
    void queryClient.invalidateQueries({ queryKey: hrKeys.audit(employeeId) });
  };

  const save = useMutation({
    mutationFn: (payload: ReturnType<typeof buildUpdatePayload>) => updateEmployee(accessToken!, employeeId, payload),
    onSuccess: (data) => {
      store(data as EmployeeDetail);
      setEditing(false);
      setNotice('Changes saved.');
    },
    onError: (error) => {
      if (error instanceof HrHttpError && error.code === 'EMPLOYEE_EMAIL_EXISTS') setErrors({ personalEmail: error.message });
      setFormError(hrErrorMessage(error));
    },
  });

  const retryLogin = useMutation({
    mutationFn: () => retryEmployeeLogin(accessToken!, employeeId),
    onSuccess: (data) => {
      store(data.employee as EmployeeDetail);
      setCredential(data.initialPassword ?? null);
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: hrKeys.employee(employeeId) }),
  });

  const [linkOpen, setLinkOpen] = useState(false);
  const [linkEmail, setLinkEmail] = useState('');
  const linkLogin = useMutation({
    mutationFn: () => linkEmployeeLogin(accessToken!, employeeId, linkEmail.trim() || undefined),
    onSuccess: (data) => {
      store(data.employee as EmployeeDetail);
      setLinkOpen(false);
      setLinkEmail('');
      setNotice('Linked to the existing Verigence login. The employee signs in with that login.');
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: hrKeys.employee(employeeId) }),
  });

  const photo = useMutation({
    mutationFn: (p: { blob: Blob; name: string }) => uploadEmployeePhoto(accessToken!, employeeId, p.blob, p.name),
    onSuccess: async (data) => {
      store(data as EmployeeDetail);
      await queryClient.invalidateQueries({ queryKey: hrKeys.photo(employeeId) });
      setNotice('Photo updated.');
    },
  });

  const qualificationChange = useMutation({
    mutationFn: (run: () => Promise<EmployeeDetail>) => run(),
    onSuccess: (data) => store(data),
  });

  if (access.loading) return <div className="uc01-admin-state">Loading…</div>;
  if (!access.canReadEmployees) {
    return (
      <section className="uc01-admin-page" aria-label="Employee">
        <PageHeader eyebrow="HR" title="Employee" />
        <div className="uc01-admin-state uc01-admin-state--error"><strong>You do not have access to employee records.</strong></div>
      </section>
    );
  }
  if (employeeQuery.isLoading) return <div className="uc01-admin-state">Loading employee…</div>;
  if (employeeQuery.isError || !employee) {
    const notFound = employeeQuery.error instanceof HrHttpError && employeeQuery.error.status === 404;
    return (
      <section className="uc01-admin-page" aria-label="Employee">
        <PageHeader eyebrow="HR" title="Employee" actions={<Link className="uc01-admin-button" to="/hr/employees">All employees</Link>} />
        <div className="uc01-admin-state uc01-admin-state--error" role="alert">
          <strong>{notFound ? 'This employee was not found.' : 'The employee could not be loaded.'}</strong>
          {!notFound && <span>{hrErrorMessage(employeeQuery.error)}</span>}
          {!notFound && <button type="button" className="uc01-admin-button" onClick={() => employeeQuery.refetch()}>Try again</button>}
        </div>
      </section>
    );
  }

  const canManage = access.canManageEmployees;
  const startEdit = () => {
    setValues(formFromEmployee(employee));
    setErrors({});
    setFormError('');
    setNotice('');
    setEditing(true);
  };
  const submitEdit = () => {
    if (!values) return;
    const found = validateEmployeeForm(values, 'edit');
    setErrors(found);
    if (Object.keys(found).length > 0) {
      setFormError('Some details need attention. They are marked below.');
      return;
    }
    const payload = buildUpdatePayload(employee, values);
    if (Object.keys(payload).length === 0) {
      setEditing(false);
      setNotice('Nothing was changed.');
      return;
    }
    setFormError('');
    save.mutate(payload);
  };

  const qualificationEditing = canManage
    ? {
        busy: qualificationChange.isPending,
        error: qualificationChange.isError ? hrErrorMessage(qualificationChange.error) : undefined,
        onAdd: (input: Parameters<typeof addQualification>[2]) => qualificationChange.mutateAsync(() => addQualification(accessToken!, employeeId, input)),
        onReplace: (id: string, input: Parameters<typeof addQualification>[2]) => qualificationChange.mutateAsync(() => replaceQualification(accessToken!, employeeId, id, input)),
        onRemove: (id: string) => qualificationChange.mutateAsync(() => removeQualification(accessToken!, employeeId, id)),
      }
    : undefined;

  const tabs: Array<{ key: Tab; label: string }> = [
    { key: 'profile', label: 'Profile' },
    { key: 'qualifications', label: `Qualifications (${employee.qualifications.length})` },
    ...(access.canReadAudit ? [{ key: 'history' as const, label: 'History' }] : []),
  ];

  return (
    <section className="uc01-admin-page hr-page" aria-label="Employee">
      <PageHeader
        eyebrow="HR · Employee"
        title={employee.fullName}
        description={`${employee.employeeCode}${employee.department ? ` · ${employee.department}` : ''}${employee.designation ? ` · ${employee.designation}` : ''}`}
        actions={(
          <>
            <Link className="uc01-admin-button" to="/hr/employees">All employees</Link>
            {canManage && !editing && <button type="button" className="uc01-admin-button uc01-admin-button--primary" onClick={startEdit}>Edit details</button>}
          </>
        )}
      />

      <div className="hr-identity">
        <EmployeeAvatar name={employee.fullName} hasPhoto={employee.hasPhoto} scope={employee.employeeId} size="lg" />
        <div className="hr-identity__facts">
          <span className={`uc01-admin-status uc01-admin-status--${employee.employmentStatus === 'ACTIVE' ? 'active' : 'rejected'}`}>{statusLabels[employee.employmentStatus]}</span>
          <span className={`uc01-admin-status uc01-admin-status--${employee.loginStatus === 'CREATED' ? 'active' : employee.loginStatus === 'FAILED' ? 'pending' : 'rejected'}`}>{loginLabels[employee.loginStatus]}</span>
          {employee.dataFlags.map((f) => <span key={f} className="hr-flag">{dataFlagLabels[f]}</span>)}
        </div>
        {canManage && (
          <div className="hr-identity__photo">
            <PhotoPicker label={employee.hasPhoto ? 'Change photo' : 'Add photo'} busy={photo.isPending} onPick={async (p) => { await photo.mutateAsync(p); }} />
          </div>
        )}
      </div>

      {notice && <div className="uc01-admin-message uc01-admin-message--success" role="status">{notice}</div>}

      {employee.loginStatus !== 'CREATED' && canManage && (
        <div className="hr-login-banner" role="status">
          <div>
            <strong>{employee.loginStatus === 'FAILED' ? 'The Verigence login is not created yet.' : 'This employee has no Verigence login.'}</strong>
            <span>{employee.loginStatus === 'FAILED' ? loginProblem(employee.loginErrorCode) : 'Create it to let them sign in.'}</span>
            {retryLogin.isError && <span className="hr-banner-error">{hrErrorMessage(retryLogin.error)}</span>}
          </div>
          <div className="hr-actions">
            <button type="button" className="uc01-admin-button uc01-admin-button--primary" disabled={retryLogin.isPending || linkLogin.isPending} onClick={() => { setCredential(null); retryLogin.mutate(); }}>
              {retryLogin.isPending ? 'Creating…' : 'Create login'}
            </button>
            <button type="button" className="uc01-admin-button" disabled={retryLogin.isPending || linkLogin.isPending} onClick={() => setLinkOpen((open) => !open)}>
              Link existing login
            </button>
          </div>
          {linkOpen && (
            <form
              className="hr-link-form"
              onSubmit={(event) => {
                event.preventDefault();
                linkLogin.mutate();
              }}
            >
              <div className="hr-field">
                <label htmlFor="hr-link-email">Email of the existing Verigence login</label>
                <input
                  id="hr-link-email"
                  type="email"
                  inputMode="email"
                  autoComplete="off"
                  value={linkEmail}
                  placeholder={employee.personalEmail}
                  onChange={(event) => setLinkEmail(event.target.value)}
                />
                <span className="hr-field__hint">Leave it empty to use the employee&apos;s email. The login must already exist, be active, and not be linked to anyone else.</span>
              </div>
              {linkLogin.isError && <span className="hr-banner-error" role="alert">{hrErrorMessage(linkLogin.error)}</span>}
              <div className="hr-actions">
                <button type="submit" className="uc01-admin-button uc01-admin-button--primary" disabled={linkLogin.isPending}>
                  {linkLogin.isPending ? 'Linking…' : 'Link login'}
                </button>
                <button type="button" className="uc01-admin-button" disabled={linkLogin.isPending} onClick={() => setLinkOpen(false)}>Cancel</button>
              </div>
            </form>
          )}
        </div>
      )}
      {credential && (
        <SectionCard title="New login created">
          <p>The login waits for SuperAdmin to allow it (Users → Pending Approvals); the employee can sign in only after that. Share this with the employee securely. <strong>The password is shown only now and cannot be shown again.</strong></p>
          <dl className="definition-list">
            <div><dt>Sign-in email</dt><dd>{employee.personalEmail}</dd></div>
            <div><dt>Initial password</dt><dd><code className="hr-password">{credential}</code></dd></div>
          </dl>
          <div className="hr-actions">
            <button type="button" className="uc01-admin-button" onClick={() => void navigator.clipboard?.writeText(credential)}>Copy password</button>
            <button type="button" className="uc01-admin-button" onClick={() => setCredential(null)}>I have shared it</button>
          </div>
        </SectionCard>
      )}

      {editing && values ? (
        <form
          className="hr-form"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            submitEdit();
          }}
        >
          <EmployeeFormFields
            mode="edit"
            values={values}
            errors={errors}
            states={states.data ?? []}
            designations={designations.data ?? []}
            panMasked={employee.panMasked}
            aadhaarMasked={employee.aadhaarMasked}
            onChange={(change) => {
              setValues((current) => (current ? { ...current, ...change } : current));
              setErrors((current) => {
                const next = { ...current };
                for (const key of Object.keys(change)) delete next[key as keyof FormErrors];
                return next;
              });
            }}
          />
          {formError && <div className="uc01-admin-message uc01-admin-message--error" role="alert">{formError}</div>}
          <div className="hr-actions hr-actions--form">
            <button type="submit" className="uc01-admin-button uc01-admin-button--primary" disabled={save.isPending}>{save.isPending ? 'Saving…' : 'Save changes'}</button>
            <button type="button" className="uc01-admin-button" disabled={save.isPending} onClick={() => setEditing(false)}>Cancel</button>
          </div>
        </form>
      ) : (
        <>
          <div className="hr-tabs" role="tablist" aria-label="Employee sections">
            {tabs.map((t) => (
              <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} className={`hr-tab${tab === t.key ? ' is-active' : ''}`} onClick={() => setTab(t.key)}>{t.label}</button>
            ))}
          </div>
          {tab === 'profile' && (
            <div className="hr-sections">
              <EmployeeSummary employee={employee} scope="hr" />
              <SensitiveNumbers employee={employee} canReveal={access.canRevealSensitive} reveal={() => revealEmployeeSensitive(accessToken!, employeeId)} />
            </div>
          )}
          {tab === 'qualifications' && (
            <QualificationsPanel qualifications={employee.qualifications} degrees={degrees.data ?? []} editing={qualificationEditing} />
          )}
          {tab === 'history' && access.canReadAudit && <AuditHistory employeeId={employeeId} />}
        </>
      )}
    </section>
  );
}
