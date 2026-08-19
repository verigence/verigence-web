# UC-001 — Implementation Status

**Status:** IMPLEMENTED ON UC-001 BRANCH — VERIFICATION PENDING  
**Date:** 2026-08-19  
**Repository/branch:** `verigence/verigence-web` / `planning/uc-001-user-onboarding`

## 1. Scope implemented

UC-001 now implements the approved Web + Capacitor-mobile shared-code journey:

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
  "status": "REJECTED",
  "reason": "optional administrative reason"
}
```

The SuperAdmin review does **not** assign:

- Tenant;
- operating role;
- administrative role;
- Dealer/Outlet;
- Project;
- permission scope.

Those remain separate administrative use cases.

## 4. Authorization boundary

The protected SuperAdmin APIs require the Security-issued human Bearer JWT. `ApprovalQueuePage` therefore uses the volatile `accessToken` already present in the Web session store interface.

The existing UC-001 Sign In screen deliberately remains a preview/navigation bridge because canonical login backend integration belongs to the later login use case. UC-001 does not add Clerk SDKs, Clerk keys, Clerk session JWTs or a second authentication model simply to make the approval screen self-authenticate.

If no Security human access token is present, the approval page does not fall back to demo authorization; it displays that Security authentication is required.

## 5. Shared Web/mobile behavior

The implementation remains one React codebase with responsive CSS and Capacitor support. There is no separate mobile onboarding model, API client, field set or business rule.

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
6. verify `PENDING -> ACTIVE` and `PENDING -> REJECTED` refresh behavior;
7. compare rendered desktop and mobile applicant screens against the frozen mockups;
8. verify the approved full logo asset and frozen background have not drifted.

No merge to `main` is authorized by this implementation record.
