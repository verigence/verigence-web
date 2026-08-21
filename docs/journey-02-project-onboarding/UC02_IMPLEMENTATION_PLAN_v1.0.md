# UC02 — Project Onboarding & Administration Implementation Plan

**Document:** UC02-IMP-001  
**Version:** 1.0 DRAFT  
**Date:** 21-Aug-2026  
**Status:** DRAFT — SOURCE-RECONCILED; OWNER DECISIONS OPEN  
**Web branch:** `planning/uc-002-project-onboarding`

> This plan is intentionally conservative. It is based on the frozen UC02 UI baseline plus the current `dev` solution/implementation documents and code in Security, Audit Core and DI. Where UC02 conflicts with an existing module baseline, the conflict is recorded as a design gap; this document does not silently redefine the module.

---

## 1. Sources reviewed

### Web

- `docs/journey-02-project-onboarding/J02_FROZEN_UI_BASELINE.md`
- `docs/journey-02-project-onboarding/J02_FROZEN_MOCKUP_MANIFEST.md`
- `docs/AGREED_TECHNOLOGY_STACK.md`
- existing UC001 implementation / branding assets

### Security — `dev`

- `docs/SECURITY_SOLUTION_DESIGN_v2.0.md` dated 19-Aug-2026
- `docs/SECURITY_IMPLEMENTATION_DESIGN_v2.0.md` dated 19-Aug-2026
- `src/verigence_security/api/routes/platform_admin.py`
- `src/verigence_security/api/routes/v2_rbac.py`
- `src/verigence_security/api/platform_schemas.py`
- `src/verigence_security/services/platform_admin.py`

### Audit Core — `dev`

- `docs/AUDIT_CORE_SOLUTION_DESIGN_v2.1.md`
- `docs/AUDIT_CORE_API_CONTRACT_v1.0.md`
- `docs/AUDIT_CORE_PHYSICAL_DATA_MODEL_v2.1.md`
- `database/AUDIT_CORE_POSTGRESQL_SCHEMA_v2.1.sql`
- `docs/AUDIT_CORE_PROGRESS_TRACKER.md`
- `docs/AUDIT_CORE_PENDING_ISSUES.md`
- current Project / Dealer / Outlet / assignment / master implementation files

### Document Intelligence — `dev`

- `DI_DECISIONS.md`
- `DI_MASTER_REFERENCE.md`
- `DI_DESIGN_SUMMARY.md`
- `PROGRESS.md`
- `docs/SECURITY_AUTHORIZATION_ALIGNMENT_INCREMENT_I.md`
- `backend/src/verigence/di/repositories/tenants.py`
- `backend/src/verigence/di/repositories/database.py`
- `backend/src/verigence/di/storage/adapter.py`
- current DI configuration API routes

---

## 2. Frozen UC02 business/UI sequence

The normal SuperAdmin journey is:

1. Project Details
2. Dealers
3. Dealer Outlets
4. Employees
5. Role Mapping
6. Project Masters
7. Project Readiness
8. Activate Project

Security, Audit Core and DI provisioning is automatic. There is no normal user-facing “Provisioning Modules” task.

The same screens remain available after activation as Project Administration for controlled updates.

UI terminology is **Project**. `tenant_id` / Tenant remains the internal cross-module identity and authorization boundary.

---

## 3. Architecture invariants that are already source-backed

1. One Security Tenant maps 1:1 to one Audit Core Project; Audit Core `projects.tenant_id` is the Project key.
2. Audit Core business hierarchy is Project → Dealer → Dealer Outlet → Customer → Journey.
3. Security owns global USER identity, Tenant identity/lifecycle, role classifications, role assignments and functional authorization.
4. Audit Core owns Dealer/Outlet business assignment independently of Security role assignment.
5. DI owns generic document intelligence and raw object storage; Audit Core remains the audit/business authority.
6. Published decision-relevant Audit Core master versions are immutable.
7. Audit Core baseline public APIs have no destructive HTTP DELETE surface; normal corrections are inactivate/retire/void/supersede/cancel.
8. DI D5 currently stores objects under Tenant → Subject → Documents and therefore does **not** satisfy the frozen UC02 Project → Dealer → Dealer Outlet → Customer hierarchy.
9. Security currently creates a Tenant in `CONFIGURING` and activates it later; this is useful for UC02 readiness and recovery.

---

## 4. Important source conflicts / gaps introduced by UC02

### GAP-01 — Web orchestration boundary

`docs/AGREED_TECHNOLOGY_STACK.md` says Web/Mobile calls Audit Core only and there is no dedicated frontend application server.

Security v2.0, written later, explicitly permits the Web BFF/API capability to orchestrate UI operations spanning Security and Audit Core.

UC02 Project creation necessarily needs the canonical Security Tenant to be created before Audit Core Project projection exists. The final orchestration boundary must therefore be approved before implementation starts. See OPEN-01.

### GAP-02 — Security Tenant Code is still required by current API

Current Security `POST /security/v1/platform/tenants` requires:

- `tenantCode`
- `tenantName`

Frozen UC02 requires no user-entered Tenant Code. Project users see only Project business fields. Security must therefore generate the internal Tenant Code or accept another approved server-generated identifier mechanism.

### GAP-03 — Employee can be added before role, but Security has no independent Tenant membership API

Security v2.0 has operating-role PUT/DELETE APIs, but the frozen UC02 Employees screen requires:

`Employee added to Project` → later → `Role Mapping`.

A durable Project/Tenant membership independent of operating role is not defined in the reviewed Security target API. Ownership and API must be approved. See OPEN-02.

### GAP-04 — Security v2 says Dealer and Outlet are the same assignment concept

Security v2.0 states that Dealer and Outlet are the same business-scope concept for Phase 1. Frozen UC02 explicitly requires distinct Dealer and Dealer Outlet scope, with PC mapped to Outlet and TL mapped to Dealer.

Security should still not own Dealer/Outlet IDs. The required change is primarily Audit Core business-scope semantics, but the Security design wording must be explicitly superseded/aligned before implementation sign-off.

### GAP-05 — Audit Core Project provisioning API is missing

Current Audit Core exposes:

- `GET /v1/tenants/{tenantId}/project`
- `PATCH /v1/tenants/{tenantId}/project`

Current `PATCH` only changes Project Name. Tests insert Project rows directly with SQL. There is no current idempotent Project-provisioning API that accepts the UC02 Project fields.

### GAP-06 — Audit Core Outlet database has location fields but API does not expose them

The physical model already contains:

- `address_text`
- `city`
- `state_region`
- `postal_code`
- `latitude`
- `longitude`
- `monthly_vehicle_volume`
- `outlet_classification`

Current Outlet API only creates/returns city/state/postal/classification and current PATCH only changes outlet name/classification/status. UC02 therefore needs API expansion, not a new core hierarchy.

### GAP-07 — Dealer/Outlet codes are currently client-supplied

Current Audit Core Dealer/Outlet create requests require `dealerCode` / `outletCode`.

Frozen UC02 treats internal identifiers/codes as platform-generated and does not show these as business-entry fields. Code-generation policy/API must be changed or the fields must be explicitly reclassified as external business references.

### GAP-08 — Audit Core business-assignment data model exists but administration API is missing

`business_assignments` already supports:

- project-wide: `dealer_id IS NULL`, `outlet_id IS NULL`
- Dealer-wide: `dealer_id != NULL`, `outlet_id IS NULL`
- Outlet-specific: Dealer + Outlet
- effective dates/status

Current reviewed implementation provides assignment helper logic but no UC02 administration API for list/create/update/end-date/remove mapping.

### GAP-09 — Audit Core master services exist but the reviewed app does not expose the complete versioned-master route surface

The Audit Core design/API contract defines Price List, Discount Scheme, Document Requirement Profile and Audit Controls version APIs. Current helper services implement much of the lifecycle, but the reviewed `main.py` does not register master routers for these domains.

UC02 also requires a new Excel staging/validation/preview/confirm flow which is not present in current Audit Core code.

### GAP-10 — Product Master is currently a platform reference, not a Project-effective versioned master

The current Audit Core physical model treats Product Category/OEM/Model/Variant/Colour/SKU as shared platform reference tables.

Frozen UC02 requires Product Master to be repeatedly uploaded, effective-dated, previewed, published and historically reproducible per Project. This requires an explicit Audit Core design/data-model revision before coding. See OPEN-05.

### GAP-11 — DI storage path must be superseded for Audit-originated documents

DI locked decision D5 and current `storage/adapter.py` implement:

`Tenant / Subjects / Subject / Documents / Form Type / File`

UC02 requires the trusted business hierarchy:

`Project / Dealer / Dealer Outlet / Customer / Documents`

DI must not infer this hierarchy from names or browser input. Audit Core must supply trusted immutable context.

### GAP-12 — DI provisioning is currently implicit/lazy

DI `tenant_session()` automatically provisions tenant settings, retention policy and tenant document types on Tenant-scoped requests. This is idempotent and useful, but there is no explicit provisioning receipt/status operation for UC02 recovery/readiness.

If UC02 must positively prove DI provisioning immediately after Project creation, an explicit internal provisioning/status API is required.

### GAP-13 — Cross-module Start Fresh / Project purge API does not exist

Current source designs do not expose a Phase-1 Tenant/Project cross-module delete. Audit Core deliberately has no public DELETE surface. DI has object-storage delete support under retention authorization but no Tenant purge orchestration endpoint. Security has no Tenant hard-delete target API in v2.0.

The previously agreed “Start Fresh” recovery for a never-active empty Project therefore requires new internal preflight/purge contracts if included in UC02.

---

## 5. Update and delete requirement

### 5.1 Update — mandatory UC02 behaviour

Every setup area must support post-create administration where business-safe:

| Area | Required update behaviour |
|---|---|
| Project | edit approved mutable fields |
| Dealer | edit details; active/inactive lifecycle |
| Dealer Outlet | edit details, type, map/address/coordinates, volume; active/inactive lifecycle |
| Employee membership | add/remove Project membership once ownership is confirmed |
| Role Mapping | create/replace/end-date/remove mapping |
| Project Masters | edit DRAFT data only; published data changes through a new version |
| Readiness | re-run at any time; reflect current setup |

### 5.2 Delete — implementation is BLOCKED on exact business semantics

The user requirement is that delete functionality must exist where appropriate and be tested very thoroughly.

However, the current Audit Core solution/API/database baseline explicitly prohibits public hard-delete and revokes/avoids DELETE privileges for business/master/workflow tables. Published master versions are immutable.

Therefore UC02 must **not** silently implement hard DELETE across these records until OPEN-03 is approved.

Recommended policy for approval:

- Before activation and only when a setup record is unreferenced: allow true administrative delete if owner explicitly approves it.
- After activation or once referenced by operational/audit history: use `INACTIVE`, end-date, `RETIRED`, remove mapping, or other audited lifecycle semantics instead of physical deletion.
- Published master versions: never hard delete; retire/supersede.
- Global USER identity: never deleted as a side effect of removing an Employee from one Project.
- Whole Project cross-module deletion remains the separately approved Phase-2 maker/checker capability; it is not silently folded into normal UC02 entity delete.

No hard-delete API should be coded until this policy is confirmed.

---

## 6. Pending / modified Security APIs

### Existing target APIs to reuse

| API | UC02 use |
|---|---|
| `POST /security/v1/platform/tenants` | create canonical internal Project/Tenant identity |
| `GET /security/v1/platform/tenants/{tenantId}` | load lifecycle state |
| `PATCH /security/v1/platform/tenants/{tenantId}` | update Security display name |
| `POST /security/v1/platform/tenants/{tenantId}/activate` | final activation after readiness |
| `GET /security/v1/platform/users` | Employee selector source, subject to filters/search implementation |
| `GET /security/v1/roles` | Role dropdown |
| `PUT /security/v1/tenants/{tenantId}/users/{userId}/operating-role` | set/replace operating role |
| `DELETE /security/v1/tenants/{tenantId}/users/{userId}/operating-role` | remove operating role |
| `GET/PUT /security/v1/tenants/{tenantId}/role-bundles/{roleKey}` | review/update Tenant role permission bundle where needed |

### Security changes / new APIs required for UC02

**SEC-UC02-01 — Modify Tenant create contract**  
Server generates `tenantCode`; Web sends Project display name only to Security. Exact generated format is internal and must not become a business dependency.

**SEC-UC02-02 — Project/Tenant membership independent of operating role — PENDING OPEN-02**  
Proposed logical operations:

- add USER to Project/Tenant without operating role;
- list Project/Tenant members;
- get membership;
- remove membership subject to dependency rules.

Exact route names are not frozen until OPEN-02 is approved.

**SEC-UC02-03 — Provisioning/recovery lifecycle support — PENDING OPEN-01**  
Security already creates Tenant as `CONFIGURING`, which should be retained. If Security is chosen as durable orchestration owner, add provisioning-operation/receipt state. If Web BFF or another approved orchestration owner is chosen, do not duplicate that state in Security.

**SEC-UC02-04 — No Phase-1 Tenant hard-delete API**  
Do not add whole-Project/Tenant hard-delete to Phase 1 unless the previously agreed Phase-2 approval design is explicitly pulled forward.

---

## 7. Pending / modified Audit Core APIs

### AC-UC02-01 — Project provisioning

Add an idempotent Project projection operation using the canonical Security `tenantId` and UC02 Project fields:

- Project Name
- OEM
- Product Category
- Effective Start Date
- Effective End Date (optional)
- Timezone
- Region / Geography (optional)

Current database already has these columns.

Suggested logical contract: an idempotent `PUT`/provision command for `/v1/tenants/{tenantId}/project`; exact route must be reconciled with the existing `GET/PATCH` contract before OpenAPI freeze.

### AC-UC02-02 — Expand Project GET/PATCH

Return/manage the full Project setup fields plus `versionNo`/ETag for optimistic concurrency.

Project post-activation mutability is pending OPEN-04.

### AC-UC02-03 — Dealer API corrections

Reuse existing Dealer create/list/get/patch routes, but:

- stop requiring user-entered internal Dealer Code, or reclassify it as an optional external reference;
- expose registered address / existing schema-supported references where approved;
- retain ACTIVE/INACTIVE lifecycle;
- use optimistic concurrency for update.

### AC-UC02-04 — Dealer Outlet API corrections

Reuse existing nested Outlet routes and add the database-supported fields:

- address
- city
- state/region
- postal code
- latitude
- longitude
- monthly vehicle volume
- `ONSITE | SATELLITE`

Google provider Place ID is not currently in Audit Core schema; adding it requires OPEN-06 approval and a migration if it is to be persisted.

### AC-UC02-05 — Business assignment / Role Mapping API

Add administration API over existing `business_assignments` model.

Required operations:

- list mappings for Project / USER;
- create or replace effective mapping;
- update/end-date mapping;
- remove/inactivate mapping according to approved delete policy.

Validation rules from frozen UC02:

- PC → Outlet-specific
- TL → Dealer-wide
- PM → Project-wide
- CRM → Dealer-wide or Project-wide
- Executive → Project-wide

Security operating role must be set separately; Audit Core mapping must not create a Security role.

### AC-UC02-06 — Project master catalogue/readiness metadata

Expose the list of masters required by Audit Core for this Project, their current version/WEF/lifecycle status and template version.

### AC-UC02-07 — Excel master import framework

For each supported Audit Core master:

1. download current template;
2. upload `.xlsx` with explicit WEF;
3. create staging/import record;
4. parse and validate;
5. expose paged parsed rows;
6. expose row-level errors/warnings;
7. download error report;
8. confirm import;
9. create DRAFT master version;
10. publish separately;
11. retain import/file hash/audit metadata.

No WEF default is allowed.

### AC-UC02-08 — Wire existing master version APIs into the actual application router

The design contract already defines Price List, Discount Scheme, Document Requirement Profile and Audit Controls version operations. Ensure the concrete FastAPI router surface is present and registered in `main.py`; do not count helper/service functions as a completed API.

### AC-UC02-09 — Product Master version model — PENDING OPEN-05

Current shared product reference tables cannot be mutated as the Project-effective historical master required by UC02.

Design and migrate a Project-effective Product Master/version model before building Excel import for Product Master.

### AC-UC02-10 — Readiness API

Add a consolidated Project Readiness API returning blocking/warning checks across:

- Security lifecycle/provisioning receipt where accessible;
- Audit Project fields;
- Dealer/Outlet completeness;
- Outlet map coordinates;
- Employee membership;
- operating role + business mapping completeness;
- master effective/published versions;
- DI provisioning/storage/config prerequisites.

The exact PC staffing rule is pending OPEN-07.

### AC-UC02-11 — Start Fresh preflight/purge — PENDING OPEN-03 / OPEN-01

If Start Fresh remains in UC02, add machine/internal-only preflight and purge operations. These are not normal public DELETE APIs.

Preflight must prove the Project has never been ACTIVE and contains no operational Customer/Journey/audit evidence before destructive reset is allowed.

---

## 8. Pending / modified DI APIs and design

### DI-UC02-01 — Explicit Project/Tenant provisioning receipt

DI currently auto-provisions Tenant settings/document types/retention policy inside `tenant_session()`. Add an explicit idempotent internal provisioning/status operation only if required by the approved cross-module orchestration/readiness model.

It must reuse existing provisioning functions rather than create a second provisioning mechanism.

### DI-UC02-02 — Supersede D5 for Audit Core-originated storage

Add a new append-only DI decision explicitly superseding D5 **for Audit Core-originated vehicle-audit documents**.

Generic DI clients may retain the Subject-centric D5 layout unless a broader migration is separately approved.

Required trusted hierarchy context:

- Project ID/name
- Dealer ID/name
- Dealer Outlet ID/name
- Customer ID/name
- stable external context/Journey reference

The context comes from Audit Core, never from browser-authored storage path segments.

### DI-UC02-03 — Storage context API/model

Add an internal idempotent API and persistence model to create/resolve an immutable Audit storage context.

The path builder should use readable names plus immutable IDs to prevent collisions and should keep old document paths stable when display names change.

### DI-UC02-04 — DI master administration through Excel

DI currently has APIs for Document Types, Extraction Profiles, Requirement Profiles, Tenant/Retention/Quality configuration, but no reviewed Excel staging/preview/confirm flow.

If DI masters remain on the UC02 Project Masters screen, DI must expose module-owned template/import/validation/preview/confirm operations, invoked through the approved backend orchestration boundary rather than the browser authoring DI data directly.

### DI-UC02-05 — Start Fresh / future Project purge

Add internal, idempotent preflight/purge operations if Start Fresh is included in UC02.

DI purge order must preserve exact object keys until object bytes are successfully deleted, then remove dependent DI metadata/configuration. Completion requires zero-state verification.

Whole Project deletion with approval remains Phase 2 unless explicitly pulled forward.

---

## 9. Web implementation increments

### W0 — Resolve owner decisions and freeze cross-module contracts

No implementation begins until OPEN-01 through OPEN-08 are answered or explicitly deferred.

Deliverables:

- updated UC02 source-of-truth requirements;
- Security/Audit Core/DI API gap contracts;
- approved delete lifecycle policy;
- approved orchestration boundary;
- OpenAPI changes in owning repos.

### W1 — Project shell and route/state model

- implement approved frozen visual baseline;
- Project Setup Journey rail;
- first-time vs Project Administration mode;
- resilient refresh/resume based on backend state, not local UI memory;
- TanStack Query for server state;
- React Hook Form + Zod validation;
- no user-visible Tenant terminology.

### W2 — Project Details

- create Project command;
- automatic backend provisioning flow per OPEN-01;
- update Project flow;
- provisioning exception/retry UI only on failure;
- no user-entered Tenant/Dealer/Outlet technical codes.

### W3 — Dealers / Dealer Outlets

- list/create/edit lifecycle;
- Dealer Outlet map picker;
- map search + pin adjustment;
- persist address/coordinates;
- delete/inactivate control according to OPEN-03;
- dependency-aware error display.

### W4 — Employees

- searchable approved Employee selector;
- add membership without role if OPEN-02 is approved;
- list current Project Employees;
- remove membership with dependency validation;
- do not delete global USER.

### W5 — Role Mapping

- Employee/Role/Dealer/Dealer Outlet dropdowns;
- role-aware field behaviour;
- Security role PUT/DELETE + Audit Core business-scope update as one UI workflow;
- compensate/recover if one module succeeds and the other fails;
- update/end-date/remove mapping;
- show current mapping history/status where required.

### W6 — Project Masters

- module/master catalogue;
- template download;
- WEF explicitly selected and initially blank;
- Excel upload;
- parse/validation progress;
- parsed data preview;
- row errors/warnings;
- error workbook download;
- confirm to create DRAFT;
- publish action separated from upload/confirm;
- history/version view;
- Product Master special controls/warnings.

### W7 — Project Readiness and activation

- consolidated readiness view;
- deep links from failed check to corrective screen;
- rerun checks;
- activation only when all blocking checks pass;
- call approved Security activation path.

### W8 — Project Administration mode

After activation retain the same task areas for allowed updates. Do not build a second separate admin product.

### W9 — Recovery / Start Fresh

- only show after technical provisioning failure / eligible state;
- retry failed provisioning first;
- Start Fresh calls preflight before destructive action;
- strong confirmation UI;
- display durable operation progress;
- resume after browser refresh;
- never show success until cross-module zero-state verification passes.

---

## 10. Delete and destructive-operation test strategy

Delete testing is a release gate, not a normal happy-path test.

### 10.1 Authorization / isolation

Test every destructive or removal operation for:

- unauthenticated denial;
- wrong permission denial;
- wrong Tenant/Project denial;
- cross-Tenant ID tampering;
- ServiceIntegration blocked from human-admin-only actions where Security requires human admin;
- Executive no-delete rule in Audit Core;
- only approved SuperAdmin/admin authority can execute the final operation.

### 10.2 Dependency safety

For each entity test:

- no dependants → approved deletion/lifecycle action succeeds;
- dependants exist → physical delete is rejected or converted to approved lifecycle action;
- Dealer with Outlets;
- Outlet with Customers/Journeys/evidence;
- Employee with active role/business assignment;
- role mapping with audit/work history;
- Product/Price/Discount version already referenced by Journey;
- published master version;
- DI Subject/Document/object-storage dependency.

### 10.3 Idempotency / retries

Test:

- duplicate destructive request;
- timeout after backend commit but before response;
- retry with same idempotency key;
- retry after one module completed and another failed;
- process restart during purge;
- browser refresh during purge;
- eventual resume without duplicate effect.

### 10.4 Zero-state verification for Start Fresh / future Project deletion

Completion must verify as applicable:

- DI object count = 0 for Project/Tenant purge root/context;
- DI Tenant/config/document live rows = 0 where purge contract requires it;
- Audit Core Project-owned live rows = 0 for an approved full reset;
- Security live Tenant removed last only for approved full reset/delete;
- no active processing/retry/outbox work remains;
- durable purge receipt/audit evidence exists according to approved retention policy.

### 10.5 Non-destructive history guarantees

Test that:

- published master history cannot be hard-deleted/mutated;
- inactivation does not rewrite old Journeys;
- removing a Project Employee does not delete the global USER;
- replacing a role does not erase historical mapping audit;
- moving an Outlet map pin does not alter historical evidence provenance;
- a new Product Master does not change prior Journey SKU semantics.

---

## 11. Cross-module integration tests required before UC02 release

1. Create Project → Security Tenant created once in `CONFIGURING`.
2. Same canonical internal ID is represented by Audit Core Project and DI Tenant/config.
3. Duplicate create/retry does not create a second Project.
4. Failed Audit Core provisioning is recoverable.
5. Failed DI provisioning is recoverable.
6. Project cannot activate on partial provisioning.
7. Dealer / Outlet CRUD remains Tenant-isolated.
8. Outlet map coordinate update persists correctly.
9. Employee can be in Project without role if OPEN-02 is approved.
10. Role Mapping updates Security role and Audit Core business scope consistently.
11. Partial role-mapping failure is reconciled rather than leaving silent split-brain state.
12. Product/Price/Discount upload requires explicit WEF.
13. Excel upload does not write authoritative master data before confirmation.
14. Published master remains immutable.
15. Project Readiness reflects current state across all required areas.
16. Activation succeeds only after readiness passes.
17. Post-activation updates follow approved mutability constraints.
18. Delete/inactivate/end-date behaviour follows OPEN-03 exactly.
19. Start Fresh is rejected for any Project that has ever been ACTIVE or has operational data.
20. Start Fresh retry/partial-failure recovery is idempotent and zero-state verified.

---

## 12. Proposed implementation order across repositories

### Increment P0 — Contract/design reconciliation

Owners: Web + Security + Audit Core + DI

- answer OPEN decisions;
- update/supersede conflicting solution-design statements;
- freeze API contracts before code;
- add/update permission catalogue entries only from approved module contracts; do not invent permission keys.

### Increment P1 — Security UC02 prerequisites

- server-generated internal Tenant Code;
- membership API if approved;
- verify role PUT/DELETE and Tenant activation behaviour;
- orchestration state only if Security chosen as owner;
- tests.

### Increment P2 — Audit Core Project landscape

- idempotent Project provisioning;
- full Project read/update;
- Dealer request corrections;
- Outlet map fields;
- business-assignment API;
- permission and optimistic-concurrency enforcement;
- lifecycle/delete policy from OPEN-03;
- tests.

### Increment P3 — Audit Core Product/Master redesign

- approve Product Master data model;
- migration;
- master route registration;
- Excel import/staging/preview/confirm;
- WEF/overlap validation;
- history/audit;
- tests.

### Increment P4 — DI UC02 delta

- new decision superseding D5 for Audit-originated documents;
- storage-context model/path builder;
- explicit provisioning/status if required;
- DI Excel master import layer if approved;
- Start Fresh preflight/purge if in UC02;
- tests.

### Increment P5 — Web UC02 implementation

- frozen screens;
- update/remove actions;
- module integrations;
- recovery UI;
- readiness.

### Increment P6 — Cross-module E2E / destructive test gate

- DEV migration verification;
- full happy path;
- fault injection at every provisioning/mapping/master/purge boundary;
- delete/lifecycle isolation tests;
- zero-state checks;
- regression against UC001 login/onboarding.

---

## 13. OPEN owner decisions — implementation must not guess

### OPEN-01 — Which component orchestrates Project creation across Security + Audit Core + DI?

Conflict:

- current Web stack says browser calls Audit Core only and has no dedicated application server;
- Security v2.0 permits a Web BFF/API to orchestrate Security + Audit Core;
- Security admin Tenant creation is human-admin-only and rejects ServiceIntegration callers.

**Recommendation:** approve a lightweight server-side Web BFF/API orchestration capability consistent with the newer Security v2.0 design, and explicitly revise the older Web stack boundary. If not approved, an alternative must be designed without weakening Security's human-admin endpoint rule.

### OPEN-02 — Who owns “Employee added to Project but no role yet” membership?

**Recommendation:** Security owns durable Tenant/Project membership independent of operating role, because Security owns Tenant authorization context and global USER identity. Audit Core continues to own only Dealer/Outlet business scope.

Confirm or choose Audit Core as membership owner.

### OPEN-03 — Exact delete semantics for UC02 setup entities

Please confirm whether this policy is correct:

- true hard delete is allowed only before activation and only for unreferenced setup/DRAFT data;
- once active/referenced/published, use inactivate/end-date/retire/remove mapping instead of physical delete;
- published masters are never hard-deleted;
- global USER is never deleted when removed from Project;
- whole Project hard deletion remains Phase 2 approval flow.

If hard delete is required after activation, Audit Core v2.1 solution/API/database no-delete decisions must be explicitly superseded first.

### OPEN-04 — Which Project fields may change after activation?

**Recommendation:**

- Project Name, End Date, Timezone, Region: editable with audit history;
- OEM, Product Category, Effective Start Date: editable only before operational Journeys or published dependent masters exist; afterwards reject change unless a separately approved migration/rebaseline process is used.

Confirm.

### OPEN-05 — Product Master scope

Frozen UC02 requires Product Master to be effective-dated and Project-managed.

Please confirm whether two Projects using the same OEM may have different Product Master versions / sellable SKU sets.

**Recommendation:** yes; retain stable platform OEM/product reference identity where useful, but add a Project-effective Product Catalogue/version layer rather than mutating global product rows.

### OPEN-06 — Google Maps provider

The frozen requirement is a map/Places-style Outlet picker. Current Web V1 stack has a zero-cost guardrail and does not yet approve a paid Maps SDK.

Confirm whether Google Maps/Places is the approved provider and whether its Place ID should be persisted in Audit Core in addition to address/lat/long.

### OPEN-07 — PC coverage as activation blocker

Existing Security/Audit design deferred staffing/cardinality enforcement. Frozen UC02/readiness discussion expects Dealer Outlet PC coverage.

Confirm whether readiness must enforce:

`every ACTIVE Dealer Outlet has at least one ACTIVE PC mapping`

as a **blocking** activation rule.

### OPEN-08 — Effective master overlap policy

Current Price List resolver can select the highest version number if multiple PUBLISHED versions overlap a date. UC02 requires diligent master governance.

**Recommendation:** prevent overlapping PUBLISHED effective periods for the same Project/master scope unless the new version explicitly supersedes/ends the prior version in one controlled operation.

Confirm.

---

## 14. Definition of done for UC02

UC02 is complete only when:

- frozen approved UI is implemented without visual regression from UC001;
- all normal setup and approved update/removal flows are backed by real APIs;
- no UI relies on mocked Project/Dealer/Employee/Master state;
- API contracts are committed in owning repos;
- Security/Audit Core/DI source-design conflicts are explicitly superseded or reconciled;
- Project provisioning is idempotent and recoverable;
- Project Readiness is cross-module and blocks incomplete activation;
- Product Master is version-safe and historically reproducible;
- DI Audit storage hierarchy is implemented through trusted Audit Core context;
- destructive/lifecycle behaviour follows the approved delete policy;
- destructive tests, fault injection and cross-Tenant isolation tests pass;
- full DEV end-to-end flow passes from login → Project creation → setup → masters → readiness → activation → later update;
- documentation, OpenAPI, migrations and runbooks match the deployed implementation.
