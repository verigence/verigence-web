# Journey 02 — Project Onboarding UI Baseline

**Status:** FROZEN / APPROVED FOR CONTINUATION  
**Frozen on:** 21-Aug-2026  
**Revised:** 21-Aug-2026 — owner decisions on admin routing, delete, employee assignment, Maps and readiness  
**Branch:** `planning/uc-002-project-onboarding`

This document freezes the approved visual and interaction baseline for Journey 02 so future implementation and design work continues from the same agreed screens.

## Visual baseline

Journey 02 must continue directly from the existing Verigence login and UC-001 onboarding experience.

Required visual language:

- Deep navy → blue → teal branded background around the main application surface.
- Large rounded white floating application surface with soft shadow.
- Approved Verigence lockup/logo treatment.
- Navy headings and primary CTA buttons.
- Teal accents for active steps, completion, focus and positive states.
- Generous whitespace, restrained borders and rounded controls.
- Avoid generic grey enterprise-dashboard styling.
- Keep the left **Project Setup Journey** task rail visible through the onboarding flow.

## Frozen first-time sequence

1. Project Details
2. Dealers
3. Dealer Outlets
4. Employees
5. Role Mapping
6. Project Masters
7. Project Readiness
8. Activate Project from Project Readiness

Security, Audit Core and Document Intelligence provisioning is automatic and does **not** appear as a normal onboarding step. A technical recovery screen is shown only if background provisioning fails.

## Cross-module admin-call rule

The browser continues to call Audit Core as its backend boundary for UC02.

There are two different backend call modes and they must not be mixed:

1. **Human administrative operation** — create/update/delete/activate or another SuperAdmin-controlled administrative action. Audit Core passes the same Security-issued human Bearer token/identity through to the owning downstream administrative API. The downstream module performs its own current authorization check. A ServiceIntegration token must not replace the human identity for that administrative action.
2. **Machine/integration operation** — ordinary module-to-module processing, background integration or Security authorization-check calls. These use the registered ServiceIntegration token appropriate to the target audience.

No separate Web BFF is required for UC02 by this decision.

## Frozen interaction rules

### Project Details

- UI terminology is **Project**, never Tenant.
- OEM, Product Category, Timezone and Region / Geography are dropdown/select controls.
- Dates use date pickers.
- Internal IDs/codes are platform generated and are not editable business fields.
- After operational Journeys or dependent published masters exist, OEM, Product Category and Project Start Date are not directly editable; a later migration/rebaseline process is required.
- Project Name, End Date, Timezone and Region / Geography remain controlled editable fields with audit history.

### Dealers

- Dealer has no latitude/longitude fields.
- Dealer can be created and edited after Project activation.
- Phase 1 provides SuperAdmin hard delete for administrative rollback, subject to backend dependency/preflight rules and explicit confirmation.

### Dealer Outlets

- Use **Dealer Outlet**, not Dealer Location.
- Outlet owns `ONSITE | SATELLITE` classification.
- Google Maps / Places search and map pin is the approved map provider, but using the map is **optional** in Phase 1.
- Manual address entry remains valid when Maps is not used or is unavailable.
- When a Google Place is selected, persist the returned Google Place ID together with selected address and available latitude/longitude. Google Place ID is nullable/optional.
- Missing Google Place ID or map coordinates alone does not block Project activation.
- Outlet can be created/edited after Project activation.
- Phase 1 provides SuperAdmin hard delete for administrative rollback, subject to backend dependency/preflight rules and explicit confirmation.

### Employees

Security is not being redesigned to create a second independent Project-membership model for UC02.

- Select an approved global Verigence Employee.
- Phase 1 Project association is represented by the existing Security Tenant operating-role assignment.
- There is no new durable `Employee in Project with no role` backend state in Phase 1.
- The Employees step may select/search the Employee, while the Role Mapping save performs the persisted Tenant role assignment.
- Removing the Employee from this Project removes the applicable Project role/business mappings; it must never delete the global Verigence USER.

### Role Mapping

Selection controls:

- Employee Name
- Role
- Dealer
- Dealer Outlet

Business mapping rules:

- PC → Dealer Outlet(s)
- TL → Dealer(s), covering all Outlets under those Dealers
- PM → whole Project
- CRM → Dealer(s) or whole Project
- Executive → whole Project

Role mappings must remain editable/removable after go-live.

For Project Readiness, **every ACTIVE Dealer Outlet must have at least one ACTIVE PC mapping**. This is a blocking activation rule in Phase 1.

### Project Masters

Project Masters are a permanent administration capability, not a one-time setup screen.

Every Excel-driven master upload follows:

1. Select Module.
2. Select Master.
3. SuperAdmin explicitly selects **WEF / Valid From**.
4. WEF starts blank and must never be defaulted by UI or backend.
5. Download/use the owning module's Excel template.
6. Upload `.xlsx`.
7. Parse into staging.
8. Validate template and rows.
9. Show parsed data to SuperAdmin before confirmation.
10. Show row-level errors/warnings and error report.
11. Only after explicit confirmation create a DRAFT master version.
12. Publish separately.
13. Published versions remain immutable while the Project exists; Phase-1 whole-Project hard delete may remove Project-scoped history as part of an explicitly confirmed rollback operation.

**Phase-1 overlap rule:** overlapping effective periods are allowed. An overlap may be shown as a warning, but it is not an activation/publish blocker solely because of overlap. Each owning module retains its defined deterministic resolver/selection semantics; UC02 does not invent a new universal precedence rule.

**Phase-2 note:** move to process-oriented master governance that prevents overlapping published effective periods unless a controlled supersede/end-date operation resolves the prior period.

### Special rule — Product Master

**Product Master must be handled as ongoing, effective-dated operational master data.**

Models, variants, colours, SKUs and related attributes will continue changing during the Project lifecycle. Therefore:

- repeated Product Master uploads are supported;
- every upload carries explicit WEF;
- parsed data is previewed before confirmation;
- published Product versions are never overwritten in place;
- historical Journeys retain the Product/SKU meaning that applied at their time while the Project remains live;
- Price Lists and Discount Schemes must reference Product SKUs valid for their own effective period;
- upload file hash, WEF, validation result, confirmation and publication history must be retained.

The exact Product Master scope across Projects using the same OEM remains an explicit open design decision; it must not be guessed before Audit Core data-model work begins.

### Project Readiness

Project Readiness is the complete onboarding gate and covers at minimum:

- background module provisioning state;
- Project setup;
- Dealers and Dealer Outlets;
- optional Outlet map/location enrichment as a warning/completeness indicator, not a standalone blocker;
- Security operating-role assignments;
- PM/PC/TL/CRM/Executive mappings and required coverage;
- **at least one ACTIVE PC for every ACTIVE Dealer Outlet** as a blocking rule;
- Project Master effective/published versions;
- DI prerequisites/internal storage hierarchy availability.

Activation remains blocked until all blocking readiness checks pass.

## Phase-1 hard-delete / rollback rule

Because the product is new, Phase 1 intentionally permits SuperAdmin hard delete for administrative rollback, including after activation when a Project/setup needs to be rebuilt.

The UI must:

- expose Delete on relevant administrative screens;
- show dependency/preflight impact before confirmation;
- require explicit destructive confirmation;
- show durable progress for cross-module Project hard delete/reset;
- never report success before the owning backend(s) confirm deletion;
- use the same authenticated human SuperAdmin identity for downstream administrative delete APIs.

This Phase-1 rule intentionally differs from the earlier Audit Core no-public-delete baseline. The backend design must contain an explicit UC02 administrative-delete amendment before code is implemented.

**Phase 2:** replace broad rollback-oriented hard delete with process-oriented lifecycle, maker/checker, retention and controlled inactivate/retire/supersede semantics.

## Post-activation behaviour

The same screens remain available to SuperAdmin as **Project Administration**. They are not discarded after first-time onboarding.

SuperAdmin must be able to make controlled later changes to:

- allowed Project details;
- Dealers;
- Dealer Outlets and optional map placement;
- Project Employee/role assignments;
- Role Mappings;
- effective-dated Project Masters;
- Readiness checks;
- Phase-1 hard-delete/rollback actions where permitted.

Backend APIs must therefore support ongoing create/read/update/delete/version-history behaviour, not create-only onboarding calls.

## Internal DI rule

There is no SuperAdmin screen to configure DI object-storage hierarchy.

For Audit Core-originated documents, DI automatically follows the agreed trusted business hierarchy:

`Project → Dealer → Dealer Outlet → Customer → Documents`

The browser does not author object-storage paths.

## Frozen mockups

The following files are the visual source of truth for this frozen UI baseline:

- `mockups/01-create-project.png`
- `mockups/02-dealers.png`
- `mockups/03-dealer-outlets.png`
- `mockups/04-employees.png`
- `mockups/05-role-mapping.png`
- `mockups/06-project-masters.png`
- `mockups/07-project-readiness.png`

Future Journey-02 screens should visually continue from these mockups unless this baseline is explicitly superseded by an approved design decision.