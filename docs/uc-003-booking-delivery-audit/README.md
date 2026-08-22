# UC03 — Booking & Delivery Audit — Web/Android Planning Pointer

**Planning branch:** `planning/uc-003-booking-delivery-audit`  
**Frozen baseline:** `dev@2c98f753ed1428c0d5f7a0b7144169d528a5bb78`

The canonical UC03 business/workflow design set is maintained in:

`verigence-audit-core / planning/uc-003-booking-delivery-audit / docs/uc-003-booking-delivery-audit/`

Current canonical documents:

- `UC03_SOLUTION_DESIGN_v1.1.md`
- `UC03_WORKFLOW_STATE_EVENT_CATALOG_v1.1.md`
- `UC03_RULE_FLAG_CATALOG_v1.0.md`
- `UC03_DOCUMENT_123_FIELD_MATRIX_v1.0.md`
- `UC03_RECONCILIATION_DECISIONS_v1.0.md`

## Web/Android planning artifacts

1. [`UC03_UX_FLOW_CONTRACT_v0.1.md`](./UC03_UX_FLOW_CONTRACT_v0.1.md) — screen/state interaction contract.
2. [`UC03_ANDROID_WEB_MOCKUPS_v0.1.html`](./UC03_ANDROID_WEB_MOCKUPS_v0.1.html) — static design-review pack with Android phone, Android tablet and desktop Web states.

The mockup pack currently covers:

### Android phone

- My Work;
- Booking capture while extraction runs;
- extraction proposal review;
- Booking verification/conclusion;
- Delivery Start while Booking remains incomplete;
- Delivery document checklist and camera/photo capture;
- Audit Flags and human flag creation;
- Delivery Completed while Audit remains In Progress.

### Android tablet

- TL/PM master-detail Audit Flag review.

### Desktop Web

- Booking workspace;
- Delivery workspace.

## Web/Android responsibility

Web/Android owns the user experience only:

- PC My Work;
- Create/Open Booking;
- Booking capture;
- Delivery capture;
- document upload and Android camera interactions;
- extraction progress and proposal review;
- flag raise/remark presentation;
- TL/PM/Executive review screens;
- adaptive/mobile presentation and user-safe wording.

Web/Android does **not** own authoritative business-state transitions or compliance logic.

## UC03 UX direction

- PC-facing UI uses **Booking** and **Delivery**, never “Journey Workspace”.
- Android phone is primary; Android tablet is second; desktop Web uses the same workflow/components.
- Booking and Delivery can overlap.
- Delivery business status is **Started -> In Progress -> Completed** only.
- After physical Delivery Completed, Delivery Audit may remain In Progress.
- Progression with incomplete Booking/Delivery audit conditions is recorded normally; Audit Core returns the resulting flag state.
- Document extraction is asynchronous: upload first, continue PC-only work, show per-document state, progressively surface proposals.
- Extracted values never silently overwrite PC-entered/accepted values.
- Aadhaar is masked in the planned UX; raw-retention policy is not invented in the client.
- VIN/chassis reconciliation result comes from Audit Core Rule Engine only.
- Applicable document counts are dynamic; the UI does not hard-code 26 or 29.
- No technical/internal backend messages are shown to users.
- Post-Delivery reconciliation UI is out of Phase-1 scope.

## Current visual framework

The static mockups intentionally retain the current Verigence direction:

- navy/blue/teal palette;
- light mist background;
- white rounded cards;
- existing identity/topbar direction;
- mobile drawer behavior;
- 44–48 px touch targets;
- card-first phone layouts.

They redesign the UC03 work surface, not the entire product shell.

## Approval gate

These are static planning artifacts only. No Web/Android production implementation is authorized yet.

After business/UX approval, create UC03 Implementation Design before changing React routes/components, Audit Core APIs, DI profiles or Android native behavior.
