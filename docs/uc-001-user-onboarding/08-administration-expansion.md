# UC-001A — Administration Expansion Design

**Status:** APPROVED FOR IMPLEMENTATION  
**Approved:** 2026-08-23  
**Repository/branch:** `verigence/verigence-web` / `planning/uc-001-administration-expansion`

## 1. Decision

UC-001 is extended beyond applicant onboarding to include the SuperAdmin administration entry points required to govern the global Verigence USER lifecycle and future administrative configuration.

This addendum supersedes older UC-001 statements that treated all post-approval administration as out of scope. It does **not** change the frozen applicant signup/OTP journey.

## 2. Administration navigation

The approved Administration navigation is:

```text
ADMINISTRATION
├─ Users
├─ User Activity Log
├─ Roles & Permissions
├─ Audit Rule Config
├─ Approval Workflow Config
├─ Notification Settings
└─ Project Provisioning
```

`Pending Approval` is no longer a top-level navigation item. It is a sub-flow of **Users**.

## 3. Users

### 3.1 Required capabilities

The Users screen must provide:

- global user list;
- account status;
- identity/contact summary;
- entry point to administrative role management;
- pending approval entry point;
- suspend;
- reinstate;
- delete/offboard.

### 3.2 Lifecycle rules

Security remains authoritative for USER lifecycle.

The current Security implementation supports administrative lifecycle states including:

```text
ACTIVE
SUSPENDED
DISABLED
EXITED
```

Approved UI behavior:

```text
ACTIVE -> SUSPENDED
SUSPENDED/DISABLED -> ACTIVE
ACTIVE/SUSPENDED/DISABLED -> EXITED
```

`EXITED` is treated as terminal by the current Security implementation.

### 3.3 Delete means logical offboarding

The user-facing action may be labelled **Delete User**, but Verigence must not physically delete the USER record from the audit/governance history.

`Delete User` therefore maps to controlled logical offboarding (`EXITED`) so that:

- future login/access is blocked;
- new role assignment is not permitted;
- the USER is excluded from normal active-user selection;
- immutable user ID and historical references remain available;
- completed audit, evidence and administrative history continue to resolve to the original actor.

No browser-side record deletion or local shadow USER database is allowed.

## 4. Pending approvals

Pending onboarding review remains part of UC-001, but is reached from:

```text
Administration -> Users -> Pending Approvals
```

The legacy `/approvals` route may remain only as a compatibility redirect.

## 5. Roles & Permissions

This area is for **administrative roles**, not UC02 operating roles.

### Project Admin

Project Admin is administrative authority for one or more assigned Projects. Its intended administration surface includes, subject to backend authorization:

- project setup/provisioning;
- dealer/outlet administration;
- project employee administration;
- project configuration and masters;
- project readiness/activation operations;
- other project-level administrative functions explicitly granted by policy.

### Module Admin

Module Admin is administrative authority for one or more Verigence modules, for example Audit, Workflow or Notifications. Module Admin does not automatically grant Project Admin, SuperAdmin or operating-role authority.

### Explicit separation from UC02

The following remain UC02 operational roles and are **not** administered here:

- PC;
- TL;
- PM;
- CRM;
- Executive.

UC02 continues to own Project/Dealer/Outlet operating-role mapping.

### Current backend boundary

The current reviewed Security source of truth does not expose the approved Project Admin / Module Admin assignment mutation contract. Therefore Web may implement navigation, role definitions and user-to-role entry points, but must not fabricate successful role assignment. Mutable role controls remain disabled until the Security contract exists.

## 6. User Activity Log

The Administration UI must provide an entry point for authoritative user/security administrative activity, including lifecycle and role changes.

The Web application must not create a competing local audit log. Until Security exposes the required read contract, the UI shows the approved surface and states the backend dependency explicitly.

## 7. Audit Rule Config

Audit Rule Config is an Administration entry point for controlled, versioned audit-rule administration.

Audit rule persistence and authorization remain owned by the appropriate backend module. Web must not use local/mock persistence or present an unsaved browser configuration as authoritative.

## 8. Approval Workflow Config

Approval Workflow Config is an Administration entry point for versioned workflow configuration, participants and escalation policy.

Operational PC/TL/PM assignment remains project-scoped and is not created by this screen.

## 9. Notification Settings

Notification Settings is an Administration entry point for module/project notification policy.

Provider credentials and secrets must never be managed as browser-owned state.

## 10. Project Provisioning

The approved label is **Project Provisioning**, not Tenant Provisioning.

Project Provisioning reuses the existing UC02 Project Administration implementation. No duplicate project-provisioning workflow is created in UC01.

## 11. Authorization

Phase-1 navigation remains visible to the existing SuperAdmin UI persona only. Navigation visibility is not authorization; backend permission enforcement remains mandatory.

Project Admin and Module Admin are approved administrative role concepts, but are not added to Web's authenticated role union until the authoritative Security token/assignment contract exists.

## 12. Backend capability matrix

| Administration area | Current implementation decision |
| --- | --- |
| Users list | Use Security global USER directory |
| Suspend / Reinstate | Use Security USER lifecycle API |
| Delete User | Map to Security `EXITED` logical offboarding |
| Pending Approvals | Reuse UC-001 approval flow under Users |
| Roles & Permissions | UI + design implemented; mutation blocked pending Security contract |
| User Activity Log | UI + design implemented; read blocked pending authoritative backend contract |
| Audit Rule Config | UI + design implemented; mutation blocked pending backend contract |
| Approval Workflow Config | UI + design implemented; mutation blocked pending backend contract |
| Notification Settings | UI + design implemented; mutation blocked pending backend contract |
| Project Provisioning | Reuse existing UC02 Project Administration |

## 13. Repository boundaries

This implementation changes Web only.

- No Security code/schema change is required for global USER list, suspend, reinstate or logical offboarding because those lifecycle capabilities already exist in the reviewed Security implementation.
- No new Security role/activity/configuration APIs are invented.
- No Audit Core or DI code change is authorized by this addendum.

## 14. Approval record

The design owner explicitly approved in-session on 23-Aug-2026:

- expanded Administration navigation;
- `Users` as the parent of Pending Approvals;
- Project Admin and Module Admin as the Roles & Permissions scope;
- separation from UC02 PC/TL/PM/CRM/Executive role mapping;
- Suspend User;
- Reinstate User;
- Delete User as controlled logical offboarding;
- Project Provisioning terminology.

Implementation on `planning/uc-001-administration-expansion` is authorized. Merge/deployment remains subject to normal CI and DEV verification.
