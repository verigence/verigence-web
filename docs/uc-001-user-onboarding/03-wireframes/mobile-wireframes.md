# UC-001 — Mobile Low-Fidelity Wireframes

**Status:** DRAFT FOR DESIGN REVIEW  
**Runtime:** Same React application wrapped by Capacitor; no separate mobile business flow.

Phone examples below are single-column compositions of the same UC-001 screens and actions defined for Web.

---

## A01 — Sign In entry

```text
┌────────────────────────────┐
│         VERIGENCE          │
│                            │
│       Welcome back         │
│ Sign in to continue        │
│                            │
│ Email or mobile number     │
│ [______________________]   │
│                            │
│ Password                   │
│ [__________________][👁]   │
│                            │
│ [       Sign in        ]   │
│                            │
│ ─── New to Verigence? ─── │
│ [    Create account    ]   │
└────────────────────────────┘
```

---

## A02 — Create account / top

```text
┌────────────────────────────┐
│ ← Sign in       VERIGENCE  │
│                            │
│ Create your Verigence      │
│ account                    │
│ Enter your details and the │
│ Verigence Identifier       │
│ provided to you.           │
│                            │
│ First Name                 │
│ [______________________]   │
│                            │
│ Last Name                  │
│ [______________________]   │
│                            │
│ Verigence Identifier       │
│ [______________________]   │
│ Provided to you for        │
│ Verigence onboarding.      │
│                            │
│              ↓ scroll      │
└────────────────────────────┘
```

---

## A02 — Create account / lower content

```text
┌────────────────────────────┐
│ Email ID                   │
│ [______________________]   │
│                            │
│ Mobile Number              │
│ [______________________]   │
│                            │
│ Password                   │
│ [__________________][Show] │
│ [guidance — OPEN DECISION] │
│                            │
│ [       Continue       ]   │
│                            │
│ Already have an account?   │
│ Sign in                    │
└────────────────────────────┘
```

All six fields are mandatory according to the frozen signup contract. The UI does not label Mobile Number as optional.

---

## A03 — Validation/error

```text
┌────────────────────────────┐
│ Create your account        │
│                            │
│ Last Name                  │
│ [______________________]   │
│ ▲ Last Name is required    │
│                            │
│ Email ID                   │
│ [not-an-email__________]   │
│ ▲ Enter a valid email      │
│                            │
│ ┌────────────────────────┐ │
│ │ Registration could not │ │
│ │ be submitted.          │ │
│ └────────────────────────┘ │
│                            │
│ [       Continue       ]   │
└────────────────────────────┘
```

On error, focus/scroll moves to the first meaningful error. Password is not persisted between application restarts.

---

## A04 — Submitting

```text
┌────────────────────────────┐
│ Create your account        │
│                            │
│ [form remains visible]     │
│                            │
│ [  Creating account…  ]    │
│ action disabled            │
└────────────────────────────┘
```

---

## A05 — Verify email

```text
┌────────────────────────────┐
│         VERIGENCE          │
│                            │
│ Verify your email          │
│ Enter the verification     │
│ code sent to your email.   │
│                            │
│ Verification code          │
│ [ _ ][ _ ][ _ ] ...       │
│ Exact length: OPEN         │
│                            │
│ [    Verify email     ]    │
│                            │
│ Didn't receive a code?     │
│ Send another code          │
└────────────────────────────┘
```

OTP entry supports the platform keyboard and paste behaviour while keeping the value transient.

---

## A06/A07 — OTP error/resend

```text
┌────────────────────────────┐
│ Verify your email          │
│                            │
│ [ _ ][ _ ][ _ ] ...       │
│ ▲ Code could not be        │
│   verified.                │
│                            │
│ [    Verify email     ]    │
│                            │
│ Send another code          │
│                            │
│ A new code request was     │
│ submitted.                 │
│ [No invented countdown]    │
└────────────────────────────┘
```

---

## A08 — Registration pending

```text
┌────────────────────────────┐
│         VERIGENCE          │
│                            │
│             ✓              │
│       Email verified       │
│                            │
│      [Pending review]      │
│                            │
│ Your registration is      │
│ under review               │
│                            │
│ Your email has been        │
│ verified. A Verigence      │
│ SuperAdmin will review     │
│ your account.              │
│                            │
│ [    Back to sign in   ]   │
└────────────────────────────┘
```

---

## A09 — Rejected conditional visual state

```text
┌────────────────────────────┐
│         VERIGENCE          │
│                            │
│  [Registration rejected]   │
│                            │
│ This registration is not  │
│ active.                    │
│                            │
│ Notification/resubmission │
│ remains an OPEN DECISION.  │
│                            │
│ [    Back to sign in   ]   │
└────────────────────────────┘
```

No resubmit action is added until its business behaviour is defined.

---

# SuperAdmin Mobile

Mobile admin uses the same API/actions as desktop but avoids a compressed split view.

## S04 — Pending USER list

```text
┌────────────────────────────┐
│ ← Admin        VERIGENCE   │
│                            │
│ User onboarding            │
│ Pending global users       │
│                            │
│ ┌────────────────────────┐ │
│ │ Aditi Sharma           │ │
│ │ aditi@company.com      │ │
│ │ [PENDING]           >  │ │
│ └────────────────────────┘ │
│                            │
│ ┌────────────────────────┐ │
│ │ Nikhil Arora           │ │
│ │ nikhil@company.com     │ │
│ │ [PENDING]           >  │ │
│ └────────────────────────┘ │
└────────────────────────────┘
```

Loading/empty/error use the same wording and semantics as desktop.

---

## S05 — Pending USER detail

```text
┌────────────────────────────┐
│ ← Pending users            │
│                            │
│ [PENDING]                  │
│ Aditi Sharma               │
│                            │
│ First Name                 │
│ Aditi                      │
│                            │
│ Last Name                  │
│ Sharma                     │
│                            │
│ Email                      │
│ aditi@company.com          │
│                            │
│ Mobile                     │
│ +91 …                      │
│                            │
│ Status                     │
│ PENDING                    │
│                            │
│ Global USER review only.   │
│ Tenant/role/business scope │
│ is assigned separately.    │
│                            │
│ [      Activate user   ]   │
│ [       Reject user    ]   │
└────────────────────────────┘
```

No role/business-scope widgets appear.

---

## S06 — Activate confirmation bottom sheet/dialog

```text
┌────────────────────────────┐
│ Activate Aditi Sharma?     │
│                            │
│ This changes the global    │
│ USER from PENDING to       │
│ ACTIVE.                    │
│                            │
│ It does not assign Tenant, │
│ role or Dealer/Outlet.     │
│                            │
│ [ Cancel ]                 │
│ [     Activate user    ]   │
└────────────────────────────┘
```

---

## S07 — Reject confirmation bottom sheet/dialog

```text
┌────────────────────────────┐
│ Reject Aditi Sharma?       │
│                            │
│ This changes the global    │
│ USER from PENDING to       │
│ REJECTED.                  │
│                            │
│ [ Cancel ]                 │
│ [      Reject user     ]   │
└────────────────────────────┘
```

No mandatory rejection reason is designed.

---

## S08 — Decision result

```text
┌────────────────────────────┐
│             ✓              │
│ User activated             │
│                            │
│ Status: ACTIVE             │
│                            │
│ [ Back to pending users ]  │
└────────────────────────────┘
```

Equivalent result is used for REJECTED.

For stale/conflict responses:

```text
┌────────────────────────────┐
│ User status changed        │
│                            │
│ This user is no longer     │
│ pending.                   │
│                            │
│ Current status: [Security] │
│                            │
│ [       Refresh        ]   │
└────────────────────────────┘
```

## Mobile implementation intent after approval

- Reuse the same route/component model where practical.
- Use responsive CSS/Ionic layout primitives rather than branching business logic by platform.
- Capacitor does not add a separate auth SDK.
- No Device/Geo permission prompt is introduced by UC-001.