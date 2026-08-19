# UC-001 — Test Scenarios

**Status:** DRAFT FOR DESIGN REVIEW  
**Platforms:** Web browser + Capacitor Android/iOS using the same React codebase

## 1. Test objective

Validate that UC-001 implements exactly the frozen global USER onboarding journey:

```text
Create account
   -> Security signup
   -> Security-mediated Clerk email OTP
   -> verified global USER = PENDING
   -> SuperAdmin review
      -> ACTIVE
      -> REJECTED
```

Tests must also prove that old Tenant/role/Audit-Core onboarding assumptions have not re-entered the flow.

## 2. Test principles

- Security is authoritative for backend validation and USER state.
- Web/Mobile never calls Clerk directly.
- Password and OTP are transient secrets.
- Desktop and mobile have the same business behaviour.
- No test should rely on Web localStorage/demo access-request persistence as authoritative onboarding state.
- Exact backend error codes and payloads must be taken from the deployed Security contract at implementation time.

---

# A. Applicant signup form

## UC001-T001 — Signup screen contains exact approved fields

**Given** the applicant opens Create Account  
**Then** the screen contains:

- First Name;
- Last Name;
- Verigence Identifier;
- Email ID;
- Mobile Number;
- Password.

**And** it does not contain Tenant, role, Dealer/Outlet, Project, Device ID, Geo or TOTP/MFA fields.

Expected: PASS on Web and mobile.

## UC001-T002 — First Name required

Submit with First Name empty.

Expected:

- client prevents invalid submit where local required validation applies;
- accessible field error is displayed;
- no fabricated backend state is created.

## UC001-T003 — Last Name required

Same expectations as T002.

## UC001-T004 — Verigence Identifier required

Expected:

- validation shown;
- UI label remains `Verigence Identifier`, not `X-Onboarding-Key`.

## UC001-T005 — Email required/format validation

Expected:

- malformed email is detected locally where supported;
- Security remains authoritative after submission.

## UC001-T006 — Mobile Number required

Expected:

- Mobile Number is not labelled optional;
- missing value prevents valid signup submission.

## UC001-T007 — Password required and masked

Expected:

- required validation;
- masked input by default;
- show/hide affordance does not log or persist the password.

## UC001-T008 — No invented password policy

Expected:

- UI does not enforce/document password rules beyond the actual approved Security contract;
- if the backend rejects the password, mapped Security feedback is shown after implementation-time contract verification.

---

# B. Signup API contract

## UC001-T010 — Correct signup endpoint

Expected request:

```text
POST /security/v1/onboarding/users
```

No Audit Core onboarding endpoint is called.

## UC001-T011 — Correct body mapping

Expected body contains only the approved signup values:

- `firstName`;
- `lastName`;
- `email`;
- `mobile`;
- `password`.

No role/Tenant/business-scope fields are added.

## UC001-T012 — Verigence Identifier header mapping

Expected:

```text
X-Onboarding-Key: <entered Verigence Identifier>
```

The technical header name is not displayed to the applicant.

## UC001-T013 — No Clerk client call

Instrument browser/mobile networking during signup.

Expected:

- no Clerk Frontend or Backend API request from Web/Capacitor;
- all signup credential traffic goes to Verigence Security.

## UC001-T014 — No Clerk SDK/configuration in client bundle

Expected:

- no Clerk SDK dependency introduced;
- no Clerk publishable/secret key in Web/mobile environment configuration or bundle.

## UC001-T015 — Password is not persisted

Submit or navigate during signup.

Expected:

- password absent from localStorage/session persistence/Zustand persistence;
- password absent from URLs;
- password absent from client logs/analytics payloads.

## UC001-T016 — Optional Device/Geo not a gate

Run signup without Device ID and without Geo/location permission.

Expected: signup remains functionally valid and proceeds to Security.

## UC001-T017 — No Device/Geo persistence introduced

Expected:

- no UC-001 client persistence/database record added for Device/Geo;
- no location prompt appears merely to create an account.

---

# C. Signup request outcomes

## UC001-T020 — Successful signup initiation

Mock/use deployed Security successful signup response.

Expected:

- client captures the Security signup-attempt reference required for verification;
- client moves to Verify Email;
- password is cleared from active/persisted state as soon as it is no longer required.

## UC001-T021 — Invalid Verigence Identifier

Security rejects the onboarding gate.

Expected:

- applicant remains on Create Account;
- safe mapped error is visible;
- no local PENDING USER/request is created.

## UC001-T022 — Duplicate/conflicting identity

Security reports its implemented duplicate/conflict result.

Expected:

- Web shows mapped safe feedback;
- Web does not silently return an old local request;
- exact copy follows the deployed contract and approved UX mapping.

## UC001-T023 — Network/server failure during signup

Expected:

- applicant remains on Create Account;
- retry is possible;
- safe non-secret values may remain in current memory/UI;
- password is not durably persisted;
- no false success/pending state.

## UC001-T024 — Double-submit protection

Rapidly activate Continue more than once.

Expected: while the first request is in flight, duplicate primary submissions are disabled/prevented.

---

# D. Email OTP verification

## UC001-T030 — Verify Email screen shown after accepted signup

Expected:

- screen explains that a verification code was sent to the email address;
- UI does not mention Clerk;
- no Tenant/role fields appear.

## UC001-T031 — Correct verify endpoint

Expected:

```text
POST /security/v1/onboarding/users/{signupAttemptId}/verify-email
```

Exact request JSON is verified against deployed Security OpenAPI before implementation.

## UC001-T032 — Successful OTP verification

Security verifies the OTP.

Expected:

- client transitions to Registration Pending;
- applicant does not receive a Verigence authorization role assignment in the UI;
- Security is treated as authoritative for resulting USER state.

## UC001-T033 — Incorrect/invalid OTP

Expected:

- remain on Verify Email;
- accessible error displayed;
- no false PENDING success;
- Clerk details not exposed.

## UC001-T034 — OTP is not persisted

Expected:

- absent from localStorage/session persistence/Zustand persistence;
- absent from URL/logs/analytics;
- cleared after completed verification request/navigation.

## UC001-T035 — OTP paste/keyboard behaviour

Expected:

- browser keyboard entry works;
- mobile numeric/text keyboard behaviour is usable according to the actual code format;
- paste works where implementation supports it;
- exact digit count is not hard-coded until backend contract verification.

---

# E. Resend email code

## UC001-T040 — Resend uses Security endpoint

Expected:

```text
POST /security/v1/onboarding/users/{signupAttemptId}/resend-email-code
```

No direct Clerk request.

## UC001-T041 — Resend success feedback

Expected:

- applicant remains on Verify Email;
- safe feedback is displayed;
- no invented resend countdown is shown unless supplied/defined by Security contract.

## UC001-T042 — Resend failure

Expected:

- remain on Verify Email;
- retry/error feedback follows Security contract;
- active signup attempt is not replaced locally without Security instruction.

---

# F. Pending state

## UC001-T050 — Pending confirmation content

After successful verification, expected screen communicates:

- email verified;
- registration pending review;
- SuperAdmin review;
- Back to Sign In action.

Expected screen does not display:

- selected role;
- Tenant;
- Dealer/Outlet;
- permission scope.

## UC001-T051 — No notification promise

Expected: Pending screen does not promise email/SMS/push notification until that mechanism is explicitly defined.

---

# G. SuperAdmin pending-user review

## UC001-T060 — Only Security global USER data is authoritative

Expected:

- queue/detail reads Security USER APIs;
- old Web demo access-request store is not authoritative;
- UI never fabricates a pending request independently.

## UC001-T061 — Pending queue loading state

Expected: loading skeleton/progress is shown without stale fake content.

## UC001-T062 — Pending queue empty state

Expected: clear empty state, no seeded demo identities.

## UC001-T063 — Pending queue error state

Expected:

- error is visible;
- retry/refresh is available;
- app does not silently switch to local demo data.

## UC001-T064 — Pending USER detail contains no secrets

Expected: no password, OTP or credential secrets are displayed.

## UC001-T065 — No role/business-scope assignment in onboarding review

Expected SuperAdmin detail has no:

- PC/TL/PM/CRM/Executive selector;
- Tenant selector;
- Dealer/Outlet selector;
- permission editor.

---

# H. Activation

## UC001-T070 — Activation requires explicit confirmation

Expected: `Activate user` does not send the transition until confirmation.

## UC001-T071 — Activation transition

Current Security state: `PENDING`.

Expected requested backend transition: `PENDING -> ACTIVE` through the canonical Security status operation.

## UC001-T072 — Only Security success creates ACTIVE UI result

Expected:

- progress while request is in flight;
- success shown only after Security confirms;
- queue/detail refresh uses authoritative backend state.

## UC001-T073 — Activation conflict/stale state

Security reports the USER is no longer eligible for PENDING->ACTIVE.

Expected:

- no silent retry;
- refresh authoritative state;
- display current state/conflict.

## UC001-T074 — Authorization failure

Non-SuperAdmin attempts the protected transition.

Expected:

- Security denies;
- UI does not treat hidden buttons/routes as authorization;
- no state change shown.

---

# I. Rejection

## UC001-T080 — Rejection requires explicit confirmation

Expected: no backend transition until confirmation.

## UC001-T081 — Rejection transition

Current state: `PENDING`.

Expected requested transition: `PENDING -> REJECTED`.

## UC001-T082 — No invented mandatory reason

Expected: UC-001 does not require a rejection reason unless Security/product design explicitly adds that contract later.

## UC001-T083 — Rejection conflict

Expected behaviour mirrors activation conflict: refresh backend state and do not silently repeat the decision.

## UC001-T084 — Applicant rejected-state mechanism remains open

Expected:

- a conditional rejected visual may exist;
- no automatic polling/notification/resubmission flow is implemented unless separately approved.

---

# J. Responsive and cross-platform tests

## UC001-T090 — Same fields on desktop and mobile

Expected: all six signup fields exist with identical meanings/requiredness.

## UC001-T091 — Mobile is not a separate auth implementation

Expected:

- same shared validation/schema/API client is used where implementation architecture permits;
- Capacitor does not introduce another auth provider/SDK.

## UC001-T092 — Desktop two-panel layout degrades cleanly

Resize from wide desktop to tablet/mobile.

Expected:

- form remains readable;
- no required field/action disappears;
- no horizontal overflow for core form content.

## UC001-T093 — SuperAdmin split view becomes mobile list/detail

Expected:

- desktop may display queue and detail side-by-side;
- mobile uses sequential list/detail navigation;
- same backend state/actions.

## UC001-T094 — Touch targets

Expected: primary/secondary actions are practical on handheld screens and do not rely on hover.

## UC001-T095 — Keyboard accessibility

Expected:

- logical tab order;
- visible focus;
- Enter/Space activation where applicable;
- errors discoverable without pointer input.

## UC001-T096 — Screen reader baseline

Expected:

- visible labels are programmatically associated;
- alerts/errors announced appropriately;
- status is not communicated by color alone.

---

# K. Regression guardrails against stale architecture

## UC001-T100 — No `APPROVED` onboarding status

Expected: UC-001 uses `PENDING`, `ACTIVE`, `REJECTED` for the decision; old Web `APPROVED` is absent from the new flow.

## UC001-T101 — No onboarding `roleKey`

Expected: signup/activation payload does not contain operating role selection.

## UC001-T102 — No Audit Core onboarding API

Expected: client does not call old invented routes such as `/v1/onboarding/access-requests`.

## UC001-T103 — No local seeded onboarding users

Expected: production/integration onboarding review never seeds `AR-WEB-*` requests or example pending users as authoritative state.

## UC001-T104 — No Tenant during signup or canonical login entry

Expected: UC-001 signup has no `tenantId`; Sign In remains identifier/password only for the later login use case.

## UC001-T105 — No mandatory Device/Geo

Expected: account creation works without camera/location/device setup and does not introduce database migration requirements.

---

## 3. Test data rule

Use dedicated test identities/Verigence Identifiers supplied for the test environment. Do not hard-code production employee credentials into source/tests.

Passwords and OTPs used in automated tests must be synthetic test secrets and must not be printed to CI logs.

## 4. Approval-time test completion criteria

Before implementation approval:

- [ ] unit/component tests cover form and state transitions;
- [ ] Security integration tests cover signup/OTP/resend/USER decision using the deployed DEV contract;
- [ ] desktop functional flow passes;
- [ ] mobile responsive browser flow passes;
- [ ] Capacitor Android flow passes when native project/runtime is available;
- [ ] iOS flow is validated when the required Xcode runtime is available;
- [ ] no Clerk client traffic is observed;
- [ ] no secret persistence/logging is observed;
- [ ] no Tenant/role/Dealer/Outlet selection appears in UC-001;
- [ ] visual implementation is compared against the approved wireframes/mockups.