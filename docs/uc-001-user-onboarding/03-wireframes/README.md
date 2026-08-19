# UC-001 — Wireframes / Mockup Specification

**Status:** DRAFT FOR DESIGN REVIEW  
**Platforms:** Responsive Web + Capacitor mobile, one React codebase

## 1. Visual source of truth

Use the existing approved Verigence identity without modification:

- approved `V` mark and `VERIGENCE` lockup from `public/brand/approved/`;
- Deep Blue `#003A82`;
- Electric Blue `#0057B8`;
- Teal `#00AFA8`;
- Mint `#00D3A7`;
- Mist `#F4F8FB`;
- White `#FFFFFF`;
- Slate Text `#1F2937`.

Do not reconstruct or reinterpret the logo.

## 2. Responsive product rule

This is not a separate desktop product and mobile product. It is one UI contract with responsive composition.

### Shared across Web and mobile

- same labels;
- same six signup fields;
- same OTP journey;
- same Security API calls;
- same USER states;
- same validation/error semantics;
- same SuperAdmin actions;
- no Tenant/role/Dealer/Outlet selection in onboarding.

### Web presentation

- authentication screens may use a two-panel composition: branded context panel + focused form card;
- SuperAdmin review may use list/detail split view at wide widths;
- strong keyboard/focus support.

### Mobile presentation

- one-column card/page flow;
- sticky or full-width primary action where appropriate;
- touch targets sized for handheld use;
- SuperAdmin list and detail become sequential views rather than compressed side-by-side columns.

## 3. Screen inventory

### Applicant

| ID | Screen/state | Web | Mobile |
|---|---|---|---|
| A01 | Sign In entry with Create account | yes | yes |
| A02 | Create account — empty | yes | yes |
| A03 | Create account — validation/error | yes | yes |
| A04 | Create account — submitting | yes | yes |
| A05 | Verify email — normal | yes | yes |
| A06 | Verify email — invalid/error | yes | yes |
| A07 | Verify email — resend feedback | yes | yes |
| A08 | Registration pending | yes | yes |
| A09 | Registration rejected visual state | conditional | conditional |

`A09` is a visual state only. The rejection notification/navigation mechanism is an **OPEN DECISION**.

### SuperAdmin

| ID | Screen/state | Web | Mobile |
|---|---|---|---|
| S01 | Pending USER list — loading | yes | yes |
| S02 | Pending USER list — empty | yes | yes |
| S03 | Pending USER list — error | yes | yes |
| S04 | Pending USER list — populated | yes | yes |
| S05 | Pending USER detail | yes | yes |
| S06 | Confirm activation | yes | yes |
| S07 | Confirm rejection | yes | yes |
| S08 | Decision progress/result/conflict | yes | yes |

## 4. Applicant content rules

### Create account fields — exact labels

1. First Name
2. Last Name
3. Verigence Identifier
4. Email ID
5. Mobile Number
6. Password

No extra organization/Tenant/role fields are allowed.

### Create account primary copy

Recommended design copy, subject to approval:

- Heading: **Create your Verigence account**
- Supporting text: **Enter your details and the Verigence Identifier provided to you.**
- Primary button: **Continue**
- Secondary navigation: **Already have an account? Sign in**

The UI should not mention Clerk.

### Verigence Identifier helper

Recommended copy:

**Provided to you for Verigence onboarding.**

Do not claim that it assigns Tenant, role, Dealer or Outlet scope.

### Verify email copy

Recommended design copy:

- Heading: **Verify your email**
- Supporting text: **Enter the verification code sent to your email address.**
- Primary button: **Verify email**
- Secondary action: **Send another code**

Do not show an invented countdown or fixed retry limit until the backend contract defines one.

### Pending copy

Recommended design copy:

- Status: **Pending review**
- Heading: **Your registration is under review**
- Supporting text: **Your email has been verified. A Verigence SuperAdmin will review your account.**
- Action: **Back to sign in**

Do not promise an email/SMS notification because the delivery mechanism is not yet defined.

## 5. SuperAdmin content rules

### Pending queue

Display only information available from Security's global USER/onboarding records. The review must remain identity-focused.

Do not include:

- Tenant selector;
- operating-role selector;
- Dealer/Outlet selector;
- permission editor;
- access-scope assignment.

### Detail actions

- Primary positive action: **Activate user**
- Destructive action: **Reject user**

Both actions require explicit confirmation before the Security transition call.

No mandatory rejection-reason field is added because the reviewed 19-Aug source of truth does not define one.

## 6. Interaction and accessibility baseline

- Every field has a visible label; placeholders are not the only label.
- Validation is presented near the affected field and summarized when useful.
- Password is masked with an optional show/hide affordance; the value is never echoed after submission.
- OTP controls support keyboard input and paste where technically safe.
- Loading states disable duplicate primary submissions.
- Error states preserve safe non-secret form values but do not persist password/OTP.
- Focus moves to the first meaningful error or new screen heading after transitions.
- Buttons and controls remain usable by keyboard and touch.
- Responsive behaviour must not remove required information or actions.

## 7. Detailed low-fidelity boards

- [`web-wireframes.md`](./web-wireframes.md)
- [`mobile-wireframes.md`](./mobile-wireframes.md)

These are the functional layout contract for review. A high-fidelity visual board should be derived from them using the approved Verigence assets and tokens; high-fidelity styling must not change the fields or flow.

## 8. Open visual decisions

1. Exact password-policy helper text once the deployed Security acceptance contract is confirmed.
2. Exact OTP digit count/input grouping.
3. Exact resend cooldown presentation.
4. Applicant-facing rejected-state entry/notification mechanism.
5. Whether SuperAdmin sees any additional non-sensitive onboarding metadata beyond the Security USER detail contract.

No visual design should resolve these by inventing backend behaviour.