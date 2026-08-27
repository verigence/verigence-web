# UC-001A — Administration Expansion Design

**Status:** APPROVED FOR IMPLEMENTATION — LIFECYCLE CONTRACT REVISED  
**Approved:** 2026-08-23  
**Lifecycle revision:** 2026-08-27  
**Repository:** `verigence/verigence-web`

## 1. Decision

UC-001 is extended beyond applicant onboarding to include the SuperAdmin administration entry points required to govern the global Verigence USER lifecycle and future administrative configuration.

This addendum supersedes older UC-001 statements that treated all post-approval administration as out of scope. It does **not** change the frozen applicant signup/OTP journey.

The 27-Aug-2026 lifecycle revision aligns Web with the authoritative Security v2 contract dated 19-Aug-2026. The earlier Web-only `EXITED` logical-offboarding interpretation is retired. New Web behavior must not create or transition a USER to `EXITED`.

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
- activate/reject pending registration;
- suspend;
- reinstate;
- permanent delete using the Security v2 deletion workflow.

### 3.2 Authoritative lifecycle rules

Security remains authoritative for USER lifecycle.

The active Security v2 lifecycle states used by Web are:

```text
PENDING
REJECTED
ACTIVE
SUSPENDED
DISABLED
```

Approved UI behavior:

```text
PENDING -> ACTIVE
PENDING -> REJECTED
REJECTED -> ACTIVE
ACTIVE -> SUSPENDED
SUSPENDED -> ACTIVE
ACTIVE -> DISABLED     # deletion request, reasonCode=DELETE_REQUEST
DISABLED -> ACTIVE     # cancel/reactivate deletion request
DISABLED -> hard DELETE
```

`EXITED` is not an active UC-001 lifecycle state and must not be exposed as a filter, target status or delete outcome in Web.

### 3.3 Delete means hard delete

The user-facing action is **Delete User**.

For an `ACTIVE` USER, Web performs the Security v2 deletion sequence:

```text
1. PATCH /security/v1/users/{userId}/status
   {
     "status": "DISABLED",
     "reasonCode": "DELETE_REQUEST",
     "reason": "<optional administrative reason>"
   }

2. DELETE /security/v1/platform/users/{userId}
```

The same SuperAdmin may perform both stages in Phase 1.

`DISABLED` is an intermediate deletion-request state, not a replacement for physical deletion. If the first stage succeeds but final hard delete fails, the USER remains `DISABLED`; the Users screen must refresh authoritative state and allow the SuperAdmin to retry the final hard delete.

Security owns all hard-delete safety and evidence retention, including:

- removal of the live USER/principal records;
- removal of the Clerk identity;
- termination/removal of live Security access state and assignments;
- retained audit evidence;
- retained deletion tombstone/reference according to the Security retention policy;
- release of the user identity/contact for permitted future reuse.

Web must not maintain a shadow deleted-user record or use `EXITED` to preserve history. Historical evidence is a Security responsibility.

## 4. Pending approvals

Pending onboarding review remains part of UC-001, but is reached from:

```text
Administration -> Users -> Pending Approvals
```

The legacy `/approvals` route may remain only as a compatibility redirect.

The authoritative decision endpoint is:

```text
PATCH /security/v1/users/{userId}/status
```

with target `ACTIVE` or `REJECTED`.

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
| Users list | `GET /security/v1/platform/users?userStatus=...` |
| User detail | `GET /security/v1/platform/users/{userId}` |
| Activate / Reject | `PATCH /security/v1/users/{userId}/status` |
| Suspend / Reinstate | `PATCH /security/v1/users/{userId}/status` |
| Request deletion | `PATCH /security/v1/users/{userId}/status` with `DISABLED` + `reasonCode=DELETE_REQUEST` |
| Hard Delete User | `DELETE /security/v1/platform/users/{userId}`; SuperAdmin only |
| Pending Approvals | Reuse UC-001 approval flow under Users |
| Roles & Permissions | UI + design implemented; mutation blocked pending Security contract |
| User Activity Log | UI + design implemented; read blocked pending authoritative backend contract |
| Audit Rule Config | UI + design implemented; mutation blocked pending backend contract |
| Approval Workflow Config | UI + design implemented; mutation blocked pending backend contract |
| Notification Settings | UI + design implemented; mutation blocked pending backend contract |
| Project Provisioning | Reuse existing UC02 Project Administration |

## 13. Repository boundaries

This lifecycle correction changes Web only.

- Security v2 already provides the required USER list/detail, status-transition, deletion-request and hard-delete capability.
- No new Security lifecycle endpoint is invented by Web.
- No database schema change is required for this Web correction.
- No Audit Core or DI code change is authorized by this addendum.

Security remains the source of truth for USER lifecycle and deletion evidence.

## 14. Approval record

The design owner explicitly approved in-session on 23-Aug-2026:

- expanded Administration navigation;
- `Users` as the parent of Pending Approvals;
- Project Admin and Module Admin as the Roles & Permissions scope;
- separation from UC02 PC/TL/PM/CRM/Executive role mapping;
- Suspend User;
- Reinstate User;
- Project Provisioning terminology.

On 27-Aug-2026 the design owner explicitly revised the lifecycle decision:

- remove `EXITED` from the active Web lifecycle;
- do not use logical offboarding as the Delete implementation;
- use the Security v2 `ACTIVE -> DISABLED` deletion-request step;
- allow SuperAdmin to complete actual hard deletion through `DELETE /security/v1/platform/users/{userId}`;
- preserve historical evidence through Security tombstone/audit controls rather than retaining the live USER row.

This 27-Aug revision supersedes the earlier `EXITED`/logical-offboarding paragraphs in the original 23-Aug approval.
