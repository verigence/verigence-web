# UC03 — Booking & Delivery Audit — Web/Android Planning Pointer

**Planning branch:** `planning/uc-003-booking-delivery-audit`  
**Frozen baseline:** `dev@2c98f753ed1428c0d5f7a0b7144169d528a5bb78`

The canonical UC03 cross-module Solution Design and Workflow Manager model are maintained in:

`verigence-audit-core / planning/uc-003-booking-delivery-audit / docs/uc-003-booking-delivery-audit/`

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
- Android phone is the primary PC target; Android tablet is second; desktop Web is third.
- Booking and Delivery can overlap: Delivery may start while Booking remains In Progress.
- Such progression is displayed and captured normally; Audit Core returns the resulting flag state.
- Document extraction is asynchronous: upload first, continue user-only work, show per-document state, progressively surface extracted proposals.
- Extracted values never silently overwrite PC-entered/accepted values.
- No technical/internal backend messages are shown to users.
- Post-Delivery reconciliation UI is out of Phase-1 scope.

Mockups are intentionally deferred until the canonical UC03 Solution Design and Workflow Manager model are approved.

No Web/Android production implementation is authorized by this planning pointer.
