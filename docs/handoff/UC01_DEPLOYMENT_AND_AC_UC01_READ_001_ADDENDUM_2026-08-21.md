# UC-001 Handoff Addendum — Deployment Rule + AC-UC01-READ-001

**Status:** AUTHORITATIVE ADDENDUM FOR CURRENT UC-001 IMPLEMENTATION  
**Date:** 2026-08-21  
**Applies after:** `docs/handoff/UC01_UC02_IMPLEMENTATION_READY_HANDOFF_2026-08-21.md`  
**Branch:** `planning/uc-001-user-onboarding`

This addendum records two corrections/clarifications that must be carried forward in every resumed implementation session.

---

## 1. Cloudflare DEV deployment rule — `main` is the deployment branch

The canonical Web DEV deployment workflow on `main` is:

```text
.github/workflows/deploy-uc001-dev.yml
```

On `main`, that workflow is triggered by:

```yaml
on:
  push:
    branches:
      - main
```

Therefore a successful build on `planning/uc-001-user-onboarding` is **not** deployment proof.

The correct delivery sequence is:

```text
Implement/test on planning/uc-001-user-onboarding
 -> review exact changed files
 -> merge/cherry-pick the approved UC-001 package to main
 -> push/commit main
 -> main Cloudflare DEV workflow runs
 -> verify workflow build + deploy + smoke
 -> runtime/visual verification on deployed DEV
```

Do not try to establish UC-001 deployment by modifying a planning-branch workflow to deploy that branch. Do not claim the feature is deployed until the corresponding approved code exists on `main` and the `main` deployment workflow has successfully deployed/smoke-tested it.

For UC01-WEB-01 specifically, the implementation is currently on `planning/uc-001-user-onboarding`; it still needs to be promoted to `main` before Cloudflare runtime verification.

---

## 2. What AC-UC01-READ-001 actually needs

`AC-UC01-READ-001` is the missing **platform-level, browse-only Current Employees & Engagements read contract** required by the frozen UC-001 SuperAdmin screen.

It is not part of the Pending Requests approval decision and must not change:

```text
PENDING -> ACTIVE
PENDING -> REJECTED
```

### 2.1 Existing source-backed capabilities

Current Security v2 already provides the platform USER directory needed to identify current employees, including filtering by USER status. Security remains authoritative for:

- canonical `userId`;
- employee/global USER identity;
- global USER lifecycle/status.

Current Audit Core v2.2 already defines Project/Tenant-specific administration including:

```text
GET /v1/tenants/{tenantId}/role-mapping-candidates
GET /v1/tenants/{tenantId}/role-mappings
GET /v1/tenants/{tenantId}/role-mappings/{userId}
```

and its physical model explicitly keeps Project/Dealer/Outlet business scope in `business_assignments`. It does **not** create a separate `project_employees` table.

Security remains authoritative for the Tenant operating role; Audit Core remains authoritative for Project/Dealer/Outlet business assignment scope.

Those existing contracts are Tenant/Project-specific. They do not yet provide the frozen UC-001 screen with one platform-wide read of an ACTIVE USER's zero, one or multiple current Project engagements.

### 2.2 Design work that must be frozen first

Before any engagement-detail Web code, Audit Core must own/freeze `AC-UC01-READ-001` in its current solution/API contract. The final contract must define, without browser-side reconstruction:

1. **Authorization** — human SuperAdmin only; fail closed for invalid/expired human JWT.
2. **Canonical join key** — Security `userId` only; no email/name matching.
3. **Platform scope** — able to browse across Projects for the authorized SuperAdmin rather than requiring the browser to enumerate every Tenant and join results itself.
4. **Current-only semantics** — exclude deleted/inactive Project assignments and any assignment that is not current under the owning model.
5. **Cardinality** — return zero, one or multiple current engagements per ACTIVE employee; zero must be represented truthfully as `No current engagement`, not omitted/fabricated Project data.
6. **Authority split** — identity/status from Security; Project/Dealer/Outlet scope from Audit Core; operating role from Security.
7. **Read-only behavior** — no role mapping, assignment, permission, Dealer/Outlet or Project write is permitted through this contract.
8. **Pagination/search** — freeze supported request parameters rather than having Web invent filters.
9. **Isolation** — no cross-Project/Tenant leakage beyond what the authorized platform SuperAdmin is explicitly permitted to browse.
10. **Stable identifiers** — return canonical Project/Tenant, Dealer and Outlet IDs where those scopes are present; display names are presentation data, not join keys.

The exact URI and JSON field names must be frozen in the owning Audit Core API contract before implementation; this Web addendum intentionally does not invent them.

### 2.3 Security read dependency that must be verified

Current Security v2 code inspected for operating-role administration exposes the approved Tenant operating-role PUT/DELETE lifecycle. Before freezing the Audit Core aggregate, verify whether a current approved Security read API already returns a USER's Tenant operating-role assignment.

If an approved Security read exists, AC-UC01-READ-001 must reuse it.

If it does **not** exist, that is a concrete source-backed Security gap: freeze the smallest read-only Security contract necessary for Audit Core to obtain the current Tenant operating role. Do not let Audit Core read Security tables directly, copy Security role state into Audit Core, or infer a role from Dealer/Outlet scope.

### 2.4 Cross-module authentication rule

For the outer browse request:

```text
Browser/SuperAdmin
 -> Audit Core with Security-issued human JWT
```

Audit Core validates the human identity and performs the approved live Security authorization flow.

If the finalized aggregate requires a downstream Security **human administrative/read** call, preserve the same Security-issued human JWT where the approved Security endpoint requires human authority. `ServiceIntegration` must not be used to impersonate the SuperAdmin. `ServiceIntegration` remains only for the already-approved machine/background paths such as Security `/authorization/check` where designed.

Never persist or log the bearer JWT.

### 2.5 Backend implementation after contract freeze

Once the design/API contract is approved:

```text
Audit Core design/API contract update
 -> verify/freeze any missing Security operating-role read
 -> Audit Core implementation/service/query
 -> backend authorization + isolation tests
 -> zero/one/multiple engagement tests
 -> inactive/deleted/stale assignment tests
 -> Web Current Employees & Engagements integration
```

The Audit Core implementation should derive engagement scope from the authoritative existing Project/business-assignment model and Project/Dealer/Outlet records, not add a duplicate employee-membership source of truth merely for this screen.

### 2.6 Minimum test gate for AC-UC01-READ-001

Before Web uses the contract, verify at minimum:

- non-SuperAdmin denied;
- missing/expired human JWT denied;
- canonical Security `userId` join only;
- ACTIVE USER with zero engagement returns no fabricated Project;
- one current engagement returns correct Project/role/scope;
- multiple current engagements all return correctly;
- deleted/inactive Project or removed mapping is not returned as current;
- operating role agrees with Security authority;
- Dealer/Outlet scope agrees with Audit Core authority;
- no unauthorized cross-Project leakage;
- endpoint performs no writes;
- bearer token is not logged or persisted.

---

## 3. Resume instruction

On the next context reset, read this addendum immediately after the main UC-001/UC-002 implementation-ready handoff.

Two non-negotiable rules to carry forward:

```text
Web DEV deployment proof requires approved code on main and a successful main workflow.

AC-UC01-READ-001 must be frozen/implemented in the owning backend contract before engagement-detail Web implementation; Web must not invent or reconstruct the contract.
```
