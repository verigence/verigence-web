import { useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';

import VerigenceButton from '../components/VerigenceButton';
import VerigenceInput from '../components/VerigenceInput';
import { signupSchema, type SignupFormValues } from '../features/onboarding/signupSchema';
import type { AccessRequest } from '../features/onboarding/types';
import { createAccessRequest } from '../services/audit-core/onboarding';
import { assetUrl } from '../services/assets';

const emptyValues: SignupFormValues = {
  fullName: '',
  workEmail: '',
  verigenceKey: '',
  mobileNumber: '',
};

export default function SignupPage() {
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<SignupFormValues>({ defaultValues: emptyValues });

  const signup = useMutation({ mutationFn: createAccessRequest });

  const submit = handleSubmit((values) => {
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
      mobileNumber: parsed.data.mobileNumber || undefined,
    });
  });

  if (signup.data) return <SignupPending request={signup.data} />;

  return (
    <main className="signup-layout">
      <section className="signup-brand-panel">
        <img
          className="signup-brand-panel__logo"
          src={assetUrl('brand/approved/verigence-lockup.png')}
          alt="Verigence — evidence, verify, everywhere."
        />
        <div className="signup-brand-panel__message">
          <span className="signup-brand-panel__kicker">Create your account</span>
          <h1>Join Verigence securely.</h1>
          <p>
            Use the Verigence Key provided to you. Your organization and access scope are resolved by
            Verigence; users are not asked to enter internal Tenant, Dealer or Outlet IDs.
          </p>
        </div>
        <div className="signup-brand-panel__rule">
          <span>01</span>
          <div>
            <strong>Enter your Verigence Key</strong>
            <small>The key is provided by your organization or Verigence administrator.</small>
          </div>
        </div>
        <div className="signup-brand-panel__rule">
          <span>02</span>
          <div>
            <strong>Verify your identity</strong>
            <small>Email/mobile verification will follow the approved authentication flow.</small>
          </div>
        </div>
        <div className="signup-brand-panel__rule">
          <span>03</span>
          <div>
            <strong>Access is approved</strong>
            <small>Your role and business scope are assigned by an authorized administrator.</small>
          </div>
        </div>
      </section>

      <section className="signup-form-panel">
        <div className="signup-form-card">
          <div className="signup-form-card__heading">
            <img src={assetUrl('brand/approved/verigence-lockup.png')} alt="Verigence" />
            <div>
              <span className="eyebrow">New user</span>
              <h2>Create account</h2>
              <p>Enter your identity details and the Verigence Key supplied to you.</p>
            </div>
          </div>

          <form className="signup-form" onSubmit={submit} noValidate>
            <VerigenceInput
              label="Full name"
              autoComplete="name"
              placeholder="Enter your full name"
              error={errors.fullName?.message}
              {...register('fullName')}
            />

            <VerigenceInput
              label="Work email"
              type="email"
              autoComplete="email"
              placeholder="name@company.com"
              error={errors.workEmail?.message}
              {...register('workEmail')}
            />

            <VerigenceInput
              label="Mobile number (optional)"
              type="tel"
              autoComplete="tel"
              placeholder="+91 98xxxxxx00"
              error={errors.mobileNumber?.message}
              {...register('mobileNumber')}
            />

            <VerigenceInput
              label="Verigence Key"
              autoComplete="off"
              autoCapitalize="characters"
              placeholder="Enter your Verigence Key"
              error={errors.verigenceKey?.message}
              helperText="Provided by your organization or Verigence administrator."
              {...register('verigenceKey')}
            />

            {signup.isError && (
              <div className="form-alert form-alert--error" role="alert">
                We could not submit the registration. Please try again.
              </div>
            )}

            <VerigenceButton
              className="signup-form__submit"
              type="submit"
              expand="block"
              disabled={signup.isPending}
            >
              {signup.isPending ? 'Submitting…' : 'Continue'}
            </VerigenceButton>
          </form>

          <p className="signup-form-card__footer">
            Already have an account? <Link to="/login">Sign in</Link>
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
          src={assetUrl('brand/approved/verigence-lockup.png')}
          alt="Verigence"
        />
        <div className="signup-brand-panel__message">
          <span className="signup-brand-panel__kicker">Registration received</span>
          <h1>Your request is under review.</h1>
          <p>
            You will be notified when your account is approved and ready to use.
          </p>
        </div>
      </section>

      <section className="signup-form-panel">
        <article className="pending-card">
          <div className="pending-card__icon">✓</div>
          <span className="status-chip">Pending approval</span>
          <h2>Registration submitted</h2>
          <p>
            We have recorded the registration for <strong>{request.workEmail}</strong>.
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
              An authorized administrator reviews the request and assigns the appropriate access.
            </span>
          </div>
          <Link className="secondary-link-button" to="/login">Back to sign in</Link>
        </article>
      </section>
    </main>
  );
}
