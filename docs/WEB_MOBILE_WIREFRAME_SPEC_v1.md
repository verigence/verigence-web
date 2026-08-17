# Verigence Web + Mobile — Grounded Wireframe Specification v1

**Status:** DRAFT FOR OWNER REVIEW — NOT APPROVED FOR IMPLEMENTATION  
**Repository:** `verigence/verigence-web`  
**Design branch:** `design/wireframes-v1`  
**Date:** 2026-08-17  
**Purpose:** Screen-by-screen UX specification grounded in current Security and Audit Core contracts.  
**Runtime / technology stack:** deliberately **not selected yet**. Stack selection follows wireframe approval.

---

## 1. Grounding and non-negotiable boundaries

This specification uses:

- Security `dev` + `SECURITY_BACKEND_AUTH_AND_EMAIL_OTP_DESIGN_v1.4.8.md` as the identity/authentication source of truth.
- Audit Core `main` route implementation as the business/evidence source of truth.
- `verigence-web/docs/BRANDING_GUIDELINES.md` and checked-in brand assets as the visual source of truth.
- Previously shared Booking / Delivery screens only as **business-process guidance**, never as a UI template.

Where the desired UX needs an API that does not exist today, the screen is marked **API GAP** rather than inventing behavior.

Canonical channel boundary:

```text
Web / Mobile
     ↓
Audit Core
     ├────────→ Security ────────→ Clerk Backend API
     └────────→ DI (through Security delegated authorization)
```

Rules:

- Web/Mobile calls **Audit Core only**.
- No Clerk SDK/key/session token in Web/Mobile.
- No direct Web/Mobile → Security.
- No direct Web/Mobile → DI.
- Password/email OTP/future TOTP are transient and must never be logged, audited, traced, cached or persisted by Audit Core or channel code.

---

# 2. Product UX principles

## 2.1 Evidence first; data entry last

The Process Consultant (PC) is performing an audit/evidence-capture activity, not recreating dealer source data.

```text
Capture / upload evidence
        ↓
DI reads evidence
        ↓
Audit Core receives facts/status
        ↓
System resolves what it can
        ↓
PC handles only unresolved minimums
        ↓
TL / PM review exceptions
```

The UI must not turn extracted Booking Form fields into a 20–30 field editable form.

## 2.2 One product across Web and Mobile

The information architecture, routes, components, terminology and workflows are common.

```text
Shared product experience
       ├── Web: responsive browser capabilities
       └── Mobile: same journey + native camera + native GPS
```

Mobile-specific enhancements initially:

- Camera / document capture
- GPS / location capture

Web equivalents:

- File picker / drag-and-drop
- Browser geolocation where Security policy requires it

The user never enters latitude/longitude manually.

## 2.3 Progressive disclosure

Do not show insurance, finance, trade-in, registration, discounts, payments and delivery fields together. The Journey is a small set of status cards. Detail opens only when needed.

## 2.4 Async document UX

Never display a 30–70 second blocking spinner after upload.

```text
Uploading → Uploaded → Reading document… → Ready
                                  └──────→ Needs attention
                                  └──────→ Could not read
```

The PC can immediately continue to another document or task.

## 2.5 Permission-driven UI

The UI may hide actions the user lacks permission to perform, but Audit Core/Security authorization remains authoritative.

---

# 3. Visual system

Use checked-in Verigence tokens/assets, not hard-coded ad-hoc styling.

- Deep Blue `#003A82` — hierarchy/trust
- Electric Blue `#0057B8` — active/action
- Teal `#00AFA8` / Mint `#00D3A7` — intelligence/progress
- Mist `#F4F8FB` / White — operational surfaces
- Slate `#31506E` — secondary text
- Inter — primary UI typeface

Operational screens remain predominantly white/Mist. Brand gradient is used sparingly for identity moments, not behind dense work screens.

Density rules:

- one purpose per card;
- normally one primary action per view;
- no desktop wall-of-fields;
- mobile is single-column and thumb-friendly.

---

# 4. Global information architecture

### Public

```text
Sign in
Create account
Email verification
Registration pending
```

### PC

```text
Home / My Work
Journeys
Capture (+ on mobile)
Tasks / Sent Back
Profile / Sign out
```

### TL / PM

```text
Review Queue
Journey Review
Evidence / Findings
Decision
History
```

### Platform Super Admin

```text
Pending Users
Users
Tenants
Access Assignment
```

Raw Security permission keys, Clerk identity data and other internals are not part of the normal approval UX.

---

# 5. Responsive shell

## WEB-SHELL-01 — Desktop

```text
┌──────────────────────────────────────────────────────────────────────────┐
│ Verigence        Project / Tenant                         User ▾          │
├──────────────┬───────────────────────────────────────────────────────────┤
│ Home         │                                                           │
│ My Work      │               Page content                                │
│ Journeys     │                                                           │
│ Reviews*     │                                                           │
│              │                                                           │
│ Help         │                                                           │
└──────────────┴───────────────────────────────────────────────────────────┘
```

`Reviews` is permission-dependent.

## MOB-SHELL-01 — Mobile

```text
┌───────────────────────────────┐
│ Verigence              ○ user │
│                               │
│        Page content           │
│                               │
├───────────────────────────────┤
│ Home   Work   ＋   Tasks  More│
└───────────────────────────────┘
```

The center `＋` is Capture / Add evidence or journey context.

---

# 6. Authentication and onboarding

> All channel routes below are proposed **Audit Core façade contracts**. They map internally to already implemented Security v1.4.8 APIs. Audit Core does not yet expose these façade routes.

## AUTH-01 — Sign in

**Actor:** USER (PC/TL/PM/etc.)

```text
┌────────────────────────────────────────┐
│               VERIGENCE                │
│                                        │
│              Welcome back              │
│    Sign in to continue your work       │
│                                        │
│  Email                                 │
│  [________________________________]    │
│                                        │
│  Password                              │
│  [___________________________]  (eye)  │
│                                        │
│             [ Sign in ]                │
│                                        │
│  New to Verigence?  Create account     │
└────────────────────────────────────────┘
```

Visible: Email, Password. TOTP appears only after a clean server challenge contract exists.

Hidden/system context:

- `tenantId` — resolved by channel/backend context, never typed as UUID;
- `deviceId` — channel-managed;
- geo — browser/mobile location capture when required;
- correlation identifiers.

**Required Audit Core façade:** `POST /v1/auth/login`  
**Security internal:** `POST /security/v1/auth/login`

**API GAP WEB-API-001 / WEB-API-003:** Audit Core has no auth façade or channel-friendly Tenant/session context today.

Do not show Clerk, Tenant UUID, device UUID or GPS coordinates.

---

## AUTH-02 — Create account

```text
┌────────────────────────────────────────┐
│ ← Sign in                 Step 1 of 2  │
│                                        │
│          Create your account           │
│                                        │
│ First name        Last name            │
│ [____________]    [____________]       │
│                                        │
│ Work email                             │
│ [________________________________]     │
│                                        │
│ Mobile                                 │
│ +91 [___________________________]      │
│                                        │
│ Password                               │
│ [___________________________] (eye)    │
│ Confirm password                       │
│ [___________________________] (eye)    │
│                                        │
│ Onboarding key                         │
│ [________________________________]     │
│                                        │
│            [ Continue ]                │
└────────────────────────────────────────┘
```

**Required Audit Core façade:** `POST /v1/auth/signup`  
**Security internal:** `POST /security/v1/onboarding/users`

Confirm password is UI-only. Applicant cannot choose Tenant or PC/TL/PM role.

---

## AUTH-03 — Verify email

```text
┌────────────────────────────────────────┐
│ ← Back                    Step 2 of 2  │
│                                        │
│            Verify your email           │
│                                        │
│  We sent a code to a•••@company.com    │
│                                        │
│      [ _ ] [ _ ] [ _ ] [ _ ] [ _ ] [ _ ]
│                                        │
│             [ Verify ]                 │
│                                        │
│  Didn't get it?  Resend code  00:45    │
└────────────────────────────────────────┘
```

**Required Audit Core façade:** verify-email + resend-email-code.  
Security internally uses Clerk Backend email-code verification.

OTP is transient and never stored by channel/Audit Core.

---

## AUTH-04 — Registration pending

```text
┌────────────────────────────────────────┐
│                 ✓                      │
│                                        │
│        Registration received           │
│                                        │
│ Your email has been verified.          │
│ An administrator will review your      │
│ access request and assign your role.   │
│                                        │
│             [ Back to sign in ]        │
└────────────────────────────────────────┘
```

Security state: USER `PENDING`, onboarding `PENDING_ADMIN_APPROVAL`, Clerk user remains banned.

---

## AUTH-05 — Location permission (only when policy requires it)

```text
┌────────────────────────────────────────┐
│        Location is required            │
│                                        │
│ Verigence uses your location to apply  │
│ your organisation's access policy.     │
│                                        │
│       [ Allow location access ]        │
└────────────────────────────────────────┘
```

Mobile uses native GPS permission; Web uses browser geolocation. No manual lat/long input.

---

# 7. Super Admin approval

## ADM-01 — Administrator sign in

Same visual language as AUTH-01 with heading `Administrator sign in`.

**Required Audit Core façade:** `POST /v1/platform/auth/login`  
**Security internal:** current Platform Admin login.

---

## ADM-02 — Pending approvals

```text
┌────────────────────────────────────────────────────────────────────┐
│ Pending approvals                                      Search ⌕    │
│ Review verified users waiting for access                          │
│                                                                    │
│ 3 pending                                                          │
│ ┌───────────────────────────────────────────────────────────────┐  │
│ │ Amit Goyal                       Email verified ✓     → Review│  │
│ │ amit@company.com                 +91 ••••••3210              │  │
│ │ Requested 17 Aug 2026                                        │  │
│ ├───────────────────────────────────────────────────────────────┤  │
│ │ Priya Sharma                      Email verified ✓     → Review│ │
│ └───────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────┘
```

Security can already list global users by lifecycle/onboarding status. Web receives this only through Audit Core.

---

## ADM-03 — Review + assign role and business scope

**Goal:** one human action, not a sequence of Security technical operations.

```text
┌──────────────────────────────────────────────────────┐
│ ← Pending approvals                                  │
│                                                      │
│ Amit Goyal                         Email verified ✓  │
│ amit@company.com                                    │
│ +91 ••••••3210                                      │
│                                                      │
│ Tenant                                               │
│ [ DummyTenant / Dealer Audit                    ▾ ]  │
│                                                      │
│ Role                                                 │
│ [ Process Consultant (PC)                       ▾ ]  │
│                                                      │
│ Business scope                                       │
│ Dealer   [ Premier Hyundai                      ▾ ]  │
│ Outlet   [ Cuttack                               ▾ ] │
│                                                      │
│ Optional admin note                                  │
│ [_______________________________________________]    │
│                                                      │
│ [ Reject ]                        [ Approve & activate ]
└──────────────────────────────────────────────────────┘
```

Why Dealer/Outlet is here: Security Tenant RBAC and Audit Core `business_assignments` are separate controls. A Security role alone does not establish Audit Core business scope.

**API GAP WEB-API-002:** create one Audit Core composite approval operation. Recommended channel contract for review:

```text
POST /v1/platform/users/{userId}/approve
```

Conceptually it orchestrates:

```text
assign Security Tenant role
        ↓
create Audit Core business assignment
        ↓
activate Security USER
        ↓
Security unbans Clerk identity
```

with fail-closed / compensation semantics. The browser must not sequence these low-level calls.

Role choices come from configured backend roles; UI does not hard-code permission sets.

---

## ADM-04 — Approval complete

```text
┌────────────────────────────────────────┐
│                 ✓                      │
│                                        │
│           User activated               │
│                                        │
│ Amit Goyal                             │
│ Process Consultant • Cuttack           │
│                                        │
│        [ Back to approvals ]           │
└────────────────────────────────────────┘
```

---

# 8. PC Home / My Work

## PC-01 — My Work

```text
┌────────────────────────────────────────────────────────────────────┐
│ Good morning, Amit                                      + New audit│
│ Premier Hyundai • Cuttack                                          │
│                                                                    │
│ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐                 │
│ │ In progress  │ │ Sent back    │ │ Processing   │                 │
│ │      7       │ │      2       │ │      3       │                 │
│ └──────────────┘ └──────────────┘ └──────────────┘                 │
│                                                                    │
│ Continue working                                                   │
│ ┌───────────────────────────────────────────────────────────────┐  │
│ │ Bhagirathi Behera • Creta      Booking evidence reading…  → │  │
│ ├───────────────────────────────────────────────────────────────┤  │
│ │ Rahul Das • Venue               Sent back by TL           →  │  │
│ └───────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────┘
```

Mobile uses the same cards.

**API GAP WEB-API-004:** Audit Core has customer-scoped journey listing but no efficient `my journeys / recent work` read model. Add a backend read model rather than N+1 client aggregation.

---

# 9. Start Booking audit

Audit Core currently requires a Customer before a Journey, and a Journey before evidence can be attached. Therefore the design asks the PC for the smallest business context before Booking Form upload.

## BOOK-01 — Customer context

```text
┌──────────────────────────────────────────────┐
│ ← My work                  New Booking Audit │
│                                              │
│ Outlet                                       │
│ Premier Hyundai • Cuttack                    │  ← read-only
│                                              │
│ Customer                                     │
│ Name*                                        │
│ [______________________________________]     │
│                                              │
│ Customer type*                               │
│ [ Individual                            ▾ ]  │
│                                              │
│ Mobile last 4        (optional)              │
│ [____]                                       │
│                                              │
│ [ Continue to documents ]                    │
└──────────────────────────────────────────────┘
```

Current Customer API requires `customerTypeCode` + `displayName`; mobile last 4/email/external ref are optional.

System-hidden actions:

1. resolve current Tenant/dealer/outlet/business assignment;
2. create/reuse Customer;
3. create Journey;
4. resolve effective master versions server-side where possible;
5. start audit lifecycle when appropriate.

**API gaps:**

- authenticated/business context missing (`WEB-API-003`);
- customer matching currently expects a `matchHash`, which is not a UI field;
- Journey create exposes master version UUIDs; the channel should not ask users to select them.

---

## BOOK-02 — Booking evidence capture

**Primary PC screen.**

```text
┌──────────────────────────────────────────────────┐
│ ← Bhagirathi Behera                Booking audit │
│                                                  │
│ Booking Form                                     │
│ ┌──────────────────────────────────────────────┐ │
│ │ 📄 Add Booking Form                          │ │
│ │ We'll read the document automatically.       │ │
│ │                                              │ │
│ │ [ Take photo ]   [ Choose file ]             │ │
│ └──────────────────────────────────────────────┘ │
│                                                  │
│ Other evidence                                   │
│ ○ Booking intimation                            │
│ ○ Sales contract                                │
│                                                  │
│                         [ Continue ]             │
└──────────────────────────────────────────────────┘
```

Mobile: camera/scan primary, file/gallery secondary.  
Web: file picker / drag-and-drop primary.

Current Audit Core mapping:

```text
POST /v1/tenants/{tenantId}/journeys/{journeyId}/evidence
multipart: file + evidencePurpose + requirementKey? + documentTypeKey?
Idempotency-Key
```

Document type/requirement comes from configured Journey requirements; the PC never types `documentTypeKey`.

**API GAP WEB-API-006:** Audit Core validates `journey_document_requirements` but exposes no current Journey requirement-list endpoint. The UI must not hard-code the full checklist.

---

## BOOK-03 — Uploaded / Reading document

```text
┌──────────────────────────────────────────────────┐
│ Booking documents                                │
│                                                  │
│ ✓ Booking Form                                   │
│   booking-form.pdf                               │
│   ⟳ Reading document…                            │
│   You can continue while we process it.          │
│                                                  │
│ ○ Booking intimation              [ Add ]        │
│ ○ Sales contract                  [ Add ]        │
│                                                  │
│                         [ Continue ]              │
└──────────────────────────────────────────────────┘
```

Evidence already exposes `processingStatus` and `verificationStatus`; Audit Core can list/get evidence and refresh facts. No extraction wait modal.

---

## BOOK-04 — System-read Booking summary

```text
┌──────────────────────────────────────────────────┐
│ Booking summary                         Evidence │
│                                                  │
│ Customer            Bhagirathi Behera            │
│ Booking date        24 Jul 2026                  │
│ Booking reference   682604                       │
│ Vehicle             Creta • S(O) MT • Atlas White│
│ Sales consultant    Annapurna Barik              │
│                                                  │
│ Source: Booking Form                             │
│ ✓ 14 details read confidently                   │
│ ⚠ 2 items need confirmation                     │
│                                                  │
│ Needs attention                                  │
│ ┌──────────────────────────────────────────────┐ │
│ │ Vehicle match                               │ │
│ │ Creta • S(O) MT • Atlas White              │ │
│ │ [ Confirm match ] [ Choose another ]        │ │
│ └──────────────────────────────────────────────┘ │
│                                                  │
│                         [ Continue ]              │
└──────────────────────────────────────────────────┘
```

Audit Core evidence facts provide field key/value/normalized value/confidence/verification status.

Current Booking API requires:

- `salesStaffId`
- `productSkuId`
- optional booking reference/date
- optional `selectionSource`

The UI should use extracted staff/product text to auto-resolve reference records. PC acts only on ambiguous matches.

An Audit Core branch `feat/web-reference-api-v1` already contains staff lookup, product SKU search and status-code lookup, but it is **not merged or registered on `main`** today. Treat it as an API gap, not a live contract.

---

# 10. Journey workspace — one page, not many forms

## JRN-01 — Journey workspace

```text
┌────────────────────────────────────────────────────────────────────┐
│ Bhagirathi Behera                              Audit: In progress  │
│ Creta • S(O) MT • Atlas White                                    │
│                                                                    │
│ Journey                                                            │
│ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌──────────────┐  │
│ │ Booking     │ │ Payments    │ │ Insurance   │ │ Delivery     │  │
│ │ Ready ✓     │ │ 2 receipts  │ │ Evidence ✓  │ │ Not started  │  │
│ └─────────────┘ └─────────────┘ └─────────────┘ └──────────────┘  │
│                                                                    │
│ Documents                                                          │
│ ✓ Booking Form             Ready                                   │
│ ⟳ Insurance Cover Note    Reading…                                 │
│ ○ Payment receipt          Add                                     │
│                                                                    │
│ Attention                                                          │
│ ⚠ Payment receipt #2 needs review                                 │
│                                                                    │
│ [ Add evidence ]                         [ Review & submit ]         │
└────────────────────────────────────────────────────────────────────┘
```

Payments, commercials, finance, insurance, trade-in, vehicle, registration and delivery become concise cards. Opening a card shows only relevant information/unresolved actions.

This replaces the legacy all-fields-on-one-page pattern.

---

# 11. Progressive evidence/domain cards

## PAY-01 — Payments

```text
┌──────────────────────────────────────────────┐
│ Payments                                     │
│ ₹50,001   Bank transfer      Evidence ✓      │
│ 02 Aug    Ref •••749                        │
│                                              │
│ ₹10,000   UPI / wallet       Needs review ⚠ │
│                                              │
│ [ Add payment evidence ]                     │
└──────────────────────────────────────────────┘
```

Current Audit Core supports payment read/create/update and verification. PC default is evidence capture; verification belongs to authorized reviewers.

## COM-01 — Price & discounts

```text
┌──────────────────────────────────────────────┐
│ Price & discounts                            │
│ Ex-showroom       Standard ₹…   Actual ₹…    │
│ Registration      Standard ₹…   Actual ₹…    │
│ Corporate disc.   Eligible ₹…   Actual ₹…    │
│                                              │
│ 1 variance detected                          │
│ [ View evidence ]                            │
└──────────────────────────────────────────────┘
```

Standard amounts come from published Audit Core masters; PC does not type standards.

## INS-01 — Insurance

```text
┌──────────────────────────────────────────────┐
│ Insurance                                    │
│ Cover note              Ready ✓              │
│ Insurer                 [system-read]        │
│ Premium                 [system-read]        │
│ Add-ons                 2 identified         │
│                                              │
│ [ View evidence ]                            │
└──────────────────────────────────────────────┘
```

## TRD-01 — Trade-in (only when applicable)

```text
┌──────────────────────────────────────────────┐
│ Trade-in                                     │
│ Old vehicle        [system-read]             │
│ Quoted value       ₹…                        │
│ Actual value       ₹…                        │
│ Documents          2 / 2 ✓                   │
│                                              │
│ [ View evidence ]                            │
└──────────────────────────────────────────────┘
```

If no trade-in applies, this card is absent rather than an empty form.

---

# 12. Delivery journey

Delivery is part of the same Journey, not a second disconnected record.

## DEL-01 — Delivery workspace

```text
┌──────────────────────────────────────────────────┐
│ ← Journey                         Delivery       │
│                                                  │
│ Delivery status                                  │
│ [ Not started / Planned / Delivered ...     ▾ ] │
│                                                  │
│ Delivery evidence                                │
│ ○ Tax invoice (OMS)                    [ Add ]   │
│ ○ Registration invoice                 [ Add ]   │
│ ○ Insurance cover note                 [ Add ]   │
│ ○ No-dues certificate                  [ Add ]   │
│ ○ Delivery order / gate pass            [ Add ]  │
│                                                  │
│ Vehicle & registration                           │
│ VIN / chassis        [system-read or missing]    │
│ Registration         [system-read or pending]    │
│                                                  │
│                         [ Continue ]              │
└──────────────────────────────────────────────────┘
```

The exact checklist comes from configured Journey requirements, not permanently from legacy screens.

Mobile `Add` opens camera capture first.

---

## DEL-02 — Delivery facts

```text
┌──────────────────────────────────────────────┐
│ Delivery details                             │
│                                              │
│ Planned delivery                             │
│ 30 Jul 2026 • 3:00 PM                        │
│ Delivery intimation                          │
│ 30 Jul 2026 • 11:10 AM                       │
│ Actual delivery                              │
│ 30 Jul 2026 • 3:24 PM                        │
│                                              │
│ Source: Delivery documents                   │
│                                              │
│ ⚠ Registration number not yet available     │
│ [ Add evidence ]                             │
│                                              │
│                         [ Save & continue ]  │
└──────────────────────────────────────────────┘
```

Current Delivery API supports plannedDeliveryAt, deliveryIntimatedAt, actualDeliveryStatusCode, actualDeliveredAt, statusSource and sourceEvidenceId. Vehicle/registration have separate Journey endpoints.

Legacy screens contain a free-text `reason for non-intimation of delivery`; current `DeliveryPut` does not. Do not invent it in UI until business confirms it remains required and Audit Core exposes it.

---

## DEL-03 — Delivery evidence processing

```text
Tax invoice              ✓ Ready
Registration invoice     ⟳ Reading…
Insurance cover note     ✓ Ready
Gate pass                ○ Missing
```

No blocking extraction wait.

---

## DEL-04 — Ready for review

```text
┌──────────────────────────────────────────────┐
│             Ready for review                 │
│                                              │
│ ✓ Booking evidence                           │
│ ✓ Payment evidence                           │
│ ✓ Insurance evidence                         │
│ ✓ Delivery evidence                          │
│                                              │
│ 2 system findings will be sent to the TL.    │
│                                              │
│       [ Submit audit for review ]             │
└──────────────────────────────────────────────┘
```

Maps internally to Audit Core audit lifecycle. `audit/submit` moves the Journey to `PC_SUBMITTED` and creates a durable `TL_REVIEW` task.

---

# 13. Sent-back correction

## PC-02 — Sent back by reviewer

```text
┌──────────────────────────────────────────────────┐
│ Sent back by Team Lead                           │
│                                                  │
│ "Payment receipt #2 is not readable."           │
│                                                  │
│ What needs attention                             │
│ ⚠ Payment receipt #2                             │
│                                                  │
│ [ Replace evidence ]                             │
│                                                  │
│                  [ Resubmit for review ]         │
└──────────────────────────────────────────────────┘
```

Current `SEND_BACK` creates a `PC_CORRECTION` task and moves audit to `SENT_BACK`. Reopen only the exception, not the whole journey.

---

# 14. TL review

## TL-01 — Review queue

```text
┌────────────────────────────────────────────────────────────────────┐
│ Review queue                                                       │
│ [ Mine ] [ Unclaimed ] [ All in scope ]                            │
│                                                                    │
│ ┌───────────────────────────────────────────────────────────────┐  │
│ │ TL Review • Bhagirathi Behera                         Due ... │  │
│ │ Premier Hyundai • Cuttack                                    │  │
│ │ 2 findings • Evidence ready                       [ Review ]  │  │
│ └───────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────┘
```

Audit Core already supports task list/read/claim/start/complete/history.

**API GAP WEB-API-007:** current `TaskResponse` omits `journeyId`. Review navigation requires it; ideally also include concise customer/outlet context.

---

## TL-02 — Review Journey

```text
┌────────────────────────────────────────────────────────────────────┐
│ ← Review queue           Bhagirathi Behera           TL Review    │
│                                                                    │
│ Booking       Ready ✓     Delivery       Ready ✓                    │
│ Evidence      8 docs      Findings       2                         │
│                                                                    │
│ Findings                                                           │
│ ┌───────────────────────────────────────────────────────────────┐  │
│ │ HIGH  Undercharge detected                                   │  │
│ │ Expected ₹…  Observed ₹…                                     │  │
│ │ Evidence: Booking Form, Receipt #2                 [ Inspect ]│  │
│ ├───────────────────────────────────────────────────────────────┤  │
│ │ MED   Payment verification requires review                   │  │
│ └───────────────────────────────────────────────────────────────┘  │
│                                                                    │
│ [ View all evidence ]                            [ Make decision ] │
└────────────────────────────────────────────────────────────────────┘
```

Reviewer sees Expected / Observed / Evidence / Confidence where useful / Finding — not a giant copied form.

---

## TL-03 — Decision

```text
┌──────────────────────────────────────────────┐
│ Review decision                              │
│                                              │
│ ( ) No breach                                │
│ ( ) Breach                                   │
│ ( ) Send back to PC                          │
│                                              │
│ Remarks                                      │
│ [________________________________________]   │
│                                              │
│                [ Submit decision ]           │
└──────────────────────────────────────────────┘
```

Maps to current `POST .../review-decisions` with `BREACH | NO_BREACH | SEND_BACK`, `reviewerRoleCode=TL`, optional remarks.

---

# 15. PM review

## PM-01 — PM review

The UI can reuse TL review components, but **current Audit Core has a real workflow gap**:

- data model includes `PM_REVIEW` and decision API accepts `reviewerRoleCode=PM`;
- PC submit currently creates `TL_REVIEW`;
- current non-SEND_BACK review decision moves directly to `REVIEW_COMPLETE`;
- reviewed code does not create a PM review task after TL review.

**API GAP WEB-API-008:** if PM validation is mandatory, define/implement TL → PM transition/task rules before Web implements PM queue behavior. Do not fake it in frontend.

---

# 16. Evidence detail component

## EVD-01 — Evidence detail

```text
┌──────────────────────────────────────────────────┐
│ Booking Form                           Ready ✓    │
│ booking-form.pdf                                  │
│                                                  │
│ System-read facts                                 │
│ Booking reference      682604          70% ⚠     │
│ Booking date           24 Jul 2026     92%       │
│ Customer               Bhagirathi...   92%       │
│ Vehicle                Creta...        92%       │
│                                                  │
│ [ View original ]                                 │
└──────────────────────────────────────────────────┘
```

Audit Core already exposes processing/verification status and fact key/value/normalized value/confidence/verification status.

Low confidence is a review signal, not an editable PC field by default.

---

# 17. Loading, failure and poor-network states

### Document lifecycle

```text
Uploaded                → neutral success
Reading document…       → non-blocking progress
Needs attention         → warning, actionable
Could not read          → retry/replace
```

### Mobile poor network

- captured/selected file may be retained locally only as long as required for upload retry;
- show `Waiting to upload` / `Retry` clearly;
- do not claim evidence is accepted until Audit Core returns an evidence record;
- no silent loss.

Offline/resumable mechanics are a runtime-stack decision after wireframe approval.

Dependency errors use business-safe copy, not DI/Clerk/Railway/database messages.

---

# 18. Current API readiness matrix

| UI capability | Current backend | Status for Web |
|---|---|---|
| Backend-only signup + OTP | Security v1.4.8 | Security ready; Audit Core façade missing |
| Normal user credential login | Security v1.4.8 | Security ready; Audit Core façade missing |
| Platform Admin login | Security v1.4.8 | Security ready; Audit Core façade missing |
| Pending users | Security platform users | Needs Audit Core admin façade |
| Activate USER | Security lifecycle | Needs composite approval façade |
| Tenant role assignment | Security Tenant role API | Needs composite approval façade |
| Dealer/outlet business scope | Audit Core business assignments | Admin API missing |
| Dealer/outlet read | Audit Core main | Available |
| Customer create/read | Audit Core main | Available |
| Journey create/read | Audit Core main | Available; hide master UUIDs from channel |
| Booking get/put | Audit Core main | Available |
| Staff reference selector | Audit Core feature branch | Not merged/registered |
| Product SKU selector | Audit Core feature branch | Not merged/registered |
| Status code selector | Audit Core feature branch | Not merged/registered |
| Evidence upload | Audit Core → Security → DI | Available |
| Evidence async status/facts | Audit Core main | Available |
| Journey document checklist | Audit Core data exists | Read API missing |
| Payments | Audit Core main | Available |
| Commercials/discounts | Audit Core main | Available |
| Insurance | Audit Core main | Available |
| Trade-in | Audit Core main | Available |
| Vehicle/registration | Audit Core main | Available |
| Delivery | Audit Core main | Available |
| Findings | Audit Core main | Available |
| PC submit → TL task | Audit Core main | Available |
| TL task lifecycle | Audit Core main | Available; task lacks journeyId |
| SEND_BACK → PC correction | Audit Core main | Available |
| PM review stage | Partial model support | Workflow transition/task gap |
| PC My Work read model | None | Missing |

---

# 19. API Gap Register before implementation

**No implementation is authorized by this wireframe document.**

## P0 — required for requested journeys

### WEB-API-001 — Audit Core authentication/onboarding façade

Channel-safe Audit Core equivalents for signup, OTP verify/resend, USER login and Platform Admin login. Audit Core forwards transient secrets to Security with strict redaction and never owns Clerk configuration.

### WEB-API-002 — Composite Super Admin approval

One Audit Core operation should orchestrate Security Tenant role + Audit Core business assignment + Security activation. Browser must not sequence low-level calls.

### WEB-API-003 — Authenticated channel context

Web/Mobile needs a simple context containing current user, Tenant, project, roles/permissions, business assignments and current dealer/outlet scope. Never ask users for UUIDs.

Multi-Tenant selection needs an explicit product/API decision.

### WEB-API-005 — Reference selectors

Review/promote/register the existing `feat/web-reference-api-v1` direction for active outlet staff, product SKUs and business status codes.

### WEB-API-006 — Journey document requirements read API

Expose required/optional evidence items so the checklist remains policy/config-driven.

### WEB-API-007 — Task must expose Journey linkage

At minimum add `journeyId`; ideally concise customer/outlet context.

## P1 — complete operational UX

### WEB-API-004 — PC My Work read model

Recent/in-progress/sent-back Journeys scoped to current PC/business assignment.

### WEB-API-008 — PM workflow contract

If PM is mandatory, implement TL → PM transition/task + PM decision semantics in Audit Core.

### WEB-API-009 — Evidence-to-domain projection/provenance

Today channel can read Audit Core evidence facts then call Booking/Delivery domain APIs. Longer term prefer a server-side projection/resolution operation so evidence provenance stays stronger and channel does not become a domain-mapping engine.

## P2 — business decisions

### WEB-API-010 — TOTP challenge semantics

Current Security login accepts optional TOTP but a clean challenge/response contract should exist before showing conditional TOTP UI.

### WEB-API-011 — Delivery non-intimation reason

Legacy screens capture a reason; current Delivery API does not. Confirm whether requirement remains before adding anything.

---

# 20. Screen inventory

| ID | Screen | Actor | API readiness |
|---|---|---|---|
| AUTH-01 | Sign in | USER | façade gap |
| AUTH-02 | Create account | New user | façade gap |
| AUTH-03 | Verify email | New user | façade gap |
| AUTH-04 | Registration pending | New user | façade gap |
| AUTH-05 | Location permission | USER | context integration gap |
| ADM-01 | Administrator sign in | Super Admin | façade gap |
| ADM-02 | Pending approvals | Super Admin | façade gap |
| ADM-03 | Review + assign role/scope | Super Admin | composite API gap |
| ADM-04 | Approval complete | Super Admin | composite API gap |
| PC-01 | Home / My Work | PC | read-model gap |
| BOOK-01 | Customer context | PC | partly ready |
| BOOK-02 | Booking evidence capture | PC | ready except requirements API |
| BOOK-03 | Async extraction status | PC | ready |
| BOOK-04 | System-read Booking summary | PC | reference API gap |
| JRN-01 | Journey workspace | PC | composed from current APIs |
| PAY-01 | Payment summary | PC/TL | ready |
| COM-01 | Price/discount summary | PC/TL | ready |
| INS-01 | Insurance summary | PC/TL | ready |
| TRD-01 | Trade-in summary | PC/TL | ready |
| DEL-01 | Delivery workspace | PC | requirements/reference gaps |
| DEL-02 | Delivery facts | PC | ready |
| DEL-03 | Delivery evidence status | PC | ready |
| DEL-04 | Ready for review | PC | ready |
| PC-02 | Sent-back correction | PC | ready |
| TL-01 | Review queue | TL | task-link gap |
| TL-02 | Review Journey | TL | ready after task-link gap |
| TL-03 | Decision | TL | ready |
| PM-01 | PM review | PM | workflow gap if mandatory |
| EVD-01 | Evidence detail | PC/TL/PM | ready |

---

# 21. Deliberately excluded

- editable 20–30 field Booking Form recreation;
- direct DI screens;
- direct Security/Clerk screens for normal users;
- raw permission-key editing in approval flow;
- manual Tenant/device/GPS UUID/value entry;
- separate Web vs Mobile business workflows;
- hard-coded delivery checklist copied from old screens;
- analytics-heavy dashboard before operational workflows work;
- decorative charts with no action;
- PM behavior not implemented by Audit Core.

---

# 22. Owner decisions requested during review

1. **Evidence-first Booking:** Is Customer Name + Customer Type acceptable as the only mandatory PC input before Booking Form upload given current Audit Core ordering?
2. **Approval:** Should Super Admin assign Tenant + PC/TL/PM + Dealer + Outlet in one action? **Recommendation: yes.**
3. **PC landing page:** `My Work` rather than KPI dashboard? **Recommendation: yes.**
4. **Booking + Delivery:** one Journey workspace with stage cards rather than separate dense forms? **Recommendation: yes.**
5. **Extracted facts:** PC sees summaries and resolves only ambiguity; no generic `Edit all`? **Recommendation: yes.**
6. **PM stage:** mandatory for every Journey, only breach/exception, or configurable?
7. **Multi-Tenant login:** can a person belong to multiple Tenants in phase 1? If yes, we need explicit channel selection semantics.
8. **Delivery non-intimation reason:** retain or retire?

---

# 23. Next step after wireframe approval

```text
Wireframes approved
      ↓
Close/approve P0 API contracts
      ↓
Freeze Web + Mobile runtime architecture
      ↓
Select shared-code technology stack
      ↓
Create component/design-system contract
      ↓
Implement vertical journeys one at a time
      ↓
E2E against Audit Core only
```

The runtime/tech-stack review will explicitly optimize for startup cost and maximum shared Web/Mobile code, with native camera and GPS as the main mobile-specific capabilities. It is intentionally deferred until this UX/API contract is reviewed.
