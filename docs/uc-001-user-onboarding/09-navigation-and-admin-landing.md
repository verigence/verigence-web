# UC-001B — Navigation Consolidation & Administration Landing

**Status:** APPROVED FOR IMPLEMENTATION  
**Approved:** 2026-08-24  
**Repository/branch:** `verigence/verigence-web` / `fix/navigation-admin-landing`

## 1. Navigation decision

The authenticated Verigence sidebar is consolidated into four expandable top-level sections so the product can scale without exposing a long flat menu.

```text
Workspace
Operations & Assurance
Insights
Administration
```

Only one section is expanded at a time. The section containing the current route opens automatically. Users may collapse the open section.

The existing UC03 operational shell restriction remains intact: when a Project is actively selected, the current UC03 implementation continues to expose only the approved Project Workspace/Overview navigation until later UC03 navigation scope is authorized.

## 2. Administration contents

Administration contains:

```text
Engagements
Users
  -> Pending Approvals
User Activity Log
Roles & Permissions
Audit Rule Config
Approval Workflow Config
Notification Settings
Project Provisioning
```

Engagements is intentionally introduced as an Administration entry point only. Its detailed lifecycle/data model/backend contract will be revisited later and must not be invented in Web.

## 3. SuperAdmin landing page

When a SuperAdmin signs in and no operational Project is selected, `/dashboard` presents an Administration overview inside the normal authenticated shell instead of forcing the Project selection gate first.

Required summary metrics:

- Total Employees
- Process Consultants (PC)
- Team Leads (TL)
- Project Managers (PM)
- CRM
- Executives
- Total Projects

The summary is calculated only from authoritative Audit Core Project and role-mapping APIs. Web must not use hard-coded/demo counts.

### Employee counting rule

`Total Employees` is the number of unique USER IDs that have at least one operational role mapping across Projects.

Each role metric is the number of unique USER IDs that hold that role in at least one Project. Because UC02 explicitly permits a user's operating role to differ by Project, role buckets may overlap and their sum does not have to equal Total Employees.

### Project counting rule

`Total Projects` is the number of Projects returned by the authoritative Project administration list. The landing page may also show the number currently ACTIVE as supporting context.

## 4. Opening operational work

The SuperAdmin landing page also lists Projects where the current SuperAdmin has an active operational assignment. Selecting one establishes the existing UC03 Project context and opens the operational Dashboard.

Project Provisioning remains available under Administration independently of whether the SuperAdmin has an operating role in any Project.

## 5. Authorization and backend boundaries

- Administration remains SuperAdmin-only in the current Web persona model.
- Backend authorization remains authoritative.
- No Engagement backend is created by this change.
- No Security, Audit Core or DI schema change is required for the landing summary because existing Project and role-mapping read APIs are used.
- No employee/role counts are estimated if any required summary request fails; the UI shows a retryable load failure instead.
