# UC-001 — User Onboarding Sequence Diagrams

**Status:** DRAFT FOR DESIGN REVIEW  
**Date:** 2026-08-19

## 1. Component boundary

The same Verigence React application is used for browser and Capacitor mobile. For UC-001 both clients use Verigence Security APIs. Neither client calls Clerk.

```text
Browser Web ------------------+
                              |
Capacitor Android / iOS ------+----> Verigence Security ----> Clerk Backend API
```

Audit Core and DI are intentionally absent from the UC-001 signup/OTP path.

---

## 2. Signup + email OTP + PENDING

```mermaid
sequenceDiagram
    autonumber
    actor Applicant
    participant Client as Verigence Web / Capacitor Mobile
    participant Security as Verigence Security
    participant Clerk as Clerk Backend API

    Applicant->>Client: Select Create account
    Client-->>Applicant: Show 6-field signup form
    Applicant->>Client: First Name, Last Name, Verigence Identifier,<br/>Email ID, Mobile Number, Password

    Client->>Security: POST /security/v1/onboarding/users<br/>X-Onboarding-Key: Verigence Identifier<br/>body: firstName,lastName,email,mobile,password
    Security->>Security: Validate onboarding gate + duplicate constraints
    Security->>Clerk: Create/coordinate human credential identity
    Clerk-->>Security: Identity/signup result
    Security->>Clerk: Initiate email-code verification
    Clerk-->>Security: Verification initiation result
    Security-->>Client: Signup attempt reference / accepted verification state

    Client-->>Applicant: Show Verify email
    Applicant->>Client: Enter email OTP
    Client->>Security: POST /security/v1/onboarding/users/{signupAttemptId}/verify-email<br/>transient OTP
    Security->>Clerk: Verify email code
    Clerk-->>Security: Verified
    Security->>Security: Bind Clerk subject to global Verigence USER
    Security->>Security: USER = PENDING
    Security-->>Client: Verification/onboarding success
    Client-->>Applicant: Show Registration pending
```

### Important rules

- Password and OTP are transient.
- No Clerk token passes through the client.
- No `tenantId` appears in the signup path.
- No role/Dealer/Outlet selection appears in the signup path.
- Optional Device/Geo context, if supplied by a client, is not required, persisted or evaluated as a Phase-1 gate.

---

## 3. Email-code resend

```mermaid
sequenceDiagram
    autonumber
    actor Applicant
    participant Client as Verigence Web / Capacitor Mobile
    participant Security as Verigence Security
    participant Clerk as Clerk Backend API

    Applicant->>Client: Request another email code
    Client->>Security: POST /security/v1/onboarding/users/{signupAttemptId}/resend-email-code
    Security->>Clerk: Request new email verification code
    Clerk-->>Security: Resend result
    Security-->>Client: Resend result
    Client-->>Applicant: Stay on Verify email + feedback
```

**OPEN DECISION:** The reviewed 19-Aug Security documents do not define client-visible resend countdown, throttle interval or maximum resend count. The design must not invent those values.

---

## 4. SuperAdmin activation

```mermaid
sequenceDiagram
    autonumber
    actor SuperAdmin
    participant AdminUI as Verigence Web / Capacitor Mobile
    participant Security as Verigence Security

    SuperAdmin->>AdminUI: Open pending USER review
    AdminUI->>Security: GET /security/v1/platform/users<br/>filter/search as supported for PENDING
    Security-->>AdminUI: Authoritative USER list/state
    AdminUI-->>SuperAdmin: Show pending USERs

    SuperAdmin->>AdminUI: Open USER detail
    AdminUI->>Security: GET /security/v1/platform/users/{userId}
    Security-->>AdminUI: Authoritative global USER detail
    AdminUI-->>SuperAdmin: Show identity + PENDING status

    SuperAdmin->>AdminUI: Select Activate + confirm
    AdminUI->>Security: PATCH /security/v1/users/{userId}/status<br/>target transition PENDING -> ACTIVE
    Security->>Security: Authorize SuperAdmin + validate transition
    Security->>Security: USER = ACTIVE
    Security-->>AdminUI: Updated USER state
    AdminUI-->>SuperAdmin: Show ACTIVE result / remove from pending queue
```

The activation UI does **not** assign Tenant, role, Dealer/Outlet or permissions.

**OPEN DECISION:** The exact PATCH request envelope for the target status must be taken from the deployed Security API contract; this design does not invent the JSON field name.

---

## 5. SuperAdmin rejection

```mermaid
sequenceDiagram
    autonumber
    actor SuperAdmin
    participant AdminUI as Verigence Web / Capacitor Mobile
    participant Security as Verigence Security

    SuperAdmin->>AdminUI: Open PENDING USER
    SuperAdmin->>AdminUI: Select Reject + confirm
    AdminUI->>Security: PATCH /security/v1/users/{userId}/status<br/>target transition PENDING -> REJECTED
    Security->>Security: Authorize SuperAdmin + validate transition
    Security->>Security: USER = REJECTED
    Security-->>AdminUI: Updated USER state
    AdminUI-->>SuperAdmin: Show REJECTED result / remove from pending queue
```

**OPEN DECISION:** A mandatory rejection reason is not defined in the reviewed 19-Aug source of truth and therefore is not added to UC-001.

---

## 6. Signup error — onboarding request rejected

```mermaid
sequenceDiagram
    autonumber
    actor Applicant
    participant Client as Verigence Web / Capacitor Mobile
    participant Security as Verigence Security

    Applicant->>Client: Submit signup
    Client->>Security: POST /security/v1/onboarding/users
    Security-->>Client: Validation / onboarding / duplicate error
    Client-->>Applicant: Keep Create account visible + show safe error
```

The client must not translate a Security failure into a locally invented account state.

---

## 7. OTP verification error

```mermaid
sequenceDiagram
    autonumber
    actor Applicant
    participant Client as Verigence Web / Capacitor Mobile
    participant Security as Verigence Security
    participant Clerk as Clerk Backend API

    Applicant->>Client: Enter OTP
    Client->>Security: Verify email via Security
    Security->>Clerk: Verify code
    Clerk-->>Security: Verification failed
    Security-->>Client: Verification error
    Client-->>Applicant: Stay on Verify email + show error
```

The UI does not reveal Clerk implementation details.

---

## 8. Decision conflict / stale admin view

```mermaid
sequenceDiagram
    autonumber
    actor SuperAdmin
    participant AdminUI as Verigence Web / Capacitor Mobile
    participant Security as Verigence Security

    SuperAdmin->>AdminUI: Confirm Activate or Reject
    AdminUI->>Security: Request PENDING status transition
    Security->>Security: USER is no longer eligible for requested transition
    Security-->>AdminUI: Conflict / current authoritative state
    AdminUI->>Security: Refresh USER detail/list
    Security-->>AdminUI: Current state
    AdminUI-->>SuperAdmin: Show current state; do not repeat silently
```

---

## 9. Post-activation boundary

After activation, UC-001 may return the person to the existing Sign In entry. Canonical login is a later use case:

```text
POST /security/v1/auth/login
body: identifier + password
```

There is no `tenantId`, mandatory Device/Geo or Phase-1 TOTP/MFA in that login request.

Tenant context, operating role, Dealer/Outlet and permissions are resolved separately after global identity authentication and are outside UC-001.