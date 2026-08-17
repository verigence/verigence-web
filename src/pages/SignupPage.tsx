import { useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';

import VerigenceButton from '../components/VerigenceButton';
import VerigenceInput from '../components/VerigenceInput';
import { signupSchema, type SignupFormValues } from '../features/onboarding/signupSchema';
import type { AccessRequest } from '../features/onboarding/types';
import { createAccessRequest } from '../services/audit-core/onboarding';
import { assetUrl } from '../services/assets';

const emptyValues: SignupFormValues = {
  fullName: '',
  workEmail: '',
  tenantCode: '',
  employeeId: '',
  mobileNumber: '',
};

export default function SignupPage() {
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<SignupFormValues>({ defaultValues: emptyValues });

  const signup = useMutation({
    mutationFn: createAccessRequest,
  });

  const submit = handleSubmit(async (values) => {
    const parsed = signupSchema.safeParse(values);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (typeof field === 'string' && field in values) {
          setError(field as keyof SignupFormValues, { message: issue.message });
        }
      }
      return;
    }

    signup.mutate({
      ...parsed.data,
      employeeId: parsed.data.employeeId || undefined,
      mobileNumber: parsed.data.mobileNumber || undefined,
    });
  });

  if (signup.data) {
    return <SignupPending request={signup.data} />;
  }

  return (
    <main className="signup-layout">
      <section className="signup-brand-panel">
        <img
          className="signup-brand-panel__logo"
          src={assetUrl('brand/svg/verigence-hero-lockup.svg')}
          alt="Verigence"
        />
        <div className="signup-brand-panel__message">
          <span className="signup-brand-panel__kicker">Audit • Governance • Intelligence</span>
          <h1>Request access to Verigence</h1>
          <p>
            Create your access request using your work identity. A Verigence administrator will
            verify your organization and assign the appropriate operating role before access is
            enabled.
          </p>
        </div>
        <div className="signup-brand-panel__rule">
          <span>01</span>
          <div>
            <strong>You request access</strong>
            <small>No role or permission is self-selected.</small>
          </div>
        </div>
        <div className="signup-brand-panel__rule">
          <span>02</span>
          <div>
            <strong>An administrator approves</strong>
            <small>Tenant and role are validated before activation.</small>
          </div>
        </div>
        <div className="signup-brand-panel__rule">
          <span>03</span>
          <div>
            <strong>Access is activated</strong>
            <small>Authentication and authorization remain controlled by Verigence Security.</small>
          </div>
        </div>
      </section>

      <section className="signup-form-panel">
        <div className="signup-form-card">
          <div className="signup-form-card__heading">
            <img src={assetUrl('brand/svg/verigence-logo.svg')} alt="Verigence" />
            <div>
              <span className="eyebrow">New user</span>
              <h2>Sign up</h2>
              <p>Use your work details. Fields marked optional can be added by the administrator later.</p>
            </div>
          </div>

          <form className="signup-form" onSubmit={submit} noValidate>
            <VerigenceInput
              label="Full name"
              autoComplete="name"
              placeholder="e.g. Aditi Sharma"
              error={errors.fullName?.message}
              {...register('fullName')}
            />

            <VerigenceInput
              label="Work email"
              type="email"
              autoComplete="email"
              placeholder="name@company.com"
              error={errors.workEmail?.message}
              helperText="Use the email address your organization can verify."
              {...register('workEmail')}
            />

            <VerigenceInput
              label="Organization / Tenant code"
              autoCapitalize="characters"
              autoComplete="organization"
              placeholder="Code provided by your administrator"
              error={errors.tenantCode?.message}
              helperText="This identifies the Verigence organization you want to join."
              {...register('tenantCode')}
            />

            <div className="signup-form__two-column">
              <VerigenceInput
                label="Employee ID (optional)"
                autoComplete="off"
                placeholder="Employee ID"
                error={errors.employeeId?.message}
                {...register('employeeId')}
              />
              <VerigenceInput
                label="Mobile number (optional)"
                type="tel"
                autoComplete="tel"
                placeholder="+91 98xxxxxx00"
                error={errors.mobileNumber?.message}
                {...register('mobileNumber')}
              />
            </div>

            <div className="signup-form__security-note">
              <strong>Role selection happens during approval.</strong>
              <span>
                Process Consultant, Team Lead, Project Manager and CRM access are assigned only by an
                authorized administrator.
              </span>
            </div>

            {signup.isError && (
              <div className="form-alert form-alert--error" role="alert">
                We could not submit the access request. Check the Audit Core connection and try again.
              </div>
            )}

            <VerigenceButton
              className="signup-form__submit"
              type="submit"
              expand="block"
              disabled={signup.isPending}
            >
              {signup.isPending ? 'Submitting request…' : 'Request access'}
            </VerigenceButton>
          </form>

          <p className="signup-form-card__footer">
            Already approved? Sign-in will be enabled after the onboarding approval flow is connected.
          </p>
        </div>
      </section>
    </main>
  );
}

function SignupPending({ request }: { request: AccessRequest }) {
  return (
    <main className="signup-layout signup-layout--complete">
      <section className="signup-brand-panel">
        <img
          className="signup-brand-panel__logo"
          src={assetUrl('brand/svg/verigence-hero-lockup.svg')}
          alt="Verigence"
        />
        <div className="signup-brand-panel__message">
          <span className="signup-brand-panel__kicker">Request received</span>
          <h1>Approval is now the gate.</h1>
          <p>
            Your request has been captured. No Verigence role or application access is active until an
            authorized administrator reviews and approves it.
          </p>
        </div>
      </section>

      <section className="signup-form-panel">
        <article className="pending-card">
          <div className="pending-card__icon">✓</div>
          <span className="status-chip">Pending approval</span>
          <h2>Access request submitted</h2>
          <p>
            We have recorded the request for <strong>{request.workEmail}</strong> under organization
            <strong> {request.tenantCode}</strong>.
          </p>
          <dl className="pending-card__details">
            <div>
              <dt>Request reference</dt>
              <dd>{request.requestId}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>{request.status}</dd>
            </div>
          </dl>
          <div className="signup-form__security-note">
            <strong>What happens next?</strong>
            <span>
              An administrator validates the request and assigns the approved operating role. Access
              remains disabled while this request is pending.
            </span>
          </div>
        </article>
      </section>
    </main>
  );
}
