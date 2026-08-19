# UC-001 — Design Approval Record

**Status:** APPROVED — FULL UC-001 IMPLEMENTATION AUTHORIZED  
**Date created:** 2026-08-19  
**Approval updated:** 2026-08-19  
**Repository/branch:** `verigence/verigence-web` / `planning/uc-001-user-onboarding`

## 1. Approval gate

UC-001 is authorized for implementation on the planning branch.

The applicant-facing authentication/onboarding mockups are **frozen**. Implementation must not silently alter their logo, tagline, background, field composition, card treatment or approved navigation sequence.

The SuperAdmin onboarding review/decision functionality is also authorized as part of UC-001. Its implementation must follow the existing Web design language and the approved UC-001 rules; it must not introduce Tenant, role, Dealer/Outlet, Project or permission assignment into onboarding approval.

Any material business/API change discovered during implementation must return to design review rather than being invented in Web.

## 2. Approved design basis

The implementation basis is:

- `01-use-case-spec.md`
- `02-sequence-diagram.md`
- `03-wireframes/README.md`
- `03-wireframes/web-wireframes.md`
- `03-wireframes/mobile-wireframes.md`
- `03-wireframes/mockup-board.html`
- `04-api-data-mapping.md`
- `05-test-scenarios.md`
- the final applicant mockups approved in the 19-Aug-2026 design session
- the frozen 19-Aug-2026 Security v2 solution/implementation contract

Where older Web assumptions conflict with Security v2, Security v2 wins.

## 3. Frozen applicant journey

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
Back to sign in
```

Applicant signup captures the approved identity/credential inputs only. The Verigence Identifier is transported as `X-Onboarding-Key`.

The applicant does not select Tenant, operating role, administrative role, Dealer/Outlet, Project or authorization scope.

## 4. Frozen applicant visual baseline

### 4.1 Verigence identity

Use the approved full Verigence lockup asset exactly as supplied:

```text
public/brand/approved/verigence-lockup.svg
```

Do not redraw, reinterpret, simplify, recolor or regenerate the logo.

The approved lockup includes:

```text
AUDIT • GOVERNANCE • INTELLIGENCE
```

### 4.2 Background

All approved applicant screens use the same layer order:

```css
linear-gradient(rgba(255,255,255,0.045) 1px, transparent 1px),
linear-gradient(90deg, rgba(255,255,255,0.045) 1px, transparent 1px),
radial-gradient(
  ellipse at 78% 48%,
  rgba(0,175,168,0.28) 0%,
  rgba(0,175,168,0.16) 32%,
  transparent 72%
),
linear-gradient(158deg, #011E47 0%, #013060 55%, #026D7D 100%);
```

Grid repeat:

```css
background-size: 66px 66px, 66px 66px, 100% 100%, 100% 100%;
```

### 4.3 Composition

- centred white authentication/onboarding card;
- deep-navy primary actions;
- teal interactive accents;
- approved full Verigence logo/tagline at the top of the card;
- one shared React implementation for browser and Capacitor mobile;
- responsive single-column behavior on smaller screens;
- no mobile-only onboarding fields or business rules.

## 5. Frozen Security / Clerk architecture

- Clerk is the human credential provider.
- Only Security integrates with Clerk Backend APIs.
- Web/Mobile contain no Clerk SDK, Clerk keys or Clerk session-JWT authentication.
- Security issues the Verigence human access JWT.
- Security remains the authoritative USER lifecycle and authorization source.
- Device/Geo are not mandatory, persisted or onboarding/login gates in Phase 1.
- No Phase-1 TOTP/MFA requirement is introduced.
- No Security, Audit Core, DI or database modification is authorized by UC-001 Web implementation.

## 6. Applicant implementation-time contract resolutions

The deployed/current `verigence-security/dev` implementation resolves the following transport details:

```text
POST /security/v1/onboarding/users
  Header: X-Onboarding-Key
  Body: firstName, lastName, email, mobile, password
  Response: signupAttemptId, EMAIL_VERIFICATION_REQUIRED, expiresAt

POST /security/v1/onboarding/users/{signupAttemptId}/verify-email
  Body: code
  Successful result: PENDING_ADMIN_APPROVAL

POST /security/v1/onboarding/users/{signupAttemptId}/resend-email-code
```

Password and OTP remain transient client secrets and are not persisted in Web session storage.

## 7. SuperAdmin review/decision contract

UC-001 ends when the global USER is either `ACTIVE` or `REJECTED`.

The existing Security v2 administrative surface is:

```text
GET /security/v1/platform/users?userStatus=PENDING&limit=200&offset=0
GET /security/v1/platform/users/{userId}
PATCH /security/v1/users/{userId}/status
```

Allowed onboarding decisions:

```text
PENDING -> ACTIVE
PENDING -> REJECTED
```

Both are SuperAdmin-only in Phase 1 and require the Security-issued human Bearer JWT.

Activation body:

```json
{
  "status": "ACTIVE"
}
```

Rejection body:

```json
{
  "status": "REJECTED",
  "reason": "optional administrative reason"
}
```

The review UI must not assign or edit:

- Tenant;
- operating role;
- administrative role;
- Dealer/Outlet;
- Project;
- permission scope.

Those are separate administrative use cases.

## 8. Deliberately deferred/open items

UC-001 does not invent:

- applicant notification mechanism after a later `REJECTED` decision;
- applicant-driven resubmission after rejection;
- mandatory Device/Geo context;
- a new password-policy business rule beyond Security/provider acceptance;
- a resend limit/cooldown not supplied by Security;
- canonical login backend integration.

Canonical human login remains the later login use case:

```text
POST /security/v1/auth/login
identifier + password
```

The SuperAdmin review implementation may consume an already-established Security human access token, but UC-001 does not redesign login just to create that token.

## 9. Implementation authorization

```text
Design owner approval: explicitly confirmed in-session on 19-Aug-2026
Frozen applicant mockups: YES
Applicant implementation authorized: YES
SuperAdmin UC-001 review/decision implementation authorized: YES
Security changes authorized: NO
Audit Core / DI changes authorized: NO
Web main changes authorized: NO
Target branch: planning/uc-001-user-onboarding
```

## 10. Verification and merge restriction

Before merge/deployment approval:

1. run `npm run typecheck`;
2. run `npm run build`;
3. test applicant registration against Security DEV;
4. test OTP verification and resend;
5. test pending-user list/detail with a Security-issued SuperAdmin human token;
6. test `PENDING -> ACTIVE` and `PENDING -> REJECTED` including stale/conflict refresh behavior;
7. compare desktop and mobile applicant rendering against the frozen mockups;
8. verify the approved logo asset and frozen background have not drifted.

Merge to `main` remains separately controlled and is **not** authorized by this approval record.
