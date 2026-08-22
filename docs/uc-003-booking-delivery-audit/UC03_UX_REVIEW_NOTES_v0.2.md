# Verigence UC03 — UX Review Notes / Amendment

**Document ID:** `VUC03-UXR-001`  
**Version:** `0.2`  
**Status:** ACCEPTED DESIGN REVIEW AMENDMENT  
**Date:** 2026-08-22  
**Applies to:** `UC03_UX_FLOW_CONTRACT_v0.1.md` and `UC03_ANDROID_WEB_MOCKUPS_v0.1.html`  
**Implementation authority:** none; planning only

---

## 1. Purpose and precedence

This note records business review corrections to the first UC03 Android/Web mockup pack. Where this note conflicts with the v0.1 UX contract or static mockup, **this note wins** for implementation design.

The remaining v0.1 Booking, Delivery, extraction, Audit Flag and review interaction direction remains valid and may be refined during UAT/testing.

---

## 2. UX-REV-01 — Verigence logo

The static mockup representation of the Verigence brand is **not normative** and must not be copied into production.

Implementation SHALL reuse the existing approved Web/Android Verigence lockup asset/component:

```text
src/assets/verigenceLockup.ts
```

That source is already used by the application shell and contains the exact approved bundled lockup pixels.

Implementation rules:

- do not recreate the wordmark with HTML/text;
- do not substitute the placeholder shown in the static mockup;
- do not introduce a separate UC03 logo asset unless the approved master brand itself changes;
- mobile, tablet and desktop UC03 screens use the same approved Verigence identity treatment as the existing application shell.

---

## 3. UX-REV-02 — Project selection is the operational context gate

PC, TL and PM users may work across more than one Project. Project is therefore resolved **before** the operational UC03 landing page.

### 3.1 After successful sign-in

The client requests the authenticated user's available operational Projects.

#### Zero active/authorized Projects

Show a user-safe state:

```text
No active Projects are currently assigned to you.
Please contact your Verigence administrator.
```

No tenant IDs, assignment IDs or Security/internal terminology are shown.

#### Exactly one Project

- select it automatically;
- do not show an unnecessary Project-selection page;
- enter the Project landing/My Work view directly.

#### More than one Project

The first operational screen is:

```text
Choose Project
```

Android phone uses large touch-friendly cards/list rows. Each Project item should show at least:

- Project name;
- user's operating role in that Project;
- optional short OEM/region context when it helps distinguish similarly named Projects.

Example:

```text
Hyundai Punjab Audit
Process Coordinator

Hyundai Delhi Audit
Team Lead
```

The same human may legitimately have a different operating role in different Projects.

### 3.2 Selected Project context

After selection, the client context contains conceptually:

```text
tenantId          internal routing key
projectCode       user-safe secondary reference where useful
projectName
operatingRole     PC | TL | PM | ... for this selected Project
dealer/outlet scope as authorized
```

Dealer/outlet sub-context is cleared when Project is switched.

### 3.3 Switching Project later

For users with more than one Project, provide a low-friction **Switch Project** action in the mobile drawer/header/profile area and desktop shell. Do not force sign-out/sign-in to change Project.

Users assigned to exactly one Project do not need persistent Project-switch chrome.

### 3.4 Current implementation caution

The existing UC02 `ProjectSelector` is a SuperAdmin Project Administration control and its current `/v1/projects` endpoint is not the operational PC/TL/PM project-list contract. UC03 Implementation Design defines a scoped current-user Project read model instead of broadening that admin endpoint.

---

## 4. UX-REV-03 — operational landing terminology

The first mockup incorrectly used **Deliveries Today**.

Replace it with:

```text
Delivery In Progress
```

This metric is a business/work status count, not a calendar count.

Recommended UC03 landing metrics for PC/TL/PM are now:

```text
Bookings In Progress
Delivery In Progress
Needs Attention
Audit Flags
```

Exact metric visibility may vary by selected operating role, but **Delivery Today is not a UC03 status metric**.

---

## 5. UX-REV-04 — landing list is latest Booking + Delivery transactions

The Project landing page shall not present a generic **Recent Journeys** list to PC/TL/PM.

Default list title:

```text
Latest Bookings & Deliveries
```

Each row/card represents the same underlying case and shows the latest Booking and Delivery context together.

Minimum row/card content:

```text
Booking reference
Customer
Vehicle
Dealer / Outlet
Booking business status
Delivery business status or Not Started
Booking Audit State / Audit Status
Delivery Audit State / Audit Status when applicable
Open/total Audit Flag indicator
Latest meaningful activity timestamp
Contextual action
```

Contextual actions include examples such as:

```text
Continue Booking
Start Delivery
Continue Delivery
View Completed Delivery
Review Flags
```

Internal `journey_id` remains an API identity and is not displayed as the user's case label.

---

## 6. UX-REV-05 — fixed 10 transactions per page

The operational list uses a maximum/default **page size of 10 transactions**.

Default state:

- no date filter;
- latest 10 authorized transactions for the selected Project and business scope;
- newest meaningful activity first.

Pagination controls are simple on phone/tablet:

```text
Previous     Next
```

The API may use cursor/keyset pagination even if the UI uses page-like Previous/Next controls.

The client must never load an unbounded Project transaction history merely to paginate locally.

---

## 7. UX-REV-06 — Booking/Delivery date selector

A date control is required above the transaction list.

UI direction:

```text
All | Bookings | Deliveries

Date
[ Select date / range ]
```

The interaction should support a single day immediately and remain compatible with a date range so implementation does not require an API redesign later.

After a date/filter change:

- reset pagination to the first page;
- return at most 10 transactions;
- continue to page in groups of 10.

Date evaluation uses the selected Project's configured timezone, not an accidental browser/UTC day boundary.

Working filter semantics for implementation design:

- **Bookings** — match the configured Booking business date/event date in the selected range;
- **Deliveries** — match the configured Delivery business date/event date in the selected range;
- **All** — include a case when its relevant Booking or Delivery business activity falls in the selected range; return one case row, not duplicate rows.

Exact source-date precedence will be finalized with the API/read-model contract and tested during UAT.

---

## 8. UX-REV-07 — latest ordering

Without a date filter, and within a filtered result set, the default order is:

```text
latestActivityAt DESC
```

`latestActivityAt` is a backend-projected business/audit activity timestamp derived from durable UC03 events/material capture activity; the Web client does not infer it from whichever API response happened to arrive last.

Stable pagination should use a deterministic secondary key such as the internal case ID.

---

## 9. Mockup/UAT status

`UC03_ANDROID_WEB_MOCKUPS_v0.1.html` remains a **workflow/interaction reference**, not pixel-final UI.

Known corrections for implementation:

1. use the approved Verigence logo/lockup asset;
2. insert conditional Project selection before operational landing;
3. replace Delivery Today with Delivery In Progress;
4. replace generic Recent Journeys with Latest Bookings & Deliveries;
5. show at most 10 transactions per page;
6. provide Booking/Delivery + date filtering;
7. expect additional visual/content adjustments during real device and business UAT.

These corrections do not change the frozen UC03 Workflow Manager business-state model.
