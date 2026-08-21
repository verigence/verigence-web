# UC02 — Project Onboarding & Administration Implementation Plan

**Document:** UC02-IMP-001  
**Version:** 1.2  
**Date:** 21-Aug-2026  
**Status:** OWNER DECISIONS CLOSED — READY FOR API/DATA-MODEL CONTRACT FREEZE  
**Web branch:** `planning/uc-002-project-onboarding`

> This document supersedes v1.1 for UC02 planning. It is grounded in the frozen UC02 UI baseline and the current Security, Audit Core and DI `dev` designs plus the UC02 alignment amendments already committed in the owning repositories. It does not invent missing physical schema or endpoint details; those must be frozen in the owning module designs/OpenAPI before implementation.

---

## 1. Frozen UC02 first-time journey

1. Project Details
2. Dealers
3. Dealer Outlets
4. Employees
5. Role Mapping
6. Project Masters
7. Project Readiness
8. Activate Project

Security, Audit Core and Document Intelligence are provisioned automatically. There is no normal user-facing provisioning step.

After activation, the same screens remain available as **Project Administration** for approved updates, versioned master maintenance and Phase-1 rollback/delete operations.

The Web UI says **Project**. `tenant_id` remains the internal canonical cross-module key/authorization boundary.

---

## 2. Confirmed architecture and actor model

### 2.1 Browser boundary

For UC02:

```text
Browser -> Audit Core
```

No additional Web BFF is introduced.

### 2.2 Two operation types

#### Human administrative operation

Examples:

- create Project/Tenant;
- update Project/Tenant administrative fields;
- activate Project;
- hard delete Project/Tenant;
- assign/remove operating role;
- DI administrative purge/configuration.

The same Security-issued human Bearer token received from the browser remains the actor through the administrative chain.

If Audit Core calls Security or DI administrative APIs, it forwards the same human token. It does not replace the human with `ServiceIntegration` and does not impersonate/mint a human token.

Each owning module performs its own current authorization.

#### Machine/integration operation

Use `ServiceIntegration` for:

- normal module-to-module processing;
- background jobs;
- Security `/authorization/check`;
- other explicitly machine-oriented endpoints.

Human-admin endpoints continue to reject machine substitution.

---

## 3. Frozen owner decisions

### DEC-01 — Phase-1 hard delete

Phase 1 supports SuperAdmin hard delete for administrative rollback, including after Project activation.

Reason: the product is new and Project/setup issues may require a clean rebuild.

Phase 2 will move toward process-oriented lifecycle/deletion controls with maker/checker, retention, inactivate/end-date/retire/supersede semantics where approved.

### DEC-02 — Employee association

No new independent Security `Employee in Project without role` persistence model is introduced in Phase 1.

The existing Security Tenant operating-role assignment is the persisted Project association.

The Employees screen may select/search the employee; the persisted association is created when Role Mapping saves the operating role.

Removing a Project assignment never deletes the global Verigence USER.

### DEC-03 — Project field mutability

After operational Journeys or dependent published masters exist:

Editable with audit history:

- Project Name
- Effective End Date
- Timezone
- Region / Geography

Not directly editable:

- OEM
- Product Category
- Effective Start Date

A later change to a restricted field requires a separately approved migration/rebaseline process.

### DEC-04 — Google Maps / Places

Google Maps / Places is approved but optional for Dealer Outlet location assistance.

Phase 1 supports:

- manual address entry;
- optional Google Place ID;
- optional latitude/longitude;
- later update of map/place details.

Missing Place ID/coordinates alone is not a readiness blocker.

### DEC-05 — PC coverage readiness

Every ACTIVE Dealer Outlet must have at least one ACTIVE PC mapping before Project activation.

This is a blocking readiness rule.

No other staffing/cardinality rule is implied.

### DEC-06 — Master overlap

Phase 1 allows overlapping effective periods.

- overlap may warn;
- overlap alone does not block upload, publish or activation;
- each owning master domain keeps/defines deterministic resolver semantics.

Phase 2 will introduce stronger overlap/supersede governance.

### DEC-07 — Product Master Phase 1

Keep Phase 1 simple.

- Product Master is Project-managed in the Project Masters flow.
- Each Project maintains its own effective-dated Product Master version history.
- Repeated Excel uploads are supported.
- WEF is mandatory and never defaulted.
- Uploaded data is staged/validated/previewed before confirmation.
- Published historical Product versions are not overwritten in place.
- One Project's Product Master changes must not silently alter another Project's operational master state.
- Price Lists and Discount Schemes must resolve against Product/SKU data valid for the same Project/effective context.

Phase 1 does **not** provide `Pick Existing Product Master` / cross-Project reusable master selection.

**Phase 2:** may add an option to pick/reuse an existing approved Product Master/catalogue, with reuse/copy/reference semantics designed separately.

---

## 4. Security — confirmed reuse and pending UC02 API work

### Reuse current Security target capabilities

- create/read/update/activate Tenant;
- global USER list/search for Employee selector;
- role catalogue;
- Tenant operating-role PUT/DELETE;
- Tenant role bundle administration where needed;
- live synchronous authorization.

### SEC-UC02-01 — Tenant create contract correction

Current Security create contract still requires technical `tenantCode` input.

Phase 1 requirement:

- UI sends Project business name, not Tenant Code;
- Security generates the internal Tenant Code/server identifier;
- generated code remains an internal implementation concern.

### SEC-UC02-02 — Tenant hard delete

Add/freeze a SuperAdmin human-admin Tenant hard-delete contract.

Target logical route already agreed in the Security UC02 alignment:

```text
DELETE /security/v1/platform/tenants/{tenantId}
Authorization: Bearer <human SuperAdmin JWT>
```

Before coding, Security OpenAPI/implementation design must define:

- idempotency key/operation semantics;
- success/already-deleted response;
- dependency/precondition behaviour owned by Security;
- audit receipt/event;
- deletion of Tenant-scoped role/admin mappings/bundles;
- preservation of global USERs.

Security Tenant delete is the final cross-module Project-delete step.

### SEC-UC02-03 — forwarded human-token tests

No new endpoint is necessarily required, but every Security admin endpoint used by UC02 must be tested with the forwarded Security human token and must reject `ServiceIntegration` substitution.

No separate Security Project-membership API is required for Phase 1.

---

## 5. Audit Core — pending UC02 API/data-model work

Audit Core remains the browser-facing orchestrator and owns Project/Dealer/Outlet/business-scope/master administration.

### AC-UC02-01 — Project provision/create

Add an idempotent Project projection operation using the canonical Security `tenantId` plus:

- Project Name
- OEM
- Product Category
- Effective Start Date
- Effective End Date optional
- Timezone
- Region / Geography optional

The current physical model already has these fields; the missing work is the complete API/orchestration contract.

### AC-UC02-02 — Project read/update

Expand Project GET/PATCH to cover approved fields and optimistic concurrency (`versionNo`/ETag or the existing approved project-concurrency mechanism).

Apply DEC-03 mutability rules.

### AC-UC02-03 — Project hard-delete orchestration/status

Add the browser-facing SuperAdmin Project hard-delete command plus durable status/read API.

Required behaviour:

1. authorize human SuperAdmin;
2. create/resume an idempotent delete operation;
3. preflight dependencies and prevent/reject new Project writes while deletion is running;
4. invoke DI administrative purge with the same human token;
5. delete Audit Core Project-owned rows in dependency-safe order;
6. invoke Security Tenant delete with the same human token last;
7. cross-module zero-state verification;
8. only then return COMPLETED.

Partial failure must be resumable.

### AC-UC02-04 — Dealer API corrections

Current hierarchy is reusable; Phase 1 needs:

- server-generated internal Dealer Code or formal optional external-reference treatment;
- approved Dealer mutable fields;
- list/get/create/update;
- SuperAdmin hard delete with dependency preflight;
- Tenant/Project isolation and concurrency enforcement.

Dealer does not store Outlet coordinates.

### AC-UC02-05 — Dealer Outlet API expansion

Expose the physical-model location fields plus the new optional Google Place ID:

- Dealer
- Outlet Name
- `ONSITE | SATELLITE`
- address
- city
- state/region
- postal code
- optional latitude
- optional longitude
- optional `googlePlaceId` — nullable schema migration required
- optional monthly vehicle volume
- status/concurrency fields as designed

Support list/get/create/update/hard-delete-with-preflight.

Manual entry must work without Google Maps.

### AC-UC02-06 — Business assignment / Role Mapping API

The existing `business_assignments` structure already represents:

- Project-wide
- Dealer-wide
- Outlet-specific

Add administration APIs for:

- list mapping by Project/USER;
- create/replace mapping;
- update mapping;
- remove mapping;
- current/effective state for UI refresh.

Rules:

- PC -> Outlet-specific
- TL -> Dealer-wide
- PM -> Project-wide
- CRM -> Dealer-wide or Project-wide
- Executive -> Project-wide

Security operating role remains a separate owning-module write inside the same UI workflow.

### AC-UC02-07 — Project Readiness API

Consolidated readiness must at minimum evaluate:

- Security Tenant exists/expected lifecycle;
- Audit Project complete;
- Dealer/Outlet structure;
- every ACTIVE Outlet has >=1 ACTIVE PC;
- required role/business mappings;
- required master versions/lifecycle;
- DI prerequisites/provisioning/storage hierarchy readiness.

Warnings only:

- missing Google Place ID;
- missing optional coordinates when manual address is valid;
- effective-period overlap in Phase 1.

### AC-UC02-08 — Master catalogue/version route exposure

Expose the actual registered Project-master catalogue, current version/WEF/lifecycle/history and template version.

Existing helper/service code does not count as complete until the FastAPI routes are present and registered.

### AC-UC02-09 — Excel staging/import framework

For each Audit Core Excel master:

1. download template;
2. upload `.xlsx` with explicit WEF;
3. create staging/import record;
4. parse workbook;
5. validate template + row data;
6. expose parsed rows for preview;
7. expose row-level warnings/errors;
8. error-report download;
9. explicit confirm;
10. create DRAFT version;
11. publish separately;
12. retain file hash/uploader/WEF/validation/confirmation/publication audit metadata.

No authoritative version is created merely because a file was uploaded.

### AC-UC02-10 — Product Master Phase-1 physical design

This work is now unblocked on business scope.

The current shared OEM/Product/Model/Variant/Colour/SKU reference model cannot simply be mutated by a Project upload.

Before implementation, Audit Core must revise the solution/physical-data model to provide the **minimal Project-effective, versioned Product Master treatment** required by DEC-07 while reusing stable platform reference identity where appropriate.

Do not introduce Phase-2 cross-Project `pick existing master` behaviour into this Phase-1 schema/API unless it naturally falls out without adding coupling/complexity.

---

## 6. Document Intelligence — pending UC02 changes

### DI-UC02-01 — supersede D5 for Audit-originated storage

Current DI storage is Tenant -> Subject -> Documents.

UC02 requires Audit-originated documents to follow trusted context:

```text
Project -> Dealer -> Dealer Outlet -> Customer -> Documents
```

Before implementation, append a locked DI decision superseding D5 for Audit Core-originated vehicle-audit documents.

Generic non-Audit DI use may retain the existing Subject-centric layout unless separately changed.

### DI-UC02-02 — storage-context model/API

Add an idempotent internal storage-context contract receiving trusted Audit Core IDs/context.

Browser never authors storage paths.

Names may be used for readability, but immutable IDs must preserve uniqueness/stability. Display-name changes must not move historical objects.

### DI-UC02-03 — Project/Tenant administrative purge/status

Add SuperAdmin human-admin purge/status for whole-Project hard delete.

Requirements:

- same forwarded human token;
- reject machine substitution for the admin purge endpoint;
- idempotent/resumable;
- safely stop/drain/invalidate active DI processing work;
- remove object bytes before dependent metadata where required;
- zero-state verification before completion.

### DI-UC02-04 — explicit provisioning/status only if needed

DI already has idempotent lazy Tenant provisioning helpers.

Add an explicit provisioning/status receipt only if Project Readiness/recovery genuinely needs to prove immediate DI provisioning. Reuse existing provisioning helpers; do not create a second provisioning mechanism.

### DI-UC02-05 — DI-owned Project Master import APIs if kept on the combined screen

If Project Masters continues to surface DI master/configuration types, DI owns the template/import/validate/preview/confirm/publish semantics for those DI-owned masters.

Browser still enters through Audit Core; owning module remains authoritative.

---

## 7. Web implementation increments

### W0 — contract freeze

Before feature code:

- fold Security UC02 alignment into Security consolidated design/OpenAPI;
- fold Audit Core UC02 alignment + Product Master Phase-1 decision into solution/API/data model;
- append DI locked storage decision;
- freeze new Project create/update/delete/readiness/master-import contracts;
- freeze delete operation-state/error models.

### W1 — Project shell

Implement the frozen approved visual baseline:

- visual continuation of UC001/login;
- Project Setup Journey rail;
- first-time vs Project Administration mode;
- server-state-driven refresh/resume;
- no user-visible Tenant terminology.

### W2 — Project Details

- Project create through Audit Core;
- Security canonical Tenant create via forwarded human token;
- Audit Core projection + DI prerequisites;
- update allowed fields;
- background-provisioning exception/retry UI only on failure;
- no user-entered technical codes.

### W3 — Dealers

- list/create/edit/delete;
- dependency preflight/confirmation;
- refresh readiness after change.

### W4 — Dealer Outlets

- list/create/edit/delete;
- optional Google Places picker;
- manual address entry always available;
- persist optional Place ID/address/lat/long;
- map pin update;
- dependency handling;
- readiness refresh.

### W5 — Employees / Role Mapping

Keep both visual steps but no new membership table/API.

Flow:

1. Employees screen searches/selects global approved USER;
2. Role Mapping chooses role + scope;
3. Security operating role write;
4. Audit Core business-assignment write where applicable;
5. reconcile partial failure;
6. later update/remove;
7. never delete global USER.

### W6 — Project Masters

- master catalogue;
- template download;
- mandatory blank-by-default WEF;
- Excel upload;
- parsing/validation progress;
- parsed data preview;
- row warnings/errors;
- error report;
- explicit confirm -> DRAFT;
- publish separately;
- history;
- overlap warning only;
- Product Master uses Project-specific Phase-1 version history;
- no `Pick Existing Product Master` UI in Phase 1.

### W7 — Project Readiness / activation

- consolidated readiness;
- blocking vs warning distinction;
- PC coverage blocker;
- Maps/coordinate warning only;
- overlap warning only;
- deep links to corrective steps;
- Security activation using forwarded human token.

### W8 — Project Administration

Reuse the same screens after activation for approved updates and hard-delete actions.

### W9 — Hard Delete / Start Fresh

- dependency/preflight view;
- strong confirmation;
- durable delete operation/status;
- resume on browser refresh;
- show module progress;
- no success until DI + Audit Core + Security zero-state verification.

---

## 8. Delete/destructive test gate

Hard delete is a UC02 release gate.

### Actor tests

- unauthenticated denied;
- ordinary USER denied;
- wrong admin denied;
- ServiceIntegration denied on human-admin delete;
- SuperAdmin human token accepted where designed;
- downstream modules observe same human identity.

### Isolation tests

- wrong Project/Tenant ID;
- cross-Project Dealer/Outlet IDs;
- tampered parent/child IDs;
- deletion cannot touch another Project's rows, mappings or DI objects.

### Dependency/preflight tests

- empty Dealer/Outlet;
- Dealer with Outlets;
- Outlet with Customer/Journey/evidence;
- role/business mappings;
- active DI jobs;
- master references;
- row-level delete rejected when whole-Project rollback is required.

### Idempotency/recovery tests

- duplicate click/request;
- timeout after DI delete;
- timeout after Audit Core delete;
- retry after one module fails;
- process restart;
- browser refresh;
- same operation resumes without duplicate effects.

### ACTIVE Project rollback test

Must include a Project that has already been activated and contains representative Dealer/Outlet/role/master data.

Verify:

1. DI purges first;
2. Audit Core deletes Project-owned data next;
3. Security Tenant remains until final step;
4. Security deletes last;
5. global USERs remain;
6. zero-state check passes;
7. Project can be recreated cleanly afterward.

---

## 9. Cross-module E2E test set

At minimum:

1. Create Project creates one Security Tenant in `CONFIGURING`.
2. Same canonical internal ID is represented in Audit Core/DI.
3. Security admin create receives forwarded SuperAdmin human token.
4. Duplicate retry does not duplicate Project.
5. Project setup survives refresh.
6. Dealer CRUD isolated by Project.
7. Outlet CRUD isolated by Project.
8. Google Place ID persists when used.
9. Manual Outlet address works without Maps.
10. Missing optional Place ID/coordinates does not block activation.
11. Role Mapping persists Security operating role and matching Audit business scope.
12. PC/TL/PM/CRM/Executive scope rules are enforced.
13. Every ACTIVE Outlet without PC blocks activation.
14. Adding PC clears blocker.
15. restricted Project fields cannot be directly changed after dependency threshold.
16. allowed Project fields remain editable.
17. master WEF is mandatory and never defaulted.
18. Excel upload only stages/parses before confirmation.
19. parsed rows are shown before DRAFT creation.
20. Phase-1 overlap is allowed and warns only.
21. Project A and Project B using the same OEM can maintain independent Phase-1 Product Master histories without one silently changing the other.
22. No Phase-1 UI allows picking another Project's Product Master.
23. publish is separate from upload/confirm.
24. activation calls Security with forwarded human token.
25. Dealer/Outlet deletes use dependency-safe hard-delete/preflight.
26. ACTIVE Project rollback resumes across failures and Security deletes last.
27. global USER survives Project deletion.
28. clean recreate works after rollback.

---

## 10. Repository implementation order

### P0 — Design/API reconciliation

- Security consolidated design/OpenAPI update;
- Audit Core solution/API/physical model update including simple Project-effective Product Master;
- DI locked storage decision and admin-purge contract;
- freeze delete/provision/readiness/master-import contracts.

### P1 — Security

- server-generated Tenant Code;
- human-token pass-through admin tests;
- Tenant hard-delete API;
- role PUT/DELETE regression;
- tests.

### P2 — Audit Core Project landscape

- Project create/read/update;
- Project hard-delete orchestrator/status;
- Dealer CRUD/delete correction;
- Outlet geo + optional Place ID + CRUD/delete;
- business-assignment API;
- readiness API with PC coverage;
- tests.

### P3 — Audit Core masters

- Project-effective Product Master physical design/migration;
- register master APIs;
- Excel staging/preview/confirm;
- phase-1 overlap warning/allowed behaviour;
- Product/Price/Discount reference validation;
- tests.

### P4 — DI

- D5 superseding decision;
- storage context/path implementation;
- Project purge/status;
- explicit provisioning status only if needed;
- DI master import layer if required by Project Masters;
- tests.

### P5 — Web

- frozen approved screens;
- update/delete actions;
- optional Maps;
- master preview;
- readiness;
- delete progress/recovery.

### P6 — DEV E2E/destructive gate

- full happy path;
- fault injection;
- post-activation hard delete;
- cross-Project/Tenant isolation;
- Product Master isolation;
- UC001 login/onboarding visual/regression tests.

---

## 11. Definition of done

UC02 is complete only when:

- frozen approved UI is implemented without UC001 visual regression;
- all setup/update/delete actions use real APIs;
- administrative downstream calls preserve the authenticated SuperAdmin identity;
- ServiceIntegration is not substituted for human admin authority;
- owning-module OpenAPI/design/data-model amendments are committed before code depends on them;
- Project provisioning is idempotent/recoverable;
- every ACTIVE Outlet requires at least one ACTIVE PC for activation;
- Google Maps/Place ID remains optional;
- master WEF is explicit and upload is previewed before confirmation;
- Phase-1 overlap is allowed and Phase-2 stricter governance is documented;
- Product Master is Project-specific/effective-dated in Phase 1, with cross-Project reuse deferred to Phase 2;
- DI storage hierarchy uses trusted Audit Core context;
- ACTIVE Project hard-delete rollback is resumable and Security Tenant deletes last;
- global USERs are preserved during Project deletion;
- destructive/fault/isolation/E2E tests pass;
- the full DEV flow passes login -> Project create -> Dealers/Outlets -> Role Mapping -> Masters -> Readiness -> Activate -> Update -> Hard Delete -> Recreate.
