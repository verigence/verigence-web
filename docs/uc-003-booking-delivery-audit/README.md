# UC03 — Booking & Delivery Audit — Web/Android Pointer

**UC03 canonical planning branch:** `planning/uc-003-booking-delivery-audit`  
**Original frozen baseline:** `dev@2c98f753ed1428c0d5f7a0b7144169d528a5bb78`  
**Documentation/status refreshed:** `2026-08-25`

The canonical UC03 business/workflow/implementation and execution-status set is maintained in:

`verigence-audit-core / planning/uc-003-booking-delivery-audit / docs/uc-003-booking-delivery-audit/`

Current canonical Audit Core documents include:

- `UC03_SOLUTION_DESIGN_v1.1.md`
- `UC03_WORKFLOW_STATE_EVENT_CATALOG_v1.1.md`
- `UC03_RULE_FLAG_CATALOG_v1.0.md`
- `UC03_DOCUMENT_123_FIELD_MATRIX_v1.0.md`
- `UC03_RECONCILIATION_DECISIONS_v1.0.md`
- `UC03_IMPLEMENTATION_DESIGN_v0.1.md`
- `UC03_IMPLEMENTATION_HANDOFF_v1.1.md` — approved execution contract
- `UC03_EXECUTION_BASELINE_ADDENDUM_2026-08-23.md` — active stabilization/continuity override
- `UC03_UI_LAYOUT_AMENDMENT_2026-08-25.md` — dated UI-only refinement pointer
- `status/UC03_C0_FOUNDATION.md`
- `status/UC03_C1_BOOKING.md`
- `status/UC03_C2_DELIVERY.md`
- `status/UC03_C3_AUDIT.md`
- `status/UC03_PHASE1_PRODUCT_BASELINE.md`

## Branch / integration note — 25-Aug-2026

The designated UC03 planning branch remains `planning/uc-003-booking-delivery-audit`. The current Web `dev` branch, however, already contains later UC03 UI integration from the recent Booking/mobile/capture PRs and is therefore the active UI comparison baseline.

Do **not** bulk-merge all of `dev` into the UC03 planning branch merely to catch it up: `dev` also contains unrelated product work. Reconciliation back to planning must be UC03-scoped and deliberate.

The Phase 1 / Phase 2 UI refinement recorded below is implemented against the current `dev` integration baseline. It changes presentation and client loading behavior only; it does not change Audit Core workflow authority.

## Execution checkpoints

Feature checkpoints remain:

```text
C0 Foundation / Project Context
        ->
C1 Booking
        ->
C2 Delivery
        ->
C3 Audit / Review / Hardening
        ->
Full C0-C3 product regression + consolidated DEV/UAT
        ->
Phase-1 stable product baseline
```

Working shorthand **C4** means only the final full-product regression/DEV-UAT baseline. It is not a new business checkpoint and must not introduce new functionality or a new migration merely for naming symmetry.

## Web/Android design artifacts

1. [`UC03_UX_FLOW_CONTRACT_v0.1.md`](./UC03_UX_FLOW_CONTRACT_v0.1.md) — original Android-first screen/state interaction contract.
2. [`UC03_ANDROID_WEB_MOCKUPS_v0.1.html`](./UC03_ANDROID_WEB_MOCKUPS_v0.1.html) — original static design-review pack.
3. [`UC03_UX_REVIEW_NOTES_v0.2.md`](./UC03_UX_REVIEW_NOTES_v0.2.md) — accepted 22-Aug review amendment.
4. [`UC03_UI_LAYOUT_AMENDMENT_2026-08-25.md`](./UC03_UI_LAYOUT_AMENDMENT_2026-08-25.md) — current Phase 1 / Phase 2 UI layout and interaction baseline.
5. [`UC03_PC_UI_MOCKUPS_2026-08-25.html`](./UC03_PC_UI_MOCKUPS_2026-08-25.html) — updated reference mockup board for PC Overview, compact/expanded work rows, Capture New Booking, Booking Workspace and mobile consistency.

Where visual/layout guidance conflicts, the 25-Aug amendment takes precedence. It does not supersede authoritative Audit Core workflow/state/security contracts.

## Phase 1 — PC landing/dashboard visual refactor

Phase 1 is implemented as a visual/information-hierarchy refinement with no backend/API redesign.

It covers:

- selected Project + Process Coordinator workspace identity;
- Dealer / Outlet context close to the page title;
- visible **Capture New Booking** primary action;
- operational KPI cards for Bookings In Progress, Delivery In Progress, Needs Attention and Audit Flags;
- actionable Booking/Delivery KPI filters;
- **Latest Bookings & Deliveries** as the primary work surface;
- cleaner spacing, card/row styling and responsive density;
- Booking as the primary transaction action, with Delivery and Audit Review secondary;
- Booking Workspace header/presentation aligned to the same UC01-derived visual baseline;
- approved Verigence lockup, blue/teal palette, typography and enterprise visual language preserved.

## Phase 2 — interaction refinement

Phase 2 is implemented on top of Phase 1 and covers:

- progressive/lazy loading of the server-paged work list;
- API page size remains bounded at 10 transactions while the client appends subsequent pages;
- automatic next-page loading near the end of the list plus an explicit **Load more** fallback;
- simplified All / Bookings / Deliveries + From/To date filter treatment;
- compact work rows by default for fast scanning;
- **View details / Hide details** in-place expansion;
- expanded Booking/Delivery audit state, flags, document-processing count and proposal-ready count;
- consistent content hierarchy across desktop Web, tablet and Android phone;
- mobile secondary actions retained behind the compact More action;
- no change to server-returned permitted actions or workflow authority.

## Web/Android responsibility

Web/Android owns presentation and interaction only:

- Project and PC Outlet selection/switching;
- Project/Outlet-scoped landing;
- Capture/Open Booking;
- Booking capture;
- Delivery capture;
- document upload and Android camera interactions;
- extraction progress and proposal review;
- Audit Flag presentation/creation actions;
- TL/PM/Executive review screens;
- adaptive/mobile presentation and user-safe wording.

Web/Android does not own authoritative workflow transitions, Project authorization, VIN decisions, completion-guard policy or other compliance logic.

## Frozen UX / authority direction

- PC-facing UI says Booking/Delivery, not Journey Workspace;
- Android phone is primary, tablet second, desktop Web third;
- Delivery lifecycle is Started -> In Progress -> Completed only;
- Delivery can begin while Booking audit remains incomplete; the server records the flag and UI continues Delivery;
- physical Delivery Completed may coexist with Delivery Audit In Progress;
- extraction is asynchronous: upload first, keep working, surface progressive proposals;
- extracted data never silently overwrites accepted/PC-entered values;
- Aadhaar is masked in ordinary UX;
- VIN/chassis reconciliation comes only from Audit Core Rule Engine;
- applicable document counts are dynamic;
- human flag creation cannot self-declare an Audit completion guard;
- lifecycle buttons follow server-returned permitted actions; Web/Android is not the permission authority;
- no raw technical/internal errors are shown to users;
- Post-Delivery reconciliation is out of Phase-1 scope.

## CI/CD stabilization rule

Per the Audit Core execution addendum, **do not redesign or materially change CI/CD while UC03 is being stabilized**.

Provider throttling/outage or checkpoint-validation inconvenience is recorded as an external blocker and retried using the existing baseline. Railway/GitHub/Cloudflare deployment architecture, credential strategy, workflow trust and promotion design are not to be changed merely to unblock UC03.

A CI/CD architecture review may begin only after UC03 is stable following full C0-C3 regression and consolidated human DEV/UAT.

## Current Web/Android status — 25-Aug-2026

C0-C3 Web engineering remains present, including Project context, Booking, Delivery, Audit/History and cross-stage timeline presentation.

The current `dev` UI baseline also contains the PC landing/capture/Booking visual refinements from the recent UC03 PRs. Phase 1 and Phase 2 of the 25-Aug UI refinement are now represented in the runtime source and dated reference documentation.

Automated build/visual/native status must be taken from the CI runs for the relevant commits. **Human UAT remains pending**; no automated result is to be recorded as a human-UAT pass.
