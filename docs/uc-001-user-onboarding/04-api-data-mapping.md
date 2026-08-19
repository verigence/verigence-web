# UC-001 — API & Data Mapping

**Status:** IMPLEMENTATION CONTRACT VERIFIED  
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

| UI concept | Client field | Security transport | Persistence in Web | Notes |
|---|---|---|---|---|
| First Name | `firstName` | body `firstName` | no durable onboarding DB | required |
| Last Name | `lastName` | body `lastName` | no durable onboarding DB | required |
| Verigence Identifier | `verigenceIdentifier` | header `X-Onboarding-Key` | no | technical header name is not shown to the applicant |
| Email ID / work email | `email` | body `email` | no durable onboarding DB | verification target |
| Mobile Number | `mobile` | body `mobile` | no durable onboarding DB | required |
| Password | `password` | body `password` | **never persist** | transient secret |

Canonical request shape:

```text
Headers:
  Content-Type: application/json
  X-Onboarding-Key: <Verigence Identifier>

Body:
  firstName
  lastName
  email
  mobile
  password
```

The current Security implementation normalizes/validates an Indian mobile number and Web sends the approved `+91` form value.

### Explicitly absent

Do not send or add signup form fields for:

- `tenantId`;
- operating role;
- administrative role;
- Dealer/Outlet;
- Project;
- permission scope;
- TOTP/MFA;
- mandatory Device ID;
- mandatory Geo.

## 3. Optional Device/Geo request context

Security v2 permits optional Device ID / Geo request-context headers on signup/login but Phase 1 does not require, persist or evaluate them for onboarding/authentication decisions.

UC-001 implementation therefore adds:

- no Device ID input field;
- no Geo input field;
- no location-permission prerequisite;
- no local persistence for these values;
- no onboarding database change;
- no Device/Geo request context solely for UC-001.

Whether optional context is introduced later remains a separate decision and must not become an onboarding gate.

## 4. Signup response -> active onboarding state

Current Security response:

```json
{
  "signupAttemptId": "<Security signup-attempt id>",
  "status": "EMAIL_VERIFICATION_REQUIRED",
  "expiresAt": "<ISO timestamp>"
}
```

Client handling:

- retain `signupAttemptId` only for the active component workflow;
- retain `expiresAt` only to present the approved verification-expiry UI;
- retain the email address required for the verification screen;
- clear the signup form after successful submission;
- never persist the password;
- never invent a Web access-request ID such as `AR-WEB-*`.

## 5. Email OTP verification

### Endpoint

```http
POST /security/v1/onboarding/users/{signupAttemptId}/verify-email
```

### Verified transport

```json
{
  "code": "<transient verification code>"
}
```

Handling rules:

- code is transient component state only;
- client sends it to Security only;
- Security performs Clerk-backed verification;
- Web/Mobile never sends the code to Clerk directly;
- code is not logged, persisted, cached or placed in a URL;
- code state is cleared after successful verification.

The frozen approved mockup uses a six-position OTP presentation. That is a UI decision; Web still treats Security as authoritative for verification acceptance and does not implement its own credential-verification logic.

## 6. Resend email code

### Endpoint

```http
POST /security/v1/onboarding/users/{signupAttemptId}/resend-email-code
```

Current Security response:

```json
{
  "signupAttemptId": "<same active attempt>",
  "status": "EMAIL_VERIFICATION_REQUIRED",
  "expiresAt": "<ISO timestamp>"
}
```

Client behavior:

- remain on Verify Email;
- disable verify/resend while resend is in flight;
- clear the existing entered code after successful resend;
- show safe success feedback;
- accept the returned `expiresAt` value;
- do not invent resend limits, cooldowns or maximum-attempt rules.

## 7. Verified onboarding result

Current successful verification response:

```json
{
  "onboardingRequestId": "<Security onboarding request id>",
  "status": "PENDING_ADMIN_APPROVAL",
  "message": "<Security message>"
}
```

Security then owns the resulting global USER in lifecycle status `PENDING`.

Client state becomes:

```text
Email verified
     |
     v
Registration received
     |
     v
Global USER = PENDING
```

Web does not independently create a USER, Tenant membership, role assignment or authorization record.

## 8. SuperAdmin pending USER list

### Endpoint

```http
GET /security/v1/platform/users?userStatus=PENDING&limit=200&offset=0
Authorization: Bearer <Security human access JWT>
```

Verified query parameters from `verigence-security/dev`:

- `userStatus` — used as `PENDING` for UC-001;
- `search` — available but not required for the minimal UC-001 screen;
- `limit` — 1..200;
- `offset` — non-negative.

UC-001 currently requests at most 200 pending users and does not invent a separate Web pagination model.

### Response model used by Web

Security returns:

```text
userId
displayName
primaryEmail
primaryMobile
status
clerkSubject
onboardingStatus
createdAtUtc
updatedAtUtc
```

UI rules:

- display only approved non-secret identity/status fields;
- do **not** render `clerkSubject`;
- do not display password, OTP or any credential material;
- pending list data is selection/navigation data, not sufficient by itself for a lifecycle decision.

## 9. SuperAdmin authoritative USER detail

### Endpoint

```http
GET /security/v1/platform/users/{userId}
Authorization: Bearer <Security human access JWT>
```

Before Activate/Reject is enabled, Web loads this detail response and confirms the authoritative current USER status is still `PENDING`.

If detail cannot be loaded:

- decision controls remain unavailable;
- the UI shows the failure and retry action;
- the list row is not treated as authoritative for the decision.

## 10. SuperAdmin onboarding decision

### Endpoint

```http
PATCH /security/v1/users/{userId}/status
Authorization: Bearer <Security human access JWT>
Content-Type: application/json
```

Allowed UC-001 transitions:

| Current | Requested target | Actor |
|---|---|---|
| `PENDING` | `ACTIVE` | SuperAdmin only |
| `PENDING` | `REJECTED` | SuperAdmin only |

Activation body:

```json
{
  "status": "ACTIVE"
}
```

Rejection body:

```json
{
  "status": "REJECTED"
}
```

Security's broader lifecycle schema supports optional `reasonCode` / `reason`, but the approved UC-001 wireframes do not define a rejection-reason field. UC-001 therefore sends the minimal status-only body.

Verified response shape:

```text
userId
status
previousStatus
changed
deletionRequestId
```

Client requirements:

1. load authoritative detail;
2. ensure current status is `PENDING`;
3. require explicit confirmation;
4. submit the status transition;
5. disable competing actions while the request is in flight;
6. show success only after Security confirms;
7. refresh pending list after success;
8. on failure/stale conflict, refresh authoritative detail and display current Security status.

## 11. Status vocabulary

For UC-001 onboarding decision:

```text
PENDING
  |-- ACTIVE
  `-- REJECTED
```

Do not introduce the old Web `APPROVED` status.

`SUSPENDED` and `DISABLED` are broader USER-lifecycle states and are not onboarding decision targets in UC-001.

## 12. Role and business-scope separation

No applicant signup or SuperAdmin activation/rejection request carries:

- `roleKey`;
- Tenant ID;
- Dealer/Outlet ID;
- permission keys;
- Project assignment.

Any later assignment flows use their own Security/Audit Core contracts and use-case designs.

## 13. Client-side models

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
signupAttemptId
email
verificationCode   # transient
expiresAt
```

### SuperAdmin review state

```text
pending GlobalUserDirectoryItem[]
selectedUserId
Security authoritative USER detail
confirmation mode
successful decision result
```

Old Web `AccessRequest` / `OperationalRoleKey` models are not used by the UC-001 Security approval page.

## 14. Error handling rules

The UI represents at least these categories:

- signup field/input validation;
- rejected/invalid Verigence Identifier;
- duplicate/conflicting onboarding identity;
- unusable/expired signup attempt;
- verification failure;
- resend failure;
- network/service failure;
- unauthorized/forbidden SuperAdmin operation;
- status-transition conflict/stale state.

Rules:

- never fabricate Security error codes;
- never expose Clerk-specific UI or Clerk credentials;
- never convert an error into `PENDING`, `ACTIVE` or `REJECTED` locally;
- never log password/OTP;
- never fall back to demo/local onboarding data for a protected Security failure.

Exact final user-facing copy for every Security error code remains an implementation-hardening item once live DEV responses are exercised.

## 15. Correlation/request tracing

Security owns platform correlation/audit behavior.

The exact browser/mobile responsibility for creating versus propagating a correlation header remains to be taken from the deployed HTTP contract. UC-001 does not invent a competing request-ID scheme.

## 16. Environment/routing

Web uses:

```text
VITE_SECURITY_BASE_URL
```

If blank, the client calls the same-origin `/security/*` path. Otherwise it calls the configured environment-specific Security base URL.

Deployment verification must confirm browser CORS/routing and Capacitor connectivity for the selected environment.

## 17. Later login boundary — reference only

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

UC-001 does not redesign canonical login. The applicant flow only returns to Sign In. The SuperAdmin approval UI consumes an already-established Security human access token.

## 18. Implementation verification status

Verified from current `verigence-security/dev` source before implementation:

- [x] signup endpoint and request body;
- [x] `X-Onboarding-Key` header contract;
- [x] signup response `signupAttemptId`, status and `expiresAt`;
- [x] verify-email request property `code`;
- [x] resend endpoint and response shape;
- [x] verified result `PENDING_ADMIN_APPROVAL`;
- [x] pending USER query parameter `userStatus`;
- [x] pending USER list/detail response fields;
- [x] status PATCH body property `status`;
- [x] status PATCH response shape;
- [x] SuperAdmin-only protection of pending-user administration;
- [ ] live Security DEV CORS/routing verification from browser;
- [ ] live applicant signup/OTP exercise;
- [ ] live SuperAdmin list/detail/decision exercise with Security-issued human JWT;
- [ ] final correlation-header client behavior if required by deployment.

If live verification exposes a concrete missing backend capability, return to design review rather than inventing a Web workaround.
