# UC03 — Booking & Delivery Audit — Web/Android Planning Pointer

**Planning branch:** `planning/uc-003-booking-delivery-audit`  
**Frozen baseline:** `dev@2c98f753ed1428c0d5f7a0b7144169d528a5bb78`

The canonical UC03 design set is maintained in:

`verigence-audit-core / planning/uc-003-booking-delivery-audit / docs/uc-003-booking-delivery-audit/`

Current canonical documents:

- `UC03_SOLUTION_DESIGN_v1.1.md`
- `UC03_WORKFLOW_STATE_EVENT_CATALOG_v1.1.md`
- `UC03_RULE_FLAG_CATALOG_v1.0.md`
- `UC03_DOCUMENT_123_FIELD_MATRIX_v1.0.md`

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

## UC03 UX direction frozen before mockups

- PC-facing UI uses **Booking** and **Delivery**, never “Journey Workspace”.
- Android phone is the primary PC target; Android tablet is second; desktop Web follows the same workflow/components.
- Booking and Delivery can overlap: Delivery may start while Booking remains In Progress.
- Delivery business status is **Started -> In Progress -> Completed**. There is no Delivery Closed state.
- After physical Delivery Completed, Delivery audit work may remain In Progress and the UI must show that distinction clearly.
- Progression with incomplete Booking/Delivery audit conditions is captured normally; Audit Core returns resulting flag state.
- Document extraction is asynchronous: upload first, continue user-only work, show per-document state, progressively surface extracted proposals.
- Extracted values never silently overwrite PC-entered/accepted values.
- The 123-field inventory is now accounted for; legacy generic Status and Observation fields are being replaced/remapped by Workflow/Flag models.
- The provisional document catalogue contains 29 numbered source items pending UAT reconciliation against the source's 26-document wording.
- No technical/internal backend messages are shown to users.
- Post-Delivery reconciliation UI is out of Phase-1 scope.

## Next UI deliverable

After review/reconciliation of the canonical four-document design set, create the complete UC03 mockup pack in this order:

1. Android phone;
2. Android tablet;
3. desktop Web.

No Web/Android production implementation is authorized by this planning pointer.