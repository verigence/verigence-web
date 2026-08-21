# Integrated Implementation Plan — UC-001 followed by UC-002

**Status:** IMPLEMENTATION IN PROGRESS — UC01-WEB-01 CODED; FULL BUILD/RUNTIME VERIFICATION PENDING  
**Date:** 2026-08-21  
**Implementation order:** UC-001 first, then UC-002  
**Primary Web repository:** `verigence/verigence-web`

---

## 1. Purpose

This document is the execution plan for completing the remaining UC-001 work before beginning UC-002 implementation.

It deliberately separates:

1. what is already implemented and can be reused;
2. what remains to be changed in Web;
3. what new backend API/design work is genuinely required;
4. what must be tested before UC-001 is considered complete;
5. the dependent UC-002 implementation sequence across Security, Audit Core, DI and Web.

No endpoint or persistence behaviour should be inferred from a mockup alone. Where the current source designs do not define an API required by the approved UI, this plan marks it explicitly as **pending contract work** rather than inventing a production contract.

---

# PART A — UC-001 USER ONBOARDING COMPLETION

## 2. UC-001 governing references

### Web branch

```text
Repository: verigence/verigence-web
Branch:     planning/uc-001-user-onboarding
```

### Current UC-001 source documents

- `docs/uc-001-user-onboarding/01-use-case-spec.md`
- `docs/uc-001-user-onboarding/02-sequence-diagram.md`
- `docs/uc-001-user-onboarding/04-api-data-mapping.md`
- `docs/uc-001-user-onboarding/05-test-scenarios.md`
- `docs/uc-001-user-onboarding/06-design-approval.md`
- `docs/uc-001-user-onboarding/07-implementation-status.md`
- `docs/BRANDING_GUIDELINES.md`
- approved Sign In / Sign Up implementation and assets under the current branch

### New frozen approval mockup baseline

- `docs/uc-001-user-onboarding/03-wireframes/UC01_SUPERADMIN_PENDING_APPROVAL_MOCKUPS.md`
- `docs/uc-001-user-onboarding/03-wireframes/UC01_PENDING_APPROVAL_MAIN.png`
- `docs/uc-001-user-onboarding/03-wireframes/UC01_PENDING_APPROVAL_CONFIRM_ACTIVATION.png`
- `docs/uc-001-user-onboarding/03-wireframes/UC01_PENDING_APPROVAL_CONFIRM_REJECTION.png`

The same approved Verigence lockup/logo used by Sign In and Sign Up must be used here and across subsequent use cases.

---

## 3. UC-001 scope that is already implemented

The current branch records UC-001 as implemented with runtime verification still pending.

### Applicant flow already implemented

```text
Sign In
 -> Create Account
 -> POST /security/v1/onboarding/users
 -> Verify Email OTP
 -> Registration Received
 -> global USER remains PENDING
```

Existing Web implementation already includes:

- approved applicant Sign In / Sign Up visual language;
- approved Verigence lockup asset;
- First Name / Last Name / Verigence Identifier / Email / Mobile / Password contract;
- Security onboarding API integration;
- email OTP verify/resend;
- password/OTP transient-secret handling;
- pending-registration state.

These applicant screens are not to be redesigned as part of the SuperAdmin approval work.

### Current SuperAdmin decision APIs already used

The existing UC-001 Web implementation already consumes Security administrative APIs for the global USER decision:

```text
GET /security/v1/platform/users?userStatus=PENDING&limit=200&offset=0
GET /security/v1/platform/users/{userId}
PATCH /security/v1/users/{userId}/status
```

Activation body:

```json
{
  "status": "ACTIVE"
}
```

Rejection body:

```json
{
  "status": "REJECTED"
}
```

The decision remains:

```text
PENDING -> ACTIVE
PENDING -> REJECTED
```

No Tenant/Project, role, Dealer/Outlet, business-scope or permission assignment is part of this UC-001 decision.

---

## 4. UC-001 visual redesign now required

The existing SuperAdmin approval implementation is functionally closer to the required contract than the old prototype, but its visual design must be replaced by the approved Pending Approval mockups.

### 4.1 Visible section name

Use:

```text
Pending Approval
```

Do not use `User Onboarding` as the visible SuperAdmin area name.

### 4.2 Approved visual continuity

The Pending Approval area must visibly continue from Sign In / Sign Up and the approved UC-002 mockup language:

- identical approved Verigence lockup/logo asset;
- navy -> blue -> teal outer background;
- large rounded white application surface;
- deep-navy heading/action hierarchy;
- teal active/focus states;
- generous whitespace;
- restrained borders/shadows;
- responsive/mobile continuation from the same design system.

No regenerated or approximate logo is allowed in implementation.

### 4.3 Main tabs

The approved SuperAdmin view contains:

1. **Pending Requests**
2. **Current Employees & Engagements**

---

## 5. UC-001 Pending Requests implementation

### 5.1 Data source

Continue using Security as the authority.

Pending list:

```text
GET /security/v1/platform/users?userStatus=PENDING...
```

Selected detail:

```text
GET /security/v1/platform/users/{userId}
```

Decision:

```text
PATCH /security/v1/users/{userId}/status
```

### 5.2 Displayed USER detail

The selected USER detail must be limited to the current approved Security USER contract used by UC-001:

- Display Name;
- Primary Email;
- Primary Mobile;
- USER Status;
- Onboarding Status;
- Created / Registered timestamp;
- USER ID.

Do not add applicant-requested Project, role, access or permissions to the approval decision.

### 5.3 Activation

The UI must refresh authoritative USER state before/after decision and show an explicit confirmation:

```text
Confirm activation
Security transition: PENDING -> ACTIVE
```

No Project, role or business scope is assigned during activation.

### 5.4 Rejection

The UI must show explicit confirmation:

```text
Confirm rejection
Security transition: PENDING -> REJECTED
```

The current UC-001 approved design does not collect a rejection reason; do not add one.

### 5.5 Required approval-page states

Implement and test:

- list loading;
- list empty;
- list error + retry;
- populated pending list;
- selected detail loading;
- selected detail;
- confirmation activation;
- confirmation rejection;
- decision in progress;
- ACTIVE result/state refresh;
- REJECTED result/state refresh;
- stale/conflict decision;
- unauthorized/no valid Security human token;
- responsive/mobile sequential list -> detail -> confirmation/result flow.

---

## 6. UC-001 Current Employees & Engagements addition

This is a new approved browse-only addition to the SuperAdmin Pending Approval area.

It must not alter the UC-001 approval decision model.

### 6.1 Employee identity authority

Security remains authoritative for global USER identity/status.

The existing platform USER list capability can be reused to list ACTIVE/current employees, subject to the deployed Security list/search contract.

Logical use:

```text
GET /security/v1/platform/users?userStatus=ACTIVE...
```

The exact supported query/search parameters must come from the deployed Security/OpenAPI contract; Web must not invent unsupported filtering parameters.

### 6.2 Engagement authority

Project engagement is not Security USER identity data.

Current ownership remains:

```text
Security
  -> global USER
  -> operating role / functional authorization

Audit Core
  -> Project
  -> Dealer
  -> Dealer Outlet
  -> business assignment / engagement scope
```

Therefore the `Current Employees & Engagements` tab requires cross-module read composition.

### 6.3 Pending backend contract — AC-UC01-READ-001

**Status:** REQUIRED BEFORE IMPLEMENTATION OF ENGAGEMENT DETAILS.  
**Owning module:** Audit Core.  
**Exact route/schema:** MUST BE FROZEN IN AUDIT CORE DESIGN/API CONTRACT BEFORE CODE.

The current UC-002 Audit Core contract provides Tenant/Project-specific Role Mapping reads, but the new UC-001 browse screen asks the SuperAdmin to inspect current employees and their engagements across Projects. A platform-level aggregate read contract is therefore still missing.

The backend design must support a read-only SuperAdmin view that can associate Security `userId` with zero or more current Project engagements.

The logical response needs only the fields necessary for the approved browse screen, derived from authoritative modules, for example:

- Security `userId`;
- employee display name / approved identity fields;
- global USER status;
- Project identifier/name for each current engagement;
- current operating role from Security;
- Dealer/Dealer Outlet business scope from Audit Core where applicable;
- effective/current assignment state required to avoid displaying expired mappings.

The exact field names and endpoint URI are not frozen by this Web plan.

### 6.4 Recommended composition boundary

Because engagement combines Security and Audit Core authority, the backend contract should return one coherent browse model rather than requiring the browser to reconstruct Project engagement truth from unrelated calls.

The Audit Core design review should decide whether it:

1. composes the view itself using the same SuperAdmin human token for Security administrative reads; or
2. exposes its engagement projection keyed by Security `userId` while Web separately joins approved Security USER data.

Do not code either approach until the Audit Core/Security contract review fixes the choice.

### 6.5 Browse-only rule

The tab may:

- search/browse current employees;
- show whether an employee has no current Project engagement;
- show one or more current Project engagements;
- drill into read-only engagement detail if approved.

The tab must not:

- assign/change/remove a role;
- assign/change Dealer or Dealer Outlet scope;
- create/delete Project membership;
- edit permission bundles.

Those writes belong to UC-002 Project Administration.

---

## 7. UC-001 implementation work packages

### Progress checkpoint — 21-Aug-2026

`UC01-WEB-01 — Replace approval visual shell` is coded on `planning/uc-001-user-onboarding`; full repository build/runtime/visual verification is still pending.

Exact application files changed for the package:

```text
src/layout/AppShell.tsx
src/pages/ApprovalQueuePage.tsx
src/styles/approval-uc001.css
```

Implemented:

- dedicated Pending Approval branded shell on `/approvals` using the frozen navy -> blue -> teal background and rounded white application surface;
- exact mandated logo reference `public/brand/approved/verigence-lockup.svg`;
- visible `Pending Approval` terminology and approved two-tab shell;
- Pending Requests queue/detail visual alignment using only existing Security USER fields;
- existing Security PENDING list/detail and ACTIVE/REJECTED decision semantics preserved;
- Current Employees & Engagements data integration intentionally not implemented in this package;
- no backend/API/schema/dependency changes.

Targeted checks available in the current execution runtime passed: TSX syntax transpile for the two changed TSX files, static logo/terminology assertions and CSS structural balance. Full `npm run typecheck`, `npm run build`, browser runtime and desktop/mobile visual comparison remain required before UC-001 is declared complete.

Next package: `UC01-WEB-02 — Pending Requests tab`, focused on the remaining frozen search/confirmation/state interaction alignment without changing Security lifecycle semantics.

### UC01-WEB-01 — Replace approval visual shell

**Status:** CODED — full build/runtime/visual verification pending.

Files/components changed:

- `src/pages/ApprovalQueuePage.tsx`
- `src/styles/approval-uc001.css`
- `src/layout/AppShell.tsx`

Acceptance:

- approved Pending Approval mockup visual shell implemented;
- same exact approved Sign In/Sign Up logo asset referenced;
- applicant screens not modified by this work package.

### UC01-WEB-02 — Pending Requests tab

Reuse current Security client and decision semantics.

Do not redesign backend transitions.

Remaining package work includes the frozen Pending Requests search/confirmation/state interaction alignment and targeted verification against the existing Security decision contract.

### UC01-WEB-03 — Current Employees tab

Reuse Security ACTIVE-user list/search once verified against deployed contract.

### UC01-BE-01 — Employee Engagement browse contract

Audit Core + Security design review required for AC-UC01-READ-001 before Web engagement rendering is implemented.

### UC01-WEB-04 — Engagement browse integration

Implement only after AC-UC01-READ-001 is frozen and available.

### UC01-WEB-05 — responsive/mobile states

Use a sequential small-screen experience rather than compressing desktop split views.

---

## 8. UC-001 test/release gate

UC-001 must complete before UC-002 Web implementation begins.

### 8.1 Existing applicant regression tests

- signup happy path;
- Verigence Identifier validation path;
- duplicate/conflict handling according to Security response;
- OTP verify;
- OTP resend;
- invalid OTP;
- service/network retry;
- pending-registration state;
- password and OTP never persisted/logged.

### 8.2 Pending Approval functional tests

- PENDING list uses Security source, not demo/local records;
- selected detail refreshes authoritative Security USER;
- Activate sends only `ACTIVE`;
- Reject sends only `REJECTED`;
- no role/Project/permission payload is sent;
- stale USER decision refreshes instead of repeating silently;
- non-SuperAdmin is denied by backend even if route is manually entered;
- missing/expired Security human token fails closed;
- duplicate click / slow response does not cause misleading duplicate UI state;
- screen shows Security-confirmed result only after backend success.

### 8.3 Current Employees & Engagements tests

Once AC-UC01-READ-001 exists:

- ACTIVE employee with no Project engagement shows `No current engagement` rather than fabricated Project data;
- employee with one Project engagement shows the correct Project;
- employee with multiple Project engagements shows all current engagements;
- expired/end-dated assignment is not shown as current;
- deleted Project/role mapping is not cached as active;
- Security USER identity and Audit Core Project assignment are joined using canonical `userId` only;
- cross-Project/Tenant isolation does not leak data to unauthorized administrators;
- browse tab performs no writes;
- engagement role/business scope agrees with Security + Audit Core source data.

### 8.4 Visual/accessibility tests

- exact approved Verigence logo asset;
- desktop approved mockup comparison;
- mobile layout comparison;
- keyboard navigation;
- focus indication;
- confirmation actions accessible;
- status not communicated by color alone;
- no dense/generic admin styling drift.

### 8.5 Build/runtime gate

Before UC-001 merge:

1. `npm run typecheck`;
2. `npm run build`;
3. real DEV registration/OTP flow;
4. real SuperAdmin pending USER list/detail;
5. real ACTIVE/REJECTED transitions;
6. stale/conflict test;
7. ACTIVE employee browse;
8. employee-engagement browse after backend contract is implemented;
9. desktop/mobile visual review;
10. no regression to Sign In/Sign Up/Forgot Password/legal pages.

UC-001 should then merge before UC-002 Web implementation is rebased/continued.

---

# PART B — UC-002 PROJECT ONBOARDING & ADMINISTRATION

## 9. UC-002 governing references

### Web

```text
Repository: verigence/verigence-web
Branch:     planning/uc-002-project-onboarding
```

Key documents:

- `docs/journey-02-project-onboarding/J02_FROZEN_UI_BASELINE.md`
- frozen UC-002 mockup manifest/baseline documents
- `docs/journey-02-project-onboarding/UC02_IMPLEMENTATION_PLAN_v1.2.md`

### Security

```text
Repository: verigence/verigence-security
Branch:     dev
```

Key documents:

- `docs/SECURITY_SOLUTION_DESIGN_v2.0.md`
- `docs/SECURITY_IMPLEMENTATION_DESIGN_v2.0.md`
- `docs/SECURITY_SOLUTION_DESIGN_v2.1.md`
- `docs/SECURITY_IMPLEMENTATION_DESIGN_v2.1.md`

### Audit Core

```text
Repository: verigence/verigence-audit-core
Branch:     dev
```

Key documents:

- `docs/AUDIT_CORE_SOLUTION_DESIGN_v2.2.md`
- `docs/AUDIT_CORE_API_CONTRACT_v1.1.md`
- `docs/AUDIT_CORE_PHYSICAL_DATA_MODEL_v2.2.md`
- `docs/AUDIT_CORE_CROSS_MODULE_AUTH_DESIGN_v1.1.md`
- `docs/AUDIT_CORE_UC02_MASTER_RESOLUTION_ALIGNMENT.md`
- `docs/handoff/UC02_CROSS_MODULE_DESIGN_HANDOFF_2026-08-21.md`

### DI

```text
Repository: verigence/verigence-di
Branch:     dev
```

Key documents:

- `DI_DECISIONS.md`
- `design/DI_ARCHITECTURE_v2.3.md`
- `design/DI_LLD_v2.3.md`
- `design/DI_DATA_MODEL_v2.3.md`
- `design/DI_SECURITY_RBAC_v2.3.md`
- `docs/UC02_EXCEL_MASTER_ALIGNMENT.md`

---

## 10. Frozen UC-002 user journey

```text
Project Details
 -> Dealers
 -> Dealer Outlets
 -> Employees
 -> Role Mapping
 -> Project Masters
 -> Project Readiness
 -> Activate Project
```

The Web says **Project**.

`tenantId` remains the internal canonical Security Tenant / cross-module Project identifier.

Security, Audit Core and DI provisioning is automatic and does not appear as a normal user-facing task.

After activation, the same screens remain available as Project Administration.

---

## 11. UC-002 cross-module actor model

### Human administrative operation

```text
Browser
 -> Audit Core
    -> Security or DI admin endpoint when required
```

Audit Core forwards the **same Security-issued human SuperAdmin JWT** for downstream human-admin operations.

It must not replace the human actor with `ServiceIntegration`.

### Machine/integration operation

`ServiceIntegration` remains for normal module-to-module/background operations and the machine-specific Security authorization paths already defined by design.

---

## 12. UC-002 implementation order

UC-002 must be implemented backend-contract-first so the Web does not compensate for missing module contracts.

### Stage UC02-1 — Security contract implementation

Implement and verify Security v2.1 deltas:

1. server-generated internal Tenant Code for Project creation;
2. retry-safe/idempotent Tenant create semantics required by Audit Core provisioning;
3. forwarded human-token acceptance on UC-002 admin APIs;
4. explicit `ServiceIntegration` rejection on human-admin operations;
5. existing operating-role PUT/DELETE reused for Role Mapping;
6. SuperAdmin Tenant hard-delete contract for Phase-1 rollback;
7. preserve global USERs when Project/Tenant is deleted;
8. Security audit actor remains the initiating human USER.

No new Security Project-membership model is introduced in Phase 1.

### Stage UC02-2 — Audit Core Project/Dealer/Outlet administration

Implement the frozen `AUDIT_CORE_API_CONTRACT_v1.1.md` / physical model changes:

1. `POST /v1/projects` orchestration;
2. durable Project provisioning operation/status/retry;
3. complete Project GET/PATCH and post-dependency mutability rules;
4. Dealer create/read/update/delete with dependency impact/preflight;
5. Dealer Outlet create/read/update/delete;
6. optional Google Maps/Places fields:
   - `googlePlaceId` nullable;
   - latitude nullable;
   - longitude nullable;
   - manual address remains valid;
7. hard-delete preflight/isolation/idempotency;
8. every delete path tested against cross-Project IDs and operational descendants.

### Stage UC02-3 — Role Mapping

Implement composite Role Mapping using:

```text
Security operating role
+
Audit Core business assignment
```

Rules:

```text
PC        -> Dealer Outlet(s)
TL        -> Dealer(s), all their Outlets
PM        -> whole Project
CRM       -> Dealer(s) or whole Project
Executive -> whole Project
```

Every ACTIVE Dealer Outlet must have at least one ACTIVE PC mapping before activation.

The composite write must be idempotent/recoverable when Security succeeds but Audit Core business-scope persistence fails or vice versa.

### Stage UC02-4 — Audit Core Project Masters

Implement the Project Master catalogue and effective-dated Excel framework.

Phase-1 Audit Core master groups include the approved business domains, with Product Master treated as ongoing/versioned Project data.

Required Excel flow:

```text
Download template
 -> SuperAdmin selects explicit WEF
 -> Upload Excel
 -> Stage rows
 -> Validate
 -> Show parsed preview
 -> Show row errors/warnings
 -> Confirm
 -> Create DRAFT version
 -> Publish separately
```

WEF must never be silently defaulted where the master requires WEF.

No authoritative version is created on file upload alone.

### Stage UC02-5 — Product Master Phase 1

Implement the minimal Project-effective Product Master layer already designed in Audit Core v2.2.

Rules:

- each Project has its own effective-dated Product Master history in Phase 1;
- no `Pick Existing Product Master` Phase-1 feature;
- published historical meaning is immutable/reproducible;
- Price/Discount references validate against Product/SKU context;
- Product Master overlap is allowed in Phase 1;
- resolver is **latest WEF wins**: greatest published WEF not later than the requested business date;
- ambiguous same-WEF data must not be silently resolved;
- stricter overlap/supersede policy is Phase 2.

### Stage UC02-6 — DI storage hierarchy

Implement DI D28-D31 / v2.3 design changes for Audit Core-originated documents.

Internal hierarchy:

```text
Project
 -> Dealer
   -> Dealer Outlet
     -> Customer
       -> Documents
```

The browser does not choose object-storage paths.

Audit Core sends trusted business context/immutable IDs; DI owns storage-object construction and DI metadata.

A DI Subject identity remains distinct from the Audit storage context so one customer can participate in multiple Audit business contexts without relocating historical documents.

### Stage UC02-7 — DI Excel administration

Add the approved additional Excel path:

```text
Document Types       -> FORM + EXCEL
Extraction Profiles  -> FORM + EXCEL
Requirement Profiles -> FORM + EXCEL
```

Excel is additive to existing DI form/API lifecycle.

Flow remains staging -> validation -> preview -> explicit confirmation -> existing DI DRAFT/version lifecycle -> separate publish where the existing domain publishes.

Do not invent WEF for DI domains that do not already have an approved effective-date concept.

### Stage UC02-8 — Project Readiness

Audit Core must aggregate readiness over the whole Project setup.

Blocking checks include at minimum the approved design requirements:

- required Security/Audit Core/DI provisioning state;
- Project Details complete;
- Dealer/Outlet structure valid;
- every ACTIVE Dealer Outlet has >=1 ACTIVE PC;
- required mappings;
- required effective/published master state;
- DI prerequisites/storage-context capability.

Phase-1 warnings, not blockers:

- optional Google Place ID missing;
- optional map coordinates absent where manual address is valid;
- allowed master effective-period overlap.

Activation happens only after blocking readiness checks pass.

### Stage UC02-9 — Phase-1 hard delete / rollback

The product is new, so Phase 1 deliberately supports SuperAdmin hard delete even after activation for administrative rollback.

Cross-module order:

```text
1. Start durable Audit Core delete operation
2. Freeze/prevent new Project writes as designed
3. DI purge
4. DI zero-state verification
5. Audit Core Project-owned delete
6. Audit Core zero-state verification
7. Security Tenant delete LAST
8. Cross-module completion receipt
```

Global Security USERs survive Project deletion.

Partial failure must resume safely rather than reporting success or creating a new Project identity.

Phase 2 moves to process-oriented deletion/maker-checker/retention and stronger retire/supersede lifecycle controls.

### Stage UC02-10 — Web implementation

Only after backend contracts are frozen/available:

- implement the frozen UC-002 visual baseline;
- use the exact same approved Sign In/Sign Up Verigence logo asset;
- Project Details dropdown/date-picker behaviour;
- Dealer CRUD;
- Dealer Outlet Google Maps/Places optional picker + manual fallback;
- Employee selection;
- Role Mapping;
- Project Master Excel upload/preview/history;
- Project Readiness;
- activation;
- update/edit/inactivate/delete flows;
- recovery / retry / Start Fresh / Phase-1 Project delete UI according to backend contracts.

---

## 13. UC-002 delete test gate

Delete must be treated as a high-risk release gate, not a simple happy-path button.

At minimum test:

- non-SuperAdmin denied;
- invalid/expired human JWT denied;
- `ServiceIntegration` denied from human-admin delete APIs;
- duplicate delete command is idempotent;
- browser timeout after backend delete step can resume/read status;
- Dealer delete with dependent Outlets rejected/handled according to impact contract;
- Outlet delete with Customer/Journey dependencies rejected/handled according to contract;
- wrong-Project Dealer/Outlet ID cannot be deleted;
- Role Mapping delete removes only that Project association and preserves global USER;
- DI object deletion occurs before removal of metadata necessary to locate objects;
- DI zero-state verification catches residual object/row/job state;
- Audit Core zero-state verification catches residual tenant-owned records;
- Security Tenant delete occurs last;
- global USER remains usable in other Projects;
- interrupted whole-Project delete resumes without duplicate/missing effects;
- completed delete cannot accidentally auto-provision DI state again;
- fresh Project creation after rollback receives a new canonical internal identity.

---

## 14. Integrated delivery order

The implementation sequence is intentionally strict:

### Milestone 1 — Finish UC-001

1. store/freeze Pending Approval mockups;
2. implement redesigned Pending Requests UI on existing Security APIs;
3. design/freeze AC-UC01-READ-001 Current Employees & Engagements read contract;
4. implement browse-only Current Employees & Engagements;
5. run UC-001 regression + real DEV verification;
6. merge UC-001.

Current milestone state: visual-shell package `UC01-WEB-01` is coded; `UC01-WEB-02` is next. UC-001 is not yet complete or runtime-verified.

### Milestone 2 — Reconcile UC-002 branch with completed UC-001

Before UC-002 Web coding:

- bring the completed/final UC-001 shell, logo, auth/onboarding visual language and navigation into the UC-002 branch;
- do not recreate a second styling system;
- preserve frozen UC-002 functional mockups while using the final shared application design system.

### Milestone 3 — Implement UC-002 backend prerequisites

Order:

```text
Security UC-002 deltas
 -> Audit Core Project/Dealer/Outlet/Role APIs
 -> Audit Core Product/Master import/version APIs
 -> DI storage + DI Excel/admin deltas
 -> Audit Core readiness/delete integration
```

### Milestone 4 — Implement UC-002 Web

Only after owning-module API contracts are implemented and testable.

### Milestone 5 — Cross-module integration/recovery testing

Exercise creation, update, role mapping, master updates, activation and hard-delete/recovery under real Security human authorization and the final Audit Core/DI contracts.

---

## 15. Explicit pending design item before UC-001 completion

There is one new backend contract introduced by the approved UC-001 mockup addition:

> **AC-UC01-READ-001 — platform-level Current Employees & Engagements browse view.**

The existing UC-001 source did not include Audit Core/Project engagement in approval; the existing UC-002 API contract is Project/Tenant-specific. Therefore the exact aggregate read contract must be added to the Audit Core/Security design before implementation.

Nothing else in the Pending Approval activation/rejection decision requires a new backend contract.

---

## 16. Definition of done

### UC-001 done

- applicant journey still passes;
- redesigned Pending Approval matches approved mockups;
- activation/rejection remains Security-only global USER decision;
- Current Employees list is authoritative;
- Current Employees & Engagements displays truthful cross-module current engagement data only after the new read contract exists;
- responsive/accessibility/build/runtime verification passes;
- UC-001 merged before UC-002 Web continuation.

### UC-002 done

- Security/Audit Core/DI contracts implemented according to current approved module designs;
- Project can be created, updated and recovered idempotently;
- Dealers and Dealer Outlets support approved create/update/delete behaviour;
- optional Google Places information is persisted safely;
- role mapping is consistent across Security role + Audit Core business scope;
- effective-dated Excel masters stage/validate/preview/confirm/publish correctly;
- Product Master history and latest-WEF resolution are reproducible;
- DI stores Audit documents using trusted Project/Dealer/Dealer Outlet/Customer hierarchy;
- Readiness blocks invalid activation;
- Phase-1 hard delete is thoroughly tested and resumable;
- UI uses the same approved Verigence design system from Sign In through UC-001 and UC-002.
