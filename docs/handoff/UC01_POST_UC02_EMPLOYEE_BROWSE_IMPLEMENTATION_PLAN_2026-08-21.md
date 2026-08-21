# UC-001/Post-UC-002 Employee Browse — Deferred Implementation Plan

**Status:** DEFERRED UNTIL AFTER UC-002 COMPLETION  
**Date:** 2026-08-21  
**Priority rule:** UC-002 Project Onboarding/Administration is higher priority. Do not implement employee engagement/assignment browse before UC-002 is completed and runtime-verified.

---

## 1. Decision

The browse-only `Current Employees & Engagements` capability is intentionally parked until after UC-002.

Current UC-001 work may keep the approved tab/screen affordance, but no unsupported engagement aggregation, role-scoped employee directory, or assignment browsing API is to be invented in Web.

The existing UC-001 Pending Requests lifecycle remains unchanged:

```text
PENDING -> ACTIVE
PENDING -> REJECTED
```

No Project, role, Dealer/Outlet, permission, engagement or rejection-reason data is added to that decision.

---

## 2. Post-UC-002 browse authorization rules already decided

These rules are explicit requirements for the later browse implementation:

### PC

- A PC must **not** be able to see engagement or assignment information belonging to other employees.
- Any later PC-visible browse/read capability must therefore be restricted to the PC's own authorized context only; it must not expose peer staffing/assignment data.

### TL

- A TL may see the employees assigned within the **same Dealer** that the TL is authorized to supervise.
- A TL must not receive employee engagement/assignment data for unrelated Dealers or Projects.
- Dealer scope must come from authoritative Audit Core business assignment data; it must not be inferred from names or browser-supplied identifiers.

### Other roles

No additional PM/CRM/Executive/Tenant Admin visibility rules are frozen by this checkpoint. Do not infer them from the UI or from UC-002 role mapping. Freeze them explicitly when this deferred work resumes.

### SuperAdmin UC-001 view

The existing frozen `Current Employees & Engagements` SuperAdmin concept remains a platform administrative browse requirement. Its platform-level aggregate contract (`AC-UC01-READ-001`) is still not frozen and must not be implemented by browser-side reconstruction.

---

## 3. Dependency on UC-002

Implement UC-002 first because UC-002 establishes the authoritative Project/Dealer/Dealer Outlet and Role Mapping state that the later browse capability must respect.

The later browse design must consume the final UC-002 authority model:

```text
Security
  -> global USER identity/status
  -> Tenant operating role

Audit Core
  -> Project
  -> Dealer
  -> Dealer Outlet
  -> business_assignments / engagement scope
```

Do not create a duplicate `project_employees` or employee-membership source of truth merely to support browsing.

---

## 4. AC-UC01-READ-001 work after UC-002

After UC-002 is complete and verified:

1. Re-read current Security and Audit Core source-of-truth designs/code.
2. Freeze the exact SuperAdmin aggregate read contract in Audit Core (`AC-UC01-READ-001`).
3. Verify whether Security already exposes an approved read for current Tenant operating-role assignment; add only the smallest read-only Security capability if a concrete gap remains.
4. Define role-scoped authorization for browse consumers. Preserve the already-decided PC and TL restrictions above.
5. Implement Audit Core read composition using canonical Security `userId` only.
6. Return only current/authorized assignments; exclude removed, inactive, expired or deleted Project/Dealer/Outlet mappings.
7. Implement zero/one/multiple engagement handling.
8. Add isolation/authorization tests before Web integration.
9. Wire the browse-only Web view only after the backend contract is frozen and available.

The exact endpoint URI and JSON field names remain intentionally unfrozen until the owning backend design is updated.

---

## 5. Mandatory authorization test matrix after UC-002

At minimum verify:

- PC cannot read another employee's engagement or assignment;
- PC cannot widen scope by supplying another `userId`, Dealer ID, Outlet ID or Project ID;
- TL can see employees assigned to the same authorized Dealer;
- TL cannot see employees assigned only to another Dealer;
- TL cannot widen Dealer scope through request parameters;
- SuperAdmin aggregate browse follows the finally approved platform-scope contract;
- canonical Security `userId` is the identity join key;
- operating role agrees with Security;
- Dealer/Outlet engagement scope agrees with Audit Core;
- removed/inactive/deleted assignments are not returned as current;
- endpoint performs no writes;
- no bearer token or secret is logged or persisted.

---

## 6. Resume rule

Do **not** start this package while UC-002 remains incomplete.

Resume sequence:

```text
Finish + runtime-verify UC-002
 -> reopen this plan
 -> reconcile final UC-002 Role Mapping/data model
 -> freeze AC-UC01-READ-001 + remaining role visibility rules
 -> backend implementation/tests
 -> Web browse integration
```
