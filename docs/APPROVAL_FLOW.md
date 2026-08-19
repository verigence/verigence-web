# Verigence V1 — Access Approval Flow

**Status:** Web implementation baseline  
**Predecessor:** Sign-up / access request  
**Input state:** `PENDING`  
**Decision states:** `APPROVED` or `REJECTED`

## 1. Purpose

Approval converts a verified onboarding request into an authorized Security activation decision. It is not a generic user-edit screen and it is not permission entry by hand.

The approver validates the requester and Tenant, chooses an approved operating role template, then explicitly approves or rejects the request.

## 2. Allowed role assignment

Ordinary onboarding approval may assign one of the four approved operational role templates:

- `PC` — Process Consultant;
- `TL` — Team Lead;
- `PM` — Project Manager / PMO;
- `CRM` — CRM operator.

The approval UI intentionally excludes:

- `SUPER_ADMIN`;
- `TENANT_ADMIN`;
- arbitrary direct permission entry.

Privileged administration access requires a separate controlled flow.

## 3. Approval rules

- The requester cannot approve their own request.
- The backend is authoritative for approver permissions and Tenant scope.
- Browser route visibility is not an authorization control.
- Approval requires an explicit operational role.
- Rejection requires a reason.
- Duplicate/previously-decided requests must fail closed rather than be silently reprocessed.
- Every decision must be auditable with actor, request, Tenant, selected role/reason and timestamp.
- Approval must activate Security-owned identity/membership only through the backend onboarding contract.

## 4. Audit Core Web contract

### List pending requests

```http
GET /v1/onboarding/access-requests?status=PENDING
```

Expected response:

```json
{
  "items": [
    {
      "requestId": "AR-123",
      "fullName": "Aditi Sharma",
      "workEmail": "aditi@company.com",
      "tenantCode": "DEALER-NORTH",
      "employeeId": "E12345",
      "mobileNumber": "+91 98xxxxxx00",
      "status": "PENDING",
      "submittedAt": "2026-08-17T00:00:00Z"
    }
  ]
}
```

### Approve

```http
POST /v1/onboarding/access-requests/{requestId}/approve
Content-Type: application/json
```

```json
{
  "roleKey": "PC"
}
```

The backend validates that the actor may approve this Tenant and that `roleKey` is an allowed operational role before changing state or activating Security membership.

### Reject

```http
POST /v1/onboarding/access-requests/{requestId}/reject
Content-Type: application/json
```

```json
{
  "reason": "Employee identity could not be validated"
}
```

## 5. Backend dependency

Audit Core does not currently expose these onboarding endpoints and Security does not currently persist pending access requests. The Web flow is therefore API-contract complete but requires the backend onboarding capability before end-to-end activation can be exercised.

Security's existing login implementation currently accepts only identities already provisioned in Security. The onboarding backend must close that gap without moving role calculation, Clerk integration, or authorization authority into the Web application.
