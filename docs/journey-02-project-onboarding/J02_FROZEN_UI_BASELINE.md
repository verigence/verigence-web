# Journey 02 — Project Onboarding UI Baseline

**Status:** FROZEN / APPROVED FOR CONTINUATION  
**Frozen on:** 21-Aug-2026  
**Branch:** `planning/uc-001-user-onboarding`

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

## Frozen interaction rules

### Project Details

- UI terminology is **Project**, never Tenant.
- OEM, Product Category, Timezone and Region / Geography are dropdown/select controls.
- Dates use date pickers.
- Internal IDs/codes are platform generated and are not editable business fields.

### Dealers

- Dealer has no latitude/longitude fields.
- Dealer can be created and edited after Project activation.

### Dealer Outlets

- Use **Dealer Outlet**, not Dealer Location.
- Outlet owns `ONSITE | SATELLITE` classification.
- Exact Outlet location is selected using Google Maps / Places style search and map pin.
- Persist selected address plus latitude/longitude.
- Outlet can be created/edited/inactivated after Project activation.

### Employees

- First add an approved Verigence **Employee to Project**.
- An Employee may initially exist in the Project without a role mapping.
- Role assignment is the next separate task.

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

Role mappings must remain editable/end-dateable after go-live.

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
13. Published historical versions are immutable.

### Special rule — Product Master

**Product Master must be handled as ongoing, effective-dated operational master data.**

Models, variants, colours, SKUs and related attributes will continue changing during the Project lifecycle. Therefore:

- repeated Product Master uploads are supported;
- every upload carries explicit WEF;
- parsed data is previewed before confirmation;
- published historical Product versions are never overwritten;
- historical Journeys retain the Product/SKU meaning that applied at their time;
- Price Lists and Discount Schemes must reference Product SKUs valid for their own effective period;
- upload file hash, WEF, validation result, confirmation and publication history must be retained.

This requires an explicit Audit Core design/model treatment rather than silently mutating static platform product-reference rows.

### Project Readiness

Project Readiness is the complete onboarding gate and covers at minimum:

- background module provisioning state;
- Project setup;
- Dealers and Dealer Outlets;
- Outlet coordinates/location completeness;
- Employees;
- PM/PC/TL/CRM/Executive mappings and required coverage;
- Project Master effective/published versions;
- DI prerequisites/internal storage hierarchy availability.

Activation remains blocked until all blocking readiness checks pass.

## Post-activation behaviour

The same screens remain available to SuperAdmin as **Project Administration**. They are not discarded after first-time onboarding.

SuperAdmin must be able to make controlled later changes to:

- allowed Project details;
- Dealers;
- Dealer Outlets and map placement;
- Project Employees;
- Role Mappings;
- effective-dated Project Masters;
- Readiness checks.

Backend APIs must therefore support ongoing create/read/update/version-history behaviour, not create-only onboarding calls.

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
