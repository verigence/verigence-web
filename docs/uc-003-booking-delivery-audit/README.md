# UC03 — Booking & Delivery Audit — Web/Android Planning Pointer

**Planning branch:** `planning/uc-003-booking-delivery-audit`  
**Frozen baseline:** `dev@2c98f753ed1428c0d5f7a0b7144169d528a5bb78`

The canonical UC03 business/workflow/implementation design set is maintained in:

`verigence-audit-core / planning/uc-003-booking-delivery-audit / docs/uc-003-booking-delivery-audit/`

Current canonical Audit Core documents include:

- `UC03_SOLUTION_DESIGN_v1.1.md`
- `UC03_WORKFLOW_STATE_EVENT_CATALOG_v1.1.md`
- `UC03_RULE_FLAG_CATALOG_v1.0.md`
- `UC03_DOCUMENT_123_FIELD_MATRIX_v1.0.md`
- `UC03_RECONCILIATION_DECISIONS_v1.0.md`
- `UC03_IMPLEMENTATION_DESIGN_v0.1.md`

## Web/Android planning artifacts

1. [`UC03_UX_FLOW_CONTRACT_v0.1.md`](./UC03_UX_FLOW_CONTRACT_v0.1.md) — original Android-first screen/state interaction contract.
2. [`UC03_ANDROID_WEB_MOCKUPS_v0.1.html`](./UC03_ANDROID_WEB_MOCKUPS_v0.1.html) — static design-review pack.
3. [`UC03_UX_REVIEW_NOTES_v0.2.md`](./UC03_UX_REVIEW_NOTES_v0.2.md) — **accepted review amendment**; supersedes conflicting v0.1 mockup/UX details.

## Accepted UX amendment v0.2

Implementation must incorporate these corrections:

- use the existing approved `src/assets/verigenceLockup.ts` asset; the static mockup logo placeholder is not normative;
- PC/TL/PM Project context is resolved before operational landing;
- if exactly one Project is available, select it automatically;
- if more than one is available, the first operational screen is **Choose Project**;
- operating role belongs to the selected Project context because the same user can hold different roles across Projects;
- replace **Deliveries Today** with **Delivery In Progress**;
- replace generic `Recent Journeys` with **Latest Bookings & Deliveries**;
- default/latest list is limited to **10 transactions per page**;
- provide **All / Bookings / Deliveries** plus date/date-range filtering;
- return filtered results in pages of 10;
- Project timezone governs date boundaries;
- further pixel/content refinements are expected during Android/tablet/Web UAT.

## Web/Android responsibility

Web/Android owns the user experience only:

- conditional Project selection/switching;
- PC/TL/PM Project-scoped landing;
- Create/Open Booking;
- Booking capture;
- Delivery capture;
- document upload and Android camera interactions;
- extraction progress and proposal review;
- Audit Flag raise/remark presentation;
- TL/PM/Executive review screens;
- adaptive/mobile presentation and user-safe wording.

Web/Android does **not** own authoritative business-state transitions, Project authorization or compliance logic.

## UC03 UX direction

- PC-facing UI uses **Booking** and **Delivery**, never “Journey Workspace”.
- Android phone is primary; Android tablet is second; desktop Web uses the same workflow/components.
- Booking and Delivery can overlap.
- Delivery business status is **Started -> In Progress -> Completed** only.
- After physical Delivery Completed, Delivery Audit may remain In Progress.
- Progression with incomplete Booking/Delivery audit conditions is recorded normally; Audit Core returns resulting flags.
- document extraction is asynchronous: upload first, continue PC-only work, show per-document state, progressively surface proposals;
- extracted values never silently overwrite PC-entered/accepted values;
- Aadhaar is masked in the planned UX;
- VIN/chassis reconciliation result comes from Audit Core Rule Engine only;
- applicable document counts are dynamic;
- no technical/internal backend messages are shown to users;
- Post-Delivery reconciliation UI is out of Phase-1 scope.

## Current planning gate

`UC03_IMPLEMENTATION_DESIGN_v0.1.md` is now the next cross-module review artifact. No React/API/database/DI/native production implementation is authorized until the Implementation Design is approved and the final UC03 Implementation Handoff is created.
