# Verigence V1 — User Onboarding Flow

**Web baseline:** Sign-up → Identity verification → Pending approval → Approval → Sign-in

## User-facing registration

Registration asks for user identity plus a **Verigence Key** supplied by the organization/Verigence administrator.

The user must not be asked to enter internal platform identifiers such as Tenant ID, Dealer ID or Outlet ID.

Current Web fields:

- full name;
- work email;
- mobile number (optional in the current Web baseline);
- Verigence Key.

The exact verification/password/OTP rules will follow the approved authentication design before backend integration is finalized.

## Verigence Key

The Verigence Key is a user-facing onboarding credential/reference. Its backend implementation will resolve the organization and permitted business scope. The browser must not derive or authorize Tenant/Dealer/Outlet scope itself.

## Approval

The requester does not choose PC/TL/PM/CRM. An authorized administrator validates the registration and assigns the operating role and business scope.

```text
User registration
      │
      ▼
Verigence Key + identity
      │
      ▼
Identity verification
      │
      ▼
PENDING APPROVAL
      │
      ├── Reject ──► no access
      │
      └── Approve ─► role + business scope
                          │
                          ▼
                       Sign-in
```

## Web-only status

Audit Core does not currently expose the onboarding persistence/approval API. Until the Web flow is signed off, this feature remains isolated inside `verigence-web`; no Security, Audit Core or DI changes are made for it.
