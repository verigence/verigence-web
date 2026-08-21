# UC02 — Project Onboarding & Administration Implementation Plan

**Document:** UC02-IMP-001  
**Version:** 1.1 DRAFT  
**Date:** 21-Aug-2026  
**Status:** DRAFT — OWNER DECISIONS APPLIED; PRODUCT MASTER SCOPE OPEN  
**Web branch:** `planning/uc-002-project-onboarding`

> This plan is based on the frozen UC02 UI baseline and the current `dev` Security, Audit Core and DI source/design. Owner decisions from 21-Aug-2026 are now applied. One material Product Master scope decision remains open and is not guessed.

---

## 1. Sources reviewed

### Web

- `docs/journey-02-project-onboarding/J02_FROZEN_UI_BASELINE.md`
- `docs/journey-02-project-onboarding/J02_FROZEN_UI_AMENDMENT_UPDATE_DELETE.md`
- `docs/journey-02-project-onboarding/J02_FROZEN_MOCKUP_MANIFEST.md`
- `docs/AGREED_TECHNOLOGY_STACK.md`

### Security — `dev`

- `docs/SECURITY_SOLUTION_DESIGN_v2.0.md`
- `docs/SECURITY_IMPLEMENTATION_DESIGN_v2.0.md`
- `docs/SECURITY_UC02_ADMIN_OPERATION_ALIGNMENT.md`
- current Tenant, USER and RBAC routes/services

### Audit Core — `dev`

- `docs/AUDIT_CORE_SOLUTION_DESIGN_v2.1.md`
- `docs/AUDIT_CORE_API_CONTRACT_v1.0.md`
- `docs/AUDIT_CORE_PHYSICAL_DATA_MODEL_v2.1.md`
- `docs/AUDIT_CORE_UC02_ADMIN_ALIGNMENT.md`
- `database/AUDIT_CORE_POSTGRESQL_SCHEMA_v2.1.sql`
- current Project / Dealer / Outlet / assignment / master implementation files

### Document Intelligence — `dev`

- `DI_DECISIONS.md`
- `DI_MASTER_REFERENCE.md`
- `DI_DESIGN_SUMMARY.md`
- `PROGRESS.md`
- `docs/SECURITY_AUTHORIZATION_ALIGNMENT_INCREMENT_I.md`
- `docs/UC02_ADMIN_OPERATION_ALIGNMENT.md`
- current Tenant provisioning and storage implementation

---

## 2. Frozen UC02 sequence

1. Project Details
2. Dealers
3. Dealer Outlets
4. Employees
5. Role Mapping
6. Project Masters
7. Project Readiness
8. Activate Project

Security, Audit Core and DI provisioning is automatic. The same screens remain available after activation as Project Administration.

UI terminology is **Project**. `tenant_id` remains the internal canonical cross-module identity/authorization boundary.

---

## 3. Confirmed cross-module architecture

### 3.1 Browser boundary

For UC02 the browser continues to call **Audit Core only**. No new Web BFF is required.

### 3.2 Two operation types — do not mix actor models

#### A. Human administrative operation

Examples:

- create Project/Tenant;
- update Project/Tenant administrative metadata;
- activate Project;
- hard delete Project/Tenant;
- assign/remove operating role;
- DI administrative purge/config operation.

The same Security-issued human Bearer token/identity received from the browser must remain the actor across the administrative chain.

If Audit Core invokes a downstream Security or DI administrative API, Audit Core passes that same human token through. It must not replace the human administrator with a `ServiceIntegration` token and must not mint an impersonated token.

The owning downstream module performs its own live authorization.

#### B. Machine/integration operation

Use registered `ServiceIntegration` tokens for:

- normal non-administrative module-to-module calls;
- background processing;
- Security `/authorization/check`;
- other APIs explicitly designed for machine actors.

Administrative endpoints continue to reject ServiceIntegration actors.

### 3.3 High-level UC02 path

```text
Browser
  |
  | Security human JWT
  v
Audit Core
  |
  |-- Security ADMIN API ---- same human JWT ----> Security
  |
  |-- DI ADMIN API ---------- same human JWT ----> DI
  |
  |-- normal DI integration - ServiceIntegration -> DI
  |
  `-- authorization/check --- ServiceIntegration -> Security
```

This reconciles the existing Web `Browser -> Audit Core` boundary with the Security design rule that administrative APIs are human-admin-only.

---

## 4. Owner decisions now frozen

### DEC-01 — Phase-1 hard delete

**CONFIRMED.** Phase 1 supports SuperAdmin hard delete for administrative rollback, including after activation. This is required because the product is new and Projects/setup may need to be rebuilt when issues are discovered.

This intentionally supersedes the earlier Audit Core v2.1 no-public-delete assumption for **UC02 administrative rollback APIs only**.

Phase 2 will move to a process-oriented lifecycle/deletion model using maker/checker, retention, inactivate/end-date/retire/supersede controls as approved.

### DEC-02 — Employee association

**CONFIRMED.** Do not create a new independent Security `Employee in Project but no role` membership model.

For Phase 1, the existing Security Tenant operating-role assignment is the persisted Project association.

The Employees screen may select/search an approved global Employee, but the persisted Project association begins when Role Mapping saves the Tenant role assignment.

Removing the Employee from the Project removes applicable Project role/business mappings; it never deletes the global USER.

### DEC-03 — Project creation orchestration

**CONFIRMED.** No separate Web BFF for UC02.

Audit Core is the browser-facing orchestrator. Security administrative operations are invoked by passing through the same human admin token.

### DEC-04 — Project field mutability after operational use

**CONFIRMED.** After operational Journeys or dependent published masters exist:

Editable with audit history:

- Project Name
- Effective End Date
- Timezone
- Region / Geography

Not directly editable:

- OEM
- Product Category
- Effective Start Date

Changing a restricted field later requires a separately approved migration/rebaseline process.

### DEC-05 — Google Maps / Places

**CONFIRMED, OPTIONAL.** Google Maps / Places is the approved optional Dealer Outlet location provider.

- manual address entry remains valid;
- persist optional `googlePlaceId` when a Google Place is selected;
- persist available address/latitude/longitude;
- `googlePlaceId` is nullable;
- absence of Google Place ID or coordinates alone is not a readiness blocker.

### DEC-06 — PC coverage readiness

**CONFIRMED.** Every ACTIVE Dealer Outlet must have at least one ACTIVE PC mapping. This is a blocking Project activation rule.

No additional staffing/cardinality rule is implied.

### DEC-07 — Master effective-period overlap

**CONFIRMED.** Phase 1 allows overlapping effective periods.

- overlap may generate a warning;
- overlap alone does not block upload/publish/activation;
- each owning master domain retains/defines deterministic resolver semantics;
- UC02 does not invent a universal precedence rule.

**Phase 2:** prevent overlapping published effective periods unless a controlled supersede/end-date process resolves the prior period.

### OPEN-01 — Product Master scope

Still unresolved; do not guess.

Question:

> If Project A and Project B use the same OEM, may they maintain different Product Master versions / active sellable SKU sets?

The Audit Core Product Master physical model must not be frozen until this is answered.

---

## 5. Source-backed gaps that still require implementation/design work

### GAP-01 — Security Tenant Code

Current Security Tenant create requires `tenantCode` + `tenantName`, while the frozen UI does not expose technical codes.

**Required change:** server-generate the internal Tenant Code/identifier or remove it from the business-facing create contract.

### GAP-02 — Security Tenant hard-delete API

Current Security target contract has create/read/update/activate but no Tenant hard delete.

**Required Phase-1 addition:** SuperAdmin-only human-admin Tenant hard delete, used last in whole-Project rollback.

### GAP-03 — Audit Core Project provisioning

Current Audit Core has GET/PATCH Project but no complete idempotent Project projection create/provision API with OEM/Product Category/dates/timezone/region.

### GAP-04 — Audit Core Outlet location API

Database already has address/lat/long, but current Outlet API does not expose the complete location model and does not have Google Place ID.

### GAP-05 — Dealer/Outlet technical codes

Current create APIs require client-supplied `dealerCode`/`outletCode`. Frozen UI treats internal codes as platform-generated.

### GAP-06 — Business assignment administration

Audit Core `business_assignments` already supports Project-, Dealer- and Outlet-level scope, but reviewed code lacks the UC02 administration API.

### GAP-07 — Master API/import layer

Audit Core master lifecycle services exist, but the complete REST route surface is not registered in the reviewed app and the required Excel staging/validation/preview/confirm framework does not exist.

### GAP-08 — Product Master physical model

Current Product/OEM/Model/Variant/Colour/SKU data is a shared platform reference model. UC02 needs effective-dated repeatable Product Master uploads and historical reproducibility. Physical design waits on OPEN-01.

### GAP-09 — DI Audit storage hierarchy

Current DI D5 and path builder are Tenant → Subject → Documents. UC02 requires trusted Audit Core-originated business hierarchy:

`Project → Dealer → Dealer Outlet → Customer → Documents`

A new append-only DI decision must supersede D5 for Audit Core-originated documents before implementation.

### GAP-10 — DI Project purge

Phase-1 whole-Project hard delete requires a resumable DI administrative purge/status contract with human SuperAdmin authorization and zero-state verification.

---

## 6. Phase-1 hard-delete design

### 6.1 Scope

The UC02 administrative UI must expose real hard-delete capability for:

- whole Project / Start Fresh / rollback;
- Dealer;
- Dealer Outlet;
- Project role/business mapping removal;
- DRAFT Project master/import data where applicable.

Published live master versions are not silently overwritten or row-deleted inside a continuing Project. If a whole Project is hard-deleted, its Project-scoped master/history data may be removed as part of that explicit rollback operation.

A global Verigence USER is never deleted because a Project/Dealer/Outlet is deleted.

### 6.2 Dependency behaviour

For a narrower entity such as Dealer or Outlet:

- backend must perform dependency preflight;
- if it has operational descendants that cannot be safely removed independently, direct delete may fail with dependency detail;
- whole-Project Hard Delete is the supported broad rollback path.

Do not silently cascade unknown operational data from a row-level Delete button.

### 6.3 Whole-Project hard-delete order

Audit Core orchestrates:

1. authorize current human SuperAdmin;
2. create/resume durable idempotent deletion operation;
3. preflight dependencies and prevent/reject new Project-scoped writes while deletion is running;
4. call DI admin purge using the same human token;
5. delete Audit Core Project-owned data in dependency-safe order;
6. call Security Tenant hard delete using the same human token **last**;
7. verify cross-module zero state;
8. only then report completion.

Partial failure must be resumable. Browser refresh must not create a second delete operation.

---

## 7. Pending / modified Security APIs

### Reuse

| API | UC02 use |
|---|---|
| `POST /security/v1/platform/tenants` | create canonical Project/Tenant identity after contract correction |
| `GET /security/v1/platform/tenants` | Project administration list |
| `GET /security/v1/platform/tenants/{tenantId}` | lifecycle/detail |
| `PATCH /security/v1/platform/tenants/{tenantId}` | allowed Security metadata update |
| `POST /security/v1/platform/tenants/{tenantId}/activate` | final activation |
| `GET /security/v1/platform/users` | approved Employee selector |
| `GET /security/v1/roles` | Role dropdown |
| `PUT /security/v1/tenants/{tenantId}/users/{userId}/operating-role` | persisted Employee/Project role association |
| `DELETE /security/v1/tenants/{tenantId}/users/{userId}/operating-role` | remove Project role association |
| `GET/PUT /security/v1/tenants/{tenantId}/role-bundles/{roleKey}` | role-bundle administration where required |

### Modify/add

**SEC-UC02-01 — Tenant create contract**  
Do not require user-entered `tenantCode`. Generate internal code/server identifier.

**SEC-UC02-02 — Tenant hard delete**  
Target logical API:

```text
DELETE /security/v1/platform/tenants/{tenantId}
Authorization: Bearer <human SuperAdmin JWT>
```

Requirements:

- human SuperAdmin only;
- ServiceIntegration denied;
- idempotent/retry-safe contract;
- remove Tenant-scoped Security role/admin mappings/bundles;
- preserve global USER identities;
- called last by Project deletion orchestration;
- audit final administrative delete.

Exact response/idempotency contract to be frozen in Security OpenAPI before code.

**SEC-UC02-03 — Human token pass-through**  
No new endpoint. Ensure all relevant admin routes accept/validate the forwarded Security human JWT and reject machine substitution.

**No SEC membership API is required for UC02.**

---

## 8. Pending / modified Audit Core APIs

### AC-UC02-01 — Project provision/create

Add idempotent Project projection using canonical Security `tenantId` plus:

- Project Name
- OEM
- Product Category
- Effective Start Date
- Effective End Date optional
- Timezone
- Region / Geography optional

Suggested logical shape: reconcile existing GET/PATCH with an idempotent `PUT /v1/tenants/{tenantId}/project` or equivalent approved provision operation.

### AC-UC02-02 — Project GET/PATCH expansion

Return/manage full Project setup plus `versionNo`/ETag.

Enforce DEC-04 mutability rules.

### AC-UC02-03 — Project hard delete / deletion status

Add human-SuperAdmin administrative Project delete/orchestration API and durable status/read operation.

This is the browser-facing cross-module delete entry point.

Required:

- same human token passed downstream for Security/DI admin deletes;
- idempotent operation ID;
- partial-failure resume;
- zero-state verification;
- Security Tenant delete last.

### AC-UC02-04 — Dealer APIs

Reuse current routes, but:

- generate internal Dealer Code server-side or formally reclassify it as optional external reference;
- support all approved mutable fields;
- optimistic concurrency;
- add SuperAdmin hard delete with dependency preflight.

### AC-UC02-05 — Dealer Outlet APIs

Reuse current routes and expose:

- address;
- city;
- state/region;
- postal code;
- optional latitude;
- optional longitude;
- optional `googlePlaceId` **new nullable schema field**;
- monthly vehicle volume;
- `ONSITE | SATELLITE`;
- optimistic concurrency;
- SuperAdmin hard delete with dependency preflight.

Google Maps is optional; manual address entry must work without it.

### AC-UC02-06 — Business assignment / Role Mapping API

Add administration API over `business_assignments`.

Required operations:

- list mappings by Project/USER;
- create/replace mapping;
- update mapping;
- remove mapping;
- return effective/current state for UI refresh.

Rules:

- PC → Outlet-specific;
- TL → Dealer-wide;
- PM → Project-wide;
- CRM → Dealer-wide or Project-wide;
- Executive → Project-wide.

Security operating-role assignment remains a separate owning-module write within the same UI workflow.

### AC-UC02-07 — Project Readiness API

Blocking checks at minimum:

- canonical Security Tenant exists and is in expected lifecycle state;
- Audit Project setup complete;
- Dealers/Outlets structurally valid;
- every ACTIVE Outlet has at least one ACTIVE PC mapping;
- required operating roles/business mappings complete;
- required master versions available/published according to module policy;
- DI prerequisites/provisioning/storage context ready.

Warnings/non-blockers:

- missing Google Place ID;
- missing map coordinates where manual address is accepted;
- overlapping master effective periods in Phase 1.

### AC-UC02-08 — Master catalogue and version routes

Expose registered Project masters, current versions/WEF/lifecycle/history and template version.

Register the concrete versioned-master routers in the running application; service helpers alone do not satisfy UC02.

### AC-UC02-09 — Excel staging/import framework

For each supported Audit Core master:

1. download template;
2. upload `.xlsx` with explicit blank-by-default WEF;
3. create staging/import record;
4. parse;
5. validate template/rows;
6. show paged parsed rows;
7. show row-level warnings/errors;
8. download error report;
9. explicit confirm;
10. create DRAFT version;
11. publish separately;
12. retain file hash, WEF, validation, confirmation and publication audit metadata.

Phase-1 overlaps are allowed and may warn.

### AC-UC02-10 — Product Master design — BLOCKED ON OPEN-01

Do not implement the physical Product Master version model until Project-vs-OEM scope is confirmed.

---

## 9. Pending / modified DI APIs/design

### DI-UC02-01 — Storage hierarchy decision

Before code, append a new locked `DI_DECISIONS.md` decision superseding D5 for Audit Core-originated vehicle-audit documents.

Trusted hierarchy:

`Project → Dealer → Dealer Outlet → Customer → Documents`

Audit Core provides trusted IDs/context. Browser never supplies object-storage path strings.

### DI-UC02-02 — Audit storage-context model/API

Add internal idempotent create/resolve storage context using immutable IDs plus readable names as approved. Display-name changes must not move old objects.

### DI-UC02-03 — Project/Tenant admin purge + status

Add human-SuperAdmin administrative purge/status contract for Project hard delete.

Requirements:

- same forwarded human token;
- ServiceIntegration rejected for human-admin purge;
- idempotent/resumable;
- stop/drain or safely invalidate active processing work;
- remove object bytes before dependent metadata where required;
- provide zero-state verification.

### DI-UC02-04 — Explicit provisioning/status only if readiness requires it

Reuse current idempotent Tenant provisioning helpers. Add explicit status/receipt API only where necessary to prove Project readiness/recovery; do not build a second provisioning mechanism.

### DI-UC02-05 — DI-owned master Excel administration, if exposed in UC02

If DI masters are selectable in Project Masters, DI owns template/import/validation/preview/confirm/publish APIs for its configuration. Browser still enters through Audit Core.

---

## 10. Web implementation increments

### W0 — Freeze remaining design/contracts

- obtain OPEN-01 Product Master scope decision;
- fold module UC02 alignment docs into next consolidated designs/OpenAPI;
- freeze delete/provision/readiness contracts;
- do not start Product Master physical implementation before OPEN-01.

### W1 — Project shell

- approved visual baseline;
- Project Setup Journey rail;
- first-time vs Project Administration mode;
- server-state-driven refresh/resume;
- no user-visible Tenant terminology.

### W2 — Project Details

- create canonical Security Tenant through Audit Core using human token pass-through;
- provision Audit Project + DI prerequisites;
- update approved Project fields;
- failure/retry recovery;
- no user-entered technical codes.

### W3 — Dealers

- list/create/edit/delete;
- explicit destructive confirmation;
- dependency error rendering;
- refresh Readiness after change.

### W4 — Dealer Outlets

- list/create/edit/delete;
- optional Google Maps / Places search/pin;
- manual address path always available;
- persist optional Place ID/address/lat/long;
- dependency handling;
- refresh Readiness.

### W5 — Employees / Role Mapping

Keep the visual steps, but do not create a new independent backend membership model.

Flow:

1. Employees screen searches/selects approved global USER;
2. Role Mapping chooses role/scope;
3. save Security Tenant operating role;
4. save Audit Core business assignment as applicable;
5. reconcile/compensate on partial module failure;
6. remove/replace mapping later;
7. never delete global USER.

### W6 — Project Masters

- module/master catalogue;
- explicit blank-by-default WEF;
- template download;
- Excel upload;
- validation/progress;
- parsed preview;
- row warning/error display;
- error workbook;
- confirm → DRAFT;
- publish separately;
- history/version view;
- overlap warning only in Phase 1;
- Product Master implementation waits on OPEN-01.

### W7 — Readiness / activation

- consolidated readiness;
- blocking vs warning distinction;
- PC-per-active-Outlet blocker;
- map/place-id warning only;
- overlap warning only;
- deep link to corrective screen;
- human-token pass-through for Security activation.

### W8 — Project Administration

Reuse same screens after activation for controlled updates and Phase-1 hard-delete actions.

### W9 — Hard Delete / Start Fresh recovery

- strong confirmation;
- dependency/preflight preview;
- durable operation ID/status;
- refresh/resume after browser reload;
- display current module deletion step;
- no success until DI + Audit Core + Security zero-state verification passes.

---

## 11. Hard-delete test gate

Hard delete is a mandatory UC02 release gate.

### 11.1 Actor/authorization

Test:

- no token → denied;
- ordinary USER → denied;
- wrong admin scope → denied;
- ServiceIntegration on human-admin endpoint → denied;
- SuperAdmin human token → allowed where designed;
- downstream Security/DI sees the same human identity;
- Audit Core never substitutes machine actor on admin call.

### 11.2 Isolation

Test:

- wrong Tenant/Project ID;
- cross-Tenant Dealer/Outlet IDs;
- tampered child-parent IDs;
- delete cannot touch another Project's rows/objects/assignments.

### 11.3 Dependency preflight

Test:

- empty Dealer/Outlet deletion;
- Dealer with Outlets;
- Outlet with Customer/Journey/evidence;
- mappings still present;
- active DI jobs;
- master references;
- direct row delete rejection when whole-Project rollback is required.

### 11.4 Idempotency/recovery

Test:

- duplicate Delete click/request;
- timeout after DI commit;
- timeout after Audit Core commit;
- retry after partial module failure;
- process restart;
- browser refresh;
- same operation resumes without duplicate effects.

### 11.5 Whole-Project post-activation rollback

Must explicitly test an ACTIVE Project:

1. create/activate Project;
2. create representative Dealer/Outlet/role/master data;
3. initiate Hard Delete as SuperAdmin;
4. DI purge succeeds/fails/retries;
5. Audit Core purge succeeds/fails/retries;
6. Security Tenant remains until final step;
7. Security Tenant deletes last;
8. global USERs remain;
9. cross-module zero-state verification passes;
10. Project can be recreated cleanly afterward.

### 11.6 Phase-2 regression note

Tests must make the Phase-1 broad hard-delete rule explicit so future Phase-2 lifecycle work can intentionally replace it rather than accidentally inherit it.

---

## 12. Cross-module UC02 E2E tests

1. Create Project → one Security Tenant in `CONFIGURING`.
2. Same canonical Tenant ID used by Audit Core/DI.
3. Security create is authorized using forwarded human SuperAdmin token.
4. Duplicate create/retry does not create duplicate Project.
5. Project setup survives browser refresh.
6. Dealer CRUD isolated by Project.
7. Outlet CRUD isolated by Project.
8. Optional Google Place ID persists when used.
9. Manual Outlet address works without Maps.
10. Missing Place ID/coordinates alone does not block readiness.
11. Employee selection + Role Mapping persists Security operating role.
12. Audit Core business scope matches role rules.
13. Every ACTIVE Outlet without PC blocks activation.
14. Adding PC mapping clears that blocker.
15. Project restricted-field update fails after operational/published dependency exists.
16. allowed Project fields remain editable.
17. Master WEF is mandatory and never defaulted.
18. Upload does not create authoritative master before confirmation.
19. Overlap is allowed Phase 1 and surfaced as warning only.
20. Publish remains a separate operation.
21. Activation uses forwarded human token to Security.
22. Dealer/Outlet Delete buttons execute real SuperAdmin hard-delete/preflight behaviour.
23. ACTIVE Project whole-delete rollback succeeds and Security deletes last.
24. Global USER survives Project deletion.
25. Recreating Project after rollback works cleanly.

---

## 13. Repository implementation order

### P0 — Design/API reconciliation

- fold Security UC02 admin alignment into next consolidated Security design/OpenAPI;
- fold Audit Core UC02 admin alignment into next solution/API/data-model revision;
- append DI locked storage decision before code;
- resolve OPEN-01 Product Master scope;
- freeze new DELETE/provision/readiness contracts.

### P1 — Security prerequisites

- server-generated Tenant Code;
- human-token admin proxy verification tests;
- Tenant hard-delete API;
- role PUT/DELETE regression;
- tests.

### P2 — Audit Core Project landscape

- Project provision/read/update;
- Project hard-delete orchestrator/status;
- Dealer create/update/delete corrections;
- Outlet optional Google Place ID + geo fields + delete;
- business-assignment admin API;
- readiness API with PC coverage;
- tests.

### P3 — Audit Core masters

- resolve Product Master scope/design;
- register master APIs;
- Excel staging/preview/confirm;
- Phase-1 overlap warning/allowed behaviour;
- tests.

### P4 — DI UC02 delta

- append D5 superseding decision;
- storage context/path implementation;
- Project purge/status;
- explicit provisioning status if needed;
- tests.

### P5 — Web

- all frozen screens;
- update/delete actions;
- optional Maps integration;
- master preview;
- readiness;
- hard-delete progress/recovery.

### P6 — DEV E2E / destructive gate

- happy path;
- fault injection;
- post-activation hard delete;
- cross-Tenant isolation;
- UC001 regression.

---

## 14. Definition of done

UC02 is complete only when:

- frozen approved UI is implemented without UC001 visual regression;
- normal setup, update and Phase-1 hard-delete flows use real APIs;
- administrative downstream operations preserve the same human SuperAdmin identity;
- ServiceIntegration is not used as a substitute for human admin authority;
- Security/Audit Core/DI API/design amendments are committed before implementation;
- Project provisioning is idempotent/recoverable;
- Project Readiness blocks every ACTIVE Outlet without an ACTIVE PC;
- Google Maps/Place ID remains optional;
- Phase-1 master overlap is allowed and Phase-2 stricter governance is documented;
- Product Master scope is explicitly decided and implemented without guessing;
- DI Audit storage hierarchy uses trusted Audit Core context;
- ACTIVE Project hard-delete rollback is resumable and Security Tenant deletes last;
- global USERs are preserved during Project deletion;
- destructive/fault/isolation tests pass;
- full DEV flow passes login → Project create → setup → masters → readiness → activate → update → hard-delete rollback → recreate.
