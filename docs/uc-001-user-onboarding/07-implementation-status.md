# UC-001 — Implementation Status

**Status:** IMPLEMENTED ON UC-001 BRANCH — RUNTIME VERIFICATION PENDING  
**Date:** 2026-08-19  
**Repository/branch:** `verigence/verigence-web` / `planning/uc-001-user-onboarding`

## 1. Scope implemented

UC-001 implements the approved Web + Capacitor-mobile shared-code journey:

```text
Sign in
   |
   | Register Now
   v
Create your Verigence account
   |
   | POST /security/v1/onboarding/users
   v
Verify your email
   |
   | POST /security/v1/onboarding/users/{signupAttemptId}/verify-email
   | POST /security/v1/onboarding/users/{signupAttemptId}/resend-email-code
   v
Registration received
   |
   | global USER remains PENDING
   v
SuperAdmin review
   |
   +-- PATCH /security/v1/users/{userId}/status -> ACTIVE
   |
   `-- PATCH /security/v1/users/{userId}/status -> REJECTED
```

The applicant screens continue to use the frozen approved logo, background and card treatment. No applicant mockup redesign is part of this implementation.

## 2. Applicant implementation

Implemented in:

- `src/pages/LoginPage.tsx` — frozen UC-001 entry/return visual; canonical login API remains later work.
- `src/pages/SignupPage.tsx` — registration, email OTP verification, resend and registration-received state.
- `src/features/onboarding/signupSchema.ts` — client validation aligned with the deployed Phase-1 signup contract.
- `src/services/security/onboarding.ts` — direct Verigence Security onboarding integration.
- `src/styles/auth-onboarding.css` — frozen responsive Web/mobile authentication/onboarding shell.
- `public/brand/approved/verigence-lockup.svg` — approved full Verigence lockup used as an asset, not regenerated.

Security transport implemented:

```text
POST /security/v1/onboarding/users
Header: X-Onboarding-Key
Body: firstName, lastName, email, mobile, password

POST /security/v1/onboarding/users/{signupAttemptId}/verify-email
Body: code

POST /security/v1/onboarding/users/{signupAttemptId}/resend-email-code
```

The client keeps password and OTP only in transient component/form state. Neither is written to the persisted Zustand session store.

## 3. SuperAdmin implementation

The stale Web prototype used Audit Core/demo `AccessRequest` records and assigned an operating role during approval. That conflicts with the frozen 19-Aug Security contract and is no longer used by the UC-001 approval page.

Implemented in:

- `src/services/security/onboardingAdmin.ts`
- `src/pages/ApprovalQueuePage.tsx`
- `src/styles/approval-uc001.css`
- `src/layout/AppShell.tsx` — onboarding approval navigation is shown only for the SuperAdmin UI persona; Security remains authoritative.

Existing Security APIs consumed:

```text
GET /security/v1/platform/users?userStatus=PENDING&limit=200&offset=0
GET /security/v1/platform/users/{userId}
PATCH /security/v1/users/{userId}/status
```

Activation request:

```json
{
  "status": "ACTIVE"
}
```

Rejection request:

```json
{
  "status": "REJECTED"
}
```

Security supports an optional administrative reason in the broader lifecycle schema, but the approved UC-001 wireframes do not define a rejection-reason control. The UC-001 Web implementation therefore sends only the requested status.

The SuperAdmin review does **not** assign:

- Tenant;
- operating role;
- administrative role;
- Dealer/Outlet;
- Project;
- permission scope.

Those remain separate administrative use cases.

### Implemented review states

- pending list loading;
- pending list empty;
- pending list error + retry;
- pending list populated;
- no automatic first-user selection;
- authoritative pending USER detail;
- explicit activation confirmation;
- explicit rejection confirmation;
- decision in progress with actions disabled;
- explicit ACTIVE/REJECTED result screen;
- stale/conflict state showing the current Security USER status;
- desktop split list/detail presentation;
- mobile sequential list -> detail -> result presentation.

No password, OTP or Clerk subject is rendered in the SuperAdmin review UI.

## 4. Authorization boundary

The protected SuperAdmin APIs require the Security-issued human Bearer JWT. `ApprovalQueuePage` therefore uses the volatile `accessToken` already present in the Web session store interface.

The existing UC-001 Sign In screen deliberately remains a preview/navigation bridge because canonical login backend integration belongs to the later login use case. UC-001 does not add Clerk SDKs, Clerk keys, Clerk session JWTs or a second authentication model simply to make the approval screen self-authenticate.

If no Security human access token is present, the approval page does not fall back to demo authorization or local data. It reports that an authenticated Security session is required.

## 5. Shared Web/mobile behavior

The implementation remains one React codebase with responsive CSS and Capacitor support. There is no separate mobile onboarding model, API client, field set or business rule.

For SuperAdmin review, desktop uses the approved split list/detail layout while small screens use sequential list/detail navigation from the same React component and Security client.

## 6. Explicitly unchanged

This implementation does not modify:

- `verigence-security`;
- Audit Core;
- DI;
- any database schema;
- Web `main`;
- the frozen applicant logo/background/mockup treatment.

Device/Geo remain optional Phase-1 request context and are not introduced as onboarding fields or gates.

## 7. Verification still required before merge

Before any merge/deployment approval:

1. run `npm run typecheck`;
2. run `npm run build`;
3. exercise registration against the target Security DEV environment;
4. exercise OTP verify/resend using a real Security signup attempt;
5. exercise SuperAdmin pending list/detail with a Security-issued SuperAdmin human token;
6. verify `PENDING -> ACTIVE` and `PENDING -> REJECTED` result/refresh behavior;
7. force a stale/conflict decision and confirm the authoritative Security status is displayed;
8. compare rendered desktop and mobile applicant screens against the frozen mockups;
9. verify mobile SuperAdmin navigation is list -> detail -> result without compressed split-view behavior;
10. verify the approved full logo asset and frozen background have not drifted.

The branch does not currently have a pull-request CI run for these latest commits, and this environment cannot clone the GitHub repository directly for local `npm` execution. Therefore typecheck/build and live DEV API verification remain explicitly pending rather than being claimed as passed.

No merge to `main` is authorized by this implementation record.
