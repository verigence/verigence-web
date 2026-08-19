# UC-001 — Design Approval Record

**Status:** NOT YET APPROVED  
**Date created:** 2026-08-19  
**Repository/branch:** `verigence/verigence-web` / `planning/uc-001-user-onboarding`

## 1. Approval gate

No UC-001 implementation work is authorized until this record is explicitly approved.

Approval covers the business flow, API boundary, responsive Web/mobile behaviour and wireframes. Implementation must return to design review if it discovers a material gap.

## 2. Documents under review

- [ ] `01-use-case-spec.md`
- [ ] `02-sequence-diagram.md`
- [ ] `03-wireframes/README.md`
- [ ] `03-wireframes/web-wireframes.md`
- [ ] `03-wireframes/mobile-wireframes.md`
- [ ] `04-api-data-mapping.md`
- [ ] `05-test-scenarios.md`

## 3. Frozen decisions represented by this pack

- [ ] Web and Capacitor mobile use the same React application/codebase.
- [ ] Approved Verigence branding remains unchanged.
- [ ] Clerk is the human credential provider.
- [ ] Only Security integrates with Clerk Backend APIs.
- [ ] Web/Mobile contain no Clerk SDK/keys/session-JWT authentication.
- [ ] Signup calls `POST /security/v1/onboarding/users`.
- [ ] Signup fields are First Name, Last Name, Verigence Identifier, Email ID, Mobile Number and Password.
- [ ] `X-Onboarding-Key` carries the Verigence Identifier.
- [ ] Email OTP is entered in Verigence UI and sent to Security.
- [ ] Successful verification produces/binds a global USER in `PENDING`.
- [ ] SuperAdmin alone decides `PENDING -> ACTIVE` or `PENDING -> REJECTED`.
- [ ] Applicant does not choose Tenant, role, Dealer/Outlet, Project or authorization scope.
- [ ] SuperAdmin onboarding review does not assign those scopes either.
- [ ] Device/Geo are not mandatory/persisted/onboarding gates in Phase 1.
- [ ] No Phase-1 TOTP/MFA requirement is introduced.
- [ ] No Security/Audit Core/DI/database change is assumed by the Web design.

## 4. Open decisions requiring explicit resolution or deliberate deferral

### OD-001 — Password guidance

The exact client-facing password-policy guidance/validation presentation is not defined in the reviewed 19-Aug design documents.

Decision:

```text
[ ] Resolve before implementation
[ ] Defer to deployed Security contract and show only server-supported guidance
```

Notes:

---

### OD-002 — OTP input shape

Exact OTP length/format and the request-body property name are not defined in the reviewed 19-Aug design documents.

Decision:

```text
[ ] Resolve before implementation
[ ] Defer to deployed Security OpenAPI/contract
```

Notes:

---

### OD-003 — Resend timing/throttling UI

Exact resend cooldown, max attempts and retry metadata are not defined by the reviewed 19-Aug design documents.

Decision:

```text
[ ] Resolve before implementation
[ ] Do not show fixed countdown/limits unless Security contract supplies them
```

Notes:

---

### OD-004 — Rejection notification/resubmission

The applicant notification mechanism after `REJECTED` and any applicant-driven resubmission flow are not defined.

Decision:

```text
[ ] Define notification/resubmission behaviour
[ ] Keep rejected applicant screen as a conditional visual only and defer delivery/resubmission
```

Notes:

---

### OD-005 — Optional Device/Geo context

Phase 1 permits optional context but does not require/persist/evaluate it.

Decision:

```text
[ ] Do not send Device/Geo in UC-001
[ ] Send optional context using existing Security-supported headers after contract verification
```

No choice here may make Device/Geo mandatory or create persistence/database changes.

Notes:

---

## 5. Wireframe approval checklist

### Applicant Web

- [ ] A01 Authentication entry
- [ ] A02 Create Account
- [ ] A03 Validation/error
- [ ] A04 Submitting
- [ ] A05 Verify Email
- [ ] A06/A07 OTP error/resend feedback
- [ ] A08 Registration Pending
- [ ] A09 Rejected conditional visual state

### Applicant mobile

- [ ] Same content/flow as Web accepted
- [ ] One-column responsive composition accepted
- [ ] No mobile-only onboarding fields/rules

### SuperAdmin Web

- [ ] Pending list states
- [ ] Pending USER detail
- [ ] Activate confirmation
- [ ] Reject confirmation
- [ ] Decision progress/result/conflict

### SuperAdmin mobile

- [ ] List -> detail sequential flow accepted
- [ ] Same activation/rejection semantics accepted

## 6. Implementation authorization

Current authorization:

```text
NOT AUTHORIZED
```

When explicitly approved by the design owner, record:

```text
Design approved by: ______________________________
Approval date: ___________________________________
Approved commit/reference: _______________________
Open decisions accepted/deferred: _______________

Implementation authorized: YES / NO
```

## 7. Post-approval implementation scope

Only after approval, Web implementation may be planned against the approved UI/API contract.

Known stale prototype areas to reconcile include:

- `src/pages/SignupPage.tsx`
- `src/features/onboarding/signupSchema.ts`
- `src/features/onboarding/types.ts`
- `src/services/audit-core/onboarding.ts`
- `src/services/demo/onboardingDemo.ts`
- `src/pages/ApprovalQueuePage.tsx`

Login/session changes beyond the UC-001 entry/return-to-sign-in boundary require their own later use-case design.

## 8. Deployment restriction

Even after implementation approval:

1. implementation must occur on a feature branch;
2. typecheck/build/local functional/API/visual tests must pass;
3. rendered Web/mobile results must be reviewed;
4. merge to `main` occurs only after explicit deployment approval.