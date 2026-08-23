# UC-001 — User Onboarding & Administration Design Pack

**Status:** APPROVED — IMPLEMENTATION ACTIVE  
**Original onboarding approval:** 2026-08-19  
**Administration expansion approval:** 2026-08-23  
**Repository:** `verigence/verigence-web`  
**Current implementation branch:** `planning/uc-001-administration-expansion`

## Purpose

This folder is the source of truth for UC-001 User Onboarding and the approved UC-001A Administration expansion.

The original applicant signup/OTP journey remains frozen. The 23-Aug-2026 administration addendum expands the SuperAdmin administration surface without changing applicant signup behavior.

## Authoritative inputs

1. Current reviewed `verigence-security` implementation/source of truth for USER lifecycle and authorization.
2. `docs/BRANDING_GUIDELINES.md`.
3. `docs/SESSION_HANDOFF.md` for working method and branch discipline.
4. [`08-administration-expansion.md`](./08-administration-expansion.md) for the approved Administration extension.

Where older UC-001 Web assumptions conflict with the current Security implementation, Security remains authoritative for Security-owned behavior.

## Frozen architecture

```text
Web browser / Capacitor mobile
              |
              | Verigence APIs
              v
        Verigence backend modules
              |
              | Clerk Backend API only from Security
              v
             Clerk
```

- Clerk is the human credential provider.
- Only Security integrates with Clerk.
- Web/Mobile contain no Clerk SDK, Clerk keys or Clerk session-JWT authentication.
- Security owns the global Verigence USER lifecycle and authorization boundary.
- Web does not own USER data, administrative roles, permission mappings or authorization decisions.

## Web and mobile delivery model

UC-001 remains one product flow delivered from the same React + TypeScript + Vite + Ionic React application.

- Browser: responsive Web application.
- Android/iOS: the same application wrapped by Capacitor.
- Business rules, API clients and state transitions are shared.
- Responsive layout may change presentation, not meaning or flow.

## Deliverables

1. [`01-use-case-spec.md`](./01-use-case-spec.md)
2. [`02-sequence-diagram.md`](./02-sequence-diagram.md)
3. [`03-wireframes/README.md`](./03-wireframes/README.md)
4. [`04-api-data-mapping.md`](./04-api-data-mapping.md)
5. [`05-test-scenarios.md`](./05-test-scenarios.md)
6. [`06-design-approval.md`](./06-design-approval.md)
7. [`07-implementation-status.md`](./07-implementation-status.md)
8. [`08-administration-expansion.md`](./08-administration-expansion.md)

## Current Administration design

```text
ADMINISTRATION
├─ Users
│  └─ Pending Approvals
├─ User Activity Log
├─ Roles & Permissions
│  ├─ Project Admin
│  └─ Module Admin
├─ Audit Rule Config
├─ Approval Workflow Config
├─ Notification Settings
└─ Project Provisioning
```

Operational roles such as PC, TL, PM, CRM and Executive remain UC02 project-scoped role mapping and are not managed by UC01 Roles & Permissions.

`Delete User` means controlled logical offboarding, not physical deletion of audit history.

## Change-control rules

- Do not invent Security APIs, administrative role mutations, audit-log APIs or configuration persistence in Web.
- Where the backend capability exists, consume it directly.
- Where the backend capability does not yet exist, implement the approved UI/navigation surface but do not fake a successful mutation.
- No Security, Audit Core or DI change is implied by a Web-only Administration surface unless a concrete missing backend capability is separately approved.

## Historical Web files

The following files remain for history/reference but are not authoritative where they conflict with this pack:

- `docs/USER_ONBOARDING_FLOW.md`
- `docs/APPROVAL_FLOW.md`
- onboarding sections of `docs/AGREED_TECHNOLOGY_STACK.md`
- onboarding sections of `docs/WEB_IMPLEMENTATION_PROGRESS.md`
- older prototype signup/approval source files.
