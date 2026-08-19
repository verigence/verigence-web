# UC-001 — User Onboarding Use-Case Specification

**Status:** DRAFT FOR DESIGN REVIEW  
**Date:** 2026-08-19  
**Platforms:** Web browser + Capacitor mobile from one React codebase

## 1. Objective

Allow a new human employee to create one global Verigence USER identity using the Verigence onboarding contract, verify their email through Security-mediated Clerk email OTP, and enter the global `PENDING` state for SuperAdmin review.

UC-001 ends when the global USER is either `ACTIVE` or `REJECTED`. Tenant membership, operating role, Dealer/Outlet assignment and authorization scope are not selected by the applicant and are not part of the signup transaction.

## 2. Primary actors

### Applicant
A human employee creating their Verigence account.

### SuperAdmin
The Phase-1 platform administrator who reviews a global `PENDING` USER and performs either:

- `PENDING -> ACTIVE`; or
- `PENDING -> REJECTED`.

Both transitions are SuperAdmin-only in Phase 1.

## 3. Participating systems

- Verigence Web application.
- The same Verigence application running through Capacitor on mobile.
- Verigence Security.
- Clerk Backend API, called only by Security.

Audit Core and DI do not participate in UC-001 signup/credential verification.

## 4. Trigger

The applicant chooses **Create account** from the Verigence authentication entry screen.

## 5. Preconditions

1. The applicant has a valid Verigence Identifier supplied through the approved organizational process.
2. Verigence Security is reachable.
3. Security is configured for its approved Clerk Backend API integration.
4. The applicant has access to the email address used during signup so the email OTP can be completed.

No Tenant ID, Dealer ID, Outlet ID, role, Device ID, Geo, TOTP or other authorization scope is a signup precondition.

## 6. Signup fields

The applicant-facing form contains exactly:

1. **First Name**
2. **Last Name**
3. **Verigence Identifier**
4. **Email ID**
5. **Mobile Number**
6. **Password**

The current Web prototype fields such as `Full name`, optional mobile and `Verigence Key` are not the UC-001 contract.

### Field-to-contract rule

- First Name -> body `firstName`
- Last Name -> body `lastName`
- Email ID -> body `email`
- Mobile Number -> body `mobile`
- Password -> body `password`
- Verigence Identifier -> request header `X-Onboarding-Key`

## 7. Frozen business rules

### BR-001 — One global identity
Human onboarding creates/binds one global Verigence USER. Signup is not Tenant-specific.

### BR-002 — Security-only Clerk integration
Web/Mobile must not call Clerk, embed Clerk SDKs, hold Clerk keys, validate Clerk session tokens or use Clerk as the Verigence authorization source of truth.

### BR-003 — Verigence Identifier
The user-facing Verigence Identifier is sent as `X-Onboarding-Key` to Security. The UI must not expose the technical header name.

### BR-004 — No business-scope selection
The applicant does not select or enter:

- Tenant;
- operating role;
- administrative role;
- Dealer/Outlet;
- Project;
- authorization scope.

### BR-005 — Email OTP
After Security accepts the signup request and initiates Clerk-backed email verification, the applicant enters the email OTP in the Verigence UI. Web/Mobile submits that OTP only to Security.

### BR-006 — Secret handling
Password and OTP are transient request secrets. They must not be persisted in Web application storage, logged, placed in URLs, written to analytics payloads or displayed after submission.

### BR-007 — Pending state after verification
Successful email verification causes Security to create/bind the global Verigence USER and keep that USER in `PENDING`.

### BR-008 — SuperAdmin decision
Only SuperAdmin may perform the onboarding decision:

```text
PENDING
  |-- REJECTED
  `-- ACTIVE
```

### BR-009 — Role/business assignment is separate
Activation does not mean an applicant selected or was automatically assigned a Tenant operating role or Dealer/Outlet scope during signup. Those are separate administrative assignments.

### BR-010 — Device/Geo Phase-1 rule
Device ID and Geo may be supplied as optional client request context, but Phase 1 does not require them, persist them for onboarding/login, or use them as authentication/authorization gates. UC-001 therefore does not prompt for them and requires no database change.

### BR-011 — No mandatory MFA/TOTP
Phase 1 does not add TOTP/MFA to the canonical signup journey.

### BR-012 — Shared Web/mobile behaviour
Web and Capacitor mobile use the same form model, validations, API contracts and state machine. Responsive presentation may differ, but no mobile-only signup business rule is introduced.

## 8. Happy path

### Applicant flow

1. Applicant opens Verigence Sign In.
2. Applicant selects **Create account**.
3. Web/Mobile displays the signup form with the six approved fields.
4. Applicant enters First Name, Last Name, Verigence Identifier, Email ID, Mobile Number and Password.
5. Client performs only approved/basic form validation and submits the request to Security.
6. Web/Mobile calls:

   `POST /security/v1/onboarding/users`

7. Request body contains `firstName`, `lastName`, `email`, `mobile`, `password`.
8. Header contains `X-Onboarding-Key: <Verigence Identifier>`.
9. Security validates the onboarding gate and duplicate identity constraints.
10. Security coordinates human identity creation through Clerk Backend API.
11. Security initiates Clerk-backed email verification.
12. Web/Mobile transitions to **Verify email**.
13. Applicant enters the email OTP.
14. Web/Mobile submits the OTP to Security using the Security verification endpoint for the returned signup attempt.
15. Security verifies the code through Clerk Backend API.
16. Security binds/creates the global Verigence USER.
17. USER becomes `PENDING`.
18. Web/Mobile displays **Registration pending**.
19. SuperAdmin reviews the pending global USER.
20. SuperAdmin selects **Activate**.
21. Security performs `PENDING -> ACTIVE`.
22. The onboarding decision is complete.

Authentication after activation uses the canonical login contract `identifier + password` and belongs to the later login use case. UC-001 may show a **Back to sign in** action but does not redesign login behaviour here.

## 9. Alternate path — rejection

1. Steps 1–18 of the happy path complete.
2. SuperAdmin reviews the pending global USER.
3. SuperAdmin selects **Reject**.
4. Security performs `PENDING -> REJECTED`.
5. The onboarding decision is complete.

**OPEN DECISION:** The reviewed 19-Aug source of truth does not define the applicant notification/delivery mechanism for a rejection or an applicant-driven resubmission flow. UC-001 must not invent one. A rejected-state visual may be designed as a state, but the mechanism that navigates the applicant to it remains open until defined.

## 10. Alternate path — resend email code

1. Applicant has reached **Verify email**.
2. Applicant requests another code.
3. Web/Mobile calls Security's resend endpoint for the active signup attempt.
4. Security coordinates the resend through Clerk Backend API.
5. Web/Mobile remains on the verification screen and accepts the new OTP.

**OPEN DECISION:** Exact resend throttling, countdown duration, maximum resend count and user-facing retry timing are not defined by the reviewed 19-Aug documents. The UI must not invent hard-coded business limits.

## 11. Exception and error paths

### E-001 — Required field missing or malformed
The form prevents submission for locally detectable required/format errors. Security remains authoritative for backend validation.

### E-002 — Verigence Identifier rejected
Security rejects the onboarding request. The user remains on Create Account and sees a clear non-technical error associated with the Verigence Identifier/general form as supported by the actual Security error contract.

### E-003 — Duplicate identity/onboarding conflict
Security rejects or resolves the duplicate according to Security's implemented duplicate-identity contract.

**OPEN DECISION:** Exact Web copy and whether any server response may safely reveal an existing account/request state are not defined in the reviewed 19-Aug documents.

### E-004 — Signup service/network failure
The UI remains on the signup step, preserves non-secret user-entered fields when safe, does not persist the password, and offers retry.

### E-005 — Incorrect/invalid email OTP
Security rejects verification. The verification screen remains active and displays an error without exposing Clerk implementation details.

### E-006 — Verification attempt no longer usable
The UI follows the actual Security error contract. It must not fabricate attempt expiry values or restart semantics.

### E-007 — Resend failure
The verification screen remains active and displays a retryable error according to Security's response.

### E-008 — SuperAdmin decision conflict
If a pending USER has already been decided or is no longer `PENDING`, the UI refreshes authoritative state and does not silently repeat the transition.

## 12. Applicant screen states

Required design states:

1. Authentication entry / Create account entry point.
2. Create account — empty.
3. Create account — validation errors.
4. Create account — submitting.
5. Create account — Security error.
6. Verify email — normal.
7. Verify email — verifying.
8. Verify email — invalid/error.
9. Verify email — resend in progress/error/success feedback without invented timing rules.
10. Registration pending.

Conditional design state:

11. Registration rejected — visual state only; delivery/navigation mechanism is an open decision.

## 13. SuperAdmin screen states

Required design states:

1. Pending USER list — loading.
2. Pending USER list — empty.
3. Pending USER list — error.
4. Pending USER list — populated.
5. Pending USER detail.
6. Confirm activation.
7. Confirm rejection.
8. Decision in progress.
9. Decision success/state refresh.
10. Decision conflict/error.

The SuperAdmin onboarding review must not contain Tenant selection, operating-role selection, Dealer/Outlet assignment or permission editing.

## 14. Data requirements

### Applicant input

- firstName
- lastName
- email
- mobile
- password — transient only
- Verigence Identifier — sent as onboarding header
- email OTP — transient only at verification step

### Client workflow state

The client may hold only the minimum transient state necessary to move between onboarding steps, including the Security signup-attempt reference returned/required for verification and resend.

Password and OTP must never be put into persisted Zustand/localStorage state.

### Backend-owned state

Security owns:

- onboarding gate validation;
- Clerk integration;
- signup-attempt lifecycle;
- Clerk subject binding;
- global USER record;
- USER status;
- onboarding decision authority.

## 15. Security and authorization considerations

- Public applicant signup/verification calls use the defined onboarding contract, not a Clerk token.
- SuperAdmin decision calls are protected Security administrative operations.
- Web route visibility is not authorization.
- Web must not carry authoritative role/permission logic for the decision.
- No password or OTP logging.
- No Clerk keys or session tokens in browser/mobile configuration.
- No Tenant ID is introduced to make authentication work.

## 16. Audit/evidence considerations

Security owns its administrative audit requirements. UC-001 Web must not create a competing onboarding audit database.

The Web UI should present the authoritative decision result returned by Security. It must not claim an activation/rejection succeeded before Security confirms the transition.

## 17. Responsive design rule

### Web/desktop

Use the established Verigence branded authentication layout: brand/story panel plus focused form card where space allows. SuperAdmin review may use a list + detail split view.

### Mobile

Use the same content and actions in a single-column flow. Long SuperAdmin list/detail layouts become sequential screens/panels rather than shrinking desktop columns.

### Shared behaviour

- same labels;
- same required fields;
- same validations;
- same API client;
- same success/error semantics;
- touch-friendly controls on mobile;
- keyboard-friendly and accessible controls on Web.

## 18. Explicitly out of scope

- Login redesign beyond returning the user to Sign In after activation.
- Tenant selection or Tenant assignment during signup.
- PC/TL/PM/CRM/Executive assignment during signup approval.
- TenantAdmin/ModuleAdmin assignment during signup.
- Dealer/Outlet/Project assignment.
- Permission bundle editing.
- Device registration.
- Geo capture as a gate.
- TOTP/MFA.
- Clerk SDK integration in Web/Mobile.
- Web database changes.
- Security/Audit Core/DI changes.

## 19. Open decisions

Only the following remain open based on the reviewed inputs:

1. Exact client-side password guidance and presentation; Security remains authoritative for actual acceptance.
2. Exact OTP input length/format and resend timing/throttling presentation.
3. Exact error-code-to-user-copy mapping once the deployed Security response contract is consumed.
4. Rejection notification/delivery and any applicant-driven resubmission process.
5. Whether the client sends optional Device/Geo context at all in Phase 1; UC-001 does not require it.

No other fields, roles, states or business rules should be added without an explicit design decision.