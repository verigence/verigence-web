# UC-001 — API & Data Mapping

**Status:** DRAFT FOR DESIGN REVIEW  
**Date:** 2026-08-19  
**Authoritative backend:** `verigence-security/dev`

## 1. Integration rule

UC-001 Web/Mobile calls Verigence Security APIs. Security alone integrates with Clerk Backend APIs.

```text
Verigence React app
  |-- Browser
  `-- Capacitor Android/iOS
          |
          | HTTPS
          v
     Verigence Security
          |
          | Clerk Backend API
          v
         Clerk
```

Web/Mobile must not contain Clerk SDKs, Clerk keys or Clerk session-token logic.

## 2. Signup UI -> Security request

### Endpoint

```http
POST /security/v1/onboarding/users
```

### Mapping

| UI label | Client model intent | Security transport | Persistence in Web | Notes |
|---|---|---|---|---|
| First Name | `firstName` | body `firstName` | no durable onboarding DB | required by canonical signup contract |
| Last Name | `lastName` | body `lastName` | no durable onboarding DB | required by canonical signup contract |
| Verigence Identifier | client-only form field | header `X-Onboarding-Key` | no | do not expose header name in UI |
| Email ID | `email` | body `email` | no durable onboarding DB | email verification target |
| Mobile Number | `mobile` | body `mobile` | no durable onboarding DB | not optional in frozen signup contract |
| Password | transient `password` | body `password` | **never persist** | secret; never log/audit/cache in Web |

Canonical request shape:

```text
Headers:
  X-Onboarding-Key: <Verigence Identifier>

Body:
  firstName
  lastName
  email
  mobile
  password
```

### Explicitly absent

Do not send or add signup form fields for:

- `tenantId`;
- role;
- Dealer/Outlet;
- Project;
- permission scope;
- TOTP/MFA;
- mandatory Device ID;
- mandatory Geo.

## 3. Optional Device/Geo request context

Security v2 permits optional client Device ID / Geo request-context headers on signup/login but Phase 1 does not require, persist or evaluate them for authentication/onboarding authorization.

UC-001 therefore defines:

- no Device ID input field;
- no Geo input field;
- no location permission prompt as a prerequisite;
- no local persistence for these values;
- no onboarding database change.

**OPEN DECISION:** Whether the Web/Capacitor client sends optional context at all. No implementation should be added simply to satisfy UC-001.

## 4. Signup response -> client workflow

Security's follow-up routes require `{signupAttemptId}`:

```text
POST /security/v1/onboarding/users/{signupAttemptId}/verify-email
POST /security/v1/onboarding/users/{signupAttemptId}/resend-email-code
```

Therefore the client must retain the Security-provided signup-attempt reference for the active onboarding session.

### Client handling rule

- Keep only the minimum reference needed for the active flow.
- Do not put password or OTP into persisted state.
- Do not invent a Web access-request ID such as the old `AR-WEB-*` model.

**OPEN DECISION:** Exact initial response envelope/property name and any additional safe response fields are not specified by the reviewed 19-Aug design documents. The deployed Security API/OpenAPI must be used at implementation time.

## 5. Email OTP verification

### Endpoint

```http
POST /security/v1/onboarding/users/{signupAttemptId}/verify-email
```

### UI input

- Email verification code entered by the applicant.

### Handling

- OTP is transient.
- Client sends it to Security only.
- Security verifies through Clerk Backend API.
- Web/Mobile never sends the OTP to Clerk directly.
- OTP must not be logged, persisted, cached, placed in URLs or retained after the verification request completes.

**OPEN DECISION:** Exact request JSON field name and OTP length/format. Do not invent `code`, `otp`, digit count or other schema details before consuming the deployed Security contract.

## 6. Resend email code

### Endpoint

```http
POST /security/v1/onboarding/users/{signupAttemptId}/resend-email-code
```

### UI action

**Send another code**

### Handling

- Remain on Verify Email.
- Surface the Security result.
- Do not invent a resend cooldown or maximum retry count.

**OPEN DECISION:** Exact request/response envelope and client-visible retry/throttle metadata.

## 7. Verified onboarding result

After successful email verification Security:

1. verifies the code through Clerk;
2. validates the expected identity/email relationship;
3. records/binds the Clerk subject to the global Verigence USER;
4. keeps the USER in `PENDING`.

Client UI state:

```text
Email verified
     |
     v
PENDING REVIEW
```

The client does not independently create a USER, Tenant membership or authorization record.

## 8. SuperAdmin pending USER read

Security v2 defines the global USER APIs:

```text
GET /security/v1/platform/users
GET /security/v1/platform/users/{userId}
```

### List usage

UC-001 SuperAdmin review needs a view of users in the `PENDING` state.

**OPEN DECISION:** Exact query parameter syntax for filtering/pagination/search must be read from the deployed Security API/OpenAPI. The Web design must not invent a `status=PENDING` query if the implementation exposes a different contract.

### Detail usage

Use the Security global USER detail as the authoritative identity/status source for the review screen.

Display only fields supplied by that contract and approved for UI use. Never display password, OTP or secret values.

## 9. SuperAdmin onboarding decision

Security v2 defines:

```text
PATCH /security/v1/users/{userId}/status
```

The endpoint enforces transition-specific authority.

### UC-001 allowed transitions

| Current | Target | Actor |
|---|---|---|
| `PENDING` | `ACTIVE` | SuperAdmin only |
| `PENDING` | `REJECTED` | SuperAdmin only |

### Client requirements

1. Load authoritative current USER state.
2. Require explicit confirmation.
3. Submit the requested status transition to Security.
4. Wait for Security success before showing completion.
5. Refresh list/detail after success or conflict.

**OPEN DECISION:** Exact PATCH request JSON field name/envelope and exact response shape. Use the deployed Security contract at implementation time.

## 10. Status vocabulary

For the UC-001 onboarding decision, only these global USER statuses are relevant:

```text
PENDING
  |-- ACTIVE
  `-- REJECTED
```

Do not introduce old Web `APPROVED` as a lifecycle state.

Other Security lifecycle states such as `SUSPENDED` and `DISABLED` belong to broader USER administration, not the applicant signup decision being designed here.

## 11. Role and business-scope separation

No signup or activation request in UC-001 carries:

- `roleKey`;
- Tenant ID;
- Dealer/Outlet ID;
- permission keys;
- Project assignment.

Any later administrative assignment flows must use their own Security/Audit Core contracts and their own use-case design.

## 12. Client-side model — design intent only

After approval, a clean Web implementation should conceptually separate:

### Signup form values

```text
firstName
lastName
verigenceIdentifier
email
mobile
password   # transient
```

### Verification state

```text
signupAttemptReference
email
verificationCode   # transient
```

### Global USER review model

Use the actual Security response model rather than preserving the current Web-only `AccessRequest` / `OperationalRoleKey` structure.

This section is design intent, not authorization to change source files yet.

## 13. Error mapping rules

At implementation time, Web must build an explicit mapping from the deployed Security error contract to user-facing copy.

Categories the UI must be able to represent:

- field/input validation;
- invalid/rejected Verigence Identifier;
- duplicate/conflicting onboarding identity;
- signup attempt invalid/unusable;
- OTP verification failure;
- resend failure/throttle if exposed by Security;
- service/network failure;
- unauthorized/forbidden SuperAdmin operation;
- status-transition conflict/stale UI state.

### Rules

- Never fabricate backend error codes.
- Never expose Clerk internals to the applicant.
- Never convert an error into `PENDING`, `ACTIVE` or `REJECTED` locally.
- Never log password/OTP while recording errors.

## 14. Correlation/request tracing

Security has its own platform correlation/audit standards. UC-001 Web should propagate the actual supported Security request correlation header when the implementation contract requires it.

**OPEN DECISION FOR WEB IMPLEMENTATION:** Exact client responsibility for correlation-ID creation versus propagation should be taken from the deployed Security API/HTTP contract, not inferred here.

## 15. Later login boundary — reference only

After a USER is `ACTIVE`, canonical human login is:

```http
POST /security/v1/auth/login
```

Body:

```text
identifier
password
```

No `tenantId`, mandatory Device/Geo or Phase-1 TOTP/MFA is part of canonical login.

UC-001 does not implement or redesign that login contract; it only returns the user to Sign In where appropriate.

## 16. Implementation-time contract verification checklist

Before writing UC-001 API code after design approval, verify against `verigence-security/dev` deployment/OpenAPI:

- [ ] exact signup response shape and signup-attempt property;
- [ ] exact verify-email request body field(s);
- [ ] exact resend request/response body;
- [ ] exact `GET /platform/users` filtering/pagination/search parameters;
- [ ] exact global USER detail response fields;
- [ ] exact status PATCH request/response body;
- [ ] exact Security error codes/statuses safe for UI mapping;
- [ ] exact correlation-header behaviour required from browser/mobile;
- [ ] Security CORS/routing configuration required by the Web deployment.

If a required capability is actually missing, return to design review and record it as a concrete backend gap rather than inventing a Web workaround.