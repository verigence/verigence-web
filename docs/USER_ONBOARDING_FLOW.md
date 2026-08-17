# Verigence V1 — User Onboarding Flow

**Status:** Web implementation in progress  
**Sequence:** Sign-up → Approval → Activation → Sign-in  
**Frontend boundary:** Web/Mobile call Audit Core; Security owns authentication and authorization.

## 1. Agreed sequence

The first V1 user flow is **Sign-up**, followed by **Approval**. Login is not the first flow and must not bypass approval.

```text
User
  │
  ▼
Sign-up / Access Request
  │
  ▼
PENDING APPROVAL
  │
  ├── Reject ─────────────► REJECTED / no access
  │
  └── Approve + role
          │
          ▼
       APPROVED
          │
          ▼
Identity linkage / activation
          │
          ▼
        Sign-in
```

## 2. Sign-up fields

V1 captures only information needed to identify and route the access request:

- full name — required;
- work email — required;
- organization / Tenant code — required;
- employee ID — optional;
- mobile number — optional.

The requester **does not select a role**.

## 3. Approval authority

The approval flow assigns the operating role after validating the request and Tenant. Initial operating choices are the approved Security templates:

- `PC` — Process Consultant;
- `TL` — Team Lead;
- `PM` — Project Manager / PMO;
- `CRM` — CRM operator.

`SUPER_ADMIN` and `TENANT_ADMIN` are privileged administration roles and must not be grantable through ordinary self-sign-up approval.

## 4. Security rules

- Sign-up does not create active application access.
- A pending request has no Audit Core/DI permissions.
- Requesters cannot approve themselves.
- Requesters cannot self-select or self-elevate a role.
- Role and Tenant membership become effective only after approval and Security-owned activation.
- Audit Core remains the browser/mobile API boundary for onboarding business calls.
- Clerk/upstream identity handling remains behind Verigence Security; frontend code must not own authorization rules.

## 5. Web API contract required from Audit Core

The Web implementation targets the following Audit Core contract:

### Create access request

```http
POST /v1/onboarding/access-requests
Content-Type: application/json
```

```json
{
  "fullName": "Aditi Sharma",
  "workEmail": "aditi@company.com",
  "tenantCode": "DEALER-NORTH",
  "employeeId": "E12345",
  "mobileNumber": "+91 98xxxxxx00"
}
```

Expected response:

```json
{
  "requestId": "AR-...",
  "fullName": "Aditi Sharma",
  "workEmail": "aditi@company.com",
  "tenantCode": "DEALER-NORTH",
  "employeeId": "E12345",
  "mobileNumber": "+91 98xxxxxx00",
  "status": "PENDING",
  "submittedAt": "2026-08-17T00:00:00Z"
}
```

The backend must reject duplicate active/pending requests for the same normalized work identity and Tenant rather than silently create duplicates.

## 6. Existing backend gap

As of this implementation, Verigence Security supports interactive OAuth/login only for identities already provisioned in Security. An upstream-authenticated identity that is not provisioned is denied.

Therefore the end-to-end onboarding backend still needs a Security-owned pending access-request/approval capability, surfaced to Web through Audit Core. The Web implementation must not work around this by talking directly to Clerk or by treating form submission as active provisioning.

## 7. Next implementation slice

After the Sign-up UI is validated, implement the Approval Queue using the same access-request record and add explicit approve/reject operations. Approval must select the Tenant operating role and create/activate the Security membership only through the approved backend contract.
