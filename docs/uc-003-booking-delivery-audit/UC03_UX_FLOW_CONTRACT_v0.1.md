# Verigence UC03 — Android-first + Web UX Flow Contract

**Document ID:** `VUC03-UX-001`  
**Version:** `0.1`  
**Status:** MOCKUP CONTRACT / NOT IMPLEMENTATION  
**Date:** 2026-08-22  
**Parent design:** `VUC03-SD-002 / UC03_SOLUTION_DESIGN_v1.1.md`  
**Workflow:** `VUC03-WF-002 / UC03_WORKFLOW_STATE_EVENT_CATALOG_v1.1.md`  
**Rules:** `VUC03-RF-001 / UC03_RULE_FLAG_CATALOG_v1.0.md`  
**Reconciliation:** `VUC03-DR-001 / UC03_RECONCILIATION_DECISIONS_v1.0.md`

---

## 1. Purpose

This document is the UI/interaction contract for the UC03 mockup pack.

It does not authorize React, API, database or Capacitor implementation. It defines what the Android phone, Android tablet and desktop Web experiences must communicate from the same Audit Core workflow model.

The principal PC target is Android phone/tablet. Desktop Web supports the same business workflow with more simultaneous context.

---

## 2. Product language

### PC-facing terms

Use:

- Booking
- Delivery
- My Work
- Audit Flags
- Needs Attention
- Documents
- Vehicle Photos
- Payments
- Review
- History

Do not use as the PC's operating language:

- Journey
- Journey Workspace
- Journey Stage
- Audit Core
- DI
- evaluator key
- tenant ID / journey ID
- backend/provider terminology

An internal `journey_id` still identifies the case and may be present in API routes/logs; it is not a user concept.

---

## 3. Device hierarchy and interaction rules

### 3.1 Android phone — primary

Reference mockup width: **390 px**.

Design rules:

- minimum 44–48 px touch targets;
- one dominant action per task state;
- sticky bottom action bar where completion/action is important;
- cards, segmented controls and expandable sections instead of tables;
- no hover dependency;
- no horizontal business-data tables;
- camera action directly beside the required photo;
- save/resume is assumed between every material step;
- key status visible without opening another screen;
- never trap PC behind document-processing wait.

### 3.2 Android tablet — second

Reference width: **800 px**.

Uses the same components but can show:

- worklist + detail side-by-side;
- document panel + capture panel together;
- flag list + selected flag together.

### 3.3 Desktop Web — third

Reference width: **1280 px**.

Retains the current Verigence application shell and visual language:

- white navigation/sidebar;
- Verigence navy/blue/teal palette;
- existing top identity area;
- responsive cards and panels.

Desktop may show more information simultaneously but must not introduce a different workflow.

---

## 4. Existing Web framework to preserve

UC03 mockups are an adaptation of the current Verigence framework, not a replacement shell.

Current framework characteristics to retain:

- primary navy `#003a82` / blue `#0057b8`;
- teal accent around `#00afa8`;
- background around `#f4f8fb`;
- dark body text around `#17324d`;
- soft blue-grey borders;
- white rounded cards and modest shadows;
- Verigence logo/lockup;
- user first/last name and role in the top-right identity area on desktop;
- responsive navigation drawer on mobile.

UC03 will ultimately replace PC-facing `Journeys` navigation language with Booking/Delivery-oriented language, but implementation of navigation is deferred until mockup approval.

---

## 5. Information architecture

### 5.1 PC primary navigation direction

For PC, the core work entry should converge around:

```text
Overview
My Work
Bookings
Deliveries
Audit Flags
Evidence
Payments
```

The exact existing left-nav restructuring is implementation-design work. Mockups focus on the UC03 work surfaces.

### 5.2 Case header

Every Booking/Delivery screen carries a compact case identity header using business identifiers:

```text
Booking #682604
Bhagirathi Behera
Creta 1.5 S (O) MT
Aditya Hyundai · Ludhiana
```

Do not display internal Journey UUIDs.

---

## 6. Stage summary model shown to users

Booking and Delivery display three concepts separately.

Example:

```text
Booking
In Progress
Audit: In Progress
Flags Raised · 2
```

Delivery example:

```text
Delivery
Completed
Audit: In Progress
Flags Raised · 3
```

### 6.1 Audit Status display

Backend values:

```text
NOT_EVALUATED
NO_FLAGS
FLAGS_RAISED
```

User labels:

```text
Not Evaluated
No Flags
Flags Raised
```

### 6.2 Audit State display

Backend values:

```text
NOT_STARTED
IN_PROGRESS
COMPLETE
```

User labels:

```text
Not Started
In Progress
Complete
```

### 6.3 PC capture-completion display

Where TL/PM review is outstanding, explicitly distinguish the PC's work from overall Audit State:

```text
Your capture
Complete

Audit
In Progress · Team Lead review required
```

---

## 7. End-to-end PC screen flow

### UX-01 — My Work / operational landing

Purpose: PC knows what needs action now.

Phone content:

```text
Good morning, Sanjay

[ + Create Booking ]

Needs Attention          5
Bookings In Progress    12
Deliveries Today         5
Completed This Week     18
```

Below, task cards ordered by urgency.

A card should show:

- Booking number;
- customer;
- vehicle;
- outlet;
- current business phase/status;
- compact Audit State/Status;
- flag count;
- extraction-processing indicator where applicable;
- primary action such as Continue Booking / Start Delivery / Review Flag.

No generic “Journey” list.

---

### UX-02 — Create / locate Booking

Normal expectation from source: Booking may already exist from dealer/DMS intake; PC creation is an exception path.

Screen priority:

1. search by Booking number/customer/mobile;
2. show matching existing Booking if found;
3. `Create Booking` only when genuinely absent and authorized;
4. minimal creation asks for Booking reference first, not all 123 fields.

The same internal case ID is retained when Delivery begins later.

---

### UX-03 — Booking Started / upload-first entry

The first material action emphasizes documents before a long form.

Phone order:

1. Booking status header;
2. compact Booking completion/checkpoint card;
3. **Upload Booking Documents**;
4. per-document cards;
5. PC-only fields that can be completed immediately;
6. extracted/waiting sections below.

Source principle preserved: upload first, type second.

---

### UX-04 — Booking capture while extraction runs

This is a primary mockup state.

Required UI behavior:

- each document has its own state;
- show processing stage/elapsed time/queue state;
- one failed document does not imply all failed;
- fields expected from processing are visibly waiting rather than unexplained blanks;
- PC-only fields remain editable;
- explicit copy says the PC can continue working.

Example:

```text
3 documents are being read
You can continue the booking details below.
```

No blocking global spinner.

---

### UX-05 — extracted proposals arrive

Proposals are grouped into:

```text
Ready to accept
Needs your review
```

Each proposal shows:

- field label;
- proposed value;
- source document;
- confidence/reason when flagged;
- Accept / Edit / Explain as relevant.

Bulk action:

```text
Accept 19 clean values
```

No silent overwrite.

Aadhaar, if represented, is masked.

---

### UX-06 — extraction failure

Local failure card includes:

- plain user-safe message;
- Retake / Upload Better Copy;
- Enter Manually where allowed;
- Ask Team Lead / escalation where policy requires;
- attempt state where useful.

Other successful documents remain visibly successful.

---

### UX-07 — Booking requirements/checkpoint

Replace “blocking gate” language with a user-friendly verification summary.

Example:

```text
Booking verification
23 of 26 required items addressed

✓ Booking Docket
✓ PAN
! Payment proof missing
! Price variance needs explanation
```

The summary may keep normal `BOOKING_CLOSED / PROCEED_TO_DELIVERY` unavailable until the configured Booking-completion policy is satisfied.

This is different from blocking a later real Delivery event.

---

### UX-08 — Booking close/cancel/duplicate

A dedicated action sheet/modal/card asks:

```text
How is this Booking being concluded?
```

Paths:

- Ready for Delivery;
- Customer Cancelled;
- Dealer Cancelled;
- Finance Not Approved;
- Vehicle Unavailable;
- Customer Shifted Dealer;
- Duplicate Booking;
- Other.

`Remarks` is present; `Other` requires remarks by default.

Selecting Duplicate Booking clearly states:

```text
This will mark the Booking as Duplicate Booking and raise an Audit Flag.
```

It does not use destructive technical wording.

---

### UX-09 — Start Delivery, clean path

For Booking closed ready for Delivery:

```text
Start Delivery
```

Delivery Start records real progression and opens Delivery capture.

First question should be delivery intimation/how PC learned of Delivery, because source timing makes that evidence important.

---

### UX-10 — Start Delivery while Booking remains incomplete

This is a mandatory UC03 mockup state.

The PC is **not prevented from continuing**.

After Delivery Start is accepted, show a clear audit notice:

```text
Delivery started

Booking still has 3 incomplete requirements.
An Audit Flag has been recorded. Continue the Delivery checks below.
```

Show the snapshot items, e.g.:

- Minimum Booking Amount proof missing;
- PAN verification pending;
- price variance unexplained.

Primary action remains **Continue Delivery**.

---

### UX-11 — Delivery document checklist

Checklist contains only currently applicable document requirements.

Each row/card contains:

- document name;
- why applicable when conditional;
- Yes / No / NA only where allowed;
- upload/camera/document action where Yes requires evidence;
- processing/extraction state;
- flag state if No raises a flag.

`No` is presented as a legitimate audit answer, not a red validation error that prevents submission.

Example:

```text
Gate Pass
[ Yes ] [ No ✓ ]
Audit Flag raised · Add remark
```

---

### UX-12 — Vehicle photo capture

Android-first.

Required photo cards/actions include the source-supported set direction:

- VIN plate;
- front;
- rear;
- left/right exterior as configured;
- interior;
- odometer.

Each action should open the Capacitor camera flow directly.

The UI shows capture time and completion, not internal storage identifiers.

VIN/business identifier comparison result comes from Audit Core Rule Engine only.

---

### UX-13 — VIN reconciliation result

Before rule is configured:

```text
Vehicle identifier check
Needs review
Rule configuration pending
```

Once configured, possible safe states:

- Match;
- Mismatch — critical Audit Flag raised;
- Insufficient data.

Even a mismatch does not remove the ability to record actual Delivery progression.

---

### UX-14 — Payments

Phone uses receipt cards, not a wide table.

Each receipt card may contain:

- receipt mode/type;
- amount;
- receipt date;
- UTR/bank where relevant;
- Made by Customer?;
- verification state;
- realised amount;
- supporting evidence.

Third-party payer answer dynamically adds the declaration requirement.

Unverified/mismatched payments create flags according to Rule Engine policy.

---

### UX-15 — human Audit Flag creation

Available to PC/TL/PM/Executive according to permissions.

PC-friendly form:

```text
Raise Audit Flag
Stage          Booking / Delivery
Category       [select]
Severity       [select if permitted / defaulted by policy]
What did you observe?
Remarks
Attach evidence (optional)
```

No machine evaluator/rule-key fields shown.

---

### UX-16 — Audit Flags list

Flag cards contain:

- severity;
- stage;
- machine/human origin;
- concise summary;
- status;
- age/time;
- latest remark;
- review requirement where relevant.

Filters:

- Open;
- Awaiting Review;
- Resolved;
- Booking;
- Delivery.

For PC, the list focuses on actions/remarks they can perform. TL/PM/Executive get review controls according to permission.

---

### UX-17 — Delivery Completed while audit remains In Progress

Mandatory mockup.

Header example:

```text
Delivery
Completed
22 Aug · 17:42
```

Separate audit card:

```text
Delivery Audit
In Progress
Flags Raised · 3

Your capture: Complete
Team Lead review: Required
```

Late evidence/remarks remain allowed and show their true timestamp/provenance.

There is no Delivery Close/Success/Failure button.

---

### UX-18 — History / timeline

Business and audit events appear together but are distinguishable.

Example:

```text
09:10 Booking started                 PC
09:15 Booking Docket uploaded         PC
09:17 Price variance flag raised      System
16:42 Delivery started                PC
16:42 Booking incomplete flag raised  System
17:31 Vehicle delivered               PC
17:45 Missing payment proof uploaded  PC
18:12 Flag acknowledged               TL
```

The timeline is how the user understands that later evidence did not rewrite the original sequence.

---

## 8. TL / PM / Executive review UX

### UX-19 — review queue

Tablet/Desktop primary, mobile supported.

Each item displays:

- Booking reference/customer/vehicle/outlet;
- stage;
- severity;
- flag summary;
- raised by Machine/PC/TL/etc.;
- age;
- assigned/review state.

### UX-20 — selected flag review

Review detail shows:

- expected vs observed where machine-generated;
- source documents/facts/photos;
- PC remarks;
- event timeline;
- Add remark;
- Acknowledge;
- Resolve;
- Void/Reclassify according to permission.

Executive receives all Phase-1 flag privileges but the UI still reflects normal TL/PM operational ownership.

---

## 9. Desktop workspace composition

Desktop Web uses the same stage semantics but can render a multi-pane layout.

### Booking desktop

Recommended structure:

```text
Case header + Booking/Audit summary

[ Documents / processing ] [ Booking capture / proposals ]

[ Requirements / rules ]   [ Audit Flags ]
```

### Delivery desktop

Recommended structure:

```text
Case header + Delivery/Audit summary

[ Applicable documents ] [ Vehicle / witness checks ]
[ Payments             ] [ Audit Flags              ]
```

Do not resurrect the old technical sequence of separate top-level tabs such as Commercials / Finance / Insurance / Registration as the PC's primary navigation. Those remain underlying data domains and may be subsections within Booking or Delivery.

---

## 10. Extraction transport behavior reflected in UI

The UI consumes an Audit Core aggregate processing snapshot, not DI directly.

Interaction behavior:

- poll one case-scoped endpoint while processing exists;
- stop when no pending processing remains;
- pause while backgrounded/hidden;
- refresh immediately on focus/reconnect;
- show stale/offline state safely without exposing technical details;
- keep transport hidden behind a frontend hook.

The mockup does not expose polling mechanics to users.

---

## 11. Empty/error/offline states

All UC03 screens must define user-safe states.

Examples:

```text
We couldn't refresh this Booking right now.
Your saved work is still available. Try again.
```

```text
This document is still being read.
You can continue with the remaining Booking details.
```

Do not display raw HTTP status, backend service names, stack details, Railway/Cloudflare/DI terminology or internal correlation metadata to ordinary users.

---

## 12. Accessibility / usability minimums

- interactive controls >= 44 px, target 48 px for primary PC actions;
- native/select/text inputs >= 16 px text on phone to avoid unwanted zoom;
- visible focus state on Web/tablet keyboard use;
- status never conveyed by colour alone;
- buttons use action labels rather than icons alone for important tasks;
- segmented Yes/No/NA controls have explicit text and selected state;
- camera/photo requirements use labels visible beside previews;
- sticky bottom actions do not cover content or Android safe areas.

---

## 13. Mockup coverage required for v0.1

The static mockup pack must include at least:

### Android phone

1. My Work
2. Booking capture while extraction is running
3. Extraction proposals
4. Booking verification + close action
5. Delivery Start with Booking incomplete and automatic flag
6. Delivery document checklist + photos
7. Audit Flags + human Raise Flag
8. Delivery Completed / Audit In Progress

### Android tablet

9. TL/PM flag review queue + selected review

### Desktop Web

10. Booking workspace
11. Delivery workspace

The mockup pack may include additional supporting states if needed to explain the flow.

---

## 14. Approval gate after mockups

Mockups should be reviewed against:

- workflow-state correctness;
- no-blocking business progression principle;
- mobile usability;
- document/extraction latency behavior;
- flag visibility without overwhelming the PC;
- Booking/Delivery terminology;
- role-based review behavior;
- consistency with existing Verigence visual framework.

Only after mockup approval should UC03 Implementation Design define final APIs, schema migrations and component implementation.
