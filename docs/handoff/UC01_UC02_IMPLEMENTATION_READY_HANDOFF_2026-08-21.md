# UC-001 then UC-002 — Implementation-Ready Handoff

**Status:** IMPLEMENTATION IN PROGRESS — UC01-WEB-01 CODED; FULL BUILD/RUNTIME VERIFICATION PENDING  
**Date:** 2026-08-21  
**Execution order:** UC-001 first, UC-002 second  
**Change rule:** implement only what is required by the frozen design/contracts; no opportunistic refactor, redesign, schema change, API invention or unrelated file change.

---

## 1. Purpose

This is the implementation-entry checkpoint for resuming work after a context reset.

It does not replace the detailed module design documents. It tells the next implementation session exactly:

- which repositories/branches are authoritative;
- which documents must be read first;
- what is already frozen;
- what remains to implement;
- what must not be changed without a concrete source-backed reason;
- where a contract is still pending rather than guessed;
- the strict implementation order.

If this document conflicts with a later-dated module source-of-truth design on the same branch, stop and reconcile before coding.

---

## 2. Repositories and branches

### Web — UC-001 current implementation branch

```text
Repository: verigence/verigence-web
Branch:     planning/uc-001-user-onboarding
```

### Web — UC-002 continuation branch

```text
Repository: verigence/verigence-web
Branch:     planning/uc-002-project-onboarding
```

UC-002 Web implementation must not run ahead of completion/runtime verification of the remaining UC-001 work.

### Security

```text
Repository: verigence/verigence-security
Branch:     dev
```

### Audit Core

```text
Repository: verigence/verigence-audit-core
Branch:     dev
```

### Document Intelligence

```text
Repository: verigence/verigence-di
Branch:     dev
```

---

## 3. Mandatory reading order before any code change

### First — integrated sequence

Read:

```text
verigence-web / planning/uc-001-user-onboarding
docs/handoff/UC01_THEN_UC02_INTEGRATED_IMPLEMENTATION_PLAN_2026-08-21.md
```

### UC-001 Web

Read current UC-001 source documents and implementation status, especially:

```text
docs/uc-001-user-onboarding/01-use-case-spec.md
docs/uc-001-user-onboarding/02-sequence-diagram.md
docs/uc-001-user-onboarding/04-api-data-mapping.md
docs/uc-001-user-onboarding/05-test-scenarios.md
docs/uc-001-user-onboarding/06-design-approval.md
docs/uc-001-user-onboarding/07-implementation-status.md
docs/BRANDING_GUIDELINES.md
```

Frozen SuperAdmin approval references:

```text
docs/uc-001-user-onboarding/03-wireframes/UC01_SUPERADMIN_PENDING_APPROVAL_MOCKUPS.md
docs/uc-001-user-onboarding/03-wireframes/UC01_PENDING_APPROVAL_APPROVED_MOCKUPS.html
```

The implementation must use the same approved repository logo asset as Sign In / Sign Up:

```text
public/brand/approved/verigence-lockup.svg
```

Do not regenerate, redraw or substitute the Verigence logo.

### UC-002 Web

On `planning/uc-002-project-onboarding`, read:

```text
docs/journey-02-project-onboarding/J02_FROZEN_UI_BASELINE.md
docs/journey-02-project-onboarding/UC02_IMPLEMENTATION_PLAN_v1.2.md
docs/handoff/UC01_FIRST_THEN_UC02_IMPLEMENTATION_SEQUENCE.md
```

Also read the frozen UC-002 mockup manifest/baseline documents on that branch.

### Security source of truth

On `verigence-security/dev`, read:

```text
docs/SECURITY_SOLUTION_DESIGN_v2.0.md
docs/SECURITY_IMPLEMENTATION_DESIGN_v2.0.md
docs/SECURITY_SOLUTION_DESIGN_v2.1.md
docs/SECURITY_IMPLEMENTATION_DESIGN_v2.1.md
```

UC-002 v2.1 deltas include server-generated Tenant Code, forwarded human-SuperAdmin JWT for downstream administrative calls, and Phase-1 Tenant hard-delete support. Existing Security identity/USER lifecycle/RBAC rules remain authoritative except where v2.1 explicitly supersedes them.

### Audit Core source of truth

On `verigence-audit-core/dev`, read:

```text
docs/AUDIT_CORE_SOLUTION_DESIGN_v2.2.md
docs/AUDIT_CORE_API_CONTRACT_v1.1.md
docs/AUDIT_CORE_PHYSICAL_DATA_MODEL_v2.2.md
docs/AUDIT_CORE_CROSS_MODULE_AUTH_DESIGN_v1.1.md
docs/AUDIT_CORE_UC02_MASTER_RESOLUTION_ALIGNMENT.md
docs/handoff/UC02_CROSS_MODULE_DESIGN_HANDOFF_2026-08-21.md
```

Do not fall back to v2.1 assumptions where v2.2 explicitly supersedes them.

### DI source of truth

On `verigence-di/dev`, read:

```text
DI_DECISIONS.md
design/DI_ARCHITECTURE_v2.3.md
design/DI_LLD_v2.3.md
design/DI_DATA_MODEL_v2.3.md
design/DI_SECURITY_RBAC_v2.3.md
docs/UC02_EXCEL_MASTER_ALIGNMENT.md
```

For Audit Core-originated documents, the UC-002 DI decision supersedes the older generic Subject-only storage path only for that Audit use case.

---

## 4. Frozen UC-001 scope

### Applicant onboarding

The existing applicant journey is already implemented and is not to be redesigned while fixing the SuperAdmin area:

```text
Sign In
 -> Create Account
 -> Security onboarding USER create
 -> Email OTP verification
 -> Registration received
 -> USER remains PENDING
```

Applicant Sign In / Sign Up visual treatment is the reference design language for all later UC screens.

### SuperAdmin visible area

Use the visible name:

```text
Pending Approval
```

Approved tabs:

```text
Pending Requests
Current Employees & Engagements
```

### Pending Requests authority and decision

Security remains authoritative.

Existing UC-001 decision contract remains:

```text
GET   /security/v1/platform/users?userStatus=PENDING...
GET   /security/v1/platform/users/{userId}
PATCH /security/v1/users/{userId}/status
```

Allowed decisions only:

```text
PENDING -> ACTIVE
PENDING -> REJECTED
```

The approval decision must not assign Project/Tenant, role, Dealer/Outlet scope or permissions.

No rejection-reason field is part of the approved UC-001 decision.

Displayed selected-user detail is limited to the approved Security USER contract used by UC-001, including the currently approved identity/status/timestamp/USER ID fields. Do not invent applicant-requested business fields.

### Current Employees & Engagements

This is browse-only.

Security owns global USER identity/status. Audit Core owns Project/Dealer/Dealer Outlet business engagement scope. Security owns operating role.

The screen may display current employees and truthful current engagements, including `No current engagement` when appropriate.

It must not become a Role Mapping editor.

### UC-001 remaining backend design item

The integrated plan identifies:

```text
AC-UC01-READ-001
```

This is the missing platform-level Current Employees & Engagements browse contract.

Do not invent the final route/schema in Web.

Before implementing engagement details, inspect the current Audit Core/Security designs and freeze the read contract in the owning backend design/API contract. The view must use canonical Security `userId`, return only current/authorized engagement information, and preserve module authority boundaries.

If that contract has been added since this handoff, use the newer source-of-truth design instead of recreating it.

---

## 5. UC-001 implementation order

### Progress checkpoint — 21-Aug-2026

`UC01-WEB-01 — Replace approval visual shell` has been coded on `planning/uc-001-user-onboarding`.

Changed application files:

```text
src/layout/AppShell.tsx
src/pages/ApprovalQueuePage.tsx
src/styles/approval-uc001.css
```

Completed in this work package:

- `/approvals` now uses the frozen navy -> blue -> teal branded outer background and large rounded white application surface instead of the unrelated enterprise dashboard shell;
- the Pending Approval shell references the mandated `public/brand/approved/verigence-lockup.svg` asset directly;
- visible administration terminology is `Pending Approval`;
- approved primary tab labels are present, with `Pending Requests` active; `Current Employees & Engagements` is deliberately not wired to engagement data yet;
- Pending Requests queue/detail presentation has been aligned to the frozen visual shell while preserving the existing Security list/detail/decision logic;
- no Security, Audit Core or DI code/API contract was changed;
- no Project, role, Dealer/Outlet, permission or rejection-reason field was added.

Targeted verification completed in the available implementation runtime:

- TypeScript JSX syntax transpile: `AppShell.tsx` PASS;
- TypeScript JSX syntax transpile: `ApprovalQueuePage.tsx` PASS;
- approved SVG reference/static terminology checks PASS;
- CSS structural/brace check PASS.

Full repository `npm run typecheck`, `npm run build`, browser runtime and visual comparison remain mandatory before UC-001 completion. The current execution container has no GitHub/npm network checkout capability, and this branch's CI workflow does not run on direct `planning/**` pushes, so those checks are not claimed as complete here.

Next active work package is `UC01-WEB-02 — Pending Requests tab`, including the remaining frozen confirmation/search/state interaction alignment using the existing Security contract.

Proceed in this order:

1. Inspect the current UC-001 Web branch and compare implementation to the frozen Pending Approval mockup.
2. Change only the files actually required to implement the approved Pending Approval visual/interaction delta.
3. Reuse the current Security pending-user/detail/status APIs; do not redesign Security transitions.
4. Implement and test Pending Requests states and confirmation flows.
5. Verify Security ACTIVE-user listing capability for the Current Employees tab from the deployed/current contract.
6. Freeze/implement AC-UC01-READ-001 in the owning backend only if still missing.
7. Implement Current Employees & Engagements browse-only integration.
8. Run UC-001 typecheck/build/runtime/regression/visual/accessibility checks.
9. Do not start UC-002 Web implementation until UC-001 is complete and verified.

### UC-001 strict test gate

At minimum verify:

- real Security PENDING list/detail;
- Activate sends only ACTIVE;
- Reject sends only REJECTED;
- authoritative Security refresh before/after decision;
- stale/conflict handling;
- non-SuperAdmin denial;
- expired/missing human token fails closed;
- no role/Project/business-scope payload during approval;
- ACTIVE employee browse;
- zero/one/multiple current engagement cases once AC-UC01-READ-001 exists;
- no expired/deleted engagement shown as current;
- no cross-Project data leakage;
- applicant Sign In/Sign Up/OTP/Forgot Password/legal pages do not regress;
- exact approved logo and visual continuity on desktop/mobile.

---

## 6. Frozen UC-002 journey

User-facing terminology is **Project**, not Tenant.

Normal sequence:

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

Security, Audit Core and DI provisioning is automatic and is not a normal visible task. A technical recovery view appears only on failure.

After activation, the same areas remain available for controlled Project administration/update.

### Important UC-002 decisions already frozen

- Tenant Code is internal and generated by Security; it is not a normal frontend field.
- Browser calls Audit Core for the Project workflow.
- For downstream **human administrative operations**, Audit Core propagates the same Security-issued human SuperAdmin JWT to Security/DI; it does not replace the human with `ServiceIntegration`.
- `ServiceIntegration` remains for machine/background integration operations.
- Dealer has no latitude/longitude requirement.
- Dealer Outlet owns `ONSITE | SATELLITE`, address and optional Google Maps/Places information.
- Google Maps is optional; manual address remains valid.
- Persist nullable `googlePlaceId`; latitude/longitude are nullable.
- Existing Security Tenant operating-role assignment is reused; no new Phase-1 Project-membership model is introduced.
- Role Mapping business scope remains in Audit Core.
- PC -> Dealer Outlet(s).
- TL -> Dealer(s), all their Outlets.
- PM -> whole Project.
- CRM -> Dealer(s) or whole Project.
- Executive -> whole Project.
- Every ACTIVE Dealer Outlet must have at least one ACTIVE PC before activation.
- Project Masters use explicit WEF where required; WEF is never silently defaulted.
- Excel upload is staged/validated/previewed before confirmation.
- No authoritative master version is created on upload alone.
- Product Master is ongoing Project-effective data in Phase 1; no Pick Existing Product Master feature until Phase 2.
- Product Master resolver: latest published WEF not later than the business date wins.
- Same-WEF ambiguity must not be silently guessed/resolved.
- Master effective-period overlap is permitted in Phase 1; stricter overlap/supersede governance is Phase 2.
- DI Document Types, Extraction Profiles and Requirement Profiles support FORM + EXCEL in Phase 1.
- DI Audit storage hierarchy is internal and trusted: Project -> Dealer -> Dealer Outlet -> Customer -> Documents.
- The browser never authors DI storage paths.
- Phase 1 supports SuperAdmin hard delete/rollback, including after activation, because the product is new.
- Whole-Project delete order is DI first, Audit Core second, Security Tenant last.
- Global Security USERs survive Project deletion.
- Phase 2 will introduce more process-oriented delete/maker-checker/retention controls.

---

## 7. UC-002 implementation order

Do not let Web compensate for missing backend contracts. Implement dependency-first:

```text
Security UC-002 deltas
 -> Audit Core Project / Dealer / Dealer Outlet administration
 -> composite Role Mapping
 -> Audit Core Project Master + Product Master import/versioning
 -> DI Audit storage hierarchy + DI Excel/admin deltas
 -> Audit Core Readiness + hard-delete/recovery integration
 -> UC-002 Web
 -> cross-module integration/recovery/delete testing
```

### Security

Implement only the approved v2.1 deltas, including:

- server-generated internal Tenant Code;
- human SuperAdmin JWT accepted/authorized on UC-002 administrative calls;
- `ServiceIntegration` rejected on human-admin operations;
- existing operating-role PUT/DELETE reused for Role Mapping;
- Phase-1 Tenant hard-delete support;
- global USER preservation;
- audit records original human actor.

Do not redesign Security unless a concrete source-backed implementation gap is proven.

### Audit Core

Implement according to the current v2.2 solution/API/data-model documents, including:

- Project creation/provisioning/retry operation;
- Project read/update with approved post-operational mutability restrictions;
- Dealer create/read/update/delete + deletion impact;
- Dealer Outlet create/read/update/delete + optional Google Place/address/coordinates + deletion impact;
- composite Role Mapping orchestration/reconciliation;
- Project Master catalogue;
- Excel staging/validation/preview/confirm/publish flow;
- Project-effective Product Master/versioning;
- latest-WEF Product Master resolution;
- Project Readiness aggregation;
- durable Phase-1 hard-delete/recovery operation.

Do not infer machine-readable API details beyond the current approved Markdown contracts until implementation contract work explicitly freezes them.

### DI

Implement according to D28-D31/v2.3 and the Excel alignment, including:

- Audit Core-originated hierarchical storage context;
- immutable Project/Dealer/Dealer Outlet/Customer context supplied by Audit Core;
- object path owned by DI, not browser;
- Subject identity remains separate from Audit storage context;
- FORM + EXCEL for Document Types, Extraction Profiles and Requirement Profiles;
- staging/validation/preview/confirmation before applying authoritative DI configuration/version changes;
- purge/recovery that removes object bytes before metadata needed to locate them and supports zero-state verification;
- guard against accidental auto-provisioning/recreation during or after purge.

---

## 8. Phase-1 delete is a mandatory release gate

Delete must be tested as a recoverable distributed administrative operation, not as a simple button.

At minimum test:

- non-SuperAdmin denied;
- invalid/expired human JWT denied;
- `ServiceIntegration` denied on human-admin delete APIs;
- wrong-Project IDs cannot delete another Project's Dealer/Outlet/data;
- duplicate delete is idempotent/retry-safe;
- browser timeout after a downstream delete step can resume/read operation state;
- dependent Dealer/Outlet direct deletes follow dependency-impact rules;
- Role Mapping removal preserves global USER and other-Project assignments;
- DI object bytes are removed before destructive removal of metadata needed to locate them;
- DI zero-state verification catches residual objects/rows/jobs;
- Audit Core zero-state verification catches residual tenant-owned state;
- Security Tenant is deleted last;
- global USER remains intact;
- completed deletion cannot cause DI to auto-provision the deleted Project again;
- a fresh Project after rollback receives a new canonical internal identity.

Do not weaken these tests to make implementation easier.

---

## 9. Strict change-control rules for the implementation session

These rules are mandatory:

1. **Read before write.** Inspect the current target branch, source design, existing API contract and relevant tests before changing a file.
2. **No hallucinated APIs.** If an endpoint, field, lifecycle transition, ownership rule or persistence behaviour is not supported by the current source documents/code, stop and ask rather than inventing it.
3. **No unrelated refactors.** Do not rename/reorganize modules, introduce new frameworks, change formatting broadly, upgrade dependencies or clean unrelated technical debt.
4. **Minimal file surface.** Change only files necessary for the active implementation work package and its tests/docs required by the repository convention.
5. **No silent contract changes.** If implementation reveals a design/API gap, describe the gap first. Update the owning design/contract only after it is explicitly agreed; then implement.
6. **Preserve module authority.** Security owns identity/role/authorization; Audit Core owns Project/Dealer/Outlet/business scope and journey business data; DI owns document-intelligence metadata/configuration/object storage.
7. **Human-vs-machine actor separation is strict.** Human admin operations carry the human Security JWT downstream. Machine integration uses the approved ServiceIntegration model only where designed.
8. **Never log/persist bearer tokens, passwords, OTPs or secrets.**
9. **No UI redesign during implementation.** Implement the frozen mockups/branding; do not improvise another visual system.
10. **No destructive success without verification.** Delete/rollback is complete only after the owning modules' required zero-state/reconciliation checks pass.
11. **Run targeted tests after each work package** before broadening the change surface.
12. **Before commit, review the exact changed-file list** and revert any file not required by the active work package.

---

## 10. Implementation starting point after reset

Start with **UC-001**, not UC-002.

Current implementation checkpoint:

```text
UC01-WEB-01  Pending Approval visual shell — CODED; full build/runtime/visual verification pending
UC01-WEB-02  Pending Requests behaviour/confirmation alignment — NEXT
```

Procedure from this checkpoint:

1. Open `verigence-web` on `planning/uc-001-user-onboarding`.
2. Read the mandatory UC-001 references in this handoff.
3. Review the UC01-WEB-01 progress checkpoint and exact changed files above.
4. Re-read the current Approval/Pending-Approval page, Security client and frozen confirmation states before UC01-WEB-02 changes.
5. Implement only the remaining Pending Requests interaction/state delta using existing Security APIs.
6. Add/update only directly relevant tests.
7. Run targeted typecheck/tests/build/runtime checks available for the repository.
8. Report changed files, tests run and any contract gap before proceeding to Current Employees & Engagements.

Do **not** begin by changing Security/Audit Core/DI for UC-001 unless AC-UC01-READ-001 is still missing and the Current Employees engagement work has actually reached that dependency.

---

## 11. Ready/not-ready assessment

### Ready now

- UC01-WEB-02 Pending Requests interaction/confirmation completion on the new frozen shell.
- UC-001 Current Employees identity browse after verifying the current Security ACTIVE-user list contract.
- UC-002 design/contract baseline is sufficiently frozen to begin backend implementation **after UC-001 completes**, subject to normal code-vs-design reconciliation before each module change.

### One UC-001 dependency to verify/freeze before engagement-detail coding

- `AC-UC01-READ-001` — platform-level Current Employees & Engagements read view.

This does not block the Pending Requests work.

### Do not claim implementation completion until

- real tests/build/runtime checks pass;
- Current Employees engagements are backed by an approved contract, not mock/demo composition;
- UC-001 is verified before UC-002 Web starts;
- UC-002 cross-module delete/recovery tests pass before Phase-1 release.

---

## 12. Resume rule

After a context reset, do not rely on conversation memory. Use this document and the referenced source-of-truth files to reconstruct state. If repository contents have moved ahead since 2026-08-21, inspect the newer commits/designs and reconcile rather than blindly applying this checkpoint.
