# UC-001 — Web/Desktop Low-Fidelity Wireframes

**Status:** DRAFT FOR DESIGN REVIEW  
**Intent:** Functional layout contract. Branding/high-fidelity treatment follows `docs/BRANDING_GUIDELINES.md`.

---

## A01 — Authentication entry

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ VERIGENCE                                                                    │
├─────────────────────────────────┬────────────────────────────────────────────┤
│                                 │                                            │
│  Verigence brand / product      │          Welcome back                      │
│  context                         │          Sign in to continue               │
│                                 │                                            │
│  Audit • Governance •           │          Email or mobile number            │
│  Intelligence                   │          [________________________]         │
│                                 │                                            │
│                                 │          Password                           │
│                                 │          [________________________]         │
│                                 │                                            │
│                                 │          [        Sign in        ]          │
│                                 │                                            │
│                                 │          ───── New to Verigence? ─────     │
│                                 │          [     Create account     ]         │
│                                 │                                            │
└─────────────────────────────────┴────────────────────────────────────────────┘
```

UC-001 begins when **Create account** is selected.

---

## A02 — Create account / empty

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ VERIGENCE                                                                    │
├─────────────────────────────────┬────────────────────────────────────────────┤
│                                 │                                            │
│  Create your                    │  Create your Verigence account             │
│  Verigence account              │  Enter your details and the Verigence      │
│                                 │  Identifier provided to you.               │
│  01 Enter your details          │                                            │
│  02 Verify your email           │  First Name            Last Name           │
│  03 Wait for review             │  [______________]      [______________]    │
│                                 │                                            │
│  No Tenant, role or Dealer/     │  Verigence Identifier                    │
│  Outlet details are requested.  │  [____________________________________]    │
│                                 │  Provided to you for Verigence onboarding. │
│                                 │                                            │
│                                 │  Email ID                                  │
│                                 │  [____________________________________]    │
│                                 │                                            │
│                                 │  Mobile Number                             │
│                                 │  [____________________________________]    │
│                                 │                                            │
│                                 │  Password                          [Show]   │
│                                 │  [____________________________________]    │
│                                 │  [password guidance — OPEN DECISION]       │
│                                 │                                            │
│                                 │  [              Continue              ]    │
│                                 │                                            │
│                                 │  Already have an account? Sign in          │
└─────────────────────────────────┴────────────────────────────────────────────┘
```

### Layout notes

- First and Last Name may share one row on wide screens; they remain separate fields.
- Remaining fields use full card width.
- Password guidance cannot invent Security rules.
- No Device/Geo prompts.

---

## A03 — Create account / validation + Security error

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ Create your Verigence account                                                │
│                                                                              │
│ First Name                         Last Name                                  │
│ [Aditi____________________]        [________________________]                 │
│                                    ▲ Last Name is required                    │
│                                                                              │
│ Verigence Identifier                                                        │
│ [VG-_______________________________]                                         │
│                                                                              │
│ Email ID                                                                     │
│ [not-an-email______________________]                                         │
│ ▲ Enter a valid email address                                                │
│                                                                              │
│ Mobile Number                                                                │
│ [_______________________________]                                            │
│                                                                              │
│ Password                                                       [Show]         │
│ [••••••••••••____________________]                                           │
│                                                                              │
│ ┌──────────────────────────────────────────────────────────────────────────┐ │
│ │ We could not create this registration. Review the details and try again.│ │
│ │ [Exact Security error mapping to be approved from deployed contract.]    │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│ [                              Continue                                  ]   │
└──────────────────────────────────────────────────────────────────────────────┘
```

The form must distinguish local validation from a server-rejected request without inventing new account states.

---

## A04 — Create account / submitting

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ Create your Verigence account                                                │
│                                                                              │
│ [completed form values remain visible; password stays masked]                │
│                                                                              │
│ [                         Creating account…                              ]     │
│                         primary action disabled                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

Duplicate submits are disabled while the request is in progress.

---

## A05 — Verify email / normal

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ VERIGENCE                                                                    │
├─────────────────────────────────┬────────────────────────────────────────────┤
│                                 │                                            │
│  Email verification             │  Verify your email                         │
│                                 │  Enter the verification code sent to       │
│  Your password stays with the   │  your email address.                       │
│  secure Verigence authentication│                                            │
│  flow.                           │  Verification code                         │
│                                 │  [ _ ] [ _ ] [ _ ] ...                    │
│                                 │  Exact digit count: OPEN DECISION          │
│                                 │                                            │
│                                 │  [           Verify email           ]       │
│                                 │                                            │
│                                 │  Didn't receive a code?                     │
│                                 │  Send another code                          │
│                                 │                                            │
└─────────────────────────────────┴────────────────────────────────────────────┘
```

The UI never mentions Clerk and never asks for a Clerk token.

---

## A06/A07 — Verify email / error + resend feedback

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ Verify your email                                                            │
│                                                                              │
│ Verification code                                                            │
│ [ _ ] [ _ ] [ _ ] ...                                                       │
│ ▲ The code could not be verified.                                            │
│   [Exact message follows Security response mapping.]                         │
│                                                                              │
│ [                            Verify email                               ]     │
│                                                                              │
│ Send another code                                                            │
│ ┌──────────────────────────────────────────────────────────────────────────┐ │
│ │ A new code request was submitted.                                        │ │
│ │ No fixed countdown is shown until the backend contract defines one.      │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## A08 — Registration pending

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ VERIGENCE                                                                    │
│                                                                              │
│                      ✓ Email verified                                        │
│                                                                              │
│                 [ Pending review ]                                           │
│                                                                              │
│             Your registration is under review                               │
│                                                                              │
│     Your email has been verified. A Verigence SuperAdmin will               │
│     review your account.                                                     │
│                                                                              │
│                       [ Back to sign in ]                                    │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

Do not show role, Tenant, Dealer/Outlet or authorization details.

---

## A09 — Registration rejected / conditional visual state

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ VERIGENCE                                                                    │
│                                                                              │
│                    [ Registration rejected ]                                 │
│                                                                              │
│              This registration is not active.                               │
│                                                                              │
│     Applicant notification/resubmission behaviour is an OPEN DECISION.      │
│     No retry/resubmit button is approved by this wireframe.                  │
│                                                                              │
│                       [ Back to sign in ]                                    │
└──────────────────────────────────────────────────────────────────────────────┘
```

This is a visual state only; UC-001 does not invent how the applicant is routed here.

---

# SuperAdmin Web/Desktop

## S01/S02/S03/S04 — Pending USER list states

### Populated wide-screen layout

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ VERIGENCE                                      SuperAdmin                    │
├──────────────────────────────────────────────────────────────────────────────┤
│ User onboarding                                                              │
│ Pending global users                                                         │
│                                                                              │
│ ┌─────────────────────────────┐  ┌─────────────────────────────────────────┐ │
│ │ Pending users               │  │ Select a pending user                  │ │
│ │                             │  │                                         │ │
│ │ Aditi Sharma                │  │ Identity-only onboarding review.        │ │
│ │ aditi@company.com        >  │  │ Tenant/role/business scope is assigned  │ │
│ │ Pending                     │  │ separately.                             │ │
│ │                             │  │                                         │ │
│ │ Nikhil Arora                │  │                                         │ │
│ │ nikhil@company.com       >  │  │                                         │ │
│ │ Pending                     │  │                                         │ │
│ └─────────────────────────────┘  └─────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Loading

```text
Pending global users
[██████████████████]
[██████████████    ]
[████████████████  ]
```

### Empty

```text
✓ No users are waiting for onboarding review.
```

### Error

```text
Pending users could not be loaded.
[ Retry ]
```

No Web fallback/demo queue is considered authoritative after integration.

---

## S05 — Pending USER detail

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ User onboarding  /  Pending users  /  Aditi Sharma                          │
│                                                                              │
│ [ PENDING ]                                                                  │
│                                                                              │
│ Aditi Sharma                                                                 │
│                                                                              │
│ First Name                  Aditi                                             │
│ Last Name                   Sharma                                            │
│ Email                       aditi@company.com                                 │
│ Mobile                      +91 …                                             │
│ Status                      PENDING                                           │
│ [Other Security-provided non-secret fields only, if present]                 │
│                                                                              │
│ This review activates or rejects the global Verigence USER only.             │
│ Tenant, operating role, Dealer/Outlet and permissions are assigned           │
│ separately.                                                                  │
│                                                                              │
│ [ Reject user ]                               [ Activate user ]              │
└──────────────────────────────────────────────────────────────────────────────┘
```

Do not display password, OTP, Clerk subject or secret values.

---

## S06 — Confirm activation

```text
┌────────────────────────── Confirm activation ────────────────────────────────┐
│                                                                              │
│ Activate Aditi Sharma?                                                       │
│                                                                              │
│ This changes the global Verigence USER from PENDING to ACTIVE.               │
│ It does not assign a Tenant, operating role or Dealer/Outlet scope.           │
│                                                                              │
│ [ Cancel ]                                           [ Activate user ]        │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## S07 — Confirm rejection

```text
┌─────────────────────────── Confirm rejection ────────────────────────────────┐
│                                                                              │
│ Reject Aditi Sharma?                                                         │
│                                                                              │
│ This changes the global Verigence USER from PENDING to REJECTED.             │
│                                                                              │
│ [ Cancel ]                                           [ Reject user ]          │
└──────────────────────────────────────────────────────────────────────────────┘
```

No rejection-reason field is added until explicitly defined.

---

## S08 — Decision progress / result / conflict

### Progress

```text
[ Activating user… ]
Actions disabled until Security responds.
```

### Success

```text
✓ User activated
Status: ACTIVE
[ Back to pending users ]
```

or

```text
✓ User rejected
Status: REJECTED
[ Back to pending users ]
```

### Conflict/stale state

```text
This user is no longer pending.
Current status: [authoritative Security state]
[ Refresh ]
```

The Web client never fabricates a successful status transition.