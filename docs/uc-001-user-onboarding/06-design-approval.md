# UC-001 — Design Approval Record

**Status:** APPROVED — APPLICANT ONBOARDING IMPLEMENTATION AUTHORIZED  
**Date created:** 2026-08-19  
**Approval recorded:** 2026-08-19  
**Repository/branch:** `verigence/verigence-web` / `planning/uc-001-user-onboarding`

## 1. Approval gate

The applicant-facing UC-001 onboarding design is explicitly approved and frozen for implementation.

Approval covers the applicant Web/mobile flow, Security API boundary, responsive behaviour and the four approved authentication/onboarding screens. Any later material visual or contract change must return to design review rather than being introduced during implementation.

The SuperAdmin review/decision UI is not visually frozen by this approval record and remains a separate implementation/design checkpoint within the broader UC-001 scope.

## 2. Approved design basis

The approved implementation basis is:

- `01-use-case-spec.md`
- `02-sequence-diagram.md`
- `03-wireframes/README.md`
- `03-wireframes/web-wireframes.md`
- `03-wireframes/mobile-wireframes.md`
- `03-wireframes/mockup-board.html`
- `04-api-data-mapping.md`
- `05-test-scenarios.md`
- the final applicant mockups approved in the 19-Aug-2026 design session.

Where older Web authentication assumptions conflict with the 19-Aug-2026 Security v2 contract, the Security v2 contract remains authoritative.

## 3. Frozen applicant flow

The approved applicant journey is:

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
   v
Registration received
   |
   | USER remains PENDING until Verigence Admin approval
   v
Back to sign in
```

The four approved screens are:

1. **Sign in**
2. **Create your Verigence account**
3. **Verify your email**
4. **Registration received**

Do not add a Tenant, operating role, Dealer/Outlet, Project or authorization-scope selection to this applicant journey.

## 4. Frozen visual baseline — no silent changes

The following are locked for the approved applicant screens.

### 4.1 Verigence identity

Use the approved full Verigence lockup asset exactly as supplied. Do not redraw, reinterpret, simplify, recolor or regenerate it.

Approved repository asset:

```text
public/brand/approved/verigence-lockup.svg
```

The lockup includes the approved shield, wordmark treatment and tagline:

```text
AUDIT • GOVERNANCE • INTELLIGENCE
```

### 4.2 Background

Use the same background on every approved applicant screen, with the layers in this order from top to bottom:

```css
/* 1. 66px grid — horizontal */
linear-gradient(rgba(255,255,255,0.045) 1px, transparent 1px)

/* 2. 66px grid — vertical */
linear-gradient(90deg, rgba(255,255,255,0.045) 1px, transparent 1px)

/* 3. right-centre teal bloom */
radial-gradient(
  ellipse at 78% 48%,
  rgba(0,175,168,0.28) 0%,
  rgba(0,175,168,0.16) 32%,
  transparent 72%
)

/* 4. base gradient */
linear-gradient(158deg, #011E47 0%, #013060 55%, #026D7D 100%)
```

Grid repeat:

```css
background-size: 66px 66px, 66px 66px, 100% 100%, 100% 100%;
```

### 4.3 Composition

- centred white authentication/onboarding card;
- same background and card language across all four screens;
- deep-navy primary action button;
- teal interactive accents;
- approved full Verigence logo/tagline at the top of the card;
- same React application/codebase for browser and Capacitor mobile;
- responsive single-column behaviour on smaller screens;
- no alternate mobile-only onboarding rules or fields.

The approved visual baseline must not drift between screens.

## 5. Frozen Security / Clerk decisions

- Web and Capacitor mobile use the same React application/codebase.
- Clerk is the human credential provider.
- Only Security integrates with Clerk Backend APIs.
- Web/Mobile contain no Clerk SDK, Clerk keys or Clerk session-JWT authentication.
- Signup calls `POST /security/v1/onboarding/users`.
- Signup contract contains First Name, Last Name, Verigence Identifier, Email ID, Mobile Number and Password.
- `X-Onboarding-Key` transports the user-facing Verigence Identifier.
- Email OTP is entered in Verigence UI and sent to Security.
- Successful email verification creates/binds the global USER in `PENDING`.
- SuperAdmin alone decides `PENDING -> ACTIVE` or `PENDING -> REJECTED`.
- Applicant does not choose Tenant, role, Dealer/Outlet, Project or authorization scope.
- Device/Geo are not mandatory, persisted or onboarding gates in Phase 1.
- No Phase-1 TOTP/MFA requirement is introduced.
- No Security, Audit Core, DI or database modification is authorized by this Web implementation approval.

## 6. Implementation-time contract resolutions

The deployed/current `verigence-security/dev` implementation was inspected before applicant implementation began. The following previously open transport details are therefore resolved for this implementation:

- signup response reference: `signupAttemptId`;
- signup response status: `EMAIL_VERIFICATION_REQUIRED`;
- signup response includes `expiresAt`;
- verify-email request body property: `code`;
- resend uses `POST /security/v1/onboarding/users/{signupAttemptId}/resend-email-code`;
- successful verification returns `PENDING_ADMIN_APPROVAL`.

These are consumed as existing Security capabilities. They are not new Web-invented APIs or lifecycle states.

## 7. Deliberately deferred/open items

The following are not invented as part of this approval:

- applicant notification mechanism after a later `REJECTED` decision;
- applicant-driven resubmission after rejection;
- optional Device/Geo request context — UC-001 does not require it;
- password-policy copy beyond what the deployed Security/provider contract can safely support;
- SuperAdmin review-screen visual redesign;
- canonical login backend integration, which belongs to the later login use case.

The OTP expiry presentation may use the expiry timestamp returned by Security. The client must not invent a separate retry limit or resend-throttle rule.

## 8. Implementation authorization

```text
Design approval: Explicitly approved by the design owner in-session on 19-Aug-2026
Frozen applicant mockups: YES
Implementation authorized: YES — applicant UC-001 flow
Security changes authorized: NO
Audit Core / DI changes authorized: NO
Web main changes authorized: NO
Target branch: planning/uc-001-user-onboarding
```

## 9. Post-approval implementation scope

Applicant implementation may now reconcile the stale prototype areas required for the approved flow, including:

- `src/pages/LoginPage.tsx` — UC-001 entry/return visual only; canonical login remains later work;
- `src/pages/SignupPage.tsx`;
- `src/features/onboarding/signupSchema.ts`;
- Security-facing Web onboarding client/service code;
- applicant auth/onboarding responsive styles;
- environment configuration required to address the existing Security API.

Stale Audit Core/demo onboarding code may be retired or bypassed only where necessary to remove it from the applicant flow. Broader administration code should not be refactored merely as cleanup.

## 10. Verification and deployment restriction

Implementation remains subject to normal verification:

1. implementation occurs only on `planning/uc-001-user-onboarding` or a child feature branch;
2. typecheck/build and functional/API checks must pass before merge;
3. Web/mobile rendered results must be compared with the frozen mockups;
4. the approved logo asset and background layers must be verified for visual drift;
5. merge to `main` occurs only after explicit deployment/merge approval.
