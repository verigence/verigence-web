# UC03 — Booking & Delivery Audit — Web/Android Pointer

**Unified UC03 branch:** `planning/uc-003-booking-delivery-audit`  
**Original frozen baseline:** `dev@2c98f753ed1428c0d5f7a0b7144169d528a5bb78`

The canonical UC03 business/workflow/implementation set is maintained in:

`verigence-audit-core / planning/uc-003-booking-delivery-audit / docs/uc-003-booking-delivery-audit/`

Current canonical Audit Core documents include:

- `UC03_SOLUTION_DESIGN_v1.1.md`
- `UC03_WORKFLOW_STATE_EVENT_CATALOG_v1.1.md`
- `UC03_RULE_FLAG_CATALOG_v1.0.md`
- `UC03_DOCUMENT_123_FIELD_MATRIX_v1.0.md`
- `UC03_RECONCILIATION_DECISIONS_v1.0.md`
- `UC03_IMPLEMENTATION_DESIGN_v0.1.md`
- `UC03_IMPLEMENTATION_HANDOFF_v1.1.md` — current execution contract

## Single-branch execution rule

Web/Android implementation continues on this existing UC03 branch. Do not create Booking, Delivery, Audit, Android or separate `work/uc-003-*` branches.

Sequential execution is:

```text
C0 Foundation / Project Context
        ->
C1 Booking
        ->
C2 Delivery
        ->
C3 Audit / Review / Hardening
```

The next checkpoint does not begin until the current checkpoint passes its acceptance gate.

## Web/Android design artifacts

1. [`UC03_UX_FLOW_CONTRACT_v0.1.md`](./UC03_UX_FLOW_CONTRACT_v0.1.md) — original Android-first screen/state interaction contract.
2. [`UC03_ANDROID_WEB_MOCKUPS_v0.1.html`](./UC03_ANDROID_WEB_MOCKUPS_v0.1.html) — static design-review pack.
3. [`UC03_UX_REVIEW_NOTES_v0.2.md`](./UC03_UX_REVIEW_NOTES_v0.2.md) — accepted review amendment; supersedes conflicting v0.1 mockup/UX details.

## Accepted UX amendment

Implementation must:

- reuse `src/assets/verigenceLockup.ts` for the approved Verigence identity;
- resolve Project context before PC/TL/PM operational landing;
- auto-select exactly one available Project;
- show Choose Project when more than one is available;
- bind operating role to selected Project;
- use **Delivery In Progress**, not Delivery Today;
- use **Latest Bookings & Deliveries**;
- default to latest 10 transactions;
- provide All / Bookings / Deliveries + date/date-range filtering;
- keep results at 10 per page;
- use Project timezone for date boundaries;
- allow further UX refinement during Android/tablet/Web UAT.

## Web/Android responsibility

Web/Android owns presentation and interaction only:

- Project selection/switching;
- Project-scoped landing;
- Create/Open Booking;
- Booking capture;
- Delivery capture;
- document upload and Android camera interactions;
- extraction progress and proposal review;
- Audit Flag presentation/creation actions;
- TL/PM/Executive review screens;
- adaptive/mobile presentation and user-safe wording.

Web/Android does not own authoritative workflow transitions, Project authorization or compliance logic.

## Frozen UX direction

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
- no raw technical/internal errors are shown to users;
- Post-Delivery reconciliation is out of Phase-1 scope.

## Immediate implementation gate

Start with **C0 Foundation / Project Context only** on this same branch. Booking implementation begins only after the C0 checkpoint note is closed.
