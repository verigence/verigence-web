# Verigence UC03 — PC UI Layout Amendment

**Document ID:** `VUC03-UXR-002`  
**Status:** IMPLEMENTATION BASELINE / UAT PENDING  
**Date:** 2026-08-25  
**Applies to:** PC Landing / Dashboard, Capture New Booking, Booking Workspace presentation  
**Supersedes:** conflicting visual/layout details in `UC03_ANDROID_WEB_MOCKUPS_v0.1.html` and `UC03_UX_REVIEW_NOTES_v0.2.md` only  
**Does not change:** UC03 authoritative workflow states, server permissions, audit semantics, completion guards, or Phase-1 business scope

---

## 1. Purpose

This amendment records the UI direction agreed during the 25-Aug-2026 UC03 review and the implementation split into Phase 1 and Phase 2.

The product remains evidence-first and audit-led. The UI must help the Process Coordinator move through work with the least possible manual entry and without exposing internal workflow/tenant identifiers as business labels.

The approved Verigence lockup, blue/teal palette, typography and enterprise visual language remain unchanged.

---

## 2. Phase 1 — visual refactor

Phase 1 is a presentation and information-hierarchy refactor. It does **not** require a backend/API redesign.

### 2.1 PC landing / dashboard

The landing page shall use this hierarchy:

1. selected Project and operating role;
2. selected Dealer / Outlet context;
3. primary PC action — **Capture New Booking**;
4. KPI summary — Bookings In Progress, Delivery In Progress, Needs Attention, Audit Flags;
5. Latest Bookings & Deliveries work list;
6. filters immediately above the list.

### 2.2 KPI treatment

KPI cards are compact operational summaries, not decorative tiles.

- Bookings In Progress and Delivery In Progress are actionable filters.
- Needs Attention and Audit Flags use restrained attention styling only when non-zero.
- KPI cards remain readable on phone, tablet and desktop without changing metric meaning.

### 2.3 Work item treatment

Each work item prioritizes:

- Booking reference;
- customer name;
- vehicle/product label;
- Dealer / Outlet;
- Booking status;
- open Audit Flag indicator;
- latest meaningful activity;
- direct Open Booking behavior.

Delivery and Audit Review remain secondary actions.

### 2.4 Booking Workspace header

Booking Workspace uses the same visual system as the PC landing:

- customer/booking identity first;
- business status second;
- document/evidence progress as working context;
- action hierarchy that keeps the next required PC task obvious.

---

## 3. Phase 2 — interaction refinement

Phase 2 builds on the Phase 1 layout without changing UC03 workflow authority.

### 3.1 Progressive / lazy work loading

The work-list API continues to return bounded pages of up to 10 transactions. The client now progressively appends the next server page as the user approaches the end of the list.

Requirements:

- no unbounded Project history fetch;
- no client-side fake pagination over a full history set;
- first result set remains fast and bounded;
- an explicit **Load more** action remains as an accessibility/fallback control;
- filter changes reset the infinite-query dataset automatically through the query key.

### 3.2 Cleaner filters

The filter area is reduced to:

```text
All | Bookings | Deliveries
From [date]  →  To [date]   Clear dates
```

On smaller screens, the two date controls become a two-column row and then naturally fit the available width. Date semantics remain Project-timezone based and server-backed.

### 3.3 Compact and expanded work rows

Work items default to a compact state so a PC can scan more work with less scrolling.

Compact state shows:

- Booking reference;
- customer;
- vehicle;
- Dealer / Outlet;
- Booking status;
- open-flag summary;
- latest activity;
- Open Booking affordance.

**View details** expands the same row in place and adds:

- Booking business/audit state;
- Delivery business/audit state;
- total/open Audit Flags;
- highest severity when present;
- processing document count;
- extraction proposal-ready count;
- Delivery and Audit Review actions.

The expanded state is presentation-only and does not alter the transaction.

### 3.4 Mobile / Web consistency

The same content model is used on Android phone, tablet and desktop Web.

- desktop exposes secondary actions inline;
- mobile keeps secondary actions behind a compact More control;
- View details is available on both;
- the primary Booking journey stays one tap/click away;
- spacing and touch targets remain mobile-first while preserving desktop density.

---

## 4. Reference mockups

The 25-Aug-2026 reference board is:

`UC03_PC_UI_MOCKUPS_2026-08-25.html`

It covers:

1. PC Overview / Landing;
2. compact and expanded Latest Bookings & Deliveries rows;
3. Capture New Booking;
4. Booking Workspace document/evidence review direction;
5. mobile treatment of the same hierarchy.

The mockup is a **reference artifact**, not a pixel-by-pixel runtime specification. React/CSS implementation and accessibility behavior remain authoritative for the running product.

---

## 5. Implementation mapping

| Area | Runtime implementation |
|---|---|
| PC landing / metrics / filters / work list | `src/pages/DashboardPage.tsx` |
| Phase 2 progressive rows | `src/pages/DashboardPage.tsx` |
| Phase 2 visual refinements | `src/styles/uc03-phase2-worklist.css` |
| Existing PC product polish | `src/styles/uc03-pc-product-polish.css` |
| Capture New Booking | `src/pages/CreateBookingPage.tsx` |
| Booking Workspace | `src/pages/BookingWorkspacePage.tsx` |
| Document-centric review | `src/features/uc03/BookingDocumentDetails.tsx` |
| UC03 landing/work-list API | `src/services/audit-core/uc03.ts` |

---

## 6. Non-goals / guardrails

This amendment must not be interpreted as permission to:

- change workflow state transitions in Web/Android;
- bypass server-returned permitted actions;
- make extracted values silently overwrite accepted or PC-entered values;
- broaden Project/Outlet authorization;
- expose raw tenant/journey identifiers as business UI;
- add Security or protected-identity changes merely for this UI refactor;
- change the frozen Phase-1 document/audit boundary.

---

## 7. Validation status

As of **2026-08-25**:

- Phase 1 layout direction: IMPLEMENTED in the current `dev` UI baseline;
- Phase 2 progressive loading / compact-expanded work rows / filter refinement: IMPLEMENTED in `dev`;
- static reference mockup: ADDED;
- automated build/visual/native validation: must be taken from the CI results for the commits containing this amendment;
- human UAT: **PENDING** and must not be inferred from automated validation.
